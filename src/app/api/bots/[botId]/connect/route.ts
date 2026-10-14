import { NextRequest } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { authorizeWorkspaceMember } from '@/server/security/rbac';
import { okResponse, handleApiError, errorResponse } from '@/server/utils/api-response';
import { decryptSecret } from '@/server/security/encryption';
import { FleetGatewayService } from '@/server/services/fleet-gateway.service';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ botId: string }> }
) {
  try {
    const { botId } = await params;

    const bot = await prisma.botApplication.findUnique({
      where: { id: botId },
      include: {
        credentials: {
          where: { status: 'active' },
          orderBy: { credential_version: 'desc' },
          take: 1,
        },
      },
    });

    if (!bot || !bot.credentials.length) {
      return errorResponse('BOT_NOT_FOUND', 'Bot or active credentials not found', 404);
    }

    await authorizeWorkspaceMember(request, bot.workspace_id, 'bot:operate');

    const token = decryptSecret(bot.credentials[0].secret_reference);
    const connected = await FleetGatewayService.connectBot(bot.id, token);

    if (!connected) {
      return errorResponse('GATEWAY_CONNECT_FAILED', 'Failed to connect bot to Discord Gateway', 400);
    }

    return okResponse({
      id: bot.id,
      displayName: bot.display_name,
      online: true,
      status: 'connected',
      message: `Bot "${bot.display_name}" is now ONLINE in Discord`,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
