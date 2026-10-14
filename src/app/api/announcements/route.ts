import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/server/db/prisma';
import { authorizeWorkspaceMember } from '@/server/security/rbac';
import { okResponse, handleApiError, errorResponse } from '@/server/utils/api-response';
import { AuditService } from '@/server/services/audit.service';
import { messageQueue } from '@/server/jobs/queue';

const SubmitAnnouncementSchema = z.object({
  workspaceId: z.string().uuid(),
  botId: z.string().uuid(),
  title: z.string().min(1).max(128),
  content: z.string().min(1).max(2000),
  destinationChannelIds: z.array(z.string()).min(1),
  scheduledAt: z.string().datetime().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = SubmitAnnouncementSchema.parse(body);

    const { user } = await authorizeWorkspaceMember(
      request,
      data.workspaceId,
      'message:announce'
    );

    const bot = await prisma.botApplication.findUnique({
      where: { id: data.botId },
    });

    if (!bot) {
      return errorResponse('BOT_NOT_FOUND', 'Bot not found', 404);
    }

    const createdJobs = [];
    const delay = data.scheduledAt
      ? Math.max(0, new Date(data.scheduledAt).getTime() - Date.now())
      : 0;

    for (const channelId of data.destinationChannelIds) {
      const idempotencyKey = `ann_${Date.now()}_${channelId}_${data.title.slice(0, 10)}`;

      const messageJob = await prisma.messageJob.create({
        data: {
          workspace_id: data.workspaceId,
          created_by_user_id: user.userId,
          job_type: 'announcement',
          destination_id: channelId,
          idempotency_key: idempotencyKey,
          state: delay > 0 ? 'queued' : 'queued',
          payload: {
            title: data.title,
            content: data.content,
            embed: {
              title: data.title,
              description: data.content,
              color: 0x5865f2,
            },
          },
        },
      });

      // Enqueue job in BullMQ
      await messageQueue.add(
        'send-announcement',
        {
          messageJobId: messageJob.id,
          workspaceId: data.workspaceId,
          botId: bot.id,
          channelId,
          content: '',
          embed: {
            title: data.title,
            description: data.content,
            color: 0x5865f2,
          },
        },
        {
          delay,
          jobId: messageJob.id,
        }
      );

      createdJobs.push({
        jobId: messageJob.id,
        channelId,
        state: messageJob.state,
      });
    }

    await AuditService.record({
      workspaceId: data.workspaceId,
      actorUserId: user.userId,
      action: 'announcement.submitted',
      resourceType: 'message_job',
      metadata: {
        title: data.title,
        botId: data.botId,
        destinationCount: data.destinationChannelIds.length,
        delayedMs: delay,
      },
    });

    return okResponse(
      {
        submitted: true,
        jobs: createdJobs,
        totalQueued: createdJobs.length,
      },
      201
    );
  } catch (err) {
    return handleApiError(err);
  }
}
