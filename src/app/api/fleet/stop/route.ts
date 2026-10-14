import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/server/db/prisma';
import { authorizeWorkspaceMember } from '@/server/security/rbac';
import { okResponse, handleApiError } from '@/server/utils/api-response';
import { mediaGateway } from '@/server/voice/media-gateway';
import { AuditService } from '@/server/services/audit.service';

const FleetStopSchema = z.object({
  workspaceId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { workspaceId } = FleetStopSchema.parse(body);

    const { user } = await authorizeWorkspaceMember(
      request,
      workspaceId,
      'voice:emergency_stop'
    );

    // Find all active/streaming voice sessions for workspace
    const activeSessions = await prisma.voiceSession.findMany({
      where: {
        workspace_id: workspaceId,
        state: { in: ['created', 'connecting', 'streaming', 'paused'] },
      },
    });

    for (const session of activeSessions) {
      await mediaGateway.emergencyStop(session.id, 'fleet_wide_stop');
    }

    await AuditService.record({
      workspaceId,
      actorUserId: user.userId,
      action: 'fleet.stop_all',
      resourceType: 'voice_session',
      metadata: { stoppedSessionsCount: activeSessions.length },
    });

    return okResponse({
      stoppedSessionsCount: activeSessions.length,
      message: 'All active voice sessions and bot connections stopped.',
    });
  } catch (err) {
    return handleApiError(err);
  }
}
