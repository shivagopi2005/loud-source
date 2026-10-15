import { NextRequest } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { authorizeWorkspaceMember } from '@/server/security/rbac';
import { okResponse, handleApiError, errorResponse } from '@/server/utils/api-response';
import { mediaGateway } from '@/server/voice/media-gateway';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string; endpointId: string }> }
) {
  try {
    const { sessionId, endpointId } = await params;
    const session = await prisma.voiceSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      return errorResponse('SESSION_NOT_FOUND', 'Voice session not found', 404);
    }

    await authorizeWorkspaceMember(request, session.workspace_id, 'voice:stop');

    const activeSession = mediaGateway.getSession(sessionId);
    if (activeSession) {
      const worker = activeSession.endpoints.get(endpointId);
      if (worker) {
        worker.destroy();
        activeSession.endpoints.delete(endpointId);
      }
    }

    await prisma.voiceEndpoint.update({
      where: { id: endpointId },
      data: {
        state: 'disconnected',
        disconnected_at: new Date(),
      },
    });

    return okResponse({ disconnected: true, endpointId });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string; endpointId: string }> }
) {
  try {
    const { sessionId, endpointId } = await params;
    const session = await prisma.voiceSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      return errorResponse('SESSION_NOT_FOUND', 'Voice session not found', 404);
    }

    await authorizeWorkspaceMember(request, session.workspace_id, 'voice:start');

    const reconnected = await mediaGateway.reconnectEndpoint(sessionId, endpointId);
    return okResponse({ reconnected, endpointId });
  } catch (err) {
    return handleApiError(err);
  }
}

