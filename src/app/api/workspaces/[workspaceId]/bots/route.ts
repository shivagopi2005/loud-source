import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/server/db/prisma';
import { authorizeWorkspaceMember } from '@/server/security/rbac';
import { okResponse, handleApiError, errorResponse } from '@/server/utils/api-response';
import { encryptSecret, maskToken } from '@/server/security/encryption';
import { DiscordBotService } from '@/server/services/discord-bot.service';
import { AuditService } from '@/server/services/audit.service';
import { realtimeBroadcaster } from '@/server/realtime/events';

const RegisterBotSchema = z.object({
  displayName: z.string().min(1).max(64).optional(),
  applicationId: z.string().regex(/^\d{17,20}$/, 'Invalid Discord Application ID format').optional(),
  botToken: z.string().min(10, 'Discord bot token is required'),
  tags: z.array(z.string()).default([]),
  operationalRole: z.string().default('voice_operator'),
  groupId: z.string().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await params;
    await authorizeWorkspaceMember(request, workspaceId);

    const bots = await prisma.botApplication.findMany({
      where: { workspace_id: workspaceId },
      include: {
        credentials: {
          select: {
            id: true,
            credential_version: true,
            status: true,
            created_at: true,
            rotated_at: true,
          },
          orderBy: { credential_version: 'desc' },
          take: 1,
        },
        guild_accesses: {
          include: {
            guild: {
              select: { id: true, guild_id: true, display_name: true, verification_status: true },
            },
          },
        },
        group_memberships: {
          include: {
            group: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    const { FleetGatewayService } = await import('@/server/services/fleet-gateway.service');

    return okResponse(
      bots.map((b) => {
        const isOnline = FleetGatewayService.isBotOnline(b.id) || b.status === 'connected';
        const liveGuildIds = FleetGatewayService.getBotGuildIds(b.id);
        return {
          id: b.id,
          applicationId: b.application_id,
          displayName: b.display_name,
          verifiedBotUserId: b.verified_bot_user_id,
          status: isOnline ? 'connected' : b.status,
          online: isOnline,
          liveGuildIds,
          lastHealthCheckAt: b.last_health_check_at,
          tags: b.tags,
          operationalRole: b.operational_role,
          avatarUrl: b.avatar_url,
          bannerUrl: b.banner_url,
          bio: b.bio,
          customStatus: b.custom_status,
          activityType: b.activity_type,
          accentColor: b.accent_color,
          createdAt: b.created_at,
        credential: b.credentials[0]
          ? {
              id: b.credentials[0].id,
              version: b.credentials[0].credential_version,
              status: b.credentials[0].status,
              maskedToken: '••••••••••••••••••••••••••••',
            }
          : null,
        guilds: b.guild_accesses.map((ga) => ({
          guildId: ga.guild.guild_id,
          name: ga.guild.display_name,
          status: ga.status,
        })),
        groups: b.group_memberships.map((gm) => ({
          id: gm.group.id,
          name: gm.group.name,
        })),
      };
    })
  );
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await params;
    const { user } = await authorizeWorkspaceMember(request, workspaceId, 'bot:register');
    const body = await request.json();
    const data = RegisterBotSchema.parse(body);

    // 1. Verify Bot Token with Discord REST API & auto-resolve Application ID / Bot Name
    let verifiedIdentity;
    try {
      verifiedIdentity = await DiscordBotService.verifyBotToken(
        data.botToken,
        data.applicationId
      );
    } catch (err: any) {
      return errorResponse(
        'BOT_CREDENTIAL_INVALID',
        `Discord verification failed: ${err.message}`,
        400
      );
    }

    const resolvedAppId = data.applicationId || verifiedIdentity.applicationId;
    const resolvedName =
      data.displayName?.trim() || verifiedIdentity.username || `Bot-${resolvedAppId.slice(-4)}`;

    // 2. Encrypt token using AES-256-GCM
    const encryptedSecretReference = encryptSecret(data.botToken);

    // 3. Upsert Bot Record & Credential Record in Transaction
    const bot = await prisma.$transaction(async (tx) => {
      let existingBot = await tx.botApplication.findUnique({
        where: {
          workspace_id_application_id: {
            workspace_id: workspaceId,
            application_id: resolvedAppId,
          },
        },
      });

      if (existingBot) {
        existingBot = await tx.botApplication.update({
          where: { id: existingBot.id },
          data: {
            display_name: resolvedName,
            verified_bot_user_id: verifiedIdentity.id,
            status: 'ready',
            tags: data.tags.length > 0 ? data.tags : existingBot.tags,
            operational_role: data.operationalRole || existingBot.operational_role,
            last_health_check_at: new Date(),
          },
        });

        // Add new active credential version
        const latestCred = await tx.botCredential.findFirst({
          where: { bot_id: existingBot.id },
          orderBy: { credential_version: 'desc' },
        });
        const nextVersion = (latestCred?.credential_version || 1) + 1;

        await tx.botCredential.updateMany({
          where: { bot_id: existingBot.id, status: 'active' },
          data: { status: 'rotated', rotated_at: new Date() },
        });

        await tx.botCredential.create({
          data: {
            bot_id: existingBot.id,
            secret_reference: encryptedSecretReference,
            credential_version: nextVersion,
            status: 'active',
          },
        });

        return existingBot;
      }

      const newBot = await tx.botApplication.create({
        data: {
          workspace_id: workspaceId,
          application_id: resolvedAppId,
          display_name: resolvedName,
          verified_bot_user_id: verifiedIdentity.id,
          status: 'ready',
          tags: data.tags,
          operational_role: data.operationalRole,
          last_health_check_at: new Date(),
        },
      });

      await tx.botCredential.create({
        data: {
          bot_id: newBot.id,
          secret_reference: encryptedSecretReference,
          credential_version: 1,
          status: 'active',
        },
      });

      if (data.groupId) {
        await tx.botGroupMember.create({
          data: {
            group_id: data.groupId,
            bot_id: newBot.id,
          },
        });
      }

      return newBot;
    });

    // 4. Connect bot to Discord Gateway immediately so it appears ONLINE in Discord
    try {
      const { FleetGatewayService } = await import('@/server/services/fleet-gateway.service');
      await FleetGatewayService.connectBot(bot.id, data.botToken);
    } catch (gwErr) {
      console.warn('[RegisterBot] Immediate Gateway connect warning:', gwErr);
    }

    // 5. Record Audit Log (Notice: token is NOT included)
    await AuditService.record({
      workspaceId,
      actorUserId: user.userId,
      action: 'bot.register',
      resourceType: 'bot',
      resourceId: bot.id,
      metadata: {
        applicationId: bot.application_id,
        displayName: bot.display_name,
        botUserId: verifiedIdentity.id,
      },
    });

    realtimeBroadcaster.broadcast(workspaceId, 'bot.registered', {
      botId: bot.id,
      displayName: bot.display_name,
      status: bot.status,
    });

    return okResponse(
      {
        id: bot.id,
        applicationId: bot.application_id,
        displayName: bot.display_name,
        status: bot.status,
        verifiedBotUserId: bot.verified_bot_user_id,
        maskedToken: maskToken(data.botToken),
      },
      201
    );
  } catch (err) {
    return handleApiError(err);
  }
}
