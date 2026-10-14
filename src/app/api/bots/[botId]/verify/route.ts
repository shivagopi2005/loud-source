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
      return errorResponse('BOT_NOT_FOUND', 'Bot or active credentials not found', 404);
    }

    const { user } = await authorizeWorkspaceMember(request, bot.workspace_id, 'bot:manage');

    const token = decryptSecret(bot.credentials[0].secret_reference);
    const verified = await DiscordBotService.verifyBotToken(token, bot.application_id);

    await prisma.botApplication.update({
      where: { id: botId },
      data: {
        status: 'ready',
        verified_bot_user_id: verified.id,
        last_health_check_at: new Date(),
      },
    });

    await AuditService.record({
      workspaceId: bot.workspace_id,
      actorUserId: user.userId,
      action: 'bot.verify',
      resourceType: 'bot',
      resourceId: botId,
      result: 'success',
    });

    return okResponse({
      verified: true,
      botId,
      username: verified.username,
      applicationId: verified.applicationId,
    });
  } catch (err: any) {
    return handleApiError(err);
  }
}
