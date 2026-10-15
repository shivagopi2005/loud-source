import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/server/db/prisma';
import { authorizeWorkspaceMember } from '@/server/security/rbac';
import { okResponse, handleApiError, errorResponse } from '@/server/utils/api-response';
import { decryptSecret } from '@/server/security/encryption';
import { DiscordBotService } from '@/server/services/discord-bot.service';
import { AuditService } from '@/server/services/audit.service';

const BulkVerifyGuildSchema = z.object({
  guildId: z.string().regex(/^\d{17,20}$/, 'Invalid Discord Guild ID'),
  botIds: z.array(z.string().uuid()).optional(),
  autoSyncChannels: z.boolean().default(true),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await params;
    const body = await request.json();
    const data = BulkVerifyGuildSchema.parse(body);

    const { user } = await authorizeWorkspaceMember(
      request,
      workspaceId,
      'workspace:manage'
    );

    // 1. Fetch eligible workspace bots with active credentials
    const botQuery: any = {
      workspace_id: workspaceId,
      status: { notIn: ['removed', 'disabled'] },
    };

    if (data.botIds && data.botIds.length > 0) {
      botQuery.id = { in: data.botIds };
    }

    const bots = await prisma.botApplication.findMany({
      where: botQuery,
      include: {
        credentials: {
          where: { status: 'active' },
          orderBy: { credential_version: 'desc' },
          take: 1,
        },
      },
      orderBy: { created_at: 'asc' },
    });

    if (bots.length === 0) {
      return errorResponse(
        'NO_BOTS_FOUND',
        'No active registered bots available in this workspace to connect.',
        404
      );
    }

    // 2. Verify guild membership for each bot
    const successfulBots: Array<{
      bot: (typeof bots)[0];
      guildName: string;
      permissions: string;
      token: string;
    }> = [];
    const failedBots: Array<{
      botId: string;
      displayName: string;
      applicationId: string;
      error: string;
      inviteUrl?: string;
    }> = [];

    let resolvedGuildName = `Guild ${data.guildId}`;

    for (const bot of bots) {
      if (!bot.credentials.length) {
        failedBots.push({
          botId: bot.id,
          displayName: bot.display_name,
          applicationId: bot.application_id,
          error: 'No active credentials on file',
          inviteUrl: DiscordBotService.generateInstallUrl(bot.application_id, '0', data.guildId),
        });
        continue;
      }

      try {
        const token = decryptSecret(bot.credentials[0].secret_reference);
        const guildInfo = await DiscordBotService.verifyGuildAccess(token, data.guildId);
        resolvedGuildName = guildInfo.name || resolvedGuildName;

        successfulBots.push({
          bot,
          guildName: guildInfo.name,
          permissions: guildInfo.permissions,
          token,
        });
      } catch (err: any) {
        failedBots.push({
          botId: bot.id,
          displayName: bot.display_name,
          applicationId: bot.application_id,
          error: err.message || 'Membership verification failed',
          inviteUrl: DiscordBotService.generateInstallUrl(bot.application_id, '0', data.guildId),
        });
      }
    }

    if (successfulBots.length === 0) {
      return errorResponse(
        'NO_BOTS_VERIFIED',
        `None of the ${bots.length} bots could verify membership in guild ${data.guildId}. Please invite them using their Discord OAuth2 install URLs first.`,
        400,
        { failedBots }
      );
    }

    // 3. Upsert GuildConnection
    const guildConnection = await prisma.guildConnection.upsert({
      where: {
        workspace_id_guild_id: {
          workspace_id: workspaceId,
          guild_id: data.guildId,
        },
      },
      update: {
        display_name: resolvedGuildName,
        verification_status: 'verified',
        verified_at: new Date(),
      },
      create: {
        workspace_id: workspaceId,
        guild_id: data.guildId,
        display_name: resolvedGuildName,
        verification_status: 'verified',
        verified_at: new Date(),
      },
    });

    // 4. Link BotGuildAccess for all verified bots
    for (const item of successfulBots) {
      await prisma.botGuildAccess.upsert({
        where: {
          bot_id_guild_connection_id: {
            bot_id: item.bot.id,
            guild_connection_id: guildConnection.id,
          },
        },
        update: {
          status: 'active',
          permissions_snapshot: item.permissions,
          last_verified_at: new Date(),
        },
        create: {
          bot_id: item.bot.id,
          guild_connection_id: guildConnection.id,
          status: 'active',
          permissions_snapshot: item.permissions,
          last_verified_at: new Date(),
        },
      });
    }

    // 5. Automatically discover and synchronize guild channels
    let discoveredChannelsCount = 0;
    if (data.autoSyncChannels && successfulBots.length > 0) {
      try {
        const workingToken = successfulBots[0].token;
        const channels = await DiscordBotService.getGuildChannels(workingToken, data.guildId);

        for (const ch of channels) {
          // Voice (type 2) or Stage Voice (type 13)
          if (ch.type === 2 || ch.type === 13) {
            await prisma.channelConfig.upsert({
              where: {
                guild_connection_id_channel_id: {
                  guild_connection_id: guildConnection.id,
                  channel_id: ch.id,
                },
              },
              update: {
                display_name: ch.name,
                channel_type: ch.type,
                purpose: 'voice_streaming',
                status: 'active',
              },
              create: {
                workspace_id: workspaceId,
                guild_connection_id: guildConnection.id,
                channel_id: ch.id,
                channel_type: ch.type,
                purpose: 'voice_streaming',
                display_name: ch.name,
                status: 'active',
              },
            });
            discoveredChannelsCount++;
          } else if (ch.type === 0) {
            // Text channel
            await prisma.channelConfig.upsert({
              where: {
                guild_connection_id_channel_id: {
                  guild_connection_id: guildConnection.id,
                  channel_id: ch.id,
                },
              },
              update: {
                display_name: ch.name,
                channel_type: ch.type,
                purpose: 'text_testing',
                status: 'active',
              },
              create: {
                workspace_id: workspaceId,
                guild_connection_id: guildConnection.id,
                channel_id: ch.id,
                channel_type: ch.type,
                purpose: 'text_testing',
                display_name: ch.name,
                status: 'active',
              },
            });
            discoveredChannelsCount++;
          }
        }
      } catch (chErr) {
        console.warn('[BulkVerifyGuild] Auto-channel sync warning:', chErr);
      }
    }

    // 6. Record audit log
    await AuditService.record({
      workspaceId,
      actorUserId: user.userId,
      action: 'guild.bulk_verify',
      resourceType: 'guild',
      resourceId: guildConnection.id,
      metadata: {
        guildId: data.guildId,
        guildName: resolvedGuildName,
        totalBotsChecked: bots.length,
        connectedCount: successfulBots.length,
        failedCount: failedBots.length,
        discoveredChannels: discoveredChannelsCount,
      },
    });

    return okResponse({
      guildConnection: {
        id: guildConnection.id,
        guildId: guildConnection.guild_id,
        displayName: guildConnection.display_name,
      },
      totalBots: bots.length,
      connectedCount: successfulBots.length,
      failedCount: failedBots.length,
      discoveredChannels: discoveredChannelsCount,
      connectedBots: successfulBots.map((s) => ({
        botId: s.bot.id,
        displayName: s.bot.display_name,
        applicationId: s.bot.application_id,
        permissions: s.permissions,
      })),
      failedBots,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
