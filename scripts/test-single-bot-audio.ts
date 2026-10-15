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
} from '@discordjs/voice';
import { PassThrough } from 'stream';
import { prisma } from '../src/server/db/prisma';
import { decryptSecret } from '../src/server/security/encryption';

const GUILD_ID = '1499406517470756955';
const CHANNEL_ID = '1499406518313947284';

async function main() {
  console.log('[TEST] Finding bot in DB...');
  const bot = await prisma.botApplication.findFirst({
    where: {
      display_name: 'RANKU MOGUDU',
      credentials: { some: {} },
    },
    include: { credentials: true },
  });

  if (!bot || !bot.credentials[0]) {
    console.error('[TEST] No bot found!');
    process.exit(1);
  }

  const token = decryptSecret(bot.credentials[0].secret_reference);
  console.log(`[TEST] Using bot: ${bot.display_name} (${bot.id})`);

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
  });

  await new Promise<void>((resolve, reject) => {
    client.once('ready', () => {
      console.log(`[TEST] Discord client logged in as ${client.user?.tag}`);
      resolve();
    });
    client.login(token).catch(reject);
  });

  const guild = client.guilds.cache.get(GUILD_ID);
  if (!guild) {
    console.error(`[TEST] Guild ${GUILD_ID} not found!`);
    process.exit(1);
  }

  const voiceChannel = guild.channels.cache.get(CHANNEL_ID);
  console.log(`[TEST] Target channel: ${voiceChannel?.name} (${CHANNEL_ID})`);

  console.log('[TEST] Joining voice channel...');
  const connection = joinVoiceChannel({
    channelId: CHANNEL_ID,
    guildId: GUILD_ID,
    adapterCreator: guild.voiceAdapterCreator as any,
    group: client.user?.id || bot.id,
    selfDeaf: false,
    selfMute: false,
    debug: true,
  });

  connection.on('debug', (msg) => {
    console.log(`[TEST DEBUG] ${msg}`);
  });

  connection.on('stateChange', (oldState, newState) => {
    console.log(`[TEST] VoiceConnection: ${oldState.status} -> ${newState.status}`);
  });

  await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
  console.log('[TEST] Voice connection READY!');

  const player = createAudioPlayer({
    behaviors: {
      noSubscriber: NoSubscriberBehavior.Play,
      maxMissedFrames: 1_000_000,
    },
  });

  player.on('stateChange', (oldState, newState) => {
    console.log(`[TEST] AudioPlayer: ${oldState.status} -> ${newState.status}`);
  });

  player.on('error', (err) => {
    console.error('[TEST] AudioPlayer error:', err);
  });

  const audioStream = new PassThrough();
  const resource = createAudioResource(audioStream, {
    inputType: StreamType.Raw,
    inlineVolume: true,
  });

  if (resource.volume) {
    resource.volume.setVolume(1.0);
  }

  player.play(resource);
  const subscription = connection.subscribe(player);
  console.log('[TEST] Player subscribed to connection. Subscribed:', !!subscription);

  // Generate a distinct 2-tone melodic beep (C5: 523Hz, E5: 659Hz, G5: 784Hz)
  console.log('[TEST] Streaming audible tone for 15 seconds...');
  const sampleRate = 48000;
  const chunkSamples = 960; // 20ms of audio
  const tones = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
  let toneIdx = 0;
  let sampleCount = 0;

  const interval = setInterval(() => {
    const pcm = Buffer.alloc(chunkSamples * 4); // 960 samples * 2 channels * 2 bytes = 3840 bytes
    const freq = tones[toneIdx];

    for (let i = 0; i < chunkSamples; i++) {
      const t = (sampleCount + i) / sampleRate;
      // Synthesize harmonic sine wave with envelope
      const val = Math.floor(
        (Math.sin(2 * Math.PI * freq * t) * 0.7 +
         Math.sin(2 * Math.PI * (freq * 2) * t) * 0.3) * 16000
      );
      pcm.writeInt16LE(val, i * 4);     // Left
      pcm.writeInt16LE(val, i * 4 + 2); // Right
    }

    sampleCount += chunkSamples;
    if (sampleCount % (sampleRate / 2) === 0) { // change note every 500ms
      toneIdx = (toneIdx + 1) % tones.length;
      console.log(`[TEST] Playing frequency: ${tones[toneIdx]} Hz (Player status: ${player.state.status})`);
    }

    audioStream.write(pcm);
  }, 20); // 20ms interval

  setTimeout(() => {
    clearInterval(interval);
    console.log('[TEST] Finished playing tones. Disconnecting...');
    connection.destroy();
    client.destroy();
    process.exit(0);
  }, 15_000);
}

main().catch((err) => {
  console.error('[TEST] Fatal error:', err);
  process.exit(1);
});
