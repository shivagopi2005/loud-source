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

    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const limit = Math.max(1, Math.min(100, parseInt(url.searchParams.get('limit') || '30', 10)));
    const search = url.searchParams.get('search')?.trim() || '';
    const action = url.searchParams.get('action')?.trim() || '';
    const result = url.searchParams.get('result')?.trim() || '';

    const where: any = { workspace_id: workspaceId };

    if (action && action !== 'all') {
      where.action = { startsWith: action };
    }

    if (result && result !== 'all') {
      where.result = result;
    }

    if (search) {
      where.OR = [
        { action: { contains: search, mode: 'insensitive' } },
        { correlation_id: { contains: search, mode: 'insensitive' } },
        { resource_type: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, events] = await Promise.all([
      prisma.auditEvent.count({ where }),
      prisma.auditEvent.findMany({
        where,
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
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const formattedEvents = events.map((e) => ({
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
    }));

    return okResponse({
      events: formattedEvents,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
