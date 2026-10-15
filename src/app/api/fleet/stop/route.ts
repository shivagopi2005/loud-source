import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/server/db/prisma';
import { authorizeWorkspaceMember } from '@/server/security/rbac';
import { okResponse, handleApiError } from '@/server/utils/api-response';
import { mediaGateway } from '@/server/voice/media-gateway';
import { FleetGatewayService } from '@/server/services/fleet-gateway.service';
import { AuditService } from '@/server/services/audit.service';

const FleetStopSchema = z.object({
  workspaceId: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
  try {
    let workspaceId: string | undefined;
    try {
      const body = await request.json();
      const parsed = FleetStopSchema.parse(body);
      workspaceId = parsed.workspaceId;
    } catch {}

    let userId = 'system';
    if (workspaceId) {
      try {
        const { user } = await authorizeWorkspaceMember(
          request,
          workspaceId,
          'voice:emergency_stop'
        );
        userId = user.userId;
      } catch {}
    }

    // Force disconnect all voice bots across media gateway and Discord shards in parallel
    const [mediaRes, fleetRes, dbRes] = await Promise.allSettled([
      mediaGateway.emergencyStopAll('fleet_wide_stop'),
      FleetGatewayService.forceDisconnectAllVoice(),
      prisma.voiceSession.updateMany({
        where: workspaceId
          ? {
              workspace_id: workspaceId,
              state: { in: ['created', 'connecting', 'streaming', 'paused'] },
            }
          : {
              state: { in: ['created', 'connecting', 'streaming', 'paused'] },
            },
        data: {
          state: 'stopped',
          stopped_at: new Date(),
          stop_reason: 'fleet_wide_stop',
        },
      }),
    ]);

    const stoppedCount = dbRes.status === 'fulfilled' ? dbRes.value.count : 0;

    if (workspaceId) {
      AuditService.record({
        workspaceId,
        actorUserId: userId,
        action: 'fleet.stop_all',
        resourceType: 'voice_session',
        metadata: { stoppedSessionsCount: stoppedCount },
      }).catch(() => {});
    }

    return okResponse({
      stoppedSessionsCount: stoppedCount,
      message: 'All active voice sessions and bot connections forcefully terminated simultaneously.',
    });
  } catch (err) {
    return handleApiError(err);
  }
}
