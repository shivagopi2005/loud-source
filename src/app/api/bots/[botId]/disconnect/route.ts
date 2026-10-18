import { NextRequest } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { authorizeWorkspaceMember } from '@/server/security/rbac';
import { okResponse, handleApiError, errorResponse } from '@/server/utils/api-response';
import { FleetGatewayService } from '@/server/services/fleet-gateway.service';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ botId: string }> }
) {
  try {
    const { botId } = await params;

    const bot = await prisma.botApplication.findUnique({
      where: { id: botId },
    });

    if (!bot) {
      return errorResponse('BOT_NOT_FOUND', 'Bot not found', 404);
    }

    const { user } = await authorizeWorkspaceMember(request, bot.workspace_id, 'bot:operate');

    // Retrieve actor's Discord snowflake ID
    const dbUser = await prisma.user.findUnique({
      where: { id: user.userId },
      select: { discord_id: true, username: true },
    });
    const actorDiscordId = dbUser?.discord_id || '';

    // Enforce developer protection: only developers can disconnect developer bots
    const isDevBot = await FleetGatewayService.isDeveloperBot(bot.id, bot.application_id);
    const DEVELOPER_IDS = ['788970167907778562', '261661821'];
    const isDeveloperActor =
      (actorDiscordId && DEVELOPER_IDS.includes(actorDiscordId)) ||
      dbUser?.username?.toLowerCase() === 'shivagopi2005' ||
      dbUser?.username?.toLowerCase() === 'root_roy';

    if (isDevBot && !isDeveloperActor) {
      return errorResponse(
        'DEVELOPER_BOT_PROTECTED',
        'Developer bot tokens cannot be taken offline by other users. Only the developer can make developer bots offline.',
        403
      );
    }

    const result = await FleetGatewayService.disconnectBot(bot.id, false, actorDiscordId);
    if (!result.success) {
      return errorResponse('DISCONNECT_FAILED', result.error || 'Failed to disconnect bot', 403);
    }

    return okResponse({
      id: bot.id,
      displayName: bot.display_name,
      online: false,
      status: 'ready',
      message: `Bot "${bot.display_name}" disconnected from Discord Gateway (Offline)`,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
