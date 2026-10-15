import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export async function GET(request: NextRequest) {
  const clientId = process.env.DISCORD_CLIENT_ID;
  // Determine redirect URI: use configured env, or dynamically infer from incoming request
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https';
  const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const inferredOrigin = forwardedHost
    ? `${forwardedProto}://${forwardedHost}`
    : request.nextUrl.origin;

  const rawRedirectUri =
    process.env.DISCORD_REDIRECT_URI || `${inferredOrigin}/api/auth/discord/callback`;
  const redirectUri = encodeURIComponent(rawRedirectUri);

  // Generate secure OAuth2 state
  const state = crypto.randomBytes(16).toString('hex');
  const scope = encodeURIComponent('identify guilds email');

  const discordAuthUrl = `https://discord.com/oauth2/authorize?client_id=${clientId}&response_type=code&redirect_uri=${redirectUri}&scope=${scope}&state=${state}&prompt=consent`;

  const response = NextResponse.redirect(discordAuthUrl);
  // Store state and redirect URI in temporary cookies for validation in callback
  response.cookies.set('oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/',
  });
  response.cookies.set('oauth_redirect_uri', rawRedirectUri, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/',
  });

  return response;
}
