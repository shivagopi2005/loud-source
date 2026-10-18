import { PassThrough, Readable } from 'stream';
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  AudioPlayer,
  VoiceConnection,
  StreamType,
  NoSubscriberBehavior,
  getVoiceConnection,
} from '@discordjs/voice';
import { Client, GatewayIntentBits } from 'discord.js';
import { FleetGatewayService } from '../services/fleet-gateway.service';

export interface VoiceEndpointConfig {
  endpointId: string;
  botId: string;
  applicationId?: string;
  botToken: string;
  guildId: string;
  channelId: string;
  gain?: number; // 0.0 to 2.0
  muted?: boolean;
}

export interface VoiceEndpointMetrics {
  endpointId: string;
  botId: string;
  state: 'connecting' | 'connected' | 'muted' | 'reconnecting' | 'failed' | 'disconnected';
  lastErrorCode?: string;
  vuLevel: number; // 0 to 100
  pingMs?: number;
}

/**
 * Custom gateway voice adapter that sends Discord voice opcodes directly over the shard
 * without being blocked by discord.js's Status.Ready check when shards are in Status.WaitingForGuilds (6).
 */
export function createCustomVoiceAdapter(guild: any) {
  return (methods: any) => {
    guild.client.voice.adapters.set(guild.id, methods);
    return {
      sendPayload(data: any) {
        try {
          if (guild.shard) {
            guild.shard.send(data);
            return true;
          }
          if (guild.client?.ws?.shards?.first()) {
            guild.client.ws.shards.first().send(data);
            return true;
          }
          return false;
        } catch (err: any) {
          console.warn(`[CustomVoiceAdapter:${guild.id}] sendPayload error:`, err?.message || err);
          return false;
        }
      },
      destroy() {
        guild.client.voice.adapters.delete(guild.id);
      },
    };
  };
}

export function tuneResourceEncoder(resource: any): void {
  if (resource?.encoder) {
    try {
      if (typeof resource.encoder.setBitrate === 'function') {
        resource.encoder.setBitrate(384000); // 384 kbps Studio Master HD Broadcast Quality
      }
      if (typeof resource.encoder.setFEC === 'function') {
        resource.encoder.setFEC(true); // Forward Error Correction for zero-packet-loss clarity
      }
      if (typeof resource.encoder.setPLP === 'function') {
        resource.encoder.setPLP(0.02); // 2% packet loss protection
      }
    } catch {}
  }
}

export class VoiceWorkerInstance {
  public readonly endpointId: string;
  public readonly botId: string;
  public readonly applicationId?: string;
  public readonly guildId: string;
  public readonly channelId: string;
  private botToken: string;

  public state: 'connecting' | 'connected' | 'muted' | 'reconnecting' | 'failed' | 'disconnected' =
    'connecting';
  public lastErrorCode?: string;
  public gain = 1.0;
  public muted = false;
  public vuLevel = 0;

  private client: Client | null = null;
  private ownsClient = false;
  private connection: VoiceConnection | null = null;
  private player: AudioPlayer | null = null;
  private audioStream: PassThrough | null = null;
  private resource: any | null = null;
  private subscription: any = null;
  private sharedPlayer: AudioPlayer | null = null;
  public isMock = false;

  constructor(config: VoiceEndpointConfig) {
    this.endpointId = config.endpointId;
    this.botId = config.botId;
    this.applicationId = config.applicationId;
    this.botToken = config.botToken;
    this.guildId = config.guildId;
    this.channelId = config.channelId;
    this.gain = config.gain ?? 1.0;
    this.muted = config.muted ?? false;
    this.isMock =
      this.botToken.startsWith('mock_') ||
      this.botToken.startsWith('test_') ||
      this.botToken.includes('.mock_') ||
      this.botToken.includes('.test_');
  }

  /**
   * Connect to Discord voice channel.
   */
  async connect(sharedPlayer?: AudioPlayer): Promise<boolean> {
    this.state = 'connecting';

    if (this.isMock) {
      this.state = this.muted ? 'muted' : 'connected';
      return true;
    }

    try {
      // Reuse existing active client from FleetGatewayService if available
      const existingClient = FleetGatewayService.getClient(this.botId, this.applicationId);
      if (existingClient && (existingClient.isReady() || existingClient.user)) {
        this.client = existingClient;
        this.ownsClient = false;
      } else {
        this.client = new Client({
          intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
        });
        await new Promise<void>((resolve, reject) => {
          this.client!.once('ready', () => resolve());
          this.client!.login(this.botToken).catch(reject);
        });
        this.ownsClient = true;
      }

      if (!this.client) {
        this.state = 'failed';
        this.lastErrorCode = 'CLIENT_UNAVAILABLE';
        return false;
      }

      let guild = this.client.guilds.cache.get(this.guildId);
      if (!guild) {
        try {
          guild = await this.client.guilds.fetch(this.guildId);
        } catch (gErr: any) {
          console.warn(`[VoiceWorker:${this.endpointId}] Bot is not in guild ${this.guildId}:`, gErr.message);
          this.state = 'failed';
          this.lastErrorCode = 'BOT_NOT_IN_GUILD';
          return false;
        }
      }

      if (!guild) {
        this.state = 'failed';
        this.lastErrorCode = 'GUILD_NOT_FOUND';
        return false;
      }

      const botGroupId = this.client.user?.id || this.botId;

      // Check if bot is ALREADY in the target channel and ready
      const existingConn = getVoiceConnection(this.guildId, botGroupId);
      const currentVoiceChannelId = guild.members.me?.voice?.channelId;

      if (
        existingConn &&
        existingConn.state.status === VoiceConnectionStatus.Ready &&
        currentVoiceChannelId === this.channelId
      ) {
        console.log(
          `[VoiceWorker:${this.endpointId}] Bot ${this.botId} is already ready in voice channel ${this.channelId}, reusing connection`
        );
        this.connection = existingConn;
        this.state = this.muted ? 'muted' : 'connected';
        if (sharedPlayer) {
          this.sharedPlayer = sharedPlayer;
          try {
            this.subscription = this.connection.subscribe(sharedPlayer);
          } catch {}
        }
        return true;
      }

      // If existing connection was in another channel or broken, clean it up cleanly
      if (existingConn) {
        try {
          existingConn.destroy();
        } catch {}
      }

      const setupListeners = (conn: VoiceConnection) => {
        conn.on('error', (err: any) => {
          console.warn(`[VoiceWorker:${this.endpointId}] VoiceConnection warning:`, err?.message || err);
        });

        conn.on(VoiceConnectionStatus.Disconnected, async () => {
          try {
            this.state = 'reconnecting';
            await Promise.race([
              entersState(conn, VoiceConnectionStatus.Signalling, 8_000),
              entersState(conn, VoiceConnectionStatus.Connecting, 8_000),
            ]);
          } catch {
            if (conn.state.status !== VoiceConnectionStatus.Ready) {
              this.state = 'failed';
              this.lastErrorCode = 'VOICE_DISCONNECTED_TIMEOUT';
              this.destroy();
            }
          }
        });
      };

      let connected = false;
      const maxRetries = 2;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          if (attempt > 1) {
            console.log(
              `[VoiceWorker:${this.endpointId}] Retrying voice connection attempt ${attempt}/${maxRetries}...`
            );
            if (this.connection) {
              try {
                this.connection.destroy();
              } catch {}
              this.connection = null;
            }
            await new Promise((r) => setTimeout(r, 1200));
          }

          this.connection = joinVoiceChannel({
            channelId: this.channelId,
            guildId: this.guildId,
            adapterCreator: createCustomVoiceAdapter(guild) as any,
            group: botGroupId,
            selfDeaf: false,
            selfMute: false,
          });

          setupListeners(this.connection);

          // Wait for Voice Connection to be Ready (12s timeout)
          await entersState(this.connection, VoiceConnectionStatus.Ready, attempt === 1 ? 12_000 : 8_000);
          connected = true;
          break;
        } catch (readyErr: any) {
          console.warn(
            `[VoiceWorker:${this.endpointId}] Voice ready attempt ${attempt}/${maxRetries} failed:`,
            readyErr?.message || readyErr
          );
        }
      }

      if (!connected || !this.connection) {
        this.state = 'failed';
        this.lastErrorCode = 'VOICE_READY_TIMEOUT';
        this.destroy();
        return false;
      }

      this.state = this.muted ? 'muted' : 'connected';

      if (sharedPlayer) {
        this.sharedPlayer = sharedPlayer;
        this.sharedPlayer = sharedPlayer;
        this.subscription = this.connection.subscribe(sharedPlayer);
      } else {
        // Setup AudioPlayer with NoSubscriberBehavior.Play so it never autopauses
        this.player = createAudioPlayer({
          behaviors: {
            noSubscriber: NoSubscriberBehavior.Play,
            maxMissedFrames: 1_000_000,
          },
        });

        this.player.on('error', (err) => {
          console.warn(`[VoiceWorker:${this.endpointId}] AudioPlayer warning:`, err.message);
          try {
            this.audioStream = new PassThrough();
            this.audioStream.setMaxListeners(50);
            const resource = createAudioResource(this.audioStream, {
              inputType: StreamType.Raw,
              inlineVolume: true,
            });
            tuneResourceEncoder(resource);
            this.resource = resource;
            if (resource.volume) {
              resource.volume.setVolume(this.muted ? 0 : this.gain);
            }
            this.player?.play(resource);
            this.audioStream.write(Buffer.alloc(3840));
            this.state = this.muted ? 'muted' : 'connected';
          } catch (recErr: any) {
            console.error(`[VoiceWorker:${this.endpointId}] Failed to auto-recover:`, recErr.message);
          }
        });

        this.audioStream = new PassThrough();
        this.audioStream.setMaxListeners(50);
        const resource = createAudioResource(this.audioStream, {
          inputType: StreamType.Raw,
          inlineVolume: true,
        });
        tuneResourceEncoder(resource);
        this.resource = resource;

        if (resource.volume) {
          resource.volume.setVolume(this.muted ? 0 : this.gain);
        }

        this.player.play(resource);
        this.subscription = this.connection.subscribe(this.player);

        // Pre-seed with 1 frame of silence so AudioPlayer immediately transitions from buffering -> playing
        this.audioStream.write(Buffer.alloc(3840));
      }

      this.connection.on(VoiceConnectionStatus.Ready, () => {
        this.state = this.muted ? 'muted' : 'connected';
      });

      return true;
    } catch (err: any) {
      console.error(`[VoiceWorker:${this.endpointId}] Connection failed:`, err);
      this.state = 'failed';
      this.lastErrorCode = err.message || 'CONNECTION_FAILED';
      this.destroy();
      return false;
    }
  }

  /**
   * Feed raw PCM audio chunk to the voice stream.
   */
  feedAudio(chunk: Buffer, peakLevel: number): void {
    if (this.state !== 'connected' && this.state !== 'muted') return;

    // Apply per-output VU meter level (peakLevel is computed from processed chunk)
    this.vuLevel = this.muted ? 0 : Math.min(100, peakLevel);

    // If using shared session player or simulator mode, individual audio feeding is bypassed
    if (this.sharedPlayer || this.isMock) {
      return;
    }

    if (!this.muted) {
      try {
        // If player went idle, autopaused, or stream is closed, re-initialize resource and play
        if (
          !this.player ||
          !this.audioStream ||
          !this.audioStream.writable ||
          this.audioStream.destroyed ||
          this.player.state.status === AudioPlayerStatus.Idle ||
          this.player.state.status === AudioPlayerStatus.AutoPaused
        ) {
          this.audioStream = new PassThrough();
          this.audioStream.setMaxListeners(50);
          const resource = createAudioResource(this.audioStream, {
            inputType: StreamType.Raw,
            inlineVolume: true,
          });
          tuneResourceEncoder(resource);
          this.resource = resource;
          if (resource.volume) {
            resource.volume.setVolume(this.muted ? 0 : this.gain);
          }
          if (this.player) {
            this.player.play(resource);
          }
        }

        // Ensure stereo format (StreamType.Raw requires 48kHz 16-bit LE Stereo PCM)
        const pcmBuffer =
          chunk.length % 4 !== 0
            ? this.monoToStereo(chunk)
            : chunk;

        this.audioStream.write(pcmBuffer);
      } catch (err) {
        console.error(`[VoiceWorker:${this.endpointId}] Failed to write audio chunk:`, err);
      }
    }
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
   * Set output gain (0.0 to 100.0 for up to 10000% volume).
   */
  setGain(gain: number): void {
    this.gain = Math.max(0, Math.min(100.0, gain));
    if (this.resource?.volume) {
      this.resource.volume.setVolume(this.muted ? 0 : this.gain);
    }
  }

  /**
   * Mute or unmute this specific output.
   */
  setMute(mute: boolean): void {
    this.muted = mute;
    if (this.sharedPlayer && this.connection) {
      if (mute) {
        if (this.subscription) {
          try { this.subscription.unsubscribe(); } catch {}
          this.subscription = null;
        }
      } else {
        if (!this.subscription) {
          this.subscription = this.connection.subscribe(this.sharedPlayer);
        }
      }
    } else if (this.resource?.volume) {
      this.resource.volume.setVolume(mute ? 0 : this.gain);
    }
    if (this.state === 'connected' || this.state === 'muted') {
      this.state = mute ? 'muted' : 'connected';
    }
  }

  /**
   * Reconnect this bot to the voice channel.
   */
  async reconnect(sharedPlayer?: AudioPlayer): Promise<boolean> {
    console.log(`[VoiceWorker:${this.endpointId}] Manually reconnecting bot ${this.botId}...`);
    const playerToUse = sharedPlayer || this.sharedPlayer || undefined;
    this.destroy();
    // Settling delay before reconnecting
    await new Promise((r) => setTimeout(r, 500));
    return this.connect(playerToUse);
  }

  /**
   * Disconnect and release all audio and client resources.
   */
  destroy(): void {
    this.state = 'disconnected';
    this.vuLevel = 0;
    this.resource = null;

    if (this.subscription) {
      try {
        this.subscription.unsubscribe();
      } catch {}
      this.subscription = null;
    }
    this.sharedPlayer = null;

    if (this.audioStream) {
      try {
        this.audioStream.end();
      } catch {}
      this.audioStream = null;
    }

    if (this.player) {
      try {
        this.player.stop();
      } catch {}
      this.player = null;
    }

    // Force disconnect from Discord voice channel via Gateway Opcode 4 and voice state
    try {
      const client = this.client || FleetGatewayService.getClient(this.botId);
      const guild = client?.guilds.cache.get(this.guildId);
      if (guild) {
        try {
          guild.members.me?.voice.disconnect().catch(() => {});
        } catch {}
        try {
          if (guild.shard) {
            guild.shard.send({
              op: 4,
              d: {
                guild_id: this.guildId,
                channel_id: null,
                self_mute: false,
                self_deaf: false,
              },
            });
          }
        } catch {}
        try {
          guild.client.voice.adapters.delete(this.guildId);
        } catch {}
      }
    } catch (e: any) {
      console.warn(`[VoiceWorker:${this.endpointId}] Disconnect voice error:`, e?.message || e);
    }

    if (this.connection) {
      try {
        this.connection.removeAllListeners('error');
        this.connection.removeAllListeners('stateChange');
        this.connection.destroy();
      } catch {}
      this.connection = null;
    }

    const botGroupId = this.client?.user?.id || this.botId;
    const globalConn = getVoiceConnection(this.guildId, botGroupId);
    if (globalConn) {
      try {
        globalConn.destroy();
      } catch {}
    }

    if (this.client && this.ownsClient) {
      try {
        this.client.destroy();
      } catch {}
    }
    this.client = null;
  }
}
