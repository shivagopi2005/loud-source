import { NextRequest } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { authorizeWorkspaceMember } from '@/server/security/rbac';
import { okResponse, handleApiError, errorResponse } from '@/server/utils/api-response';
import { cancelJob } from '@/server/jobs/queue';
import { AuditService } from '@/server/services/audit.service';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const job = await prisma.messageJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      return errorResponse('JOB_NOT_FOUND', 'Message job not found', 404);
    }

    const { user } = await authorizeWorkspaceMember(
      request,
      job.workspace_id,
      'message:announce'
    );

    if (job.state !== 'queued' && job.state !== 'draft') {
      return errorResponse(
        'CANNOT_CANCEL_JOB',
        `Job cannot be cancelled in state '${job.state}'`,
        400
      );
    }

    // Try cancelling in BullMQ
    await cancelJob('message-jobs', jobId);

    const updated = await prisma.messageJob.update({
      where: { id: jobId },
      data: {
        state: 'cancelled',
        result_code: 'CANCELLED_BY_USER',
        completed_at: new Date(),
      },
    });

    await AuditService.record({
      workspaceId: job.workspace_id,
      actorUserId: user.userId,
      action: 'message.cancelled',
      resourceType: 'message_job',
      resourceId: jobId,
    });

    return okResponse({ cancelled: true, jobId, state: updated.state });
  } catch (err) {
    return handleApiError(err);
  }
}
