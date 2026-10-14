import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/server/db/prisma';
import { authorizeWorkspaceMember } from '@/server/security/rbac';
import { okResponse, handleApiError, errorResponse } from '@/server/utils/api-response';
import { AuditService } from '@/server/services/audit.service';
import { DiscordBotService } from '@/server/services/discord-bot.service';

const UpdateBotSchema = z.object({
  displayName: z.string().min(2).max(64).optional(),
  operationalRole: z.string().optional(),
  tags: z.array(z.string()).optional(),
  status: z.enum(['ready', 'disabled']).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ botId: string }> }
) {
  try {
    const { botId } = await params;
    const bot = await prisma.botApplication.findUnique({
      where: { id: botId },
      include: {
        workspace: true,
        credentials: {
          select: {
            id: true,
            credential_version: true,
            status: true,
            created_at: true,
            rotated_at: true,
            revoked_at: true,
          },
          orderBy: { credential_version: 'desc' },
        },
        guild_accesses: {
          include: {
            guild: true,
          },
        },
        group_memberships: {
          include: {
            group: true,
          },
        },
      },
    });

    if (!bot) {
      return errorResponse('BOT_NOT_FOUND', 'Bot application not found', 404);
    }

    await authorizeWorkspaceMember(request, bot.workspace_id);

    const installUrl = DiscordBotService.generateInstallUrl(bot.application_id);

    return okResponse({
      id: bot.id,
      workspaceId: bot.workspace_id,
      applicationId: bot.application_id,
      displayName: bot.display_name,
      verifiedBotUserId: bot.verified_bot_user_id,
      status: bot.status,
      operationalRole: bot.operational_role,
      tags: bot.tags,
      lastHealthCheckAt: bot.last_health_check_at,
      createdAt: bot.created_at,
      installUrl,
      credentials: bot.credentials,
      guilds: bot.guild_accesses.map((ga) => ({
        id: ga.id,
        guildId: ga.guild.guild_id,
        name: ga.guild.display_name,
        verificationStatus: ga.guild.verification_status,
        permissionsSnapshot: ga.permissions_snapshot,
        lastVerifiedAt: ga.last_verified_at,
      })),
      groups: bot.group_memberships.map((gm) => ({
        id: gm.group.id,
        name: gm.group.name,
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ botId: string }> }
) {
  try {
    const { botId } = await params;
    const bot = await prisma.botApplication.findUnique({
      where: { id: botId },
    });

    if (!bot) {
      return errorResponse('BOT_NOT_FOUND', 'Bot application not found', 404);
    }

    const { user } = await authorizeWorkspaceMember(request, bot.workspace_id, 'bot:manage');
    const body = await request.json();
    const data = UpdateBotSchema.parse(body);

    const updated = await prisma.botApplication.update({
      where: { id: botId },
      data: {
        display_name: data.displayName,
        operational_role: data.operationalRole,
        tags: data.tags,
        status: data.status,
      },
    });

    await AuditService.record({
      workspaceId: bot.workspace_id,
      actorUserId: user.userId,
      action: 'bot.update',
      resourceType: 'bot',
      resourceId: bot.id,
      metadata: data,
    });

    return okResponse(updated);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ botId: string }> }
) {
  try {
    const { botId } = await params;
    const bot = await prisma.botApplication.findUnique({
      where: { id: botId },
    });

    if (!bot) {
      return errorResponse('BOT_NOT_FOUND', 'Bot application not found', 404);
    }

    const { user } = await authorizeWorkspaceMember(request, bot.workspace_id, 'bot:manage');

    await prisma.botApplication.delete({
      where: { id: botId },
    });

    await AuditService.record({
      workspaceId: bot.workspace_id,
      actorUserId: user.userId,
      action: 'bot.remove',
      resourceType: 'bot',
      resourceId: botId,
    });

    return okResponse({ removed: true, botId });
  } catch (err) {
    return handleApiError(err);
  }
}
