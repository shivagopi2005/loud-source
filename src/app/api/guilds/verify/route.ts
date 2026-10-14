import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/server/db/prisma';
import { authorizeWorkspaceMember } from '@/server/security/rbac';
import { okResponse, handleApiError, errorResponse } from '@/server/utils/api-response';
import { decryptSecret } from '@/server/security/encryption';
import { DiscordBotService } from '@/server/services/discord-bot.service';
import { AuditService } from '@/server/services/audit.service';

const VerifyGuildSchema = z.object({
  workspaceId: z.string().uuid(),
  guildId: z.string().regex(/^\d{17,20}$/, 'Invalid Discord Guild ID'),
  botId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = VerifyGuildSchema.parse(body);

    const { user } = await authorizeWorkspaceMember(
      request,
      data.workspaceId,
      'workspace:manage'
    );

    // Fetch bot credential
    const bot = await prisma.botApplication.findUnique({
      where: { id: data.botId },
      include: {
        credentials: {
          where: { status: 'active' },
          orderBy: { credential_version: 'desc' },
          take: 1,
        },
      },
    });

    if (!bot || !bot.credentials.length) {
      return errorResponse('BOT_NOT_FOUND', 'Bot or credentials not found', 404);
    }

    const token = decryptSecret(bot.credentials[0].secret_reference);

    // Verify membership with Discord API
    let guildInfo;
    try {
      guildInfo = await DiscordBotService.verifyGuildAccess(token, data.guildId);
    } catch (err: any) {
      return errorResponse('GUILD_VERIFICATION_FAILED', err.message, 400);
    }

    // Upsert Guild Connection
    const guildConnection = await prisma.guildConnection.upsert({
      where: {
        workspace_id_guild_id: {
          workspace_id: data.workspaceId,
          guild_id: data.guildId,
        },
      },
      update: {
        display_name: guildInfo.name,
        verification_status: 'verified',
        verified_at: new Date(),
      },
      create: {
        workspace_id: data.workspaceId,
        guild_id: data.guildId,
        display_name: guildInfo.name,
        verification_status: 'verified',
        verified_at: new Date(),
      },
    });

    // Link Bot Guild Access
    await prisma.botGuildAccess.upsert({
      where: {
        bot_id_guild_connection_id: {
          bot_id: bot.id,
          guild_connection_id: guildConnection.id,
        },
      },
      update: {
        status: 'active',
        permissions_snapshot: guildInfo.permissions,
        last_verified_at: new Date(),
      },
      create: {
        bot_id: bot.id,
        guild_connection_id: guildConnection.id,
        status: 'active',
        permissions_snapshot: guildInfo.permissions,
        last_verified_at: new Date(),
      },
    });

    await AuditService.record({
      workspaceId: data.workspaceId,
      actorUserId: user.userId,
      action: 'guild.verify',
      resourceType: 'guild',
      resourceId: guildConnection.id,
      metadata: { guildId: data.guildId, guildName: guildInfo.name, botId: bot.id },
    });

    return okResponse({
      id: guildConnection.id,
      guildId: guildConnection.guild_id,
      name: guildConnection.display_name,
      verified: true,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
