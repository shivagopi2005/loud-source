import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { signSessionToken, COOKIE_NAME } from '@/server/security/jwt';
import { okResponse, errorResponse } from '@/server/utils/api-response';

export async function POST(request: NextRequest) {
  try {
    // In production, block dev-login completely
    if (process.env.NODE_ENV === 'production') {
      return errorResponse('FORBIDDEN', 'Quick access is disabled in production. Please authenticate with Discord.', 403);
    }

    const DEVELOPER_ID = '788970167907778562';

    // Find the developer user
    let user = await prisma.user.findUnique({
      where: { discord_id: DEVELOPER_ID },
      include: {
        memberships: {
          include: { workspace: true },
        },
      },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          discord_id: DEVELOPER_ID,
          username: 'Developer',
          avatar_url: 'https://cdn.discordapp.com/embed/avatars/0.png',
        },
        include: {
          memberships: {
            include: { workspace: true },
          },
        },
      });
    }

    // Find the workspace with the bots
    let workspace = await prisma.workspace.findFirst({
      where: { bots: { some: {} } },
    });

    if (!workspace) {
      workspace = await prisma.workspace.findFirst({
        where: { owner_user_id: user.id },
      });
    }

    if (!workspace) {
      workspace = await prisma.workspace.create({
        data: {
          owner_user_id: user.id,
          name: 'Studio Prime Fleet',
          plan_id: 'enterprise',
        },
      });
    }

    // Ensure developer has owner membership
    await prisma.workspaceMember.upsert({
      where: {
        workspace_id_user_id: {
          workspace_id: workspace.id,
          user_id: user.id,
        },
      },
      update: { role: 'owner' },
      create: {
        workspace_id: workspace.id,
        user_id: user.id,
        role: 'owner',
      },
    });

    const defaultWorkspaceId = workspace.id;

    const token = signSessionToken({
      userId: user.id,
      discordId: user.discord_id,
      username: user.username,
      avatarUrl: user.avatar_url,
      defaultWorkspaceId,
    });

    const response = okResponse({
      user: {
        id: user.id,
        username: user.username,
        avatarUrl: user.avatar_url,
        workspaceId: defaultWorkspaceId,
      },
    });

    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    });

    return response;
  } catch (err: any) {
    return errorResponse('LOGIN_FAILED', err.message, 500);
  }
}
