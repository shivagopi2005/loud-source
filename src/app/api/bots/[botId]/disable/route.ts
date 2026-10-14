import { NextRequest } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { authorizeWorkspaceMember } from '@/server/security/rbac';
import { okResponse, handleApiError, errorResponse } from '@/server/utils/api-response';
import { AuditService } from '@/server/services/audit.service';

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
      return errorResponse('BOT_NOT_FOUND', 'Bot application not found', 404);
    }

    const { user } = await authorizeWorkspaceMember(request, bot.workspace_id, 'bot:manage');

    const updated = await prisma.botApplication.update({
      where: { id: botId },
      data: { status: 'disabled' },
    });

    await AuditService.record({
      workspaceId: bot.workspace_id,
      actorUserId: user.userId,
      action: 'bot.disable',
      resourceType: 'bot',
      resourceId: botId,
    });

    return okResponse({ disabled: true, botId: updated.id, status: updated.status });
  } catch (err) {
    return handleApiError(err);
  }
}
