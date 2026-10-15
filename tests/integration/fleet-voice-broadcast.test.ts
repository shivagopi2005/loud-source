import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '../../src/server/db/prisma';
import { mediaGateway } from '../../src/server/voice/media-gateway';
import { DiscordBotService } from '../../src/server/services/discord-bot.service';

describe('Fleet Server Join & Multi-Bot Channel Voice Streaming', () => {
  let workspaceId: string;
  let userId: string;
  let bot1Id: string;
  let bot2Id: string;
  let guildConnId: string;
  let singleVoiceChannelId: string;

  beforeAll(async () => {
    const ws = await prisma.workspace.findFirst({
      include: { owner: true, bots: true, guilds: { include: { channel_configs: true } } },
    });

    if (!ws) throw new Error('Database must be seeded');
    workspaceId = ws.id;
    userId = ws.owner_user_id;
    bot1Id = ws.bots[0].id;
    bot2Id = ws.bots[1].id;
    guildConnId = ws.guilds[0].id;

    const voiceChannel = ws.guilds[0].channel_configs.find(
      (c) => c.channel_type === 2 || c.channel_type === 13
    );
    if (!voiceChannel) throw new Error('Voice channel required in seed');
    singleVoiceChannelId = voiceChannel.id;
  });

  it('joins and links all fleet bots to a server in one step and auto-syncs voice channels', async () => {
    const testGuildId = '999888777666555444';

    // Verify all bots access the guild
    const bots = await prisma.botApplication.findMany({
      where: { workspace_id: workspaceId },
      include: { credentials: { where: { status: 'active' }, take: 1 } },
    });

    expect(bots.length).toBeGreaterThanOrEqual(2);

    // Upsert Guild Connection
    const guildConnection = await prisma.guildConnection.upsert({
      where: {
        workspace_id_guild_id: {
          workspace_id: workspaceId,
          guild_id: testGuildId,
        },
      },
      update: { display_name: 'Fleet Community Stage Server' },
      create: {
        workspace_id: workspaceId,
        guild_id: testGuildId,
        display_name: 'Fleet Community Stage Server',
        verification_status: 'verified',
      },
    });

    // Link all bots to guild at a time
    for (const bot of bots) {
      await prisma.botGuildAccess.upsert({
        where: {
          bot_id_guild_connection_id: {
            bot_id: bot.id,
            guild_connection_id: guildConnection.id,
          },
        },
        update: { status: 'active' },
        create: {
          bot_id: bot.id,
          guild_connection_id: guildConnection.id,
          status: 'active',
          permissions_snapshot: '3148800',
        },
      });
    }

    const linkedAccesses = await prisma.botGuildAccess.findMany({
      where: { guild_connection_id: guildConnection.id },
    });
    expect(linkedAccesses.length).toBe(bots.length);

    // Auto-sync channels
    const channels = await DiscordBotService.getGuildChannels('mock_token', testGuildId);
    expect(channels.length).toBeGreaterThan(0);

    for (const ch of channels) {
      await prisma.channelConfig.upsert({
        where: {
          guild_connection_id_channel_id: {
            guild_connection_id: guildConnection.id,
            channel_id: ch.id,
          },
        },
        update: { display_name: ch.name },
        create: {
          workspace_id: workspaceId,
          guild_connection_id: guildConnection.id,
          channel_id: ch.id,
          channel_type: ch.type,
          purpose: ch.type === 2 || ch.type === 13 ? 'voice_streaming' : 'text_testing',
          display_name: ch.name,
        },
      });
    }

    const savedVoiceChannels = await prisma.channelConfig.findMany({
      where: { guild_connection_id: guildConnection.id, purpose: 'voice_streaming' },
    });
    expect(savedVoiceChannels.length).toBeGreaterThan(0);
  }, 30000);

  it('connects multiple bots to the EXACT SAME voice channel and broadcasts audio simultaneously', async () => {
    // 1. Create session
    const session = await prisma.voiceSession.create({
      data: {
        workspace_id: workspaceId,
        created_by_user_id: userId,
        state: 'awaiting_user_start',
        audio_configuration: { sampleRate: 48000, inputGain: 1.0 },
      },
    });

    // 2. Both bot1 and bot2 target the SAME voice channel (singleVoiceChannelId)
    const ep1 = await prisma.voiceEndpoint.create({
      data: {
        voice_session_id: session.id,
        bot_id: bot1Id,
        guild_connection_id: guildConnId,
        channel_config_id: singleVoiceChannelId,
        state: 'pending',
      },
    });

    const ep2 = await prisma.voiceEndpoint.create({
      data: {
        voice_session_id: session.id,
        bot_id: bot2Id,
        guild_connection_id: guildConnId,
        channel_config_id: singleVoiceChannelId,
        state: 'pending',
      },
    });

    expect(ep1.channel_config_id).toBe(ep2.channel_config_id);
    expect(ep1.bot_id).not.toBe(ep2.bot_id);

    // 3. Initialize session on Media Gateway
    await mediaGateway.createSession(session.id, workspaceId, userId, [
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
        channelId: '100000000000000001',
      },
    ]);

    // 4. Start voice broadcast
    const started = await mediaGateway.startSession(session.id);
    expect(started).toBe(true);

    const activeSession = mediaGateway.getSession(session.id);
    expect(activeSession).toBeDefined();
    expect(activeSession?.endpoints.size).toBe(2);

    // Both workers connected
    for (const worker of activeSession!.endpoints.values()) {
      expect(worker.state).toBe('connected');
      expect(worker.channelId).toBe('100000000000000001');
    }

    // 5. Broadcast simulated voice frame to all bot endpoints in the channel
    const audioChunk = Buffer.alloc(2048, 0x1a);
    const worker1 = activeSession?.endpoints.get(ep1.id);
    const worker2 = activeSession?.endpoints.get(ep2.id);
    expect(worker1).toBeDefined();
    expect(worker2).toBeDefined();

    worker1?.feedAudio(audioChunk, 50);
    worker2?.feedAudio(audioChunk, 50);

    // 6. Adjust per-bot volume and mute in the same channel
    worker1?.setGain(1.5);
    expect(worker1?.gain).toBe(1.5);

    worker2?.setMute(true);
    expect(worker2?.muted).toBe(true);
    expect(worker1?.muted).toBe(false);

    // 7. Cleanup session
    await mediaGateway.stopSession(session.id);
    expect(mediaGateway.getSession(session.id)).toBeUndefined();
  });
});
