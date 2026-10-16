import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { signSessionToken, COOKIE_NAME } from '@/server/security/jwt';
import { AuditService } from '@/server/services/audit.service';
import { PremiumService } from '@/server/services/premium.service';

function getBaseUrl(request: NextRequest): string {
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  if (host && !host.includes('0.0.0.0')) {
    return `${proto}://${host}`;
  }

  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured && !configured.includes('0.0.0.0')) {
    return configured.replace(/\/$/, '');
  }

  const origin = request.nextUrl.origin;
  if (origin && !origin.includes('0.0.0.0')) {
    return origin;
  }

  return 'https://enter-depend-sent-illustrated.trycloudflare.com';
}

export async function GET(request: NextRequest) {
  const baseUrl = getBaseUrl(request);
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const storedState = request.cookies.get('oauth_state')?.value;

  // CSRF validation: verify state if storedState is present in cookie
  if (storedState && state && state !== storedState) {
    console.warn('[OAuth2] State mismatch between param and cookie:', { state, storedState });
    return NextResponse.redirect(
      new URL('/login?error=OAUTH_STATE_MISMATCH', baseUrl)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL('/login?error=MISSING_AUTHORIZATION_CODE', baseUrl)
    );
  }

  try {
    const clientId = process.env.DISCORD_CLIENT_ID!;
    const clientSecret = process.env.DISCORD_CLIENT_SECRET!;
    const storedRedirectUri = request.cookies.get('oauth_redirect_uri')?.value;
    const redirectUri =
      storedRedirectUri ||
      process.env.DISCORD_REDIRECT_URI ||
      `${request.nextUrl.origin}/api/auth/discord/callback`;

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
        new URL('/login?error=DISCORD_TOKEN_EXCHANGE_FAILED', baseUrl)
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
        new URL('/login?error=DISCORD_USER_FETCH_FAILED', baseUrl)
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

    // Resolve effective tier for this user
    const userTier = await PremiumService.getUserTier(discordUser.id);
    const effectivePlan = isDeveloper ? 'developer' : userTier.tier;

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
            plan_id: effectivePlan,
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

    // Keep all owned workspaces synchronized with effectivePlan
    try {
      await prisma.workspace.updateMany({
        where: { owner_user_id: user.id },
        data: { plan_id: effectivePlan },
      });
    } catch (syncErr) {
      console.warn('[OAuthCallback] Could not sync workspace plan_id:', syncErr);
    }

    // Generate JWT session
    const sessionToken = signSessionToken({
      userId: user.id,
      discordId: user.discord_id,
      username: user.username,
      avatarUrl: user.avatar_url,
      defaultWorkspaceId,
    });

    const response = NextResponse.redirect(new URL('/', baseUrl));
    response.cookies.set(COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    });
    response.cookies.delete('oauth_state');
    response.cookies.delete('oauth_redirect_uri');

    await AuditService.record({
      workspaceId: defaultWorkspaceId,
      actorUserId: user.id,
      action: 'user.login_oauth',
      resourceType: 'workspace',
      resourceId: defaultWorkspaceId,
      metadata: { discordId: user.discord_id, username: user.username },
    });

    // Dispatch login webhook notification to Discord channel
    const webhookUrl =
      'https://discord.com/api/webhooks/1560573440275128380/9RvcUcT8OBD5-WX_2B0AG0wdeCsN_xx1arcOGH1A1yM-y5DArbeTP16Ut8ECb10YlAlC';
    const nowUnix = Math.floor(Date.now() / 1000);
    fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'LOUD Studio Security & Auth Log',
        avatar_url: 'https://cdn.discordapp.com/embed/avatars/0.png',
        embeds: [
          {
            title: '🌐 Website User Login Detected',
            color: 0x5865f2,
            thumbnail: { url: avatarUrl },
            fields: [
              {
                name: '👤 Display Name',
                value: discordUser.global_name || discordUser.username,
                inline: true,
              },
              {
                name: '🏷️ Discord Tag / Username',
                value: `@${discordUser.username}`,
                inline: true,
              },
              {
                name: '🆔 Discord ID',
                value: `\`${discordUser.id}\` (<@${discordUser.id}>)`,
                inline: true,
              },
              {
                name: '⏰ Login Time',
                value: `<t:${nowUnix}:F> (<t:${nowUnix}:R>)`,
                inline: false,
              },
              {
                name: '💎 Plan Tier',
                value: user.tier ? user.tier.toUpperCase() : 'TRIAL',
                inline: true,
              },
              {
                name: '🏢 Default Workspace',
                value: defaultWorkspaceId || 'N/A',
                inline: true,
              },
            ],
            footer: { text: 'LOUD Voice Studio • OAuth2 Telemetry' },
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    }).catch((webhookErr) => {
      console.warn('[AuthWebhook] Login webhook dispatch failed:', webhookErr.message);
    });

    return response;
  } catch (err: any) {
    console.error('[OAuth Callback Exception]:', err);
    return NextResponse.redirect(
      new URL('/login?error=AUTHENTICATION_FAILED', baseUrl)
    );
  }
}
