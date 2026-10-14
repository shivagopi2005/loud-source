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

    const jobs = await prisma.messageJob.findMany({
      where: { workspace_id: workspaceId },
      include: {
        created_by: {
          select: { id: true, username: true, avatar_url: true },
        },
      },
      orderBy: { created_at: 'desc' },
      take: 50,
    });

    return okResponse(
      jobs.map((j) => ({
        id: j.id,
        jobType: j.job_type,
        destinationId: j.destination_id,
        state: j.state,
        attemptCount: j.attempt_count,
        resultCode: j.result_code,
        payload: j.payload,
        createdAt: j.created_at,
        completedAt: j.completed_at,
        createdBy: j.created_by.username,
      }))
    );
  } catch (err) {
    return handleApiError(err);
  }
}
