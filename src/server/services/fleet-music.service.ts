import { spawn, execFile, ChildProcess } from 'child_process';
import {
  joinVoiceChannel,
  getVoiceConnection,
  createAudioPlayer,
  createAudioResource,
  AudioPlayer,
  AudioResource,
  AudioPlayerStatus,
  StreamType,
  NoSubscriberBehavior,
  VoiceConnectionStatus,
} from '@discordjs/voice';
import { prisma } from '../db/prisma';
import { FleetGatewayService } from './fleet-gateway.service';
import { createCustomVoiceAdapter, tuneResourceEncoder } from '../voice/voice-worker';

export interface ResolvedTrack {
  title: string;
  duration: string;
  webpageUrl: string;
  streamUrl: string;
  requestedBy: string;
  startedAt: number;
}

export interface GuildMusicState {
  guildId: string;
  player: AudioPlayer;
  ffmpegProc: ChildProcess | null;
  currentTrack: ResolvedTrack | null;
  resource: AudioResource | null;
  volume: number; // 1.0 = 100%
  status: 'idle' | 'playing' | 'paused';
}

declare global {
  // eslint-disable-next-line no-var
  var __fleetMusicService: FleetMusicService | undefined;
}

export class FleetMusicService {
  private guildStates = new Map<string, GuildMusicState>();
  private ytdlBinaryPath: string | null = null;

  public static getInstance(): FleetMusicService {
    if (!global.__fleetMusicService) {
      global.__fleetMusicService = new FleetMusicService();
    }
    return global.__fleetMusicService;
  }

  /**
   * Find available yt-dlp executable path.
   */
  private async findYtDlp(): Promise<string> {
    if (this.ytdlBinaryPath) return this.ytdlBinaryPath;

    const candidates = ['yt-dlp', '/home/roy/.local/bin/yt-dlp', 'python3'];
    for (const candidate of candidates) {
      const isPython = candidate === 'python3';
      const checkArgs = isPython ? ['-m', 'yt_dlp', '--version'] : ['--version'];

      const available = await new Promise<boolean>((resolve) => {
        execFile(candidate, checkArgs, { timeout: 3000 }, (err) => {
          resolve(!err);
        });
      });

      if (available) {
        this.ytdlBinaryPath = candidate;
        return candidate;
      }
    }

    this.ytdlBinaryPath = 'yt-dlp';
    return 'yt-dlp';
  }

  /**
   * Resolve a query or direct link into track metadata & audio stream URL.
   */
  public async resolveTrack(query: string): Promise<{
    title: string;
    duration: string;
    webpageUrl: string;
    streamUrl: string;
  }> {
    const trimmed = query.trim();
    if (!trimmed) {
      throw new Error('No song query or URL provided.');
    }

    const isUrl = /^https?:\/\//i.test(trimmed);

    // Direct audio URL check (mp3, wav, ogg, flac, aac, m4a, webm, opus)
    if (isUrl && /\.(mp3|wav|ogg|flac|aac|m4a|webm|opus)(\?.*)?$/i.test(trimmed)) {
      try {
        const parsed = new URL(trimmed);
        const filename = decodeURIComponent(parsed.pathname.split('/').pop() || 'Direct Audio Stream');
        return {
          title: filename,
          duration: 'Live / Audio Stream',
          webpageUrl: trimmed,
          streamUrl: trimmed,
        };
      } catch {
        return {
          title: 'Direct Audio Stream',
          duration: 'Live Stream',
          webpageUrl: trimmed,
          streamUrl: trimmed,
        };
      }
    }

    const binary = await this.findYtDlp();
    const isPython = binary === 'python3';
    const target = isUrl ? trimmed : `ytsearch1:${trimmed}`;

    const args = isPython
      ? [
          '-m',
          'yt_dlp',
          '--no-warnings',
          '-f',
          'bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio[acodec!=none]/bestaudio/best',
          '--audio-quality',
          '0',
          '--print',
          '%(title)s',
          '--print',
          '%(duration_string)s',
          '--print',
          '%(webpage_url)s',
          '-g',
          target,
        ]
      : [
          '--no-warnings',
          '-f',
          'bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio[acodec!=none]/bestaudio/best',
          '--audio-quality',
          '0',
          '--print',
          '%(title)s',
          '--print',
          '%(duration_string)s',
          '--print',
          '%(webpage_url)s',
          '-g',
          target,
        ];

    return new Promise((resolve, reject) => {
      execFile(binary, args, { timeout: 20000 }, (error, stdout, stderr) => {
        if (error) {
          console.warn(`[FleetMusic] yt-dlp resolution error for "${query}":`, error.message, stderr);
          // If direct URL failed in yt-dlp, try streaming URL directly via ffmpeg
          if (isUrl) {
            return resolve({
              title: trimmed,
              duration: 'Direct Stream',
              webpageUrl: trimmed,
              streamUrl: trimmed,
            });
          }
          return reject(new Error(`Could not find audio for: ${query}`));
        }

        const lines = stdout
          .trim()
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);

        if (lines.length === 0) {
          return reject(new Error(`No search results found for: ${query}`));
        }

        // Output lines format:
        // [0] Title
        // [1] Duration
        // [2] Webpage URL
        // [3] Stream URL (last line)
        const title = lines[0] || 'Unknown Title';
        const duration = lines[1] && (lines[1].includes(':') || /^\d+$/.test(lines[1])) ? lines[1] : 'Unknown';
        const webpageUrl =
          lines.find((l) => l.startsWith('http') && (l.includes('youtube.com') || l.includes('youtu.be') || l.includes('soundcloud.com'))) ||
          (isUrl ? trimmed : `https://www.youtube.com/results?search_query=${encodeURIComponent(trimmed)}`);
        const streamUrl = lines[lines.length - 1];

        if (!streamUrl || !streamUrl.startsWith('http')) {
          return reject(new Error(`Could not extract playable stream URL for: ${query}`));
        }

        resolve({
          title,
          duration,
          webpageUrl,
          streamUrl,
        });
      });
    });
  }

  /**
   * Get or initialize guild music player state.
   */
  private getOrCreateState(guildId: string): GuildMusicState {
    let state = this.guildStates.get(guildId);
    if (!state) {
      const player = createAudioPlayer({
        behaviors: {
          noSubscriber: NoSubscriberBehavior.Play,
          maxMissedFrames: 1_000_000,
        },
      });

      state = {
        guildId,
        player,
        ffmpegProc: null,
        currentTrack: null,
        resource: null,
        volume: 1.0,
        status: 'idle',
      };

      player.on(AudioPlayerStatus.Idle, () => {
        console.log(`[FleetMusic:${guildId}] Audio player transitioned to Idle`);
        if (state) {
          if (state.ffmpegProc) {
            try {
              state.ffmpegProc.kill('SIGKILL');
            } catch {}
            state.ffmpegProc = null;
          }
          state.currentTrack = null;
          state.status = 'idle';
        }
      });

      player.on('error', (err) => {
        console.warn(`[FleetMusic:${guildId}] Audio player warning:`, err.message);
      });

      this.guildStates.set(guildId, state);
    }
    return state;
  }

  /**
   * Connect all fleet bots to the target voice channel and play audio stream simultaneously.
   */
  public async play(params: {
    guildId: string;
    voiceChannelId: string;
    query: string;
    requestedById: string;
    targetGuild: any;
    maxBots?: number;
  }): Promise<{
    track: ResolvedTrack;
    connectedBotCount: number;
    totalBotsInGuild: number;
  }> {
    const { guildId, voiceChannelId, query, requestedById, targetGuild, maxBots } = params;
    const state = this.getOrCreateState(guildId);

    // 1. Resolve audio track
    const resolved = await this.resolveTrack(query);

    // 2. Terminate any previous playback for this guild
    if (state.ffmpegProc) {
      try {
        state.ffmpegProc.kill('SIGKILL');
      } catch {}
      state.ffmpegProc = null;
    }
    state.player.stop(true);

    // 3. Connect fleet bots in this guild simultaneously up to maxBots limit
    const allBots = await prisma.botApplication.findMany({
      where: { status: { notIn: ['removed', 'disabled'] } },
    });

    const botsToConnect = maxBots && maxBots > 0 ? allBots.slice(0, maxBots) : allBots;

    let connectedBotCount = 0;
    let totalBotsInGuild = 0;

    await Promise.allSettled(
      botsToConnect.map(async (b) => {
        const bClient = FleetGatewayService.getClient(b.id);
        if (!bClient) return;

        const bGuild = bClient.guilds.cache.get(guildId);
        if (!bGuild) return;

        totalBotsInGuild++;
        const botGroupId = bClient.user?.id || b.id;

        try {
          let conn = getVoiceConnection(guildId, botGroupId);

          if (!conn || conn.state.status === VoiceConnectionStatus.Destroyed) {
            conn = joinVoiceChannel({
              channelId: voiceChannelId,
              guildId,
              adapterCreator: createCustomVoiceAdapter(bGuild),
              group: botGroupId,
              selfDeaf: false,
              selfMute: false,
            });
          } else if (conn.joinConfig.channelId !== voiceChannelId) {
            // Move to target voice channel
            conn = joinVoiceChannel({
              channelId: voiceChannelId,
              guildId,
              adapterCreator: createCustomVoiceAdapter(bGuild),
              group: botGroupId,
              selfDeaf: false,
              selfMute: false,
            });
          }

          // Subscribe bot's voice connection to the shared guild player
          conn.subscribe(state.player);
          connectedBotCount++;
        } catch (botConnErr: any) {
          console.warn(`[FleetMusic] Bot ${botGroupId} voice join error:`, botConnErr.message);
        }
      })
    );

    // 4. Spawn real-time ffmpeg PCM transcode pipeline at Top Resolution & Studio Master Quality
    const ffmpegProc = spawn('ffmpeg', [
      '-re',
      '-reconnect',
      '1',
      '-reconnect_streamed',
      '1',
      '-reconnect_delay_max',
      '5',
      '-analyzeduration',
      '0',
      '-loglevel',
      'warning',
      '-i',
      resolved.streamUrl,
      '-af',
      'aresample=resampler=soxr:precision=28:cutoff=1.000',
      '-f',
      's16le',
      '-ar',
      '48000',
      '-ac',
      '2',
      'pipe:1',
    ]);

    ffmpegProc.stderr.on('data', (d) => {
      const msg = d.toString().trim();
      if (msg && !msg.includes('deprecated pixel format')) {
        console.debug(`[FleetMusic:FFmpeg:${guildId}]`, msg);
      }
    });

    ffmpegProc.on('error', (err) => {
      console.warn(`[FleetMusic:FFmpeg:${guildId}] Spawn error:`, err.message);
    });

    ffmpegProc.on('close', (code) => {
      console.log(`[FleetMusic:FFmpeg:${guildId}] Process exited with code ${code}`);
    });

    // 5. Create AudioResource with inline volume support
    const resource = createAudioResource(ffmpegProc.stdout, {
      inputType: StreamType.Raw,
      inlineVolume: true,
    });

    tuneResourceEncoder(resource);

    if (resource.volume) {
      resource.volume.setVolume(state.volume);
    }

    state.ffmpegProc = ffmpegProc;
    state.resource = resource;
    const track: ResolvedTrack = {
      ...resolved,
      requestedBy: requestedById,
      startedAt: Date.now(),
    };
    state.currentTrack = track;
    state.status = 'playing';

    // 6. Begin playback on shared player (dispatched to all subscribed bots at the exact same time)
    state.player.play(resource);

    return {
      track,
      connectedBotCount,
      totalBotsInGuild,
    };
  }

  /**
   * Pause playback in guild.
   */
  public pause(guildId: string): { success: boolean; track: ResolvedTrack | null } {
    const state = this.guildStates.get(guildId);
    if (!state || state.status !== 'playing' || !state.currentTrack) {
      return { success: false, track: null };
    }

    state.player.pause();
    state.status = 'paused';
    return { success: true, track: state.currentTrack };
  }

  /**
   * Resume playback in guild.
   */
  public resume(guildId: string): { success: boolean; track: ResolvedTrack | null } {
    const state = this.guildStates.get(guildId);
    if (!state || state.status !== 'paused' || !state.currentTrack) {
      return { success: false, track: null };
    }

    state.player.unpause();
    state.status = 'playing';
    return { success: true, track: state.currentTrack };
  }

  /**
   * Emergency stop / Halt playback in guild and cleanup resources.
   */
  public stop(guildId: string): boolean {
    const state = this.guildStates.get(guildId);
    if (!state) return false;

    if (state.ffmpegProc) {
      try {
        state.ffmpegProc.kill('SIGKILL');
      } catch {}
      state.ffmpegProc = null;
    }

    state.player.stop(true);
    state.currentTrack = null;
    state.resource = null;
    state.status = 'idle';
    return true;
  }

  /**
   * Set playback volume for guild (multiplier, e.g. 1.0 = 100%, 5.0 = 500%).
   */
  public setVolume(guildId: string, multiplier: number): void {
    const state = this.getOrCreateState(guildId);
    state.volume = Math.max(0.01, Math.min(100.0, multiplier));
    if (state.resource?.volume) {
      state.resource.volume.setVolume(state.volume);
    }
  }

  /**
   * Get now playing info for a guild.
   */
  public getNowPlaying(guildId: string): {
    track: ResolvedTrack | null;
    status: 'idle' | 'playing' | 'paused';
    volume: number;
    elapsedSeconds: number;
  } {
    const state = this.guildStates.get(guildId);
    if (!state || !state.currentTrack) {
      return {
        track: null,
        status: 'idle',
        volume: state?.volume || 1.0,
        elapsedSeconds: 0,
      };
    }

    const elapsedSeconds = state.status === 'playing'
      ? Math.floor((Date.now() - state.currentTrack.startedAt) / 1000)
      : 0;

    return {
      track: state.currentTrack,
      status: state.status,
      volume: state.volume,
      elapsedSeconds,
    };
  }

  /**
   * Format seconds into mm:ss or hh:mm:ss string.
   */
  public static formatDuration(seconds: number): string {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    const pad = (n: number) => n.toString().padStart(2, '0');
    if (hrs > 0) {
      return `${hrs}:${pad(mins)}:${pad(secs)}`;
    }
    return `${pad(mins)}:${pad(secs)}`;
  }
}

export const fleetMusicService = FleetMusicService.getInstance();
