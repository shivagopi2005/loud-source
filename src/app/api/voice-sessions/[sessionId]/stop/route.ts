import { NextRequest } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { authorizeWorkspaceMember } from '@/server/security/rbac';
import { okResponse, handleApiError, errorResponse } from '@/server/utils/api-response';
import { mediaGateway } from '@/server/voice/media-gateway';

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

    await authorizeWorkspaceMember(request, session.workspace_id, 'voice:stop');

    await mediaGateway.stopSession(sessionId, 'user_initiated');

    return okResponse({ stopped: true, sessionId, state: 'stopped' });
  } catch (err) {
    return handleApiError(err);
  }
}
