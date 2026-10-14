import jwt from 'jsonwebtoken';
import { serialize, parse } from 'cookie';

const JWT_SECRET = process.env.JWT_SECRET || 'loud_fallback_jwt_secret_must_override';
const MEDIA_SESSION_SECRET = process.env.MEDIA_SESSION_SECRET || 'loud_media_session_secret_key';
export const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'loud_session';

export interface UserSessionPayload {
  userId: string;
  discordId: string;
  username: string;
  avatarUrl: string | null;
  role?: string;
  defaultWorkspaceId?: string;
}

export interface MediaSessionPayload {
  sessionId: string;
  workspaceId: string;
  userId: string;
  type: 'media_stream';
}

/**
 * Generate a JWT session token for an authenticated user.
 */
export function signSessionToken(
  payload: UserSessionPayload,
  expiresIn: jwt.SignOptions['expiresIn'] = '7d'
): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

/**
 * Verify a user session token.
 */
export function verifySessionToken(token: string): UserSessionPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as UserSessionPayload;
  } catch {
    return null;
  }
}

/**
 * Generate short-lived media stream token for WebSocket WebRTC media gateway.
 * Expires in 15 minutes.
 */
export function signMediaSessionToken(payload: Omit<MediaSessionPayload, 'type'>): string {
  return jwt.sign({ ...payload, type: 'media_stream' }, MEDIA_SESSION_SECRET, {
    expiresIn: '15m' as jwt.SignOptions['expiresIn'],
  });
}

/**
 * Verify media stream token.
 */
export function verifyMediaSessionToken(token: string): MediaSessionPayload | null {
  try {
    const decoded = jwt.verify(token, MEDIA_SESSION_SECRET) as MediaSessionPayload;
    if (decoded.type !== 'media_stream') return null;
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Create secure HTTP-only cookie header value.
 */
export function createSessionCookie(token: string): string {
  return serialize(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  });
}

/**
 * Create expired cookie header value to clear session on logout.
 */
export function clearSessionCookie(): string {
  return serialize(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

/**
 * Parse session cookie from request header.
 */
export function parseSessionCookie(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  const cookies = parse(cookieHeader);
  return cookies[COOKIE_NAME] || null;
}
