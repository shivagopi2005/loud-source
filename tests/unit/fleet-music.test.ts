import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FleetMusicService } from '@/server/services/fleet-music.service';
import { PREFIX_COMMANDS } from '@/server/services/bot-command.service';

describe('FleetMusicService & Music Commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('formatDuration', () => {
    it('formats seconds into mm:ss format', () => {
      expect(FleetMusicService.formatDuration(0)).toBe('00:00');
      expect(FleetMusicService.formatDuration(65)).toBe('01:05');
      expect(FleetMusicService.formatDuration(213)).toBe('03:33');
    });

    it('formats hours into hh:mm:ss format when >= 3600 seconds', () => {
      expect(FleetMusicService.formatDuration(3665)).toBe('1:01:05');
    });

    it('handles negative or invalid values gracefully', () => {
      expect(FleetMusicService.formatDuration(-5)).toBe('00:00');
      expect(FleetMusicService.formatDuration(NaN)).toBe('00:00');
    });
  });

  describe('PREFIX_COMMANDS registration', () => {
    it('includes !play / !p in PREFIX_COMMANDS', () => {
      const playCmd = PREFIX_COMMANDS.find((c) => c.name.includes('play'));
      expect(playCmd).toBeDefined();
      expect(playCmd?.usage).toContain('!play');
      expect(playCmd?.usage).toContain('!p');
      expect(playCmd?.category).toBe('Fleet Music');
    });

    it('includes !pause, !resume, and !nowplaying in PREFIX_COMMANDS', () => {
      const pauseCmd = PREFIX_COMMANDS.find((c) => c.name === 'pause');
      const resumeCmd = PREFIX_COMMANDS.find((c) => c.name === 'resume');
      const npCmd = PREFIX_COMMANDS.find((c) => c.name.includes('nowplaying'));

      expect(pauseCmd).toBeDefined();
      expect(resumeCmd).toBeDefined();
      expect(npCmd).toBeDefined();
    });
  });

  describe('Track resolution logic', () => {
    it('identifies direct audio stream links instantly', async () => {
      const service = FleetMusicService.getInstance();
      const directUrl = 'https://example.com/audio/epic-soundtrack.mp3';
      const resolved = await service.resolveTrack(directUrl);

      expect(resolved.title).toBe('epic-soundtrack.mp3');
      expect(resolved.streamUrl).toBe(directUrl);
      expect(resolved.webpageUrl).toBe(directUrl);
    });

    it('throws error on empty query', async () => {
      const service = FleetMusicService.getInstance();
      await expect(service.resolveTrack('   ')).rejects.toThrow('No song query or URL provided.');
    });
  });

  describe('Guild playback state & volume', () => {
    it('manages volume adjustments correctly', () => {
      const service = FleetMusicService.getInstance();
      service.setVolume('test-guild-1', 2.5); // 250%

      const np = service.getNowPlaying('test-guild-1');
      expect(np.volume).toBe(2.5);
      expect(np.status).toBe('idle');
      expect(np.track).toBeNull();
    });

    it('stops guild playback and resets track state', () => {
      const service = FleetMusicService.getInstance();
      service.stop('test-guild-1');

      const np = service.getNowPlaying('test-guild-1');
      expect(np.track).toBeNull();
      expect(np.status).toBe('idle');
    });
  });
});
