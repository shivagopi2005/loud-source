import { NextRequest } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { authorizeWorkspaceMember } from '@/server/security/rbac';
import { okResponse, handleApiError, errorResponse } from '@/server/utils/api-response';
import { decryptSecret } from '@/server/security/encryption';
import { DiscordBotService } from '@/server/services/discord-bot.service';
import { AuditService } from '@/server/services/audit.service';

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
      return errorResponse('BOT_NOT_FOUND', 'Bot or active credential not found', 404);
    }

    const { user } = await authorizeWorkspaceMember(request, bot.workspace_id, 'diagnostics:view');

    const startTime = Date.now();
    try {
      const token = decryptSecret(bot.credentials[0].secret_reference);
      await DiscordBotService.verifyBotToken(token, bot.application_id);
      const latencyMs = Date.now() - startTime;

      await prisma.botApplication.update({
        where: { id: botId },
        data: {
          status: 'ready',
          last_health_check_at: new Date(),
        },
      });

      return okResponse({
        status: 'healthy',
        latencyMs,
        botId,
        timestamp: new Date().toISOString(),
      });
    } catch (checkErr: any) {
      await prisma.botApplication.update({
        where: { id: botId },
        data: {
          status: 'credential_invalid',
          last_health_check_at: new Date(),
        },
      });

      await AuditService.record({
        workspaceId: bot.workspace_id,
        actorUserId: user.userId,
        action: 'bot.health_check_failed',
        resourceType: 'bot',
        resourceId: botId,
        result: 'failure',
        errorCode: 'HEALTH_CHECK_FAILED',
        metadata: { error: checkErr.message },
      });

      return okResponse({
        status: 'degraded',
        error: checkErr.message,
        botId,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (err) {
    return handleApiError(err);
  }
}
