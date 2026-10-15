import { Client, GatewayIntentBits } from 'discord.js';
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  entersState,
  VoiceConnectionStatus,
  StreamType,
  NoSubscriberBehavior,
  getVoiceConnection,
} from '@discordjs/voice';
import { PassThrough } from 'stream';
import { prisma } from '../src/server/db/prisma';
import { decryptSecret } from '../src/server/security/encryption';

const GUILD_ID = '1499406517470756955';
const CHANNEL_ID = '1499406518313947284';

async function main() {
  console.log('[STAGGER-TEST] Testing non-blocking staggered connection...');
  const bots = await prisma.botApplication.findMany({
    where: { credentials: { some: {} } },
    include: { credentials: true },
  });

  const validBots: { bot: any; token: string; client: Client }[] = [];

  for (const bot of bots) {
    if (bot.display_name === 'Integration Test Bot') continue;
    try {
      const token = decryptSecret(bot.credentials[0].secret_reference);
      const client = new Client({
        intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
      });
      await new Promise<void>((res) => {
        client.once('ready', () => res());
        client.login(token);
      });
      if (client.guilds.cache.has(GUILD_ID)) {
        validBots.push({ bot, token, client });
      } else {
        client.destroy();
      }
    } catch {}
  }

  console.log(`[STAGGER-TEST] Found ${validBots.length} bots in guild. Staggering 5 bots...`);
  const sharedAudioStream = new PassThrough();
  const testBots = validBots.slice(0, 5);

  const connectPromises = testBots.map(async ({ bot, client }, idx) => {
    // Stagger start by 1000ms per bot
    await new Promise((r) => setTimeout(r, idx * 1000));
    console.log(`[STAGGER-TEST] [${idx + 1}/5] Starting join for ${client.user?.tag}...`);

    const guild = client.guilds.cache.get(GUILD_ID)!;
    const botGroupId = client.user?.id || bot.id;

    // Clean existing connection if any
    const existing = getVoiceConnection(GUILD_ID, botGroupId);
    if (existing) {
      try { existing.destroy(); } catch {}
    }

    const conn = joinVoiceChannel({
      channelId: CHANNEL_ID,
      guildId: GUILD_ID,
      adapterCreator: guild.voiceAdapterCreator as any,
      group: botGroupId,
      selfDeaf: false,
      selfMute: false,
    });

    try {
      await entersState(conn, VoiceConnectionStatus.Ready, 8_000);
      console.log(`[STAGGER-TEST] [${idx + 1}/5] >>> ${client.user?.tag} CONNECTED & READY!`);

      const player = createAudioPlayer({
        behaviors: { noSubscriber: NoSubscriberBehavior.Play, maxMissedFrames: 1_000_000 },
      });

      const botStream = new PassThrough();
      sharedAudioStream.pipe(botStream);
      const resource = createAudioResource(botStream, {
        inputType: StreamType.Raw,
        inlineVolume: true,
      });
      if (resource.volume) resource.volume.setVolume(1.0);
      player.play(resource);
      conn.subscribe(player);
      return conn;
    } catch (err: any) {
      console.error(`[STAGGER-TEST] [${idx + 1}/5] ${client.user?.tag} failed:`, err.message);
      try { conn.destroy(); } catch {}
      return null;
    }
  });

  // Start sound generation immediately so the very first bot plays sound instantly
  console.log('[STAGGER-TEST] Starting sound generator...');
  const sampleRate = 48000;
  const chunkSamples = 960;
  let sampleCount = 0;
  const tones = [523.25, 659.25, 783.99, 1046.50];
  let toneIdx = 0;

  const interval = setInterval(() => {
    const pcm = Buffer.alloc(chunkSamples * 4);
    const freq = tones[toneIdx];
    for (let i = 0; i < chunkSamples; i++) {
      const t = (sampleCount + i) / sampleRate;
      const val = Math.floor(Math.sin(2 * Math.PI * freq * t) * 18000);
      pcm.writeInt16LE(val, i * 4);
      pcm.writeInt16LE(val, i * 4 + 2);
    }
    sampleCount += chunkSamples;
    if (sampleCount % (sampleRate / 2) === 0) {
      toneIdx = (toneIdx + 1) % tones.length;
    }
    sharedAudioStream.write(pcm);
  }, 20);

  const conns = (await Promise.all(connectPromises)).filter(Boolean);
  console.log(`[STAGGER-TEST] Finished connection attempts: ${conns.length} / 5 bots connected!`);

  await new Promise((r) => setTimeout(r, 8000));
  clearInterval(interval);
  conns.forEach((c) => { try { c?.destroy(); } catch {} });
  testBots.forEach(({ client }) => { try { client.destroy(); } catch {} });
  console.log('[STAGGER-TEST] Test completed successfully.');
  process.exit(0);
}

main().catch(console.error);
