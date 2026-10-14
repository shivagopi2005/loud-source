import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/server/db/prisma';
import { authorizeWorkspaceMember } from '@/server/security/rbac';
import { okResponse, handleApiError, errorResponse } from '@/server/utils/api-response';
import { encryptSecret, maskToken } from '@/server/security/encryption';
import { DiscordBotService } from '@/server/services/discord-bot.service';
import { AuditService } from '@/server/services/audit.service';
import { realtimeBroadcaster } from '@/server/realtime/events';

const RegisterBotSchema = z.object({
  displayName: z.string().min(2).max(64),
  applicationId: z.string().regex(/^\d{17,20}$/, 'Invalid Discord Application ID format'),
  botToken: z.string().min(20, 'Discord bot token is required'),
  tags: z.array(z.string()).default([]),
  operationalRole: z.string().default('voice_operator'),
  groupId: z.string().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await params;
    await authorizeWorkspaceMember(request, workspaceId);

    const bots = await prisma.botApplication.findMany({
      where: { workspace_id: workspaceId },
      include: {
        credentials: {
          select: {
            id: true,
            credential_version: true,
            status: true,
            created_at: true,
            rotated_at: true,
          },
          orderBy: { credential_version: 'desc' },
          take: 1,
        },
        guild_accesses: {
          include: {
            guild: {
              select: { id: true, guild_id: true, display_name: true, verification_status: true },
            },
          },
        },
        group_memberships: {
          include: {
            group: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    return okResponse(
      bots.map((b) => ({
        id: b.id,
        applicationId: b.application_id,
        displayName: b.display_name,
        verifiedBotUserId: b.verified_bot_user_id,
        status: b.status,
        lastHealthCheckAt: b.last_health_check_at,
        tags: b.tags,
        operationalRole: b.operational_role,
        createdAt: b.created_at,
        credential: b.credentials[0]
          ? {
              id: b.credentials[0].id,
              version: b.credentials[0].credential_version,
              status: b.credentials[0].status,
              maskedToken: '••••••••••••••••••••••••••••',
            }
          : null,
        guilds: b.guild_accesses.map((ga) => ({
          guildId: ga.guild.guild_id,
          name: ga.guild.display_name,
          status: ga.status,
        })),
        groups: b.group_memberships.map((gm) => ({
          id: gm.group.id,
          name: gm.group.name,
        })),
      }))
    );
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await params;
    const { user } = await authorizeWorkspaceMember(request, workspaceId, 'bot:register');
    const body = await request.json();
    const data = RegisterBotSchema.parse(body);

    // 1. Verify Bot Token with Discord REST API
    let verifiedIdentity;
    try {
      verifiedIdentity = await DiscordBotService.verifyBotToken(
        data.botToken,
        data.applicationId
      );
    } catch (err: any) {
      return errorResponse(
        'BOT_CREDENTIAL_INVALID',
        `Discord verification failed: ${err.message}`,
        400
      );
    }

    // 2. Encrypt token using AES-256-GCM
    const encryptedSecretReference = encryptSecret(data.botToken);

    // 3. Create Bot Record & Credential Record in Transaction
    const bot = await prisma.$transaction(async (tx) => {
      const newBot = await tx.botApplication.create({
        data: {
          workspace_id: workspaceId,
          application_id: data.applicationId,
          display_name: data.displayName,
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

    // 4. Record Audit Log (Notice: token is NOT included)
    await AuditService.record({
      workspaceId,
      actorUserId: user.userId,
      action: 'bot.register',
      resourceType: 'bot',
      resourceId: bot.id,
      metadata: {
        applicationId: bot.application_id,
        displayName: bot.display_name,
        botUserId: verifiedIdentity.id,
      },
    });

    realtimeBroadcaster.broadcast(workspaceId, 'bot.registered', {
      botId: bot.id,
      displayName: bot.display_name,
      status: bot.status,
    });

    return okResponse(
      {
        id: bot.id,
        applicationId: bot.application_id,
        displayName: bot.display_name,
        status: bot.status,
        verifiedBotUserId: bot.verified_bot_user_id,
        maskedToken: maskToken(data.botToken),
      },
      201
    );
  } catch (err) {
    return handleApiError(err);
  }
}
