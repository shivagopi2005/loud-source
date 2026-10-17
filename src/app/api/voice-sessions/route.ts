import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/server/db/prisma';
import { authorizeWorkspaceMember } from '@/server/security/rbac';
import { okResponse, handleApiError, errorResponse } from '@/server/utils/api-response';
import { mediaGateway } from '@/server/voice/media-gateway';
import { signMediaSessionToken } from '@/server/security/jwt';
import { decryptSecret } from '@/server/security/encryption';
import { AuditService } from '@/server/services/audit.service';
import { VoiceEndpointConfig } from '@/server/voice/voice-worker';

const CreateVoiceSessionSchema = z.object({
  workspaceId: z.string().uuid(),
  destinations: z
    .array(
      z.object({
        botId: z.string().uuid(),
        guildConnectionId: z.string(),
        channelConfigId: z.string(),
      })
    )
    .min(1, 'At least one voice destination must be selected'),
  audioConfiguration: z
    .object({
      sampleRate: z.number().default(48000),
      channels: z.number().default(1),
      noiseSuppression: z.boolean().default(true),
      highPassFilter: z.boolean().default(true),
      compressor: z.boolean().default(true),
      inputGain: z.number().default(1.0),
    })
    .default({}),
  audioConfig: z
    .object({
      sampleRate: z.number().optional(),
      channels: z.number().optional(),
      noiseSuppression: z.boolean().optional(),
      highPassFilter: z.boolean().optional(),
      compressor: z.boolean().optional(),
      inputGain: z.number().optional(),
    })
    .optional(),
});

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get('workspaceId');

    if (!workspaceId) {
      return errorResponse('WORKSPACE_REQUIRED', 'workspaceId parameter is required', 400);
    }

    await authorizeWorkspaceMember(request, workspaceId);

    const sessions = await prisma.voiceSession.findMany({
      where: { workspace_id: workspaceId },
      include: {
        created_by: {
          select: { id: true, username: true, avatar_url: true },
        },
        endpoints: {
          include: {
            bot: { select: { id: true, display_name: true, status: true } },
            channel: { select: { id: true, display_name: true, channel_id: true } },
            guild: { select: { id: true, display_name: true, guild_id: true } },
          },
        },
      },
      orderBy: { created_at: 'desc' },
      take: 20,
    });

    return okResponse(sessions);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = CreateVoiceSessionSchema.parse(body);

    const { user } = await authorizeWorkspaceMember(
      request,
      data.workspaceId,
      'voice:start'
    );

    const { PremiumService } = await import('@/server/services/premium.service');
    const { FleetGatewayService } = await import('@/server/services/fleet-gateway.service');

    const workspace = await prisma.workspace.findUnique({
      where: { id: data.workspaceId },
      include: { owner: true },
    });

    const dbUser = await prisma.user.findUnique({
      where: { id: user.userId },
      select: { discord_id: true, tier: true, max_bots_allowed: true },
    });

    const ownerTier = await PremiumService.getUserTier(workspace?.owner?.discord_id || '');
    const sessionTier = await PremiumService.getUserTier(dbUser?.discord_id || '');

    const TIER_RANKS: Record<string, number> = {
      trial: 0,
      free: 0,
      community: 1,
      pro: 2,
      premium: 2,
      enterprise: 3,
      developer: 4,
    };

    const bestRank = Math.max(
      TIER_RANKS[ownerTier.tier] ?? 0,
      TIER_RANKS[sessionTier.tier] ?? 0,
      TIER_RANKS[workspace?.plan_id || ''] ?? 0,
      ownerTier.isDeveloper || sessionTier.isDeveloper ? 4 : 0
    );

    const isFreeTier = bestRank === 0;

    // Strict plan limits on simultaneous streaming voice endpoints:
    // Free / Community Trial: 5
    // Community: 5
    // Pro: 20
    // Enterprise: 100
    // Developer: 999
    const maxAllowedEndpoints =
      bestRank >= 4
        ? 999
        : bestRank === 3
        ? (dbUser?.max_bots_allowed || 100)
        : bestRank === 2
        ? (dbUser?.max_bots_allowed || 20)
        : 5;

    if (data.destinations.length > maxAllowedEndpoints) {
      return errorResponse(
        'PLAN_LIMIT_EXCEEDED',
        `Your subscription tier allows streaming to up to ${maxAllowedEndpoints} bot endpoint(s) simultaneously. You selected ${data.destinations.length}. Please upgrade your plan at /usage to stream to more bots.`,
        403
      );
    }

    let freeDevBots: any[] = [];
    if (isFreeTier) {
      freeDevBots = await FleetGatewayService.getFreeTierDeveloperBots();
    }

    // Verify each bot credential and destination existence
    const endpointConfigs: VoiceEndpointConfig[] = [];

    const dbSession = await prisma.voiceSession.create({
      data: {
        workspace_id: data.workspaceId,
        created_by_user_id: user.userId,
        state: 'awaiting_user_start',
        audio_configuration: data.audioConfiguration,
      },
    });

    for (const dest of data.destinations) {
      const bot = await prisma.botApplication.findUnique({
        where: { id: dest.botId },
        include: {
          credentials: {
            where: { status: 'active' },
            orderBy: { credential_version: 'desc' },
            take: 1,
          },
        },
      });

      if (!bot || !bot.credentials.length) {
        console.warn(`[CreateVoiceSession] Bot ${dest.botId} does not have an active credential, skipping.`);
        continue;
      }

      // STRICT ISOLATION: Bot must belong to this workspace, OR be an allocated developer bot for Free Tier
      const isOwnBot = bot.workspace_id === data.workspaceId;
      const isAllowedDevBot = isFreeTier && freeDevBots.some((fb) => fb.id === bot.id);

      if (!isOwnBot && !isAllowedDevBot) {
        console.warn(`[CreateVoiceSession] Cross-workspace bot access blocked: bot ${dest.botId} does not belong to workspace ${data.workspaceId}`);
        continue;
      }

      const rawGuildId = dest.guildConnectionId.trim();

      // Look up guild by UUID or Discord snowflake ID
      let guild = await prisma.guildConnection.findFirst({
        where: {
          workspace_id: data.workspaceId,
          OR: [{ id: rawGuildId }, { guild_id: rawGuildId }],
        },
      });

      // If guild is not yet registered in this workspace, auto-create/upsert on the fly so manual Guild IDs always work!
      if (!guild) {
        guild = await prisma.guildConnection.upsert({
          where: {
            workspace_id_guild_id: {
              workspace_id: data.workspaceId,
              guild_id: rawGuildId,
            },
          },
          update: {
            verification_status: 'verified',
            verified_at: new Date(),
          },
          create: {
            workspace_id: data.workspaceId,
            guild_id: rawGuildId,
            display_name: `Server #${rawGuildId.slice(-4)}`,
            verification_status: 'verified',
            verified_at: new Date(),
          },
        });
      }

      // Upsert bot-guild access record so permission checks and audits succeed
      await prisma.botGuildAccess.upsert({
        where: {
          bot_id_guild_connection_id: {
            bot_id: bot.id,
            guild_connection_id: guild.id,
          },
        },
        update: {
          status: 'active',
          last_verified_at: new Date(),
        },
        create: {
          bot_id: bot.id,
          guild_connection_id: guild.id,
          status: 'active',
          permissions_snapshot: '8', // Administrator
          last_verified_at: new Date(),
        },
      });

      const rawChannelId = dest.channelConfigId.trim();

      if (rawGuildId === rawChannelId) {
        throw new Error(
          `Target Server ID and Voice Channel ID cannot be identical (${rawGuildId}). Please enter your voice channel ID (e.g. 1499406518313947284) in the channel field.`
        );
      }

      // Look up channel by UUID or Discord snowflake ID
      let channel = await prisma.channelConfig.findFirst({
        where: {
          guild_connection_id: guild.id,
          OR: [{ id: rawChannelId }, { channel_id: rawChannelId }],
        },
      });

      // If channel is not yet registered, auto-configure it on the fly so manual channel IDs always work!
      if (!channel) {
        channel = await prisma.channelConfig.upsert({
          where: {
            guild_connection_id_channel_id: {
              guild_connection_id: guild.id,
              channel_id: rawChannelId,
            },
          },
          update: {
            display_name: `voice-${rawChannelId.slice(-4)}`,
            status: 'active',
          },
          create: {
            workspace_id: data.workspaceId,
            guild_connection_id: guild.id,
            channel_id: rawChannelId,
            channel_type: 2, // GUILD_VOICE
            purpose: 'voice_streaming',
            display_name: `voice-${rawChannelId.slice(-4)}`,
            status: 'active',
          },
        });
      }

      // Check if bot is connected and known to NOT be in the guild
      const { FleetGatewayService } = await import('@/server/services/fleet-gateway.service');
      const client = FleetGatewayService.getClient(bot.id, bot.application_id);
      if (client && client.isReady() && !client.guilds.cache.has(guild.guild_id)) {
        console.warn(`[CreateVoiceSession] Bot ${bot.display_name} (${bot.id}) is not in guild ${guild.guild_id}, skipping.`);
        continue;
      }

      // Check if bot is already actively streaming in the same guild in another workspace's session
      const activeVoice = mediaGateway.getActiveBotVoiceSession(bot.application_id || bot.id, guild.guild_id);
      if (activeVoice.inUse && activeVoice.workspaceId !== data.workspaceId) {
        console.warn(`[CreateVoiceSession] Bot ${bot.display_name} is currently busy in guild ${guild.guild_id} by another workspace (${activeVoice.workspaceId}).`);
        continue;
      }

      const token = decryptSecret(bot.credentials[0].secret_reference);

      const endpoint = await prisma.voiceEndpoint.create({
        data: {
          voice_session_id: dbSession.id,
          bot_id: bot.id,
          guild_connection_id: guild.id,
          channel_config_id: channel.id,
          state: 'pending',
        },
      });

      endpointConfigs.push({
        endpointId: endpoint.id,
        botId: bot.id,
        applicationId: bot.application_id,
        botToken: token,
        guildId: guild.guild_id,
        channelId: channel.channel_id,
      });
    }

    if (endpointConfigs.length === 0) {
      return errorResponse(
        'NO_VALID_BOTS',
        'None of the selected bots are members of this Discord server. Please verify your bots have joined this server.',
        400
      );
    }

    const rawInitialGain = data.audioConfig?.inputGain ?? data.audioConfiguration?.inputGain;
    let initialGain = typeof rawInitialGain === 'number' && !isNaN(rawInitialGain) ? rawInitialGain : 1.0;
    // Cap gain by tier: Free/Community: max 2.0 (200%), Pro/Enterprise/Developer: up to 100.0 (10000%)
    const maxGain = bestRank >= 2 ? 100.0 : 2.0;
    initialGain = Math.max(0, Math.min(maxGain, initialGain));

    // Initialize on MediaGateway
    await mediaGateway.createSession(
      dbSession.id,
      data.workspaceId,
      user.userId,
      endpointConfigs,
      initialGain
    );

    // Issue short-lived Media Session Token for WebRTC/WebSocket streaming
    const mediaToken = signMediaSessionToken({
      sessionId: dbSession.id,
      workspaceId: data.workspaceId,
      userId: user.userId,
    });

    await AuditService.record({
      workspaceId: data.workspaceId,
      actorUserId: user.userId,
      action: 'voice.session_created',
      resourceType: 'voice_session',
      resourceId: dbSession.id,
      metadata: { endpointCount: endpointConfigs.length },
    });

    return okResponse(
      {
        sessionId: dbSession.id,
        state: dbSession.state,
        mediaToken,
        endpoints: endpointConfigs.map((e) => ({
          endpointId: e.endpointId,
          botId: e.botId,
          channelId: e.channelId,
        })),
      },
      201
    );
  } catch (err) {
    return handleApiError(err);
  }
}
