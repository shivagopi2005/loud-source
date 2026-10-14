import { NextRequest } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { authorizeWorkspaceMember } from '@/server/security/rbac';
import { okResponse, handleApiError, errorResponse } from '@/server/utils/api-response';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get('workspaceId');

    if (!workspaceId) {
      return errorResponse('WORKSPACE_REQUIRED', 'workspaceId parameter is required', 400);
    }

    await authorizeWorkspaceMember(request, workspaceId, 'diagnostics:view');

    const events = await prisma.auditEvent.findMany({
      where: { workspace_id: workspaceId },
      include: {
        actor: {
          select: {
            id: true,
            username: true,
            avatar_url: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
      take: 100,
    });

    return okResponse(
      events.map((e) => ({
        id: e.id,
        action: e.action,
        actorType: e.actor_type,
        actorName: e.actor ? e.actor.username : e.actor_type,
        actorAvatar: e.actor?.avatar_url,
        resourceType: e.resource_type,
        resourceId: e.resource_id,
        result: e.result,
        errorCode: e.error_code,
        correlationId: e.correlation_id,
        metadata: e.metadata,
        createdAt: e.created_at,
      }))
    );
  } catch (err) {
    return handleApiError(err);
  }
}
