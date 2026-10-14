import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/server/db/prisma';
import { authorizeWorkspaceMember } from '@/server/security/rbac';
import { okResponse, handleApiError, errorResponse } from '@/server/utils/api-response';
import { AuditService } from '@/server/services/audit.service';

const UpdateChannelSchema = z.object({
  displayName: z.string().min(2).max(64).optional(),
  purpose: z
    .enum([
      'voice_streaming',
      'text_testing',
      'announcements',
      'notifications',
      'operational_alerts',
    ])
    .optional(),
  status: z.enum(['active', 'disabled']).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ configId: string }> }
) {
  try {
    const { configId } = await params;
    const config = await prisma.channelConfig.findUnique({
      where: { id: configId },
    });

    if (!config) {
      return errorResponse('CHANNEL_NOT_FOUND', 'Channel configuration not found', 404);
    }

    const { user } = await authorizeWorkspaceMember(
      request,
      config.workspace_id,
      'workspace:manage'
    );
    const body = await request.json();
    const data = UpdateChannelSchema.parse(body);

    const updated = await prisma.channelConfig.update({
      where: { id: configId },
      data: {
        display_name: data.displayName,
        purpose: data.purpose,
        status: data.status,
      },
    });

    await AuditService.record({
      workspaceId: config.workspace_id,
      actorUserId: user.userId,
      action: 'channel.update',
      resourceType: 'channel',
      resourceId: configId,
      metadata: data,
    });

    return okResponse(updated);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ configId: string }> }
) {
  try {
    const { configId } = await params;
    const config = await prisma.channelConfig.findUnique({
      where: { id: configId },
    });

    if (!config) {
      return errorResponse('CHANNEL_NOT_FOUND', 'Channel configuration not found', 404);
    }

    const { user } = await authorizeWorkspaceMember(
      request,
      config.workspace_id,
      'workspace:manage'
    );

    await prisma.channelConfig.delete({
      where: { id: configId },
    });

    await AuditService.record({
      workspaceId: config.workspace_id,
      actorUserId: user.userId,
      action: 'channel.delete',
      resourceType: 'channel',
      resourceId: configId,
    });

    return okResponse({ deleted: true, configId });
  } catch (err) {
    return handleApiError(err);
  }
}
