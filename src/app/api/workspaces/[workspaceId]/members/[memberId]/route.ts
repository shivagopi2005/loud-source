import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/server/db/prisma';
import { authorizeWorkspaceMember, AuthError } from '@/server/security/rbac';
import { okResponse, handleApiError } from '@/server/utils/api-response';
import { AuditService } from '@/server/services/audit.service';

const UpdateRoleSchema = z.object({
  role: z.enum(['administrator', 'operator', 'viewer']),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; memberId: string }> }
) {
  try {
    const { workspaceId, memberId } = await params;
    const { user } = await authorizeWorkspaceMember(request, workspaceId, 'member:invite');
    const body = await request.json();
    const data = UpdateRoleSchema.parse(body);

    const existing = await prisma.workspaceMember.findUnique({
      where: { id: memberId },
    });

    if (!existing || existing.workspace_id !== workspaceId) {
      return handleApiError(new Error('Member not found in workspace'));
    }

    if (existing.role === 'owner') {
      throw new AuthError('CANNOT_MODIFY_OWNER', 'Owner role cannot be modified', 400);
    }

    const updated = await prisma.workspaceMember.update({
      where: { id: memberId },
      data: { role: data.role },
    });

    await AuditService.record({
      workspaceId,
      actorUserId: user.userId,
      action: 'member.role_update',
      resourceType: 'member',
      resourceId: memberId,
      metadata: { newRole: data.role },
    });

    return okResponse(updated);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; memberId: string }> }
) {
  try {
    const { workspaceId, memberId } = await params;
    const { user } = await authorizeWorkspaceMember(request, workspaceId, 'member:remove');

    const existing = await prisma.workspaceMember.findUnique({
      where: { id: memberId },
    });

    if (!existing || existing.workspace_id !== workspaceId) {
      return handleApiError(new Error('Member not found in workspace'));
    }

    if (existing.role === 'owner') {
      throw new AuthError('CANNOT_REMOVE_OWNER', 'Cannot remove workspace owner', 400);
    }

    await prisma.workspaceMember.delete({
      where: { id: memberId },
    });

    await AuditService.record({
      workspaceId,
      actorUserId: user.userId,
      action: 'member.remove',
      resourceType: 'member',
      resourceId: memberId,
    });

    return okResponse({ removed: true, memberId });
  } catch (err) {
    return handleApiError(err);
  }
}
