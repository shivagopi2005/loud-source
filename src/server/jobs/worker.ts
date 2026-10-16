import { Worker, Job } from 'bullmq';
import { redisConnection } from './queue';
import { prisma } from '../db/prisma';
import { DiscordBotService } from '../services/discord-bot.service';
import { decryptSecret } from '../security/encryption';
import { AuditService } from '../services/audit.service';

export function startWorkers(): { messageWorker: Worker; healthWorker: Worker } {
  // 1. Message Job Worker
  const messageWorker = new Worker(
    'message-jobs',
    async (job: Job) => {
      const { messageJobId, workspaceId, botId, channelId, content, embed } = job.data;
      console.log(`[MessageWorker] Processing job ${job.id} for channel ${channelId}`);

      // Update state in DB
      await prisma.messageJob.update({
        where: { id: messageJobId },
        data: { state: 'sending', attempt_count: { increment: 1 } },
      });

      // Prevent protected Redirect/OAuth bot from sending mass/job messages
      const { FleetGatewayService } = await import('../services/fleet-gateway.service');
      if (FleetGatewayService.isRedirectBot(botId)) {
        console.warn(`[MessageWorker] Blocked message job ${job.id}: Bot ${botId} is protected OAuth bot`);
        await prisma.messageJob.update({
          where: { id: messageJobId },
          data: {
            state: 'failed',
            result_code: 'OAUTH_BOT_PROTECTED',
            completed_at: new Date(),
          },
        });
        return { success: false, error: 'OAuth Redirect bot is protected from mass message jobs' };
      }

      // Fetch bot credential
      const credential = await prisma.botCredential.findFirst({
        where: { bot_id: botId, status: 'active' },
        orderBy: { credential_version: 'desc' },
      });

      if (!credential) {
        await prisma.messageJob.update({
          where: { id: messageJobId },
          data: {
            state: 'failed',
            result_code: 'BOT_CREDENTIAL_NOT_FOUND',
            completed_at: new Date(),
          },
        });
        throw new Error('Bot active credential not found');
      }

      const token = decryptSecret(credential.secret_reference);

      // Execute send via Discord REST API
      const result = await DiscordBotService.sendChannelMessage(token, channelId, {
        content,
        embed,
      });

      if (result.success) {
        await prisma.messageJob.update({
          where: { id: messageJobId },
          data: {
            state: 'sent',
            result_code: 'SUCCESS',
            completed_at: new Date(),
          },
        });

        await AuditService.record({
          workspaceId,
          action: 'message.sent',
          resourceType: 'message_job',
          resourceId: messageJobId,
          result: 'success',
          metadata: { channelId, botId, messageId: result.messageId },
        });

        return result;
      } else {
        const isRateLimited = result.errorCode === 'DISCORD_RATE_LIMITED';
        await prisma.messageJob.update({
          where: { id: messageJobId },
          data: {
            state: isRateLimited ? 'rate_limited' : 'failed',
            result_code: result.errorCode || 'SEND_FAILED',
            completed_at: isRateLimited ? undefined : new Date(),
          },
        });

        await AuditService.record({
          workspaceId,
          action: 'message.failed',
          resourceType: 'message_job',
          resourceId: messageJobId,
          result: 'failure',
          errorCode: result.errorCode,
          metadata: { channelId, botId, error: result.error },
        });

        throw new Error(result.error || 'Failed to send Discord message');
      }
    },
    { connection: redisConnection, concurrency: 5 }
  );

  // 2. Health Check Worker
  const healthWorker = new Worker(
    'health-check-jobs',
    async (job: Job) => {
      const { botId, workspaceId } = job.data;
      console.log(`[HealthWorker] Checking health for bot ${botId}`);

      const bot = await prisma.botApplication.findUnique({
        where: { id: botId },
        include: {
          credentials: {
            where: { status: 'active' },
            orderBy: { credential_version: 'desc' },
            take: 1,
          },
        },
      });

      if (!bot || !bot.credentials.length) {
        return { status: 'skipped', reason: 'No active credential' };
      }

      try {
        const token = decryptSecret(bot.credentials[0].secret_reference);
        await DiscordBotService.verifyBotToken(token, bot.application_id);

        await prisma.botApplication.update({
          where: { id: botId },
          data: {
            status: bot.status === 'registered' ? 'ready' : bot.status,
            last_health_check_at: new Date(),
          },
        });

        return { status: 'healthy', botId };
      } catch (err: any) {
        await prisma.botApplication.update({
          where: { id: botId },
          data: {
            status: 'credential_invalid',
            last_health_check_at: new Date(),
          },
        });

        await AuditService.record({
          workspaceId,
          action: 'bot.health_check_failed',
          resourceType: 'bot',
          resourceId: botId,
          result: 'failure',
          errorCode: 'HEALTH_CHECK_FAILED',
          metadata: { error: err.message },
        });

        return { status: 'degraded', error: err.message };
      }
    },
    { connection: redisConnection, concurrency: 3 }
  );

  return { messageWorker, healthWorker };
}
