import { NextRequest } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { authorizeWorkspaceMember } from '@/server/security/rbac';
import { okResponse, handleApiError, errorResponse } from '@/server/utils/api-response';
import { mediaGateway } from '@/server/voice/media-gateway';
import { realtimeBroadcaster } from '@/server/realtime/events';

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

    await authorizeWorkspaceMember(
      request,
      session.workspace_id,
      'voice:emergency_stop'
    );

    // Trigger immediate emergency halt across gateway, audio feeds, and voice workers
    await mediaGateway.emergencyStop(sessionId, 'emergency_stop');

    // Broadcast emergency stop event to all listeners in this workspace
    realtimeBroadcaster.broadcast(session.workspace_id, 'voice.emergency_stop', {
      sessionId,
      reason: 'emergency_stop',
      timestamp: new Date().toISOString(),
    });

    return okResponse({
      emergencyStop: true,
      sessionId,
      state: 'stopped',
      message: 'All audio transmission and voice connections terminated immediately.',
    });
  } catch (err) {
    return handleApiError(err);
  }
}
