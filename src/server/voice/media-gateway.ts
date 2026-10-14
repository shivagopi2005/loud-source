import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { verifyMediaSessionToken } from '../security/jwt';
import { VoiceWorkerInstance, VoiceEndpointConfig } from './voice-worker';
import { prisma } from '../db/prisma';
import { AuditService } from '../services/audit.service';
import { decryptSecret } from '../security/encryption';

export interface ActiveSession {
  sessionId: string;
  workspaceId: string;
  userId: string;
  state: 'awaiting_start' | 'connecting' | 'streaming' | 'paused' | 'stopping' | 'stopped' | 'failed';
  masterGain: number; // 0.0 to 2.0
  masterMuted: boolean;
  startedAt: number;
  endpoints: Map<string, VoiceWorkerInstance>;
  wsClients: Set<WebSocket>;
}

export class MediaGatewayManager {
  private static instance: MediaGatewayManager;
  private activeSessions = new Map<string, ActiveSession>();
  private wss: WebSocketServer | null = null;

  public static getInstance(): MediaGatewayManager {
    if (!MediaGatewayManager.instance) {
      MediaGatewayManager.instance = new MediaGatewayManager();
    }
    return MediaGatewayManager.instance;
  }

  /**
   * Attach WebSocket server for real-time microphone audio ingest & telemetry.
   */
  public attachServer(serverOrPort: any): void {
    if (this.wss) return;

    if (typeof serverOrPort === 'number') {
      this.wss = new WebSocketServer({ port: serverOrPort });
      console.log(`[MediaGateway] WebSocket server listening on port ${serverOrPort}`);
    } else {
      this.wss = new WebSocketServer({ server: serverOrPort, path: '/media-stream' });
      console.log(`[MediaGateway] WebSocket server attached to HTTP server path /media-stream`);
    }

    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      this.handleConnection(ws, req);
    });
  }

  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    const token = url.searchParams.get('token');

    if (!token) {
      ws.close(4001, 'Media token required');
      return;
    }

    const payload = verifyMediaSessionToken(token);
    if (!payload) {
      ws.close(4003, 'Invalid or expired media session token');
      return;
    }

    const { sessionId, workspaceId, userId } = payload;
    const session = this.activeSessions.get(sessionId);

    if (!session) {
      ws.close(4004, 'Active voice session not found on gateway');
      return;
    }

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

    ws.on('close', () => {
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
    if (session.state !== 'streaming' || session.masterMuted) return;

    // Calculate RMS and Peak VU level (0 to 100 scale)
    const peak = this.calculatePeakLevel(buffer);
    const scaledPeak = Math.round(peak * session.masterGain);

    // Distribute to all active voice workers
    session.endpoints.forEach((worker) => {
      worker.feedAudio(buffer, scaledPeak);
    });

    // Broadcast VU update every ~50ms to browser
    const now = Date.now();
    if (now % 4 === 0) {
      this.broadcastToSession(session, {
        type: 'VU_METER',
        masterLevel: scaledPeak,
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

  private handleControlMessage(session: ActiveSession, msg: any): void {
    switch (msg.type) {
      case 'SET_MASTER_GAIN':
        if (typeof msg.gain === 'number') {
          session.masterGain = Math.max(0, Math.min(10.0, msg.gain));
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
        this.broadcastToSession(session, {
          type: 'STATE_CHANGED',
          masterMuted: session.masterMuted,
        });
        break;

      case 'SET_ENDPOINT_GAIN':
        if (msg.endpointId && typeof msg.gain === 'number') {
          const worker = session.endpoints.get(msg.endpointId);
          if (worker) {
            worker.setGain(Math.max(0, Math.min(10.0, msg.gain)));
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
    endpointConfigs: VoiceEndpointConfig[]
  ): Promise<ActiveSession> {
    // If previous session exists, clean it up
    if (this.activeSessions.has(sessionId)) {
      await this.stopSession(sessionId, 'recreated');
    }

    const session: ActiveSession = {
      sessionId,
      workspaceId,
      userId,
      state: 'awaiting_start',
      masterGain: 1.0,
      masterMuted: false,
      startedAt: Date.now(),
      endpoints: new Map(),
      wsClients: new Set(),
    };

    // Instantiate VoiceWorkerInstance for each destination
    for (const config of endpointConfigs) {
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

    session.state = 'connecting';
    this.broadcastToSession(session, { type: 'STATE_CHANGED', state: 'connecting' });

    // Connect all endpoints with a small stagger (150ms) so UDP IP discovery never collides
    const workers = Array.from(session.endpoints.values());
    const connectPromises: Promise<any>[] = [];

    for (const worker of workers) {
      connectPromises.push(
        worker.connect().catch((err) => {
          console.warn(`[MediaGateway] Worker connect error:`, err);
          return false;
        })
      );
      // Small 150ms stagger between bot joins
      if (workers.length > 1) {
        await new Promise((r) => setTimeout(r, 150));
      }
    }

    await Promise.all(connectPromises);

    session.state = 'streaming';
    this.broadcastToSession(session, {
      type: 'STATE_CHANGED',
      state: 'streaming',
      endpoints: Array.from(session.endpoints.values()).map((w) => ({
        endpointId: w.endpointId,
        state: w.state,
      })),
    });

    // Update DB
    await prisma.voiceSession.update({
      where: { id: sessionId },
      data: {
        state: 'streaming',
        started_at: new Date(),
      },
    });

    return true;
  }

  /**
   * Stop session normally.
   */
  public async stopSession(sessionId: string, reason = 'user_initiated'): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    session.state = 'stopping';
    this.broadcastToSession(session, { type: 'STATE_CHANGED', state: 'stopping' });

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
    } catch (err) {
      console.error('[MediaGateway] DB update error on stop:', err);
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

    // Forcefully destroy all Discord voice connections immediately
    session.endpoints.forEach((worker) => {
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
