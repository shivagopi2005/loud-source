import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/server/db/prisma';
import { authorizeWorkspaceMember } from '@/server/security/rbac';
import { okResponse, handleApiError } from '@/server/utils/api-response';
import { AuditService } from '@/server/services/audit.service';

const UpdateWorkspaceSchema = z.object({
  name: z.string().min(2).max(64).optional(),
  planId: z.enum(['free', 'pro', 'enterprise']).optional(),
  status: z.enum(['active', 'restricted']).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await params;
    const { role } = await authorizeWorkspaceMember(request, workspaceId);

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        owner: {
          select: { id: true, username: true, avatar_url: true },
        },
        _count: {
          select: {
            bots: true,
            guilds: true,
            channels: true,
            members: true,
            voice_sessions: true,
          },
        },
      },
    });

    if (!workspace) {
      return handleApiError(new Error('Workspace not found'));
    }

    return okResponse({
      ...workspace,
      currentUserRole: role,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await params;
    const { user } = await authorizeWorkspaceMember(request, workspaceId, 'workspace:manage');
    const body = await request.json();
    const data = UpdateWorkspaceSchema.parse(body);

    const updated = await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        name: data.name,
        plan_id: data.planId,
        status: data.status,
      },
    });

    await AuditService.record({
      workspaceId,
      actorUserId: user.userId,
      action: 'workspace.update',
      resourceType: 'workspace',
      resourceId: workspaceId,
      metadata: data,
    });

    return okResponse(updated);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await params;
    const { user } = await authorizeWorkspaceMember(request, workspaceId, 'workspace:delete');

    await prisma.workspace.delete({
      where: { id: workspaceId },
    });

    await AuditService.record({
      workspaceId,
      actorUserId: user.userId,
      action: 'workspace.delete',
      resourceType: 'workspace',
      resourceId: workspaceId,
    });

    return okResponse({ deleted: true, workspaceId });
  } catch (err) {
    return handleApiError(err);
  }
}
