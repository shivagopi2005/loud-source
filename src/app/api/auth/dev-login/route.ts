import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { signSessionToken, COOKIE_NAME } from '@/server/security/jwt';
import { okResponse, errorResponse } from '@/server/utils/api-response';

export async function POST(request: NextRequest) {
  try {
    // Find seeded or first user
    let user = await prisma.user.findFirst({
      include: {
        memberships: {
          include: { workspace: true },
        },
      },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          discord_id: '112233445566778899',
          username: 'StudioCommander',
          avatar_url: 'https://cdn.discordapp.com/embed/avatars/0.png',
        },
        include: {
          memberships: {
            include: { workspace: true },
          },
        },
      });

      const workspace = await prisma.workspace.create({
        data: {
          owner_user_id: user.id,
          name: 'Studio Prime Fleet',
          plan_id: 'pro',
        },
      });

      await prisma.workspaceMember.create({
        data: {
          workspace_id: workspace.id,
          user_id: user.id,
          role: 'owner',
        },
      });

      user = await prisma.user.findUnique({
        where: { id: user.id },
        include: {
          memberships: {
            include: { workspace: true },
          },
        },
      })!;
    }

    const defaultWorkspaceId = user!.memberships[0]?.workspace_id;

    const token = signSessionToken({
      userId: user!.id,
      discordId: user!.discord_id,
      username: user!.username,
      avatarUrl: user!.avatar_url,
      defaultWorkspaceId,
    });

    const response = okResponse({
      user: {
        id: user!.id,
        username: user!.username,
        avatarUrl: user!.avatar_url,
        workspaceId: defaultWorkspaceId,
      },
    });

    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    });

    return response;
  } catch (err: any) {
    return errorResponse('LOGIN_FAILED', err.message, 500);
  }
}
