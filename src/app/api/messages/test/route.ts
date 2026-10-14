import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/server/db/prisma';
import { authorizeWorkspaceMember } from '@/server/security/rbac';
import { okResponse, handleApiError, errorResponse } from '@/server/utils/api-response';
import { decryptSecret } from '@/server/security/encryption';
import { DiscordBotService } from '@/server/services/discord-bot.service';
import { AuditService } from '@/server/services/audit.service';
import { messageQueue } from '@/server/jobs/queue';

const SendTestMessageSchema = z.object({
  workspaceId: z.string().uuid(),
  botId: z.string().uuid(),
  channelId: z.string().regex(/^\d{17,20}$/),
  content: z.string().min(1).max(2000),
  idempotencyKey: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = SendTestMessageSchema.parse(body);

    const { user } = await authorizeWorkspaceMember(
      request,
      data.workspaceId,
      'message:test'
    );

    // Fetch bot credential
    const bot = await prisma.botApplication.findUnique({
      where: { id: data.botId },
      include: {
        credentials: {
          where: { status: 'active' },
          orderBy: { credential_version: 'desc' },
          take: 1,
        },
      },
    });

    if (!bot || !bot.credentials.length) {
      return errorResponse('BOT_NOT_FOUND', 'Bot or active credentials not found', 404);
    }

    const token = decryptSecret(bot.credentials[0].secret_reference);

    // Create durable message job in PostgreSQL
    const idempotencyKey = data.idempotencyKey || `test_msg_${Date.now()}_${data.channelId}`;

    const messageJob = await prisma.messageJob.upsert({
      where: {
        workspace_id_idempotency_key: {
          workspace_id: data.workspaceId,
          idempotency_key: idempotencyKey,
        },
      },
      update: { state: 'sending' },
      create: {
        workspace_id: data.workspaceId,
        created_by_user_id: user.userId,
        job_type: 'test_message',
        destination_id: data.channelId,
        idempotency_key: idempotencyKey,
        state: 'sending',
        attempt_count: 1,
        payload: { content: data.content },
      },
    });

    // Execute message send
    const result = await DiscordBotService.sendChannelMessage(token, data.channelId, {
      content: data.content,
    });

    if (result.success) {
      await prisma.messageJob.update({
        where: { id: messageJob.id },
        data: {
          state: 'sent',
          result_code: 'SUCCESS',
          completed_at: new Date(),
        },
      });

      await AuditService.record({
        workspaceId: data.workspaceId,
        actorUserId: user.userId,
        action: 'message.test_sent',
        resourceType: 'message_job',
        resourceId: messageJob.id,
        result: 'success',
        metadata: {
          channelId: data.channelId,
          botId: bot.id,
          messageId: result.messageId,
        },
      });

      return okResponse({
        success: true,
        jobId: messageJob.id,
        state: 'sent',
        messageId: result.messageId,
        channelId: data.channelId,
      });
    } else {
      await prisma.messageJob.update({
        where: { id: messageJob.id },
        data: {
          state: 'failed',
          result_code: result.errorCode || 'FAILED',
          completed_at: new Date(),
        },
      });

      await AuditService.record({
        workspaceId: data.workspaceId,
        actorUserId: user.userId,
        action: 'message.test_failed',
        resourceType: 'message_job',
        resourceId: messageJob.id,
        result: 'failure',
        errorCode: result.errorCode,
        metadata: {
          channelId: data.channelId,
          botId: bot.id,
          error: result.error,
        },
      });

      return errorResponse(
        result.errorCode || 'TEST_MESSAGE_FAILED',
        result.error || 'Failed to send test message',
        400
      );
    }
  } catch (err) {
    return handleApiError(err);
  }
}
