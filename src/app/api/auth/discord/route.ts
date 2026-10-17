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
    inferredOrigin && !inferredOrigin.includes('localhost') && !inferredOrigin.includes('0.0.0.0')
      ? `${inferredOrigin}/api/auth/discord/callback`
      : process.env.DISCORD_REDIRECT_URI || `${inferredOrigin}/api/auth/discord/callback`;
  const redirectUri = encodeURIComponent(rawRedirectUri);

  // Generate secure OAuth2 state
  const state = crypto.randomBytes(16).toString('hex');
  const scope = encodeURIComponent('identify guilds email');

  const discordAuthUrl = `https://discord.com/oauth2/authorize?client_id=${clientId}&response_type=code&redirect_uri=${redirectUri}&scope=${scope}&state=${state}&prompt=consent`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Redirecting to Discord...</title>
  <meta http-equiv="refresh" content="0;url=${discordAuthUrl}">
  <script>window.location.replace(${JSON.stringify(discordAuthUrl)});</script>
</head>
<body style="background:#0d0c14;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
  <p>Connecting to Discord OAuth2...</p>
</body>
</html>`;

  const response = new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
  // Store state and redirect URI in temporary cookies for validation in callback
  response.cookies.set('oauth_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    maxAge: 600, // 10 minutes
    path: '/',
  });
  response.cookies.set('oauth_redirect_uri', rawRedirectUri, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    maxAge: 600, // 10 minutes
    path: '/',
  });

  return response;
}
