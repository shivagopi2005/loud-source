import { Client, GatewayIntentBits, PermissionFlagsBits } from 'discord.js';
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  StreamType,
  NoSubscriberBehavior,
  entersState,
  VoiceConnectionStatus,
  AudioPlayerStatus,
} from '@discordjs/voice';
import { PassThrough } from 'stream';
import { prisma } from '../src/server/db/prisma';
import { decryptSecret } from '../src/server/security/encryption';

const GUILD_ID = '1499406517470756955';
const CHANNEL_ID = '1499406518313947284';

async function main() {
  console.log('[AUDIO-DIAGNOSTIC] Fetching bots from DB...');
  const bots = await prisma.botApplication.findMany({
    where: { credentials: { some: {} } },
    include: { credentials: true },
  });

  let selectedBot: any = null;
  let selectedToken: string = '';
  let client: Client | null = null;

  for (const bot of bots) {
    if (bot.display_name === 'Integration Test Bot') continue;
    try {
      const token = decryptSecret(bot.credentials[0].secret_reference);
      const c = new Client({
        intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
      });

      await new Promise<void>((resolve, reject) => {
        c.once('ready', () => resolve());
        c.login(token).catch(reject);
      });

      if (c.guilds.cache.has(GUILD_ID)) {
        selectedBot = bot;
        selectedToken = token;
        client = c;
        break;
      } else {
        c.destroy();
      }
    } catch {}
  }

  if (!client || !selectedBot) {
    console.error('[AUDIO-DIAGNOSTIC] No bot found in target guild!');
    process.exit(1);
  }

  console.log(`[AUDIO-DIAGNOSTIC] Selected bot: ${client.user?.tag} (${selectedBot.id})`);

  const guild = client.guilds.cache.get(GUILD_ID)!;
  const channel: any = guild.channels.cache.get(CHANNEL_ID);

  if (!channel) {
    console.error(`[AUDIO-DIAGNOSTIC] Voice channel ${CHANNEL_ID} not found in guild!`);
    process.exit(1);
  }

  console.log(`[AUDIO-DIAGNOSTIC] Voice channel: "${channel.name}" (${channel.id})`);

  const member = guild.members.me;
  const perms = channel.permissionsFor(member);
  console.log(`[AUDIO-DIAGNOSTIC] Channel Permissions:`);
  console.log(`  - Connect: ${perms?.has(PermissionFlagsBits.Connect)}`);
  console.log(`  - Speak: ${perms?.has(PermissionFlagsBits.Speak)}`);
  console.log(`  - PrioritySpeaker: ${perms?.has(PermissionFlagsBits.PrioritySpeaker)}`);
  console.log(`  - UseVAD: ${perms?.has(PermissionFlagsBits.UseVAD)}`);

  console.log(`[AUDIO-DIAGNOSTIC] Connecting to voice channel...`);
  const connection = joinVoiceChannel({
    channelId: CHANNEL_ID,
    guildId: GUILD_ID,
    adapterCreator: guild.voiceAdapterCreator as any,
    group: client.user?.id || selectedBot.id,
    selfDeaf: false,
    selfMute: false,
  });

  connection.on('stateChange', (oldState, newState) => {
    console.log(`[VoiceConnection] ${oldState.status} -> ${newState.status}`);
  });

  connection.on('debug', (msg) => {
    console.log(`[VoiceConnection:DEBUG]`, msg);
  });

  connection.on('error', (err) => {
    console.error(`[VoiceConnection:ERROR]`, err);
  });

  await entersState(connection, VoiceConnectionStatus.Ready, 25_000);
  console.log(`[AUDIO-DIAGNOSTIC] VoiceConnection is READY!`);

  const player = createAudioPlayer({
    behaviors: {
      noSubscriber: NoSubscriberBehavior.Play,
      maxMissedFrames: 1_000_000,
    },
  });

  player.on('stateChange', (oldState, newState) => {
    console.log(`[AudioPlayer] ${oldState.status} -> ${newState.status}`);
  });

  player.on('debug', (msg) => {
    console.log(`[AudioPlayer:DEBUG]`, msg);
  });

  player.on('error', (err) => {
    console.error(`[AudioPlayer:ERROR]`, err);
  });

  const stream = new PassThrough();
  const resource = createAudioResource(stream, {
    inputType: StreamType.Raw,
    inlineVolume: true,
  });
  if (resource.volume) resource.volume.setVolume(1.0);

  player.play(resource);
  const subscription = connection.subscribe(player);
  console.log(`[AUDIO-DIAGNOSTIC] Connection subscribed to player:`, !!subscription);

  // Generate loud 880Hz / 440Hz dual tone
  const sampleRate = 48000;
  const chunkSamples = 960; // 20ms
  let sampleCount = 0;
  let chunksSent = 0;

  console.log(`[AUDIO-DIAGNOSTIC] Streaming 10 seconds of LOUD dual-tone audio (880Hz + 440Hz)...`);

  const interval = setInterval(() => {
    const pcm = Buffer.alloc(chunkSamples * 4);
    for (let i = 0; i < chunkSamples; i++) {
      const t = (sampleCount + i) / sampleRate;
      const val = Math.floor(
        (Math.sin(2 * Math.PI * 440 * t) * 0.5 + Math.sin(2 * Math.PI * 880 * t) * 0.5) * 28000
      );
      pcm.writeInt16LE(val, i * 4);     // L
      pcm.writeInt16LE(val, i * 4 + 2); // R
    }
    sampleCount += chunkSamples;
    stream.write(pcm);
    chunksSent++;

    if (chunksSent % 50 === 0) {
      console.log(`[AUDIO-DIAGNOSTIC] Sent ${chunksSent} frames (${chunksSent * 20}ms). Player status: ${player.state.status}`);
    }
  }, 20);

  await new Promise((r) => setTimeout(r, 10000));

  clearInterval(interval);
  stream.end();
  console.log(`[AUDIO-DIAGNOSTIC] Finished streaming 10 seconds of audio.`);

  await new Promise((r) => setTimeout(r, 1000));
  connection.destroy();
  client.destroy();
  console.log(`[AUDIO-DIAGNOSTIC] Disconnected cleanly.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[AUDIO-DIAGNOSTIC] Fatal:', err);
  process.exit(1);
});
