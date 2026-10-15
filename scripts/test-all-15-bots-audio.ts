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
  console.log('[FLEET-TEST] Fetching all bots from database...');
  const bots = await prisma.botApplication.findMany({
    where: {
      credentials: { some: {} },
    },
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

      await new Promise<void>((resolve, reject) => {
        client.once('ready', () => resolve());
        client.login(token).catch(reject);
      });

      if (client.guilds.cache.has(GUILD_ID)) {
        validBots.push({ bot, token, client });
      } else {
        client.destroy();
      }
    } catch {}
  }

  console.log(`[FLEET-TEST] Total active bots ready in guild: ${validBots.length}`);

  const sharedAudioStream = new PassThrough();
  const connections: VoiceConnection[] = [];

  console.log(`[FLEET-TEST] Connecting all ${validBots.length} bots sequentially to voice channel...`);

  for (let i = 0; i < validBots.length; i++) {
    const { bot, client } = validBots[i];
    const guild = client.guilds.cache.get(GUILD_ID)!;

    console.log(`[FLEET-TEST] [${i + 1}/${validBots.length}] Joining: ${client.user?.tag}...`);

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
      console.log(`[FLEET-TEST] [${i + 1}/${validBots.length}] ${client.user?.tag} -> CONNECTED & READY`);

      const player = createAudioPlayer({
        behaviors: {
          noSubscriber: NoSubscriberBehavior.Play,
          maxMissedFrames: 1_000_000,
        },
      });

      const botStream = new PassThrough();
      sharedAudioStream.pipe(botStream);

      const resource = createAudioResource(botStream, {
        inputType: StreamType.Raw,
        inlineVolume: true,
      });
      if (resource.volume) resource.volume.setVolume(1.0);

      player.play(resource);
      connection.subscribe(player);
      connections.push(connection);
    } catch (err: any) {
      console.warn(`[FLEET-TEST] [${i + 1}/${validBots.length}] ${client.user?.tag} skipped: ${err.message}`);
      try { connection.destroy(); } catch {}
    }

    // Settling pause for Discord DAVE MLS group state sync
    await new Promise((r) => setTimeout(r, 800));
  }

  console.log(`\n========================================================`);
  console.log(`>>> [FLEET-TEST] ALL ${connections.length} BOTS ACTIVE IN CHANNEL! <<<`);
  console.log(`>>> PLAYING LOUD HARMONIC AUDIO CHIME FOR 20 SECONDS... <<<`);
  console.log(`========================================================\n`);

  const sampleRate = 48000;
  const chunkSamples = 960;
  const melody = [523.25, 659.25, 783.99, 1046.50, 880.00, 659.25, 523.25];
  let noteIndex = 0;
  let sampleCount = 0;

  const interval = setInterval(() => {
    const pcm = Buffer.alloc(chunkSamples * 4);
    const freq = melody[noteIndex];

    for (let i = 0; i < chunkSamples; i++) {
      const t = (sampleCount + i) / sampleRate;
      // High-volume, rich dual harmonic tone
      const val = Math.floor(
        (Math.sin(2 * Math.PI * freq * t) * 0.6 +
         Math.sin(2 * Math.PI * (freq * 1.5) * t) * 0.25 +
         Math.sin(2 * Math.PI * (freq * 2) * t) * 0.15) * 22000
      );
      pcm.writeInt16LE(val, i * 4);     // Left
      pcm.writeInt16LE(val, i * 4 + 2); // Right
    }

    sampleCount += chunkSamples;
    if (sampleCount % (sampleRate / 3) === 0) { // change note every 333ms
      noteIndex = (noteIndex + 1) % melody.length;
      console.log(`[FLEET-TEST] Chime Tone: ${melody[noteIndex].toFixed(1)} Hz (${connections.length} bots streaming live)`);
    }

    sharedAudioStream.write(pcm);
  }, 20);

  setTimeout(() => {
    clearInterval(interval);
    console.log('[FLEET-TEST] Test complete. Cleaning up...');
    connections.forEach((c) => {
      try { c.destroy(); } catch {}
    });
    validBots.forEach(({ client }) => {
      try { client.destroy(); } catch {}
    });
    console.log('[FLEET-TEST] Done!');
    process.exit(0);
  }, 20_000);
}

main().catch((err) => {
  console.error('[FLEET-TEST] Error:', err);
  process.exit(1);
});
