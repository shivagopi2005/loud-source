import { NextRequest } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { getAuthenticatedUser } from '@/server/security/rbac';
import { okResponse, handleApiError } from '@/server/utils/api-response';

export async function GET(request: NextRequest) {
  try {
    const session = getAuthenticatedUser(request);

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      include: {
        memberships: {
          include: {
            workspace: {
              select: {
                id: true,
                name: true,
                plan_id: true,
                status: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      return handleApiError(new Error('User not found'));
    }

    const { PremiumService } = await import('@/server/services/premium.service');
    const userTier = await PremiumService.getUserTier(user.discord_id || '');
    const effectiveTier = userTier.isDeveloper ? 'developer' : userTier.tier;

    return okResponse({
      id: user.id,
      discordId: user.discord_id,
      username: user.username,
      avatarUrl: user.avatar_url,
      workspaces: user.memberships.map((m) => ({
        id: m.workspace.id,
        name: m.workspace.name,
        plan: m.workspace.plan_id === 'enterprise' ? 'enterprise' : (effectiveTier || m.workspace.plan_id),
        status: m.workspace.status,
        role: m.role,
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
