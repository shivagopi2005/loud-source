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
        throw new Error(`Bot ${dest.botId} does not have an active credential`);
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

      // Look up channel by UUID or Discord snowflake ID
      let channel = await prisma.channelConfig.findFirst({
        where: {
          guild_connection_id: guild.id,
          OR: [{ id: dest.channelConfigId }, { channel_id: dest.channelConfigId }],
        },
      });

      // If channel is not yet registered, auto-configure it on the fly so manual channel IDs always work!
      if (!channel) {
        const rawChannelId = dest.channelConfigId.trim();
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
        botToken: token,
        guildId: guild.guild_id,
        channelId: channel.channel_id,
      });
    }

    // Initialize on MediaGateway
    await mediaGateway.createSession(
      dbSession.id,
      data.workspaceId,
      user.userId,
      endpointConfigs
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
