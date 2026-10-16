import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/server/db/prisma';
import { authorizeWorkspaceMember } from '@/server/security/rbac';
import { okResponse, handleApiError, errorResponse } from '@/server/utils/api-response';
import { encryptSecret, maskToken } from '@/server/security/encryption';
import { DiscordBotService } from '@/server/services/discord-bot.service';
import { AuditService } from '@/server/services/audit.service';
import { realtimeBroadcaster } from '@/server/realtime/events';

const BulkRegisterSchema = z.object({
  tokens: z.union([z.array(z.string()), z.string()]),
  operationalRole: z.string().default('voice_operator'),
  tags: z.array(z.string()).default([]),
  groupId: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await params;
    const { user } = await authorizeWorkspaceMember(request, workspaceId, 'bot:register');

    // Free Tier restriction: Free tier accounts cannot add bots!
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: { owner: true },
    });
    const { PremiumService } = await import('@/server/services/premium.service');
    const userTier = await PremiumService.getUserTier(workspace?.owner?.discord_id || '');
    if (!userTier.isDeveloper && (userTier.tier === 'trial' || userTier.tier === 'free')) {
      return errorResponse(
        'FREE_TIER_BOT_RESTRICTION',
        'Users on the Free Community Trial cannot register custom bot tokens. You have been allocated 5 Developer Fleet Bots to use for free. Upgrade to Pro or Enterprise to connect custom bots.',
        403
      );
    }

    const body = await request.json();
    const data = BulkRegisterSchema.parse(body);

    // Normalize tokens input (support newline/comma-separated strings or array)
    let rawTokens: string[] = [];
    if (Array.isArray(data.tokens)) {
      rawTokens = data.tokens;
    } else if (typeof data.tokens === 'string') {
      rawTokens = data.tokens
        .split(/[\r\n,]+/)
        .map((t) => t.trim())
        .filter((t) => t.length > 5);
    }

    if (rawTokens.length === 0) {
      return errorResponse('NO_TOKENS_PROVIDED', 'Please provide at least one valid bot token', 400);
    }

    // Limit maximum bulk batch size to 50
    if (rawTokens.length > 50) {
      return errorResponse('BULK_LIMIT_EXCEEDED', 'Maximum 50 bot tokens can be added in a single batch', 400);
    }

    const addedBots: any[] = [];
    const errors: any[] = [];

    // Process each token with bounded concurrency
    for (let i = 0; i < rawTokens.length; i++) {
      const token = rawTokens[i].trim();
      if (!token) continue;

      try {
        // 1. Verify token & auto-collect application ID and username from Discord
        const verifiedIdentity = await DiscordBotService.verifyBotToken(token);
        const resolvedAppId = verifiedIdentity.applicationId;
        const resolvedName = verifiedIdentity.username || `Bot-${resolvedAppId.slice(-4)}`;

        // 2. Encrypt token with AES-256-GCM
        const encryptedSecretReference = encryptSecret(token);

        // 3. Upsert bot record in PostgreSQL
        const bot = await prisma.$transaction(async (tx) => {
          let existing = await tx.botApplication.findUnique({
            where: {
              workspace_id_application_id: {
                workspace_id: workspaceId,
                application_id: resolvedAppId,
              },
            },
          });

          if (existing) {
            existing = await tx.botApplication.update({
              where: { id: existing.id },
              data: {
                display_name: resolvedName,
                verified_bot_user_id: verifiedIdentity.id,
                status: 'ready',
                tags: data.tags.length > 0 ? data.tags : existing.tags,
                operational_role: data.operationalRole || existing.operational_role,
                last_health_check_at: new Date(),
              },
            });

            // Add rotated/updated credential
            const latestCred = await tx.botCredential.findFirst({
              where: { bot_id: existing.id },
              orderBy: { credential_version: 'desc' },
            });
            const nextVersion = (latestCred?.credential_version || 1) + 1;

            await tx.botCredential.updateMany({
              where: { bot_id: existing.id, status: 'active' },
              data: { status: 'rotated', rotated_at: new Date() },
            });

            await tx.botCredential.create({
              data: {
                bot_id: existing.id,
                secret_reference: encryptedSecretReference,
                credential_version: nextVersion,
                status: 'active',
              },
            });

            return existing;
          }

          const newBot = await tx.botApplication.create({
            data: {
              workspace_id: workspaceId,
              application_id: resolvedAppId,
              display_name: resolvedName,
              verified_bot_user_id: verifiedIdentity.id,
              status: 'ready',
              tags: data.tags,
              operational_role: data.operationalRole,
              last_health_check_at: new Date(),
            },
          });

          await tx.botCredential.create({
            data: {
              bot_id: newBot.id,
              secret_reference: encryptedSecretReference,
              credential_version: 1,
              status: 'active',
            },
          });

          if (data.groupId) {
            await tx.botGroupMember.create({
              data: {
                group_id: data.groupId,
                bot_id: newBot.id,
              },
            });
          }

          return newBot;
        });

        // Connect bot to Discord Gateway immediately so it appears ONLINE in Discord
        try {
          const { FleetGatewayService } = await import('@/server/services/fleet-gateway.service');
          FleetGatewayService.connectBot(bot.id, token).catch((e) => {
            console.warn(`[BulkRegister] Gateway connect warning for ${bot.display_name}:`, e.message);
          });
        } catch {}

        addedBots.push({
          id: bot.id,
          applicationId: bot.application_id,
          displayName: bot.display_name,
          status: 'connected',
          maskedToken: maskToken(token),
        });
      } catch (err: any) {
        errors.push({
          tokenIndex: i + 1,
          maskedToken: maskToken(token),
          error: err.message || 'Verification failed',
        });
      }
    }

    // Record audit event
    await AuditService.record({
      workspaceId,
      actorUserId: user.userId,
      action: 'bot.bulk_register',
      resourceType: 'bot',
      result: addedBots.length > 0 ? 'success' : 'failure',
      metadata: {
        totalSubmitted: rawTokens.length,
        addedCount: addedBots.length,
        failedCount: errors.length,
        addedAppIds: addedBots.map((b) => b.applicationId),
      },
    });

    realtimeBroadcaster.broadcast(workspaceId, 'bot.bulk_registered', {
      addedCount: addedBots.length,
      failedCount: errors.length,
    });

    return okResponse({
      totalSubmitted: rawTokens.length,
      successful: addedBots.length,
      failed: errors.length,
      addedBots,
      errors,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
