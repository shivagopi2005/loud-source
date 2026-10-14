import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/server/db/prisma';
import { authorizeWorkspaceMember } from '@/server/security/rbac';
import { okResponse, handleApiError, errorResponse } from '@/server/utils/api-response';
import { encryptSecret, maskToken } from '@/server/security/encryption';
import { DiscordBotService } from '@/server/services/discord-bot.service';
import { AuditService } from '@/server/services/audit.service';

const RotateCredentialSchema = z.object({
  newBotToken: z.string().min(20, 'New Discord bot token is required'),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ botId: string }> }
) {
  try {
    const { botId } = await params;
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

    if (!bot) {
      return errorResponse('BOT_NOT_FOUND', 'Bot application not found', 404);
    }

    const { user } = await authorizeWorkspaceMember(
      request,
      bot.workspace_id,
      'bot:rotate_secret'
    );
    const body = await request.json();
    const { newBotToken } = RotateCredentialSchema.parse(body);

    // 1. Verify new token with Discord
    const verified = await DiscordBotService.verifyBotToken(newBotToken, bot.application_id);

    // 2. Encrypt new token
    const encrypted = encryptSecret(newBotToken);
    const currentVersion = bot.credentials[0]?.credential_version || 1;
    const nextVersion = currentVersion + 1;

    // 3. Atomically revoke old credentials and create new version
    await prisma.$transaction(async (tx) => {
      await tx.botCredential.updateMany({
        where: { bot_id: botId, status: 'active' },
        data: { status: 'rotated', rotated_at: new Date() },
      });

      await tx.botCredential.create({
        data: {
          bot_id: botId,
          secret_reference: encrypted,
          credential_version: nextVersion,
          status: 'active',
        },
      });

      await tx.botApplication.update({
        where: { id: botId },
        data: {
          status: 'ready',
          last_health_check_at: new Date(),
        },
      });
    });

    await AuditService.record({
      workspaceId: bot.workspace_id,
      actorUserId: user.userId,
      action: 'bot.rotate_credential',
      resourceType: 'bot',
      resourceId: botId,
      result: 'success',
      metadata: { version: nextVersion },
    });

    return okResponse({
      rotated: true,
      botId,
      newVersion: nextVersion,
      maskedToken: maskToken(newBotToken),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
