import { NextRequest } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { authorizeWorkspaceMember } from '@/server/security/rbac';
import { PremiumService } from '@/server/services/premium.service';
import { okResponse, handleApiError, errorResponse } from '@/server/utils/api-response';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get('workspaceId');

    if (!workspaceId) {
      return errorResponse('WORKSPACE_REQUIRED', 'workspaceId parameter is required', 400);
    }

    const { user } = await authorizeWorkspaceMember(request, workspaceId);

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        _count: {
          select: {
            bots: true,
            voice_sessions: true,
            message_jobs: true,
            channels: true,
          },
        },
      },
    });

    if (!workspace) {
      return errorResponse('WORKSPACE_NOT_FOUND', 'Workspace not found', 404);
    }

    // Retrieve user and real tier limits
    const dbUser = await prisma.user.findUnique({
      where: { id: user.userId },
    });

    const userTier = await PremiumService.getUserTier(dbUser?.discord_id || '');

    // Quotas based on plan
    const isEnterprise = workspace.plan_id === 'enterprise';
    const isPro = workspace.plan_id === 'pro';

    const maxBots = isEnterprise ? 100 : isPro ? 25 : 5;
    const maxVoiceEndpoints = isEnterprise ? 20 : isPro ? 10 : 2;
    const maxMonthlyVoiceHours = isEnterprise ? 500 : isPro ? 100 : 10;
    const maxDispatchOperations = isEnterprise ? 50000 : isPro ? 10000 : 1000;

    const currentPeriod = new Date().toISOString().slice(0, 7); // YYYY-MM

    const usageRecords = await prisma.usageRecord.findMany({
      where: { workspace_id: workspaceId, billing_period: currentPeriod },
    });

    const voiceSecondsUsed = usageRecords
      .filter((r) => r.resource_type === 'voice_seconds')
      .reduce((acc, curr) => acc + curr.quantity, 0);

    const messagesSent = usageRecords
      .filter((r) => r.resource_type === 'message_count')
      .reduce((acc, curr) => acc + curr.quantity, 0);

    // Real active voice sessions in this workspace
    const activeVoiceSessions = await prisma.voiceSession.count({
      where: { workspace_id: workspaceId, state: 'active' },
    });

    // Real redeemed license keys for this user
    const redemptions = await prisma.licenseKey.findMany({
      where: {
        redeemed_by: dbUser?.discord_id || '',
        is_redeemed: true,
      },
      orderBy: { redeemed_at: 'desc' },
      select: {
        id: true,
        code: true,
        tier: true,
        duration_days: true,
        redeemed_at: true,
        created_at: true,
      },
    });

    return okResponse({
      workspaceId,
      plan: workspace.plan_id,
      planName: isEnterprise
        ? 'Enterprise Voice Fleet'
        : isPro
        ? 'Professional Voice Studio'
        : 'Free Community Starter',
      billingModel: 'license_key',
      userTier: {
        tier: userTier.tier,
        maxBots: userTier.maxBots,
        maxVolume: userTier.maxVolume,
        maxSpamCount: Number.isFinite(userTier.maxSpamCount) ? userTier.maxSpamCount : 'infinite',
        expiresAt: userTier.expiresAt,
        isExpired: userTier.isExpired,
        isDeveloper: userTier.isDeveloper,
      },
      quotas: {
        maxBots,
        maxVoiceEndpoints,
        maxMonthlyVoiceHours,
        maxDispatchOperations,
      },
      currentUsage: {
        registeredBots: workspace._count.bots,
        activeVoiceEndpoints: activeVoiceSessions,
        totalVoiceSessions: workspace._count.voice_sessions,
        totalMessageJobs: workspace._count.message_jobs,
        voiceSecondsUsed,
        voiceHoursUsed: parseFloat((voiceSecondsUsed / 3600).toFixed(1)),
        messagesSent,
        bandwidthMB: parseFloat(((voiceSecondsUsed * 48000 * 2) / (1024 * 1024)).toFixed(1)),
        audioPacketsEncoded: Math.round(voiceSecondsUsed * 50),
      },
      redemptions: redemptions.map((r) => ({
        id: r.id,
        code: r.code,
        tier: r.tier,
        duration: r.duration_days === 0 ? 'Lifetime' : `${r.duration_days} Days`,
        redeemedAt: r.redeemed_at ? r.redeemed_at.toISOString().slice(0, 10) : 'Active',
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
