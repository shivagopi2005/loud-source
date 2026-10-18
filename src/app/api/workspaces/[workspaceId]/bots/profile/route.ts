import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/server/db/prisma';
import { authorizeWorkspaceMember } from '@/server/security/rbac';
import { okResponse, handleApiError, errorResponse } from '@/server/utils/api-response';
import { BotProfileService } from '@/server/services/bot-profile.service';
import { BotProfilePresets, PROFILE_THEMES } from '@/server/services/bot-profile-presets';
import { DEVELOPER_IDS, DEVELOPER_USERNAMES, isDeveloperId, isDeveloperUser } from '@/server/services/premium.service';

const UpdateProfileSchema = z.object({
  targetMode: z.enum(['single', 'selected', 'all']).default('all').optional(),
  botIds: z.array(z.string()).optional(),
  applyOptions: z
    .object({
      updateAvatar: z.boolean().optional().default(true),
      updateBanner: z.boolean().optional().default(true),
      updateBio: z.boolean().optional().default(true),
      updateStatus: z.boolean().optional().default(true),
      updateName: z.boolean().optional().default(true),
    })
    .optional(),
  profileData: z
    .object({
      displayName: z.string().max(128).optional().nullable().or(z.literal('')),
      avatarUrl: z.string().optional().nullable().or(z.literal('')),
      bannerUrl: z.string().optional().nullable().or(z.literal('')),
      bio: z.string().max(2048).optional().nullable().or(z.literal('')),
      customStatus: z.string().max(256).optional().nullable().or(z.literal('')),
      activityType: z.string().optional().nullable().or(z.literal('')),
      accentColor: z.string().optional().nullable().or(z.literal('')),
    })
    .optional(),
  randomize: z
    .object({
      enabled: z.boolean().optional().default(false),
      theme: z.string().optional().default('all'),
      randomizeAvatar: z.boolean().optional().default(true),
      randomizeBanner: z.boolean().optional().default(true),
      randomizeBio: z.boolean().optional().default(true),
      randomizeStatus: z.boolean().optional().default(true),
      randomizeName: z.boolean().optional().default(false),
      uniquePerBot: z.boolean().optional().default(true),
    })
    .optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await params;
    const { user } = await authorizeWorkspaceMember(request, workspaceId);

    const dbUser = await prisma.user.findUnique({
      where: { id: user.userId },
      select: { discord_id: true, username: true, tier: true },
    });
    const isDeveloper = Boolean(isDeveloperUser(dbUser) || (dbUser?.discord_id && isDeveloperId(dbUser.discord_id)));

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: { owner: true },
    });

    if (!workspace) {
      return errorResponse('NOT_FOUND', 'Workspace not found', 404);
    }

    const redirectClientId = process.env.DISCORD_CLIENT_ID?.trim() || '1560261747137454161';

    const bots = await prisma.botApplication.findMany({
      where: {
        workspace_id: workspaceId,
        status: { notIn: ['removed', 'disabled'] },
        operational_role: { not: 'oauth_redirect' },
        application_id: { notIn: [redirectClientId, '1560261747137454161'] },
      },
      select: {
        id: true,
        application_id: true,
        display_name: true,
        avatar_url: true,
        banner_url: true,
        bio: true,
        custom_status: true,
        activity_type: true,
        accent_color: true,
        status: true,
        created_at: true,
      },
      orderBy: { created_at: 'asc' },
    });

    const { FleetGatewayService } = await import('@/server/services/fleet-gateway.service');

    const workerBots = bots.filter(
      (b) =>
        !FleetGatewayService.isRedirectBot(b.id) &&
        !FleetGatewayService.isRedirectBot(b.application_id) &&
        b.display_name !== 'Roynix Loud'
    );

    const botsWithPermissions = await Promise.all(
      workerBots.map(async (b) => {
        const perm = await BotProfileService.getBotProfilePermission(
          b.id,
          user.userId,
          dbUser?.discord_id,
          dbUser?.username
        );
        return {
          id: b.id,
          applicationId: b.application_id,
          displayName: b.display_name,
          avatarUrl: b.avatar_url,
          bannerUrl: b.banner_url,
          bio: b.bio,
          customStatus: b.custom_status,
          activityType: b.activity_type,
          accentColor: b.accent_color,
          status: b.status,
          online: FleetGatewayService.isBotOnline(b.id, b.application_id) || b.status === 'connected',
          canEditProfile: isDeveloper ? true : perm.canEditProfile,
          profileLocked: isDeveloper ? false : perm.profileLocked,
          profileLockedReason: isDeveloper ? null : (perm.profileLockedReason || null),
          isOriginalOwner: isDeveloper ? true : perm.isOriginalOwner,
          originalOwnerUsername: perm.originalOwnerUsername || null,
        };
      })
    );

    return okResponse({
      bots: botsWithPermissions,
      themes: PROFILE_THEMES,
      presets: BotProfilePresets.getAllPresets(),
    });
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
    const { user } = await authorizeWorkspaceMember(request, workspaceId);

    const dbUser = await prisma.user.findUnique({
      where: { id: user.userId },
      select: { discord_id: true, username: true, tier: true },
    });
    const isDeveloper = Boolean(isDeveloperUser(dbUser) || (dbUser?.discord_id && isDeveloperId(dbUser.discord_id)));

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: { owner: true },
    });

    if (!workspace) {
      return errorResponse('NOT_FOUND', 'Workspace not found', 404);
    }

    const body = await request.json().catch(() => ({}));
    const data = UpdateProfileSchema.parse(body);

    const effectiveTargetMode =
      data.targetMode === 'selected' && (!data.botIds || data.botIds.length === 0)
        ? 'all'
        : (data.targetMode || 'all');

    const result = await BotProfileService.updateProfiles({
      workspaceId,
      actorUserId: user.userId,
      actorDiscordId: dbUser?.discord_id,
      actorUsername: dbUser?.username,
      isDeveloper,
      targetMode: effectiveTargetMode,
      botIds: data.botIds,
      applyOptions: data.applyOptions,
      profileData: data.profileData,
      randomize: data.randomize,
    });

    return okResponse(result);
  } catch (err) {
    return handleApiError(err);
  }
}
