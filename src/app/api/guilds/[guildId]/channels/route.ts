import { NextRequest } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { authorizeWorkspaceMember } from '@/server/security/rbac';
import { okResponse, handleApiError, errorResponse } from '@/server/utils/api-response';
import { decryptSecret } from '@/server/security/encryption';
import { DiscordBotService } from '@/server/services/discord-bot.service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ guildId: string }> }
) {
  try {
    const { guildId } = await params;
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get('workspaceId');
    const botId = url.searchParams.get('botId');

    if (!workspaceId) {
      return errorResponse('WORKSPACE_REQUIRED', 'workspaceId parameter is required', 400);
    }

    await authorizeWorkspaceMember(request, workspaceId);

    // Find guild connection
    const guild = await prisma.guildConnection.findFirst({
      where: { workspace_id: workspaceId, guild_id: guildId },
      include: {
        bot_accesses: {
          include: {
            bot: {
              include: {
                credentials: {
                  where: { status: 'active' },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });

    if (!guild) {
      return errorResponse('GUILD_NOT_FOUND', 'Guild connection not found', 404);
    }

    // Determine which bot to use for channel query
    let targetAccess = botId
      ? guild.bot_accesses.find((b) => b.bot_id === botId)
      : guild.bot_accesses[0];

    // Fallback: any active bot in workspace
    if (!targetAccess || !targetAccess.bot.credentials.length) {
      const anyBot = await prisma.botApplication.findFirst({
        where: { workspace_id: workspaceId, status: { in: ['ready', 'connected'] } },
        include: {
          credentials: {
            where: { status: 'active' },
            take: 1,
          },
        },
      });

      if (!anyBot || !anyBot.credentials.length) {
        return errorResponse(
          'NO_AUTHORIZED_BOT',
          'No bot with active credentials available for this guild',
          400
        );
      }
      targetAccess = { bot: anyBot } as any;
    }

    const token = decryptSecret(targetAccess!.bot.credentials[0].secret_reference);
    const channels = await DiscordBotService.getGuildChannels(token, guildId);

    return okResponse({
      guildId,
      botId: targetAccess!.bot.id,
      channels,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
