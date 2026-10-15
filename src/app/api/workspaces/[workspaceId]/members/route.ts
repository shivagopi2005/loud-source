import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/server/db/prisma';
import { authorizeWorkspaceMember } from '@/server/security/rbac';
import { okResponse, handleApiError } from '@/server/utils/api-response';
import { AuditService } from '@/server/services/audit.service';

const AddMemberSchema = z.object({
  usernameOrDiscordId: z.string().min(2),
  role: z.enum(['administrator', 'operator', 'viewer']).default('operator'),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await params;
    await authorizeWorkspaceMember(request, workspaceId);

    const members = await prisma.workspaceMember.findMany({
      where: { workspace_id: workspaceId },
      include: {
        user: {
          select: {
            id: true,
            discord_id: true,
            username: true,
            avatar_url: true,
            status: true,
          },
        },
      },
      orderBy: { created_at: 'asc' },
    });

    return okResponse(
      members.map((m) => ({
        id: m.id,
        userId: m.user_id,
        role: m.role,
        createdAt: m.created_at,
        user: m.user,
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
    const { user } = await authorizeWorkspaceMember(request, workspaceId, 'member:invite');
    const body = await request.json();
    const data = AddMemberSchema.parse(body);

    // Find target user by username or discord_id, or create a placeholder user
    let targetUser = await prisma.user.findFirst({
      where: {
        OR: [
          { discord_id: data.usernameOrDiscordId },
          { username: data.usernameOrDiscordId },
        ],
      },
    });

    if (!targetUser) {
      const isSnowflake = /^\d{17,20}$/.test(data.usernameOrDiscordId);
      targetUser = await prisma.user.create({
        data: {
          discord_id: isSnowflake ? data.usernameOrDiscordId : `disc_${Date.now()}`,
          username: data.usernameOrDiscordId,
        },
      });
    }

    const member = await prisma.workspaceMember.upsert({
      where: {
        workspace_id_user_id: {
          workspace_id: workspaceId,
          user_id: targetUser.id,
        },
      },
      update: { role: data.role },
      create: {
        workspace_id: workspaceId,
        user_id: targetUser.id,
        role: data.role,
      },
    });

    await AuditService.record({
      workspaceId,
      actorUserId: user.userId,
      action: 'member.invite',
      resourceType: 'member',
      resourceId: member.id,
      metadata: { targetUserId: targetUser.id, role: data.role },
    });

    return okResponse(member, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
