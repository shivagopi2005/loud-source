import { NextRequest } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { authorizeWorkspaceMember } from '@/server/security/rbac';
import { okResponse, handleApiError, errorResponse } from '@/server/utils/api-response';
import { mediaGateway } from '@/server/voice/media-gateway';
import { AuditService } from '@/server/services/audit.service';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const session = await prisma.voiceSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      return errorResponse('SESSION_NOT_FOUND', 'Voice session not found', 404);
    }

    const { user } = await authorizeWorkspaceMember(
      request,
      session.workspace_id,
      'voice:start'
    );

    const started = await mediaGateway.startSession(sessionId);
    if (!started) {
      return errorResponse('START_FAILED', 'Failed to start voice transmission', 500);
    }

    await AuditService.record({
      workspaceId: session.workspace_id,
      actorUserId: user.userId,
      action: 'voice.start',
      resourceType: 'voice_session',
      resourceId: sessionId,
      result: 'success',
    });

    return okResponse({ started: true, sessionId, state: 'streaming' });
  } catch (err) {
    return handleApiError(err);
  }
}
