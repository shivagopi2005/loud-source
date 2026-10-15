import { Client, GatewayIntentBits } from 'discord.js';
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  StreamType,
  NoSubscriberBehavior,
  VoiceConnection,
} from '@discordjs/voice';
import { PassThrough } from 'stream';
import { prisma } from '../src/server/db/prisma';
import { decryptSecret } from '../src/server/security/encryption';

const GUILD_ID = '1499406517470756955';
const CHANNEL_ID = '1499406518313947284';

async function main() {
  console.log('[TEST] Fetching all bots from DB...');
  const bots = await prisma.botApplication.findMany({
    where: {
      credentials: { some: {} },
    },
    include: { credentials: true },
  });

  console.log(`[TEST] Found ${bots.length} total bots.`);

  // Connect clients and filter those that can access the target guild
  const validBots: { bot: any; token: string; client: Client }[] = [];

  for (const bot of bots) {
    if (bot.display_name === 'Integration Test Bot') continue;
    try {
      const token = decryptSecret(bot.credentials[0].secret_reference);
      const client = new Client({
        intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
      });

      await new Promise<void>((resolve, reject) => {
        client.once('ready', () => resolve());
        client.login(token).catch(reject);
      });

      if (client.guilds.cache.has(GUILD_ID)) {
        validBots.push({ bot, token, client });
        console.log(`[TEST] Bot ready & in guild: ${client.user?.tag} (${validBots.length})`);
      } else {
        console.log(`[TEST] Bot NOT in guild: ${client.user?.tag}`);
        client.destroy();
      }
    } catch (err: any) {
      console.warn(`[TEST] Bot error ${bot.display_name}:`, err.message);
    }
  }

  console.log(`[TEST] Total valid bots in guild: ${validBots.length}`);

  // Shared audio stream / feeder
  const audioStream = new PassThrough();

  // Test connecting the first 3 bots first (or all if specified)
  const countToTest = Math.min(validBots.length, 3);
  console.log(`[TEST] Connecting ${countToTest} bots to channel ${CHANNEL_ID}...`);

  const connections: VoiceConnection[] = [];

  for (let i = 0; i < countToTest; i++) {
    const { bot, client } = validBots[i];
    const guild = client.guilds.cache.get(GUILD_ID)!;

    console.log(`[TEST] [Bot ${i + 1}/${countToTest}] Joining ${client.user?.tag}...`);
    const connection = joinVoiceChannel({
      channelId: CHANNEL_ID,
      guildId: GUILD_ID,
      adapterCreator: guild.voiceAdapterCreator as any,
      group: client.user?.id || bot.id,
      selfDeaf: false,
      selfMute: false,
    });

    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 25_000);
      console.log(`[TEST] [Bot ${i + 1}/${countToTest}] ${client.user?.tag} is READY!`);

      const player = createAudioPlayer({
        behaviors: {
          noSubscriber: NoSubscriberBehavior.Play,
          maxMissedFrames: 1_000_000,
        },
      });

      // Individual pass through for this player piped from shared audio
      const botStream = new PassThrough();
      audioStream.pipe(botStream);

      const resource = createAudioResource(botStream, {
        inputType: StreamType.Raw,
        inlineVolume: true,
      });
      if (resource.volume) resource.volume.setVolume(1.0);

      player.play(resource);
      connection.subscribe(player);
      connections.push(connection);
    } catch (err: any) {
      console.error(`[TEST] [Bot ${i + 1}] Failed to connect:`, err.message);
      connection.destroy();
    }

    // Give DAVE MLS time to settle before next bot joins
    await new Promise((r) => setTimeout(r, 1200));
  }

  console.log(`[TEST] ${connections.length} bots connected and playing! Streaming 10 seconds of sound...`);

  // Generate 440Hz / 880Hz audio tone
  const sampleRate = 48000;
  const chunkSamples = 960;
  const tones = [523.25, 659.25, 783.99, 1046.50];
  let toneIdx = 0;
  let sampleCount = 0;

  const interval = setInterval(() => {
    const pcm = Buffer.alloc(chunkSamples * 4);
    const freq = tones[toneIdx];

    for (let i = 0; i < chunkSamples; i++) {
      const t = (sampleCount + i) / sampleRate;
      const val = Math.floor(
        (Math.sin(2 * Math.PI * freq * t) * 0.7 +
         Math.sin(2 * Math.PI * (freq * 2) * t) * 0.3) * 16000
      );
      pcm.writeInt16LE(val, i * 4);
      pcm.writeInt16LE(val, i * 4 + 2);
    }

    sampleCount += chunkSamples;
    if (sampleCount % (sampleRate / 2) === 0) {
      toneIdx = (toneIdx + 1) % tones.length;
      console.log(`[TEST] Melodic chime: ${tones[toneIdx]} Hz`);
    }

    audioStream.write(pcm);
  }, 20);

  setTimeout(() => {
    clearInterval(interval);
    console.log('[TEST] Stopping and cleaning up test...');
    connections.forEach((c) => c.destroy());
    validBots.forEach(({ client }) => client.destroy());
    process.exit(0);
  }, 10_000);
}

main().catch((err) => {
  console.error('[TEST] Fatal error:', err);
  process.exit(1);
});
