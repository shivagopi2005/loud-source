import { NextRequest } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { authorizeWorkspaceMember } from '@/server/security/rbac';
import { okResponse, handleApiError, errorResponse } from '@/server/utils/api-response';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get('workspaceId');

    if (!workspaceId) {
      return errorResponse('WORKSPACE_REQUIRED', 'workspaceId parameter is required', 400);
    }

    await authorizeWorkspaceMember(request, workspaceId);

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        _count: {
          select: {
            bots: true,
            voice_sessions: true,
            message_jobs: true,
            channels: true,
          },
        },
      },
    });

    if (!workspace) {
      return errorResponse('WORKSPACE_NOT_FOUND', 'Workspace not found', 404);
    }

    // Quotas based on plan
    const maxBots = workspace.plan_id === 'enterprise' ? 100 : workspace.plan_id === 'pro' ? 25 : 5;
    const maxVoiceEndpoints = workspace.plan_id === 'enterprise' ? 20 : workspace.plan_id === 'pro' ? 10 : 2;

    const currentPeriod = new Date().toISOString().slice(0, 7); // YYYY-MM

    const usageRecords = await prisma.usageRecord.findMany({
      where: { workspace_id: workspaceId, billing_period: currentPeriod },
    });

    const voiceSecondsUsed = usageRecords
      .filter((r) => r.resource_type === 'voice_seconds')
      .reduce((acc, curr) => acc + curr.quantity, 0);

    const messagesSent = usageRecords
      .filter((r) => r.resource_type === 'message_count')
      .reduce((acc, curr) => acc + curr.quantity, 0);

    return okResponse({
      workspaceId,
      plan: workspace.plan_id,
      quotas: {
        maxBots,
        maxVoiceEndpoints,
        maxMonthlyVoiceHours: workspace.plan_id === 'free' ? 10 : 500,
      },
      currentUsage: {
        registeredBots: workspace._count.bots,
        totalVoiceSessions: workspace._count.voice_sessions,
        totalMessageJobs: workspace._count.message_jobs,
        voiceSecondsUsed,
        messagesSent,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
