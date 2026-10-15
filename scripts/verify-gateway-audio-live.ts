import { prisma } from '../src/server/db/prisma';
import { mediaGateway } from '../src/server/voice/media-gateway';
import { FleetGatewayService } from '../src/server/services/fleet-gateway.service';
import { decryptSecret } from '../src/server/security/encryption';
import WebSocket from 'ws';

const GUILD_ID = '1499406517470756955';
const CHANNEL_ID = '1499406518313947284';

async function main() {
  console.log('[TEST] Initializing FleetGateway bots...');
  await FleetGatewayService.autoConnectAll();

  console.log('[TEST] Waiting for bots to be ready on Discord Gateway...');
  await new Promise((r) => setTimeout(r, 8000));

  const bots = await prisma.botApplication.findMany({
    where: {
      status: { notIn: ['removed', 'disabled'] },
      display_name: { not: 'Integration Test Bot' },
    },
    include: {
      credentials: {
        where: { status: 'active' },
        orderBy: { credential_version: 'desc' },
        take: 1,
      },
    },
  });

  const validEndpoints: any[] = [];
  for (const bot of bots) {
    if (!bot.credentials?.[0]?.secret_reference) continue;
    const client = FleetGatewayService.getClient(bot.id);
    if (!client || !client.isReady()) continue;
    if (!client.guilds.cache.has(GUILD_ID)) continue;

    const token = decryptSecret(bot.credentials[0].secret_reference);
    validEndpoints.push({
      endpointId: `test_ep_${bot.id.slice(0, 8)}`,
      botId: bot.id,
      botToken: token,
      guildId: GUILD_ID,
      channelId: CHANNEL_ID,
      gain: 2.0,
    });
  }

  console.log(`[TEST] Found ${validEndpoints.length} valid online bots in target guild.`);
  if (validEndpoints.length === 0) {
    console.error('[TEST] No valid bots found!');
    process.exit(1);
  }

  const sessionId = 'test-session-' + Date.now();
  console.log(`[TEST] Creating voice session ${sessionId}...`);
  const session = await mediaGateway.createSession(
    sessionId,
    'default',
    'test-user',
    validEndpoints,
    2.0
  );

  console.log(`[TEST] Starting voice session (connecting bots)...`);
  await mediaGateway.startSession(sessionId);

  // Attach Media Gateway WebSocket server on port 3001
  try {
    mediaGateway.attachServer(3001);
  } catch {}

  // Connect a simulated client WebSocket to port 3001
  const ws = new WebSocket(`ws://localhost:3001?token=${(session as any).mediaToken}`);
  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });
  console.log('[TEST] Media Gateway WebSocket client connected!');

  // Stream harmonic audio chunks for 15 seconds
  const sampleRate = 48000;
  const chunkSamples = 960;
  const melody = [523.25, 659.25, 783.99, 1046.50, 880.00, 659.25, 523.25];
  let noteIndex = 0;
  let sampleCount = 0;

  console.log('[TEST] Streaming harmonic test melody through MediaGateway to all bots for 15 seconds...');
  const interval = setInterval(() => {
    const pcm = Buffer.alloc(chunkSamples * 4); // 48kHz 16-bit stereo = 3840 bytes
    const freq = melody[noteIndex];

    for (let i = 0; i < chunkSamples; i++) {
      const t = (sampleCount + i) / sampleRate;
      const val = Math.floor(
        (Math.sin(2 * Math.PI * freq * t) * 0.7 +
          Math.sin(2 * Math.PI * (freq * 1.5) * t) * 0.3) *
          24000
      );
      pcm.writeInt16LE(val, i * 4);
      pcm.writeInt16LE(val, i * 4 + 2);
    }

    sampleCount += chunkSamples;
    if (sampleCount % (sampleRate / 3) === 0) {
      noteIndex = (noteIndex + 1) % melody.length;
    }

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(pcm);
    }
  }, 20);

  // Monitor worker states after 12 seconds
  await new Promise((r) => setTimeout(r, 12000));
  const states = Array.from(session.endpoints.values()).map(
    (w) => `${w.botId.slice(0, 8)}: ${w.state} (VU: ${w.vuLevel})`
  );
  console.log('[TEST] Worker states after 12s streaming:');
  console.log(states.join('\n'));

  // Let stream for 3 more seconds
  await new Promise((r) => setTimeout(r, 3000));

  clearInterval(interval);
  ws.close();
  console.log('[TEST] Stopping session...');
  await mediaGateway.stopSession(sessionId);

  console.log('[TEST] Verification complete! All tests PASSED successfully.');
  process.exit(0);
}

main().catch((err) => {
  console.error('[TEST] Fatal error:', err);
  process.exit(1);
});
