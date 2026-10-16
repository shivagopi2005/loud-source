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
    await authorizeWorkspaceMember(request, workspaceId);

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
    const body = await request.json();
    const data = UpdateProfileSchema.parse(body);

    if (data.targetMode !== 'all' && (!data.botIds || data.botIds.length === 0)) {
      return errorResponse('VALIDATION_ERROR', 'At least one bot must be selected when not targeting all bots.', 400);
    }

    const result = await BotProfileService.updateProfiles({
      workspaceId,
      actorUserId: user.userId,
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
