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

    await authorizeWorkspaceMember(request, bot.workspace_id, 'bot:operate');

    await FleetGatewayService.disconnectBot(bot.id);

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
