import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '../../src/server/db/prisma';
import { encryptSecret, decryptSecret, maskToken } from '../../src/server/security/encryption';
import { DiscordBotService } from '../../src/server/services/discord-bot.service';
import { cancelJob, messageQueue } from '../../src/server/jobs/queue';

describe('Fleet Operations & Text Messaging Integration (PRD Section 6, 7, 9, 11)', () => {
  let workspaceId: string;
  let userId: string;
  let testBotId: string;
  let guildConnectionId: string;
  let channelConfigId: string;

  beforeAll(async () => {
    const ws = await prisma.workspace.findFirst({
      include: { owner: true, guilds: { include: { channel_configs: true } } },
    });

    if (!ws) throw new Error('Database must be seeded');
    workspaceId = ws.id;
    userId = ws.owner_user_id;
    guildConnectionId = ws.guilds[0].id;
    channelConfigId = ws.guilds[0].channel_configs[0].id;

    await prisma.botApplication.deleteMany({
      where: { application_id: '990000000000000099' },
    });
  });

  it('registers a new bot with encrypted secret and verified identity', async () => {
    const rawToken = 'mock_bot_token_new_registration_test';
    const verified = await DiscordBotService.verifyBotToken(rawToken, '990000000000000099');

    const encrypted = encryptSecret(rawToken);

    const bot = await prisma.botApplication.create({
      data: {
        workspace_id: workspaceId,
        application_id: '990000000000000099',
        display_name: 'Integration Test Bot',
        verified_bot_user_id: verified.id,
        status: 'ready',
        credentials: {
          create: {
            secret_reference: encrypted,
            credential_version: 1,
            status: 'active',
          },
        },
      },
      include: { credentials: true },
    });

    testBotId = bot.id;

    expect(bot.display_name).toBe('Integration Test Bot');
    expect(bot.credentials[0].secret_reference).not.toContain(rawToken);
    expect(decryptSecret(bot.credentials[0].secret_reference)).toBe(rawToken);
  });

  it('rotates bot credentials to version 2 securely', async () => {
    const newToken = 'mock_bot_token_version_2_rotated';
    const encrypted = encryptSecret(newToken);

    // Atomically mark old rotated and create v2
    await prisma.$transaction(async (tx) => {
      await tx.botCredential.updateMany({
        where: { bot_id: testBotId, status: 'active' },
        data: { status: 'rotated', rotated_at: new Date() },
      });

      await tx.botCredential.create({
        data: {
          bot_id: testBotId,
          secret_reference: encrypted,
          credential_version: 2,
          status: 'active',
        },
      });
    });

    const activeCred = await prisma.botCredential.findFirst({
      where: { bot_id: testBotId, status: 'active' },
    });

    expect(activeCred?.credential_version).toBe(2);
    expect(decryptSecret(activeCred!.secret_reference)).toBe(newToken);
  });

  it('sends test message with idempotency key and records delivery', async () => {
    const idempotencyKey = `test_msg_${Date.now()}`;
    const targetChannelId = '100000000000000003';

    const job = await prisma.messageJob.create({
      data: {
        workspace_id: workspaceId,
        created_by_user_id: userId,
        job_type: 'test_message',
        destination_id: targetChannelId,
        idempotency_key: idempotencyKey,
        state: 'sending',
        payload: { content: 'Integration test message' },
      },
    });

    const result = await DiscordBotService.sendChannelMessage(
      'mock_bot_token',
      targetChannelId,
      { content: 'Integration test message' }
    );

    expect(result.success).toBe(true);
    expect(result.channelId).toBe(targetChannelId);

    const updatedJob = await prisma.messageJob.update({
      where: { id: job.id },
      data: { state: 'sent', result_code: 'SUCCESS', completed_at: new Date() },
    });

    expect(updatedJob.state).toBe('sent');
  });

  it('cancels queued background job before execution', async () => {
    const queueJob = await messageQueue.add(
      'test-job',
      { workspaceId, test: true },
      { delay: 60000 } // 60s in future
    );

    const cancelled = await cancelJob('message-jobs', queueJob.id!);
    expect(cancelled).toBe(true);
  });
});
