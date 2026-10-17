import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { verifyMediaSessionToken } from '../security/jwt';
import { VoiceWorkerInstance, VoiceEndpointConfig } from './voice-worker';
import { FleetGatewayService } from '../services/fleet-gateway.service';
import { prisma } from '../db/prisma';
import { AuditService } from '../services/audit.service';
import { decryptSecret } from '../security/encryption';
import {
  createAudioPlayer,
  createAudioResource,
  StreamType,
  NoSubscriberBehavior,
  AudioPlayer,
  AudioResource,
  AudioPlayerStatus,
} from '@discordjs/voice';
import { PassThrough } from 'stream';

export interface ActiveSession {
  sessionId: string;
  workspaceId: string;
  userId: string;
  state: 'awaiting_start' | 'connecting' | 'streaming' | 'paused' | 'stopping' | 'stopped' | 'failed';
  masterGain: number; // 0.0 to 100.0 (up to 10000%)
  masterMuted: boolean;
  startedAt: number;
  endpoints: Map<string, VoiceWorkerInstance>;
  wsClients: Set<WebSocket>;
  lastVuBroadcastAt?: number;
  frameCount?: number;
  sharedPlayer?: AudioPlayer;
  sharedStream?: PassThrough;
  sharedResource?: AudioResource;
}

declare global {
  // eslint-disable-next-line no-var
  var __mediaGatewayManager: MediaGatewayManager | undefined;
}

export class MediaGatewayManager {
  private activeSessions = new Map<string, ActiveSession>();
  private wss: WebSocketServer | null = null;

  public static getInstance(): MediaGatewayManager {
    if (!global.__mediaGatewayManager) {
      global.__mediaGatewayManager = new MediaGatewayManager();
    }
    return global.__mediaGatewayManager;
  }

  /**
   * Attach WebSocket server for real-time microphone audio ingest & telemetry.
   */
  public attachServer(serverOrPort: any, fallbackPort?: number): void {
    if (this.wss) return;

    if (typeof serverOrPort === 'number') {
      this.wss = new WebSocketServer({ port: serverOrPort, host: process.env.HOST || '0.0.0.0' });
      console.log(`[MediaGateway] WebSocket server listening on port ${serverOrPort}`);
      this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
        this.handleConnection(ws, req);
      });
    } else {
      this.wss = new WebSocketServer({ server: serverOrPort, path: '/media-stream' });
      console.log(`[MediaGateway] WebSocket server attached to HTTP server path /media-stream`);
      this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
        this.handleConnection(ws, req);
      });

      if (typeof fallbackPort === 'number' && fallbackPort > 0) {
        try {
          const dedicatedWss = new WebSocketServer({ port: fallbackPort, host: process.env.HOST || '0.0.0.0' });
          dedicatedWss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
            this.handleConnection(ws, req);
          });
          console.log(`[MediaGateway] Also listening on dedicated port ${fallbackPort}`);
        } catch (e: any) {
          console.warn(`[MediaGateway] Optional dedicated port ${fallbackPort} warning:`, e.message);
        }
      }
    }
  }

  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    const token = url.searchParams.get('token');

    console.log(`[MediaGateway] WebSocket connection attempt from ${req.socket.remoteAddress || 'unknown'}`);

    if (!token) {
      console.warn(`[MediaGateway] WebSocket rejected: Media token missing`);
      ws.close(4001, 'Media token required');
      return;
    }

    const payload = verifyMediaSessionToken(token);
    if (!payload) {
      console.warn(`[MediaGateway] WebSocket rejected: Invalid/expired media token`);
      ws.close(4003, 'Invalid or expired media session token');
      return;
    }

    const { sessionId, workspaceId, userId } = payload;
    const session = this.activeSessions.get(sessionId);

    if (!session) {
      console.warn(`[MediaGateway] WebSocket rejected: Session ${sessionId} not found`);
      ws.close(4004, 'Active voice session not found on gateway');
      return;
    }

    console.log(`[MediaGateway] Client authenticated for session ${sessionId} (${session.endpoints.size} endpoints)`);
    session.wsClients.add(ws);

    // Send initial session handshake
    ws.send(
      JSON.stringify({
        type: 'SESSION_INITIALIZED',
        sessionId,
        state: session.state,
        masterGain: session.masterGain,
        masterMuted: session.masterMuted,
        endpointCount: session.endpoints.size,
      })
    );

    ws.on('message', (data: Buffer | string, isBinary: boolean) => {
      if (isBinary) {
        // High-performance binary PCM audio chunk from microphone
        this.processAudioFrame(session, data as Buffer);
      } else {
        // Control message (JSON)
        try {
          const msg = JSON.parse(data.toString());
          this.handleControlMessage(session, msg);
        } catch {}
      }
    });

    ws.on('close', (code, reason) => {
      console.log(`[MediaGateway] Client disconnected from session ${sessionId}: code=${code}`);
      session.wsClients.delete(ws);
    });

    ws.on('error', (err) => {
      console.error(`[MediaGateway] Client socket error:`, err);
      session.wsClients.delete(ws);
    });
  }

  /**
   * Process microphone audio frame, compute levels, apply gain, and distribute to voice workers.
   */
  private processAudioFrame(session: ActiveSession, buffer: Buffer): void {
    if ((session.state !== 'streaming' && session.state !== 'connecting') || session.masterMuted) return;

    // Ensure 48kHz 16-bit Stereo PCM for @discordjs/voice Opus encoding
    const audioChunk =
      buffer.length % 4 !== 0
        ? this.monoToStereo(buffer)
        : buffer;

    // Professional Studio Loudness & C1 Continuous Soft-Knee Analog Saturation Engine
    // Boosts acoustic energy massively while completely preserving clarity, vocal definition, and bass punch
    const gain = session.masterGain;
    const isMuted = session.masterMuted;
    const processedChunk = Buffer.allocUnsafe(audioChunk.length);

    if (isMuted) {
      processedChunk.fill(0);
    } else {
      const boost = 1.6; // +4.1 dB studio broadcast pre-amp
      const effectiveMultiplier = gain * boost;
      const T = 0.60; // Linear threshold: under 60% is 100% bit-exact transparent clarity
      const invHeadroom = 1 / (1.0 - T);

      for (let i = 0; i < audioChunk.length; i += 2) {
        const sample = audioChunk.readInt16LE(i);
        const x = (sample / 32768) * effectiveMultiplier;
        const absX = Math.abs(x);
        let y: number;

        if (absX <= T) {
          y = x;
        } else {
          // Smooth C1-continuous soft-knee saturation curve (zero harsh clipping buzz, maximum punch)
          y = Math.sign(x) * (T + (1.0 - T) * Math.tanh((absX - T) * invHeadroom));
        }

        const outSample = Math.max(-32768, Math.min(32767, Math.round(y * 32767)));
        processedChunk.writeInt16LE(outSample, i);
      }
    }

    // Calculate real peak VU level (0 to 100 scale) from processedChunk
    const peak = this.calculatePeakLevel(processedChunk);

    session.frameCount = (session.frameCount || 0) + 1;
    if (session.frameCount % 100 === 1) {
      console.log(
        `[MediaGateway] Ingesting audio frame #${session.frameCount}: bytes=${processedChunk.length}, gain=${gain}x (${Math.round(gain * 100)}%), peak=${peak}%, active endpoints=${session.endpoints.size}`
      );
    }

    // 1. Broadcast to synchronized Shared AudioPlayer (sample-accurate phase-aligned broadcast to all bots)
    if (session.sharedStream && session.sharedPlayer) {
      try {
        if (
          !session.sharedStream.writable ||
          session.sharedStream.destroyed ||
          session.sharedPlayer.state.status === AudioPlayerStatus.Idle ||
          session.sharedPlayer.state.status === AudioPlayerStatus.AutoPaused
        ) {
          session.sharedStream = new PassThrough();
          session.sharedStream.setMaxListeners(100);
          session.sharedResource = createAudioResource(session.sharedStream, {
            inputType: StreamType.Raw,
            inlineVolume: false,
          });
          this.tuneEncoder(session.sharedResource);
          session.sharedPlayer.play(session.sharedResource);
        }
        session.sharedStream.write(processedChunk);
      } catch (err) {
        console.error('[MediaGateway] Shared audio stream write error:', err);
      }
    }

    // 2. Distribute to all active voice workers (for fallback, simulator, and VU tracking)
    session.endpoints.forEach((worker) => {
      worker.feedAudio(processedChunk, peak);
    });

    // 3. Broadcast VU update every ~50ms to browser
    const now = Date.now();
    if (!session.lastVuBroadcastAt || now - session.lastVuBroadcastAt >= 50) {
      session.lastVuBroadcastAt = now;
      this.broadcastToSession(session, {
        type: 'VU_METER',
        masterLevel: peak,
        endpoints: Array.from(session.endpoints.values()).map((w) => ({
          endpointId: w.endpointId,
          state: w.state,
          vuLevel: w.vuLevel,
        })),
      });
    }
  }

  /**
   * Calculate audio peak level from raw PCM buffer.
   */
  private calculatePeakLevel(buffer: Buffer): number {
    let max = 0;
    // PCM 16-bit signed integer values range from -32768 to 32767
    for (let i = 0; i < buffer.length - 1; i += 2) {
      const sample = Math.abs(buffer.readInt16LE(i));
      if (sample > max) max = sample;
    }
    // Convert to percentage 0..100
    return Math.min(100, Math.round((max / 32768) * 100));
  }

  private monoToStereo(mono: Buffer): Buffer {
    const numSamples = Math.floor(mono.length / 2);
    const stereo = Buffer.allocUnsafe(numSamples * 4);
    for (let i = 0, j = 0; i < numSamples * 2; i += 2, j += 4) {
      const sample = mono.readInt16LE(i);
      stereo.writeInt16LE(sample, j);     // Left
      stereo.writeInt16LE(sample, j + 2); // Right
    }
    return stereo;
  }

  /**
   * Tune Opus encoder to 128 kbps HD voice with Forward Error Correction for studio clarity.
   */
  private tuneEncoder(resource: any): void {
    if (resource?.encoder) {
      try {
        if (typeof resource.encoder.setBitrate === 'function') {
          resource.encoder.setBitrate(384000); // 384 kbps Studio Master HD Broadcast quality
        }
        if (typeof resource.encoder.setFEC === 'function') {
          resource.encoder.setFEC(true); // Forward Error Correction for zero-packet-loss clarity
        }
        if (typeof resource.encoder.setPLP === 'function') {
          resource.encoder.setPLP(0.02); // 2% packet loss protection
        }
      } catch (err) {
        console.warn('[MediaGateway] Encoder tuning notice:', err);
      }
    }
  }

  private handleControlMessage(session: ActiveSession, msg: any): void {
    switch (msg.type) {
      case 'SET_MASTER_GAIN':
        if (typeof msg.gain === 'number') {
          session.masterGain = Math.max(0, Math.min(100.0, msg.gain));
          if (session.sharedResource?.volume) {
            session.sharedResource.volume.setVolume(session.masterMuted ? 0 : session.masterGain);
          }
          // Propagate to all voice workers so every bot plays at the exact same unified volume
          session.endpoints.forEach((worker) => {
            worker.setGain(session.masterGain);
          });
          this.broadcastToSession(session, {
            type: 'STATE_CHANGED',
            masterGain: session.masterGain,
          });
        }
        break;

      case 'SET_MASTER_MUTE':
        session.masterMuted = Boolean(msg.muted);
        if (session.sharedResource?.volume) {
          session.sharedResource.volume.setVolume(session.masterMuted ? 0 : session.masterGain);
        }
        this.broadcastToSession(session, {
          type: 'STATE_CHANGED',
          masterMuted: session.masterMuted,
        });
        break;

      case 'SET_ENDPOINT_GAIN':
        if (msg.endpointId && typeof msg.gain === 'number') {
          const worker = session.endpoints.get(msg.endpointId);
          if (worker) {
            worker.setGain(Math.max(0, Math.min(100.0, msg.gain)));
          }
        }
        break;

      case 'SET_ENDPOINT_MUTE':
        if (msg.endpointId) {
          const worker = session.endpoints.get(msg.endpointId);
          if (worker) {
            worker.setMute(Boolean(msg.muted));
          }
        }
        break;

      case 'RECONNECT_ENDPOINT':
        if (msg.endpointId) {
          this.reconnectEndpoint(session.sessionId, msg.endpointId).catch((err) => {
            console.warn(`[MediaGateway] WebSocket reconnect endpoint ${msg.endpointId} error:`, err);
          });
        }
        break;

      case 'EMERGENCY_STOP':
        this.emergencyStop(session.sessionId, 'user_initiated');
        break;
    }
  }

  /**
   * Initialize a voice session on the media gateway.
   */
  public async createSession(
    sessionId: string,
    workspaceId: string,
    userId: string,
    endpointConfigs: VoiceEndpointConfig[],
    initialMasterGain = 1.0
  ): Promise<ActiveSession> {
    // If previous session exists, clean it up
    if (this.activeSessions.has(sessionId)) {
      await this.stopSession(sessionId, 'recreated');
    }

    const initialGain = Math.max(0, Math.min(100.0, initialMasterGain ?? 1.0));

    // Clean up any previous session with the same ID or in the same workspace
    if (this.activeSessions.has(sessionId)) {
      await this.stopSession(sessionId, 'session_recreated');
    }
    for (const [sId, sess] of this.activeSessions.entries()) {
      if (sess.workspaceId === workspaceId || sId === sessionId) {
        console.log(`[MediaGateway] Cleaning up previous session ${sId} in workspace ${workspaceId}`);
        await this.stopSession(sId, 'new_session_started');
      }
    }

    const session: ActiveSession = {
      sessionId,
      workspaceId,
      userId,
      state: 'awaiting_start',
      masterGain: initialGain,
      masterMuted: false,
      startedAt: Date.now(),
      endpoints: new Map(),
      wsClients: new Set(),
    };

    // Initialize synchronized Shared AudioPlayer for sample-accurate phase-aligned multi-bot broadcast
    const sharedStream = new PassThrough();
    sharedStream.setMaxListeners(100);
    const sharedResource = createAudioResource(sharedStream, {
      inputType: StreamType.Raw,
      inlineVolume: false,
    });
    this.tuneEncoder(sharedResource);
    const sharedPlayer = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Play,
        maxMissedFrames: 1_000_000,
      },
    });
    sharedPlayer.play(sharedResource);

    session.sharedPlayer = sharedPlayer;
    session.sharedStream = sharedStream;
    session.sharedResource = sharedResource;

    // Instantiate VoiceWorkerInstance for each destination
    for (const config of endpointConfigs) {
      if (config.gain === undefined) {
        config.gain = initialGain;
      }
      const worker = new VoiceWorkerInstance(config);
      session.endpoints.set(config.endpointId, worker);
    }

    this.activeSessions.set(sessionId, session);
    return session;
  }

  /**
   * Start transmission: connect all voice workers to Discord.
   */
  public async startSession(sessionId: string): Promise<boolean> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return false;

    if (session.state === 'streaming') return true;

    session.state = 'streaming';
    this.broadcastToSession(session, { type: 'STATE_CHANGED', state: 'streaming' });

    // Connect all endpoints (synchronously for mock bots, sequentially with DAVE settling for real bots)
    const workers = Array.from(session.endpoints.values());
    const allMock = workers.every((w) => w.isMock);

    if (allMock) {
      for (const worker of workers) {
        await worker.connect();
        this.broadcastToSession(session, {
          type: 'ENDPOINT_STATUS',
          endpointId: worker.endpointId,
          state: worker.state,
        });
      }
    } else {
      // Connect all bots simultaneously at a time with synchronized shared player
      (async () => {
        console.log(`[MediaGateway] Joining all ${workers.length} bots to Discord voice AT A TIME...`);
        await Promise.allSettled(
          workers.map(async (worker, i) => {
            if (!this.activeSessions.has(session.sessionId) || (session.state as string) === 'stopped') return;
            // 30ms micro-stagger between bot connection initializations prevents gateway opcode 4 burst packet drops
            if (i > 0) {
              await new Promise((r) => setTimeout(r, i * 30));
            }
            if (!this.activeSessions.has(session.sessionId) || (session.state as string) === 'stopped') return;
            try {
              console.log(`[MediaGateway] [${i + 1}/${workers.length}] Joining voice: ${worker.botId}...`);
              await worker.connect(session.sharedPlayer);
              console.log(`[MediaGateway] [${i + 1}/${workers.length}] Bot ${worker.botId} -> ${worker.state}`);
              this.broadcastToSession(session, {
                type: 'ENDPOINT_STATUS',
                endpointId: worker.endpointId,
                state: worker.state,
              });
            } catch (err: any) {
              console.warn(`[MediaGateway] Worker ${worker.endpointId} connect error:`, err?.message || err);
            }
          })
        );
        console.log(`[MediaGateway] All ${workers.length} bots finished joining voice channel at a time!`);
      })();
    }

    // Update DB
    prisma.voiceSession
      .update({
        where: { id: sessionId },
        data: {
          state: 'streaming',
          started_at: new Date(),
        },
      })
      .catch(() => {});

    return true;
  }

  /**
   * Reconnect a specific voice endpoint in an active session.
   */
  public async reconnectEndpoint(sessionId: string, endpointId: string): Promise<boolean> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      console.warn(`[MediaGateway] Cannot reconnect endpoint ${endpointId}: session ${sessionId} not found`);
      return false;
    }

    let worker = session.endpoints.get(endpointId);
    if (!worker) {
      try {
        const dbEndpoint = await prisma.voiceEndpoint.findUnique({
          where: { id: endpointId },
          include: {
            bot: {
              include: { credentials: true },
            },
            guild: true,
            channel: true,
          },
        });
        if (
          !dbEndpoint ||
          !dbEndpoint.bot ||
          !dbEndpoint.bot.credentials[0] ||
          !dbEndpoint.guild ||
          !dbEndpoint.channel
        ) {
          return false;
        }

        const token = decryptSecret(dbEndpoint.bot.credentials[0].secret_reference);
        worker = new VoiceWorkerInstance({
          endpointId: dbEndpoint.id,
          botId: dbEndpoint.bot_id,
          botToken: token,
          guildId: dbEndpoint.guild.guild_id,
          channelId: dbEndpoint.channel.channel_id,
          gain: session.masterGain,
          muted: session.masterMuted,
        });
        session.endpoints.set(endpointId, worker);
      } catch (err: any) {
        console.error(`[MediaGateway] Recreating worker ${endpointId} failed:`, err);
        return false;
      }
    }

    worker.state = 'reconnecting';
    this.broadcastToSession(session, {
      type: 'ENDPOINT_STATUS',
      endpointId: worker.endpointId,
      state: 'reconnecting',
    });

    try {
      const success = await worker.reconnect(session.sharedPlayer);
      this.broadcastToSession(session, {
        type: 'ENDPOINT_STATUS',
        endpointId: worker.endpointId,
        state: worker.state,
      });
      if (success) {
        await prisma.voiceEndpoint
          .update({
            where: { id: endpointId },
            data: { state: 'connected' },
          })
          .catch(() => {});
      }
      return success;
    } catch (err: any) {
      console.warn(`[MediaGateway] Reconnecting worker ${endpointId} error:`, err?.message || err);
      this.broadcastToSession(session, {
        type: 'ENDPOINT_STATUS',
        endpointId: worker.endpointId,
        state: 'failed',
      });
      return false;
    }
  }

  /**
   * Stop session normally.
   */
  public async stopSession(sessionId: string, reason = 'user_initiated'): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    session.state = 'stopping';
    this.broadcastToSession(session, { type: 'STATE_CHANGED', state: 'stopping' });

    // Clean up shared audio stream & player
    if (session.sharedStream) {
      try {
        session.sharedStream.end();
      } catch {}
      session.sharedStream = undefined;
    }
    if (session.sharedPlayer) {
      try {
        session.sharedPlayer.stop();
      } catch {}
      session.sharedPlayer = undefined;
    }

    // Destroy all voice workers
    session.endpoints.forEach((worker) => worker.destroy());
    session.endpoints.clear();

    session.state = 'stopped';
    this.broadcastToSession(session, { type: 'STATE_CHANGED', state: 'stopped', reason });

    // Close all browser WS clients
    session.wsClients.forEach((ws) => {
      try {
        ws.close(1000, `Session stopped: ${reason}`);
      } catch {}
    });
    session.wsClients.clear();

    this.activeSessions.delete(sessionId);

    // Update DB
    try {
      await prisma.voiceSession.update({
        where: { id: sessionId },
        data: {
          state: 'stopped',
          stopped_at: new Date(),
          stop_reason: reason,
        },
      });

      // Record audit
      await AuditService.record({
        workspaceId: session.workspaceId,
        actorUserId: session.userId,
        action: 'voice.stop',
        resourceType: 'voice_session',
        resourceId: sessionId,
        metadata: { reason },
      });
    } catch (err: any) {
      console.warn('[MediaGateway] DB update warning on stop:', err?.message || err);
    }
  }

  /**
   * Emergency Stop: Instantly kills all audio distribution, disconnects voice bots,
   * invalidates session and alerts clients.
   */
  public async emergencyStop(sessionId: string, reason = 'emergency_stop'): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      // Still ensure DB session is marked stopped
      try {
        await prisma.voiceSession.update({
          where: { id: sessionId },
          data: {
            state: 'stopped',
            stopped_at: new Date(),
            stop_reason: 'emergency_stop',
          },
        });
      } catch {}
      return;
    }

    console.warn(`[MediaGateway] EMERGENCY STOP triggered for session ${sessionId}`);

    // Instantly notify clients
    this.broadcastToSession(session, {
      type: 'EMERGENCY_STOP_TRIGGERED',
      sessionId,
      reason,
      timestamp: Date.now(),
    });

    // Forcefully destroy all Discord voice connections in parallel immediately
    const destroyPromises = Array.from(session.endpoints.values()).map(async (worker) => {
      try {
        worker.destroy();
      } catch {}
    });
    session.endpoints.clear();

    // Close all WebSockets immediately
    session.wsClients.forEach((ws) => {
      try {
        ws.close(4000, 'EMERGENCY_STOP');
      } catch {}
    });
    session.wsClients.clear();

    this.activeSessions.delete(sessionId);

    // Concurrently force-disconnect all workers and any lingering bot voice state strictly for this workspace
    await Promise.allSettled([
      ...destroyPromises,
      session.workspaceId ? FleetGatewayService.forceDisconnectWorkspaceVoice(session.workspaceId) : Promise.resolve(),
    ]);

    // Update DB & Audit
    try {
      await prisma.voiceSession.update({
        where: { id: sessionId },
        data: {
          state: 'stopped',
          stopped_at: new Date(),
          stop_reason: 'emergency_stop',
        },
      });

      await AuditService.record({
        workspaceId: session.workspaceId,
        actorUserId: session.userId,
        action: 'voice.emergency_stop',
        resourceType: 'voice_session',
        resourceId: sessionId,
        result: 'success',
        metadata: { reason, timestamp: new Date().toISOString() },
      });
    } catch (err) {
      console.error('[MediaGateway] Emergency stop DB error:', err);
    }
  }

  public getSession(sessionId: string): ActiveSession | undefined {
    return this.activeSessions.get(sessionId);
  }

  /**
   * Stop all active voice streaming sessions belonging strictly to a specific workspace.
   */
  public async stopWorkspaceSessions(workspaceId: string, reason = 'workspace_stop'): Promise<void> {
    if (!workspaceId) return;
    const sessionIdsToStop: string[] = [];
    for (const session of this.activeSessions.values()) {
      if (session.workspaceId === workspaceId) {
        sessionIdsToStop.push(session.sessionId);
      }
    }
    await Promise.allSettled(
      sessionIdsToStop.map((id) => this.emergencyStop(id, reason))
    );
  }

  public async emergencyStopAll(reason = 'emergency_stop'): Promise<void> {
    const sessionIds = Array.from(this.activeSessions.keys());
    await Promise.allSettled([
      ...sessionIds.map((sessionId) => this.emergencyStop(sessionId, reason)),
      FleetGatewayService.forceDisconnectAllVoice(),
    ]);
  }

  public setMasterGainWorkspace(workspaceId: string, gain: number): void {
    const clampedGain = Math.max(0, Math.min(100.0, gain));
    for (const session of this.activeSessions.values()) {
      if (session.workspaceId === workspaceId) {
        session.masterGain = clampedGain;
        session.endpoints.forEach((worker) => {
          worker.setGain(clampedGain);
        });
        this.broadcastToSession(session, {
          type: 'STATE_CHANGED',
          masterGain: clampedGain,
        });
      }
    }
  }

  public setMasterGainAll(gain: number): void {
    const clampedGain = Math.max(0, Math.min(100.0, gain));
    for (const session of this.activeSessions.values()) {
      session.masterGain = clampedGain;
      session.endpoints.forEach((worker) => {
        worker.setGain(clampedGain);
      });
      this.broadcastToSession(session, {
        type: 'STATE_CHANGED',
        masterGain: clampedGain,
      });
    }
  }

  public setMasterMuteWorkspace(workspaceId: string, muted: boolean): void {
    for (const session of this.activeSessions.values()) {
      if (session.workspaceId === workspaceId) {
        session.masterMuted = muted;
        session.endpoints.forEach((worker) => {
          worker.setMute(muted);
        });
        this.broadcastToSession(session, {
          type: 'STATE_CHANGED',
          masterMuted: muted,
        });
      }
    }
  }

  public setMasterMuteAll(muted: boolean): void {
    for (const session of this.activeSessions.values()) {
      session.masterMuted = muted;
      this.broadcastToSession(session, {
        type: 'STATE_CHANGED',
        masterMuted: session.masterMuted,
      });
    }
  }

  /**
   * Check if a bot is currently in an active voice stream.
   * If guildId is provided, checks if it is actively in voice in that specific Discord guild.
   */
  public getActiveBotVoiceSession(botIdOrAppId: string, guildId?: string): {
    inUse: boolean;
    sessionId?: string;
    workspaceId?: string;
    guildId?: string;
    channelId?: string;
  } {
    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (session.state === 'streaming' || session.state === 'awaiting_start' || session.state === 'connecting') {
        for (const worker of session.endpoints.values()) {
          const matchBot =
            worker.botId === botIdOrAppId ||
            (worker as any).config?.applicationId === botIdOrAppId;
          const matchGuild = !guildId || worker.guildId === guildId;
          if (matchBot && matchGuild && (worker.state === 'connected' || worker.state === 'connecting' || worker.state === 'muted')) {
            return {
              inUse: true,
              sessionId,
              workspaceId: session.workspaceId,
              guildId: worker.guildId,
              channelId: worker.channelId,
            };
          }
        }
      }
    }
    return { inUse: false };
  }

  private broadcastToSession(session: ActiveSession, data: any): void {
    const payload = JSON.stringify(data);
    session.wsClients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    });
  }
}

export const mediaGateway = MediaGatewayManager.getInstance();
