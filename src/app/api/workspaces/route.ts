import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/server/db/prisma';
import { getAuthenticatedUser } from '@/server/security/rbac';
import { okResponse, handleApiError } from '@/server/utils/api-response';
import { AuditService } from '@/server/services/audit.service';

const CreateWorkspaceSchema = z.object({
  name: z.string().min(2).max(64),
  planId: z.enum(['free', 'pro', 'enterprise']).default('free'),
});

export async function GET(request: NextRequest) {
  try {
    const user = getAuthenticatedUser(request);
    const memberships = await prisma.workspaceMember.findMany({
      where: { user_id: user.userId },
      include: {
        workspace: {
          include: {
            _count: {
              select: {
                bots: true,
                members: true,
                channels: true,
                voice_sessions: true,
              },
            },
          },
        },
      },
      orderBy: { created_at: 'asc' },
    });

    return okResponse(
      memberships.map((m) => ({
        id: m.workspace.id,
        name: m.workspace.name,
        planId: m.workspace.plan_id,
        status: m.workspace.status,
        role: m.role,
        createdAt: m.workspace.created_at,
        counts: m.workspace._count,
      }))
    );
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = getAuthenticatedUser(request);
    const body = await request.json();
    const data = CreateWorkspaceSchema.parse(body);

    const workspace = await prisma.workspace.create({
      data: {
        name: data.name,
        plan_id: data.planId,
        owner_user_id: user.userId,
        members: {
          create: {
            user_id: user.userId,
            role: 'owner',
          },
        },
      },
    });

    await AuditService.record({
      workspaceId: workspace.id,
      actorUserId: user.userId,
      action: 'workspace.create',
      resourceType: 'workspace',
      resourceId: workspace.id,
      metadata: { name: workspace.name, planId: workspace.plan_id },
    });

    return okResponse(workspace, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
