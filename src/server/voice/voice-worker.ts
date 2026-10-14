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
} from '@discordjs/voice';
import { Client, GatewayIntentBits } from 'discord.js';

export interface VoiceEndpointConfig {
  endpointId: string;
  botId: string;
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

export class VoiceWorkerInstance {
  public readonly endpointId: string;
  public readonly botId: string;
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
  private connection: VoiceConnection | null = null;
  private player: AudioPlayer | null = null;
  private audioStream: PassThrough | null = null;
  private isMock = false;

  constructor(config: VoiceEndpointConfig) {
    this.endpointId = config.endpointId;
    this.botId = config.botId;
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
  async connect(): Promise<boolean> {
    this.state = 'connecting';

    if (this.isMock) {
      this.state = this.muted ? 'muted' : 'connected';
      return true;
    }

    try {
      // Initialize Discord client if not already active
      this.client = new Client({
        intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
      });

      await this.client.login(this.botToken);

      const guild = await this.client.guilds.fetch(this.guildId);
      if (!guild) {
        throw new Error(`Guild ${this.guildId} not found`);
      }

      this.connection = joinVoiceChannel({
        channelId: this.channelId,
        guildId: this.guildId,
        adapterCreator: guild.voiceAdapterCreator as any,
        selfDeaf: false,
        selfMute: false,
      });

      this.player = createAudioPlayer();
      this.audioStream = new PassThrough();

      const resource = createAudioResource(this.audioStream, {
        inputType: StreamType.Raw,
        inlineVolume: true,
      });

      if (resource.volume) {
        resource.volume.setVolume(this.muted ? 0 : this.gain);
      }

      this.player.play(resource);
      this.connection.subscribe(this.player);

      // Handle voice connection lifecycle
      this.connection.on(VoiceConnectionStatus.Ready, () => {
        this.state = this.muted ? 'muted' : 'connected';
      });

      this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
        try {
          this.state = 'reconnecting';
          await Promise.race([
            entersState(this.connection!, VoiceConnectionStatus.Signalling, 5_000),
            entersState(this.connection!, VoiceConnectionStatus.Connecting, 5_000),
          ]);
        } catch {
          this.state = 'failed';
          this.lastErrorCode = 'VOICE_DISCONNECTED_TIMEOUT';
          this.destroy();
        }
      });

      this.player.on('error', (err) => {
        console.error(`[VoiceWorker:${this.endpointId}] AudioPlayer error:`, err);
        this.state = 'failed';
        this.lastErrorCode = 'AUDIO_PLAYER_ERROR';
      });

      await entersState(this.connection, VoiceConnectionStatus.Ready, 15_000);
      this.state = this.muted ? 'muted' : 'connected';
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

    // Apply per-output VU meter level
    this.vuLevel = this.muted ? 0 : Math.round(peakLevel * this.gain);

    if (this.isMock) {
      // In simulator mode, audio is processed virtually
      return;
    }

    if (this.audioStream && !this.muted) {
      try {
        this.audioStream.write(chunk);
      } catch (err) {
        console.error(`[VoiceWorker:${this.endpointId}] Failed to write audio chunk:`, err);
      }
    }
  }

  /**
   * Set output gain (0.0 to 2.0).
   */
  setGain(gain: number): void {
    this.gain = Math.max(0, Math.min(2.0, gain));
  }

  /**
   * Mute or unmute this specific output.
   */
  setMute(mute: boolean): void {
    this.muted = mute;
    if (this.state === 'connected' || this.state === 'muted') {
      this.state = mute ? 'muted' : 'connected';
    }
  }

  /**
   * Disconnect and release all audio and client resources.
   */
  destroy(): void {
    this.state = 'disconnected';
    this.vuLevel = 0;

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

    if (this.connection) {
      try {
        this.connection.destroy();
      } catch {}
      this.connection = null;
    }

    if (this.client) {
      try {
        this.client.destroy();
      } catch {}
      this.client = null;
    }
  }
}
