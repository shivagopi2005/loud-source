import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/server/db/prisma';
import { authorizeWorkspaceMember } from '@/server/security/rbac';
import { okResponse, handleApiError, errorResponse } from '@/server/utils/api-response';
import { BotProfileService } from '@/server/services/bot-profile.service';
import { BotProfilePresets, PROFILE_THEMES } from '@/server/services/bot-profile-presets';

const UpdateProfileSchema = z.object({
  targetMode: z.enum(['single', 'selected', 'all']).default('all'),
  botIds: z.array(z.string()).optional(),
  applyOptions: z
    .object({
      updateAvatar: z.boolean().default(true),
      updateBanner: z.boolean().default(true),
      updateBio: z.boolean().default(true),
      updateStatus: z.boolean().default(true),
      updateName: z.boolean().default(true),
    })
    .optional(),
  profileData: z
    .object({
      displayName: z.string().max(64).optional(),
      avatarUrl: z.string().optional(),
      bannerUrl: z.string().optional(),
      bio: z.string().max(1024).optional(),
      customStatus: z.string().max(128).optional(),
      activityType: z
        .enum(['PLAYING', 'LISTENING', 'STREAMING', 'WATCHING', 'COMPETING', 'CUSTOM'])
        .optional(),
      accentColor: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).optional(),
    })
    .optional(),
  randomize: z
    .object({
      enabled: z.boolean().default(false),
      theme: z.string().default('all'),
      randomizeAvatar: z.boolean().default(true),
      randomizeBanner: z.boolean().default(true),
      randomizeBio: z.boolean().default(true),
      randomizeStatus: z.boolean().default(true),
      randomizeName: z.boolean().default(false),
      uniquePerBot: z.boolean().default(true),
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

    const DEVELOPER_ID = '788970167907778562';
    const dbUser = await prisma.user.findUnique({
      where: { id: user.userId },
      select: { discord_id: true },
    });
    const isDeveloper = dbUser?.discord_id === DEVELOPER_ID;

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: { owner: true },
    });

    if (!workspace) {
      return errorResponse('NOT_FOUND', 'Workspace not found', 404);
    }

    const isDeveloperWorkspace =
      workspace.owner?.discord_id === DEVELOPER_ID ||
      workspace.id === 'c5690896-c818-47f7-8577-eeedc4f05027';

    // Non-developers can NEVER access developer fleet bot profiles
    if (isDeveloperWorkspace && !isDeveloper) {
      return errorResponse('FORBIDDEN', 'Access restricted to workspace owner.', 403);
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

    let workerBots = bots.filter(
      (b) =>
        !FleetGatewayService.isRedirectBot(b.id) &&
        !FleetGatewayService.isRedirectBot(b.application_id) &&
        b.display_name !== 'Roynix Loud'
    );

    // If caller is not developer, ensure developer fleet bots are NEVER returned
    if (!isDeveloper) {
      const devBots = await prisma.botApplication.findMany({
        where: {
          workspace: { owner: { discord_id: DEVELOPER_ID } },
        },
        select: { id: true, application_id: true },
      });
      const devBotIds = new Set(devBots.map((b) => b.id));
      const devAppIds = new Set(devBots.map((b) => b.application_id).filter(Boolean));

      workerBots = workerBots.filter(
        (b) => !devBotIds.has(b.id) && !devAppIds.has(b.application_id)
      );
    }

    return okResponse({
      bots: workerBots.map((b) => ({
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
        online: FleetGatewayService.isBotOnline(b.id) || b.status === 'connected',
      })),
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
    const { user } = await authorizeWorkspaceMember(request, workspaceId, 'bot:manage');

    const DEVELOPER_ID = '788970167907778562';
    const dbUser = await prisma.user.findUnique({
      where: { id: user.userId },
      select: { discord_id: true },
    });
    const isDeveloper = dbUser?.discord_id === DEVELOPER_ID;

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: { owner: true },
    });

    if (!workspace) {
      return errorResponse('NOT_FOUND', 'Workspace not found', 404);
    }

    const isDeveloperWorkspace =
      workspace.owner?.discord_id === DEVELOPER_ID ||
      workspace.id === 'c5690896-c818-47f7-8577-eeedc4f05027';

    // A user can ONLY modify their own bots in their own workspace
    // Developer fleet bots can only be modified by the platform developer
    if (isDeveloperWorkspace && !isDeveloper) {
      return errorResponse('FORBIDDEN', 'Only the platform developer can modify developer fleet bot profiles.', 403);
    }

    const body = await request.json();
    const data = UpdateProfileSchema.parse(body);

    if (data.targetMode !== 'all' && (!data.botIds || data.botIds.length === 0)) {
      return errorResponse('VALIDATION_ERROR', 'At least one bot must be selected when not targeting all bots.', 400);
    }

    const result = await BotProfileService.updateProfiles({
      workspaceId,
      actorUserId: user.userId,
      actorDiscordId: dbUser?.discord_id,
      isDeveloper,
      targetMode: data.targetMode,
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
