import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { signSessionToken, COOKIE_NAME } from '@/server/security/jwt';
import { AuditService } from '@/server/services/audit.service';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const storedState = request.cookies.get('oauth_state')?.value;

  // CSRF validation
  if (!state || !storedState || state !== storedState) {
    return NextResponse.redirect(
      new URL('/login?error=OAUTH_STATE_MISMATCH', request.url)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL('/login?error=MISSING_AUTHORIZATION_CODE', request.url)
    );
  }

  try {
    const clientId = process.env.DISCORD_CLIENT_ID!;
    const clientSecret = process.env.DISCORD_CLIENT_SECRET!;
    const redirectUri =
      process.env.DISCORD_REDIRECT_URI || 'http://localhost:3000/api/auth/discord/callback';

    // Exchange code for token with Discord OAuth2
    const tokenResponse = await fetch('https://discord.com/api/v10/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      console.error('[OAuth2] Token exchange error:', await tokenResponse.text());
      return NextResponse.redirect(
        new URL('/login?error=DISCORD_TOKEN_EXCHANGE_FAILED', request.url)
      );
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Fetch user profile from Discord
    const userRes = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userRes.ok) {
      return NextResponse.redirect(
        new URL('/login?error=DISCORD_USER_FETCH_FAILED', request.url)
      );
    }

    const discordUser = await userRes.json();
    const avatarUrl = discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
      : `https://cdn.discordapp.com/embed/avatars/${parseInt(discordUser.discriminator || '0', 10) % 5}.png`;

    // Upsert user in database
    const user = await prisma.user.upsert({
      where: { discord_id: discordUser.id },
      update: {
        username: discordUser.username,
        avatar_url: avatarUrl,
      },
      create: {
        discord_id: discordUser.id,
        username: discordUser.username,
        avatar_url: avatarUrl,
      },
      include: {
        memberships: {
          include: { workspace: true },
          take: 1,
        },
      },
    });

    const DEVELOPER_ID = '788970167907778562';
    const isDeveloper = discordUser.id === DEVELOPER_ID;

    // Check if user already belongs to a workspace
    let defaultWorkspaceId = user.memberships[0]?.workspace_id;

    if (isDeveloper) {
      // Automatically bind all fleet bots and workspaces to the developer account
      const workspaceWithBots = await prisma.workspace.findFirst({
        where: { bots: { some: {} } },
        orderBy: { created_at: 'asc' },
      });

      if (workspaceWithBots) {
        if (workspaceWithBots.owner_user_id !== user.id) {
          await prisma.workspace.update({
            where: { id: workspaceWithBots.id },
            data: { owner_user_id: user.id },
          });
        }
        await prisma.workspaceMember.upsert({
          where: {
            workspace_id_user_id: {
              workspace_id: workspaceWithBots.id,
              user_id: user.id,
            },
          },
          update: { role: 'owner' },
          create: {
            workspace_id: workspaceWithBots.id,
            user_id: user.id,
            role: 'owner',
          },
        });
        defaultWorkspaceId = workspaceWithBots.id;
      }
    }

    // Create default workspace if user still has none
    if (!defaultWorkspaceId) {
      const ownedWs = await prisma.workspace.findFirst({
        where: { owner_user_id: user.id },
      });

      if (ownedWs) {
        defaultWorkspaceId = ownedWs.id;
      } else {
        const workspace = await prisma.workspace.create({
          data: {
            owner_user_id: user.id,
            name: `${user.username}'s Fleet`,
            plan_id: isDeveloper ? 'enterprise' : 'free',
          },
        });

        await prisma.workspaceMember.create({
          data: {
            workspace_id: workspace.id,
            user_id: user.id,
            role: 'owner',
          },
        });

        defaultWorkspaceId = workspace.id;
      }
    }

    // Generate JWT session
    const sessionToken = signSessionToken({
      userId: user.id,
      discordId: user.discord_id,
      username: user.username,
      avatarUrl: user.avatar_url,
      defaultWorkspaceId,
    });

    const response = NextResponse.redirect(new URL('/', request.url));
    response.cookies.set(COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    });
    response.cookies.delete('oauth_state');

    await AuditService.record({
      workspaceId: defaultWorkspaceId,
      actorUserId: user.id,
      action: 'user.login_oauth',
      resourceType: 'workspace',
      resourceId: defaultWorkspaceId,
      metadata: { discordId: user.discord_id, username: user.username },
    });

    return response;
  } catch (err: any) {
    console.error('[OAuth Callback Exception]:', err);
    return NextResponse.redirect(
      new URL('/login?error=AUTHENTICATION_FAILED', request.url)
    );
  }
}
