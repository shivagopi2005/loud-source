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

    const TIER_RANKS: Record<string, number> = {
      trial: 0,
      free: 0,
      community: 1,
      pro: 2,
      premium: 2,
      enterprise: 3,
      developer: 4,
    };

    return okResponse({
      id: user.id,
      discordId: user.discord_id,
      username: user.username,
      avatarUrl: user.avatar_url,
      tier: effectiveTier,
      isDeveloper: userTier.isDeveloper,
      maxBots: userTier.maxBots,
      workspaces: user.memberships.map((m) => {
        const uRank = TIER_RANKS[effectiveTier] ?? 0;
        const wRank = TIER_RANKS[m.workspace.plan_id] ?? 0;
        const bestPlan = uRank >= wRank ? effectiveTier : m.workspace.plan_id;
        return {
          id: m.workspace.id,
          name: m.workspace.name,
          plan: bestPlan,
          status: m.workspace.status,
          role: m.role,
        };
      }),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
