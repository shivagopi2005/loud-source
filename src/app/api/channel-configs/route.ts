import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/server/db/prisma';
import { authorizeWorkspaceMember } from '@/server/security/rbac';
import { okResponse, handleApiError, errorResponse } from '@/server/utils/api-response';
import { AuditService } from '@/server/services/audit.service';

const CreateChannelConfigSchema = z.object({
  workspaceId: z.string().uuid(),
  guildConnectionId: z.string().uuid(),
  channelId: z.string().regex(/^\d{17,20}$/, 'Invalid Discord Channel ID'),
  channelType: z.number().int(),
  purpose: z.enum([
    'voice_streaming',
    'text_testing',
    'announcements',
    'notifications',
    'operational_alerts',
  ]),
  displayName: z.string().min(2).max(64),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = CreateChannelConfigSchema.parse(body);

    const { user } = await authorizeWorkspaceMember(
      request,
      data.workspaceId,
      'workspace:manage'
    );

    const guild = await prisma.guildConnection.findUnique({
      where: { id: data.guildConnectionId },
    });

    if (!guild || guild.workspace_id !== data.workspaceId) {
      return errorResponse('GUILD_NOT_FOUND', 'Guild connection does not match workspace', 404);
    }

    const channelConfig = await prisma.channelConfig.upsert({
      where: {
        guild_connection_id_channel_id: {
          guild_connection_id: data.guildConnectionId,
          channel_id: data.channelId,
        },
      },
      update: {
        purpose: data.purpose,
        display_name: data.displayName,
        channel_type: data.channelType,
        status: 'active',
      },
      create: {
        workspace_id: data.workspaceId,
        guild_connection_id: data.guildConnectionId,
        channel_id: data.channelId,
        channel_type: data.channelType,
        purpose: data.purpose,
        display_name: data.displayName,
        status: 'active',
      },
    });

    await AuditService.record({
      workspaceId: data.workspaceId,
      actorUserId: user.userId,
      action: 'channel.configure',
      resourceType: 'channel',
      resourceId: channelConfig.id,
      metadata: {
        channelId: data.channelId,
        name: data.displayName,
        purpose: data.purpose,
      },
    });

    return okResponse(channelConfig, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
