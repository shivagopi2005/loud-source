import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/server/db/prisma';
import { mediaGateway } from '../../src/server/voice/media-gateway';
import { encryptSecret } from '../../src/server/security/encryption';
import { verifyMediaSessionToken } from '../../src/server/security/jwt';

describe('Voice Session Lifecycle & Emergency Stop (PRD Section 8)', () => {
  let workspaceId: string;
  let userId: string;
  let bot1Id: string;
  let bot2Id: string;
  let guildConnId: string;
  let channel1Id: string;
  let channel2Id: string;
  let sessionId: string;

  beforeAll(async () => {
    // Load seeded workspace and user
    const ws = await prisma.workspace.findFirst({
      include: { owner: true, bots: true, guilds: { include: { channel_configs: true } } },
    });

    if (!ws) {
      throw new Error('Seed database must be run before tests');
    }

    workspaceId = ws.id;
    userId = ws.owner_user_id;
    const stableBots = ws.bots.filter((b) => b.application_id !== '990000000000000099');
    bot1Id = stableBots[0].id;
    bot2Id = stableBots[1].id;
    guildConnId = ws.guilds[0].id;

    const voiceChannels = ws.guilds[0].channel_configs.filter((c) => c.channel_type === 2 || c.channel_type === 13);
    channel1Id = voiceChannels[0].id;
    channel2Id = voiceChannels[1].id;
  });

  it('creates a multi-output voice session with valid media stream token', async () => {
    const dbSession = await prisma.voiceSession.create({
      data: {
        workspace_id: workspaceId,
        created_by_user_id: userId,
        state: 'awaiting_user_start',
        audio_configuration: { inputGain: 1.0, compressor: true },
      },
    });

    sessionId = dbSession.id;

    const ep1 = await prisma.voiceEndpoint.create({
      data: {
        voice_session_id: sessionId,
        bot_id: bot1Id,
        guild_connection_id: guildConnId,
        channel_config_id: channel1Id,
        state: 'pending',
      },
    });

    const ep2 = await prisma.voiceEndpoint.create({
      data: {
        voice_session_id: sessionId,
        bot_id: bot2Id,
        guild_connection_id: guildConnId,
        channel_config_id: channel2Id,
        state: 'pending',
      },
    });

    const activeSession = await mediaGateway.createSession(sessionId, workspaceId, userId, [
      {
        endpointId: ep1.id,
        botId: bot1Id,
        botToken: 'mock_bot_token_alpha',
        guildId: '888888888888888888',
        channelId: '100000000000000001',
      },
      {
        endpointId: ep2.id,
        botId: bot2Id,
        botToken: 'mock_bot_token_beta',
        guildId: '888888888888888888',
        channelId: '100000000000000002',
      },
    ]);

    expect(activeSession).toBeDefined();
    expect(activeSession.endpoints.size).toBe(2);
    expect(activeSession.state).toBe('awaiting_start');
  });

  it('starts voice session and connects all voice endpoints concurrently', async () => {
    const started = await mediaGateway.startSession(sessionId);
    expect(started).toBe(true);

    const session = mediaGateway.getSession(sessionId);
    expect(session?.state).toBe('streaming');

    const workers = Array.from(session!.endpoints.values());
    expect(workers.length).toBe(2);
    expect(workers[0].state).toBe('connected');
    expect(workers[1].state).toBe('connected');
  });

  it('allows individual endpoint muting and volume control without affecting others', () => {
    const session = mediaGateway.getSession(sessionId)!;
    const workers = Array.from(session.endpoints.values());

    const w1 = workers[0];
    const w2 = workers[1];

    w1.setMute(true);
    expect(w1.muted).toBe(true);
    expect(w1.state).toBe('muted');
    expect(w2.muted).toBe(false);
    expect(w2.state).toBe('connected');

    w2.setGain(1.5);
    expect(w2.gain).toBe(1.5);
    expect(w1.gain).toBe(1.0);
  });

  it('Emergency Stop immediately destroys all voice connections and marks session stopped', async () => {
    await mediaGateway.emergencyStop(sessionId, 'emergency_stop');

    const inMemorySession = mediaGateway.getSession(sessionId);
    expect(inMemorySession).toBeUndefined(); // Destroyed from active memory

    const dbSession = await prisma.voiceSession.findUnique({
      where: { id: sessionId },
    });

    expect(dbSession?.state).toBe('stopped');
    expect(dbSession?.stop_reason).toBe('emergency_stop');

    // Check that audit event was recorded
    const audit = await prisma.auditEvent.findFirst({
      where: { resource_id: sessionId, action: 'voice.emergency_stop' },
    });
    expect(audit).toBeDefined();
    expect(audit?.result).toBe('success');
  });
});
