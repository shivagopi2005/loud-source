import zlib from 'zlib';

export interface ProfilePreset {
  id: string;
  name: string;
  theme: 'anime' | 'cyberpunk' | 'studio' | 'minimalist' | 'gaming' | 'syndicate';
  avatarUrl: string;
  bannerUrl: string;
  bio: string;
  customStatus: string;
  activityType: 'PLAYING' | 'LISTENING' | 'STREAMING' | 'WATCHING' | 'COMPETING' | 'CUSTOM';
  displayName: string;
  accentColor: string;
}

// Pre-computed CRC32 table for fast PNG generation
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  crcTable[n] = c;
}

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Generate a 100% valid, standards-compliant PNG data URI accepted by Discord API.
 */
export function createPng(
  width: number,
  height: number,
  r1: number,
  g1: number,
  b1: number,
  r2?: number,
  g2?: number,
  b2?: number
): string {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 2; // RGB
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;

  const ihdrCrc = crc32(Buffer.concat([Buffer.from('IHDR'), ihdrData]));
  const ihdrChunk = Buffer.alloc(8 + 13 + 4);
  ihdrChunk.writeUInt32BE(13, 0);
  Buffer.from('IHDR').copy(ihdrChunk, 4);
  ihdrData.copy(ihdrChunk, 8);
  ihdrChunk.writeUInt32BE(ihdrCrc, 21);

  const rowSize = 1 + width * 3;
  const rawData = Buffer.alloc(rowSize * height);

  const hasGradient = r2 !== undefined && g2 !== undefined && b2 !== undefined;
  const red2 = r2 ?? r1;
  const green2 = g2 ?? g1;
  const blue2 = b2 ?? b1;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter: None
    const t = height > 1 ? y / (height - 1) : 0;
    const r = Math.round(r1 + (red2 - r1) * t);
    const g = Math.round(g1 + (green2 - g1) * t);
    const b = Math.round(b1 + (blue2 - b1) * t);

    for (let x = 0; x < width; x++) {
      const px = rowOffset + 1 + x * 3;
      rawData[px] = r;
      rawData[px + 1] = g;
      rawData[px + 2] = b;
    }
  }

  const idatCompressed = zlib.deflateSync(rawData);
  const idatChunk = Buffer.alloc(8 + idatCompressed.length + 4);
  idatChunk.writeUInt32BE(idatCompressed.length, 0);
  Buffer.from('IDAT').copy(idatChunk, 4);
  idatCompressed.copy(idatChunk, 8);
  const idatCrc = crc32(Buffer.concat([Buffer.from('IDAT'), idatCompressed]));
  idatChunk.writeUInt32BE(idatCrc, 8 + idatCompressed.length);

  const iendData = Buffer.concat([Buffer.from('IEND')]);
  const iendCrc = crc32(iendData);
  const iendChunk = Buffer.alloc(12);
  iendChunk.writeUInt32BE(0, 0);
  Buffer.from('IEND').copy(iendChunk, 4);
  iendChunk.writeUInt32BE(iendCrc, 8);

  const png = Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
  return 'data:image/png;base64,' + png.toString('base64');
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    clean = clean.split('').map((c) => c + c).join('');
  }
  const num = parseInt(clean, 16);
  if (isNaN(num)) return { r: 88, g: 101, b: 242 }; // Discord blurple default
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

export function createPngFromHex(width: number, height: number, hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return createPng(width, height, r, g, b);
}

export const PROFILE_THEMES = [
  { id: 'all', name: 'All Themes', icon: 'Sparkles', color: '#5865F2' },
  { id: 'anime', name: 'Anime / Aizen', icon: 'Flame', color: '#8b5cf6' },
  { id: 'studio', name: 'Audio Studio', icon: 'Headphones', color: '#10b981' },
  { id: 'gaming', name: 'Gaming / Discord', icon: 'Gamepad2', color: '#5865f2' },
  { id: 'minimalist', name: 'Minimalist Dark', icon: 'Shield', color: '#64748b' },
  { id: 'cyberpunk', name: 'Cyberpunk', icon: 'Zap', color: '#06b6d4' },
  { id: 'syndicate', name: 'Executive Suite', icon: 'Crown', color: '#eab308' },
];

export const PROFILE_PRESETS: ProfilePreset[] = [
  // 1. Anime / Aizen
  {
    id: 'aizen-sovereign',
    name: 'Aizen • Sovereign',
    theme: 'anime',
    avatarUrl: createPng(128, 128, 88, 28, 135, 124, 58, 237),
    bannerUrl: createPng(600, 240, 24, 16, 54, 76, 29, 149),
    bio: 'All of this has been according to my plan from the very beginning.\n\nFrom now on, I will stand atop the heavens.',
    customStatus: 'Standing atop the heavens',
    activityType: 'PLAYING',
    displayName: 'AIZEN !!',
    accentColor: '#8b5cf6',
  },
  {
    id: 'aizen-kyoka',
    name: 'Aizen • Kyoka Suigetsu',
    theme: 'anime',
    avatarUrl: createPng(128, 128, 59, 7, 100, 147, 51, 234),
    bannerUrl: createPng(600, 240, 30, 27, 75, 88, 28, 135),
    bio: 'Shatter, Kyoka Suigetsu.\n\nAdmiration is the state furthest from understanding.',
    customStatus: 'Shattering reality',
    activityType: 'STREAMING',
    displayName: 'AIZEN • Kyoka',
    accentColor: '#a855f7',
  },
  {
    id: 'aizen-las-noches',
    name: 'Aizen • Las Noches',
    theme: 'anime',
    avatarUrl: createPng(128, 128, 23, 37, 84, 99, 102, 241),
    bannerUrl: createPng(600, 240, 15, 23, 42, 49, 46, 129),
    bio: 'Ruling over the endless moonlit sands of Hueco Mundo.\n\nOperating high-fidelity fleet voice transmissions.',
    customStatus: 'In Las Noches',
    activityType: 'WATCHING',
    displayName: 'AIZEN • Las Noches',
    accentColor: '#6366f1',
  },

  // 2. Audio Studio
  {
    id: 'studio-master',
    name: 'Studio • Master Control',
    theme: 'studio',
    avatarUrl: createPng(128, 128, 6, 78, 59, 16, 185, 129),
    bannerUrl: createPng(600, 240, 2, 44, 34, 6, 95, 70),
    bio: 'Master Audio Engineer for LOUD Voice Studio.\n\nCalibrated parametric EQ and multi-band compression for studio voice output.',
    customStatus: 'Mastering studio audio',
    activityType: 'LISTENING',
    displayName: 'STUDIO • MASTER',
    accentColor: '#10b981',
  },
  {
    id: 'studio-bass',
    name: 'Studio • Bass Driver',
    theme: 'studio',
    avatarUrl: createPng(128, 128, 113, 63, 18, 234, 179, 8),
    bannerUrl: createPng(600, 240, 66, 32, 6, 113, 63, 18),
    bio: 'High-power acoustic driver.\n\nHarmonic frequency excitation delivering deep sound directly to connected channels.',
    customStatus: 'Tuning EQ curves',
    activityType: 'PLAYING',
    displayName: 'BASS // BOOSTER',
    accentColor: '#eab308',
  },

  // 3. Gaming / Discord
  {
    id: 'discord-blurple',
    name: 'Discord • Blurple Classic',
    theme: 'gaming',
    avatarUrl: createPng(128, 128, 88, 101, 242, 71, 82, 196),
    bannerUrl: createPng(600, 240, 32, 34, 37, 88, 101, 242),
    bio: 'Official Discord Bot Fleet member.\n\nProviding multi-channel voice connectivity and broadcast management.',
    customStatus: 'Connected to voice',
    activityType: 'PLAYING',
    displayName: 'FLEET • OPERATOR',
    accentColor: '#5865F2',
  },
  {
    id: 'discord-green',
    name: 'Discord • Emerald Voice',
    theme: 'gaming',
    avatarUrl: createPng(128, 128, 35, 165, 90, 46, 204, 113),
    bannerUrl: createPng(600, 240, 25, 30, 36, 35, 165, 90),
    bio: 'High-availability voice channel bot.\n\nAlways ready, always online.',
    customStatus: 'Voice Ready • !join',
    activityType: 'COMPETING',
    displayName: 'VOICE • BOT',
    accentColor: '#23a55a',
  },

  // 4. Minimalist Dark
  {
    id: 'minimal-slate',
    name: 'Minimalist • Dark Slate',
    theme: 'minimalist',
    avatarUrl: createPng(128, 128, 30, 41, 59, 71, 85, 105),
    bannerUrl: createPng(600, 240, 15, 23, 42, 30, 41, 59),
    bio: 'Minimalist voice fleet node.\n\nClean sound, zero clutter, reliable connectivity.',
    customStatus: 'System nominal',
    activityType: 'CUSTOM',
    displayName: 'NODE // 01',
    accentColor: '#64748b',
  },
  {
    id: 'minimal-carbon',
    name: 'Minimalist • Matte Carbon',
    theme: 'minimalist',
    avatarUrl: createPng(128, 128, 24, 24, 27, 63, 63, 70),
    bannerUrl: createPng(600, 240, 9, 9, 11, 24, 24, 27),
    bio: 'Quiet efficiency. Managing synchronized background operations.',
    customStatus: 'Standby mode',
    activityType: 'CUSTOM',
    displayName: 'CARBON // CORE',
    accentColor: '#71717a',
  },

  // 5. Cyberpunk
  {
    id: 'cyber-cyan',
    name: 'Cyberpunk • Cyan Pulse',
    theme: 'cyberpunk',
    avatarUrl: createPng(128, 128, 8, 51, 68, 6, 182, 212),
    bannerUrl: createPng(600, 240, 8, 51, 68, 15, 23, 42),
    bio: 'Low-latency fiber voice routing enabled.\n\nSynchronized multi-bot packet transmission across all stages.',
    customStatus: 'Syncing cyber-nodes',
    activityType: 'STREAMING',
    displayName: 'NEON • PHANTOM',
    accentColor: '#06b6d4',
  },

  // 6. Executive Syndicate
  {
    id: 'syndicate-gold',
    name: 'Executive • Imperial Gold',
    theme: 'syndicate',
    avatarUrl: createPng(128, 128, 113, 63, 18, 245, 158, 11),
    bannerUrl: createPng(600, 240, 41, 37, 36, 113, 63, 18),
    bio: 'Executive class multi-bot audio management.\n\nUnmatched voice quality and dedicated fleet synchronization.',
    customStatus: 'Executive priority',
    activityType: 'PLAYING',
    displayName: 'DON // LOUD',
    accentColor: '#f59e0b',
  },
];

export class BotProfilePresets {
  public static getAllPresets(): ProfilePreset[] {
    return PROFILE_PRESETS;
  }

  public static getPresetsByTheme(theme: string): ProfilePreset[] {
    if (!theme || theme === 'all') return PROFILE_PRESETS;
    return PROFILE_PRESETS.filter((p) => p.theme === theme);
  }

  public static getRandomPreset(theme?: string): ProfilePreset {
    const list = this.getPresetsByTheme(theme || 'all');
    const index = Math.floor(Math.random() * list.length);
    return list[index] || PROFILE_PRESETS[0];
  }

  public static getRandomProfilesForFleet(
    botCount: number,
    theme?: string,
    baseName: string = 'AIZEN !!'
  ): Array<{
    displayName: string;
    avatarUrl: string;
    bannerUrl: string;
    bio: string;
    customStatus: string;
    activityType: 'PLAYING' | 'LISTENING' | 'STREAMING' | 'WATCHING' | 'COMPETING' | 'CUSTOM';
    accentColor: string;
  }> {
    const pool = this.getPresetsByTheme(theme || 'all');
    const results = [];

    for (let i = 0; i < botCount; i++) {
      const preset = pool[i % pool.length];
      const name =
        botCount > 1
          ? `${baseName || preset.displayName} #${i + 1}`
          : baseName || preset.displayName;

      results.push({
        displayName: name,
        avatarUrl: preset.avatarUrl,
        bannerUrl: preset.bannerUrl,
        bio: preset.bio,
        customStatus: preset.customStatus,
        activityType: preset.activityType,
        accentColor: preset.accentColor,
      });
    }

    return results;
  }
}
