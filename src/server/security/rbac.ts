import { prisma } from '../db/prisma';
import { parseSessionCookie, verifySessionToken, UserSessionPayload } from './jwt';

export type UserRole = 'owner' | 'administrator' | 'operator' | 'viewer' | 'platform_admin';

export type Permission =
  | 'workspace:delete'
  | 'workspace:manage'
  | 'member:invite'
  | 'member:remove'
  | 'bot:register'
  | 'bot:manage'
  | 'bot:rotate_secret'
  | 'bot:operate'
  | 'voice:start'
  | 'voice:stop'
  | 'voice:emergency_stop'
  | 'message:test'
  | 'message:announce'
  | 'diagnostics:view'
  | 'audit:export'
  | 'platform:admin';

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  platform_admin: [
    'workspace:delete',
    'workspace:manage',
    'member:invite',
    'member:remove',
    'bot:register',
    'bot:manage',
    'bot:rotate_secret',
    'bot:operate',
    'voice:start',
    'voice:stop',
    'voice:emergency_stop',
    'message:test',
    'message:announce',
    'diagnostics:view',
    'audit:export',
    'platform:admin',
  ],
  owner: [
    'workspace:delete',
    'workspace:manage',
    'member:invite',
    'member:remove',
    'bot:register',
    'bot:manage',
    'bot:rotate_secret',
    'bot:operate',
    'voice:start',
    'voice:stop',
    'voice:emergency_stop',
    'message:test',
    'message:announce',
    'diagnostics:view',
    'audit:export',
  ],
  administrator: [
    'workspace:manage',
    'member:invite',
    'bot:register',
    'bot:manage',
    'bot:operate',
    'voice:start',
    'voice:stop',
    'voice:emergency_stop',
    'message:test',
    'message:announce',
    'diagnostics:view',
  ],
  operator: [
    'bot:operate',
    'voice:start',
    'voice:stop',
    'voice:emergency_stop',
    'message:test',
    'diagnostics:view',
  ],
  viewer: [
    'diagnostics:view',
  ],
};

export class AuthError extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, message: string, statusCode = 403) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Checks if a given role has the required permission.
 */
export function hasPermission(role: string, permission: Permission): boolean {
  const perms = ROLE_PERMISSIONS[role as UserRole];
  if (!perms) return false;
  return perms.includes(permission);
}

/**
 * Extract authenticated user session from Request headers.
 */
export function getAuthenticatedUser(request: Request): UserSessionPayload {
  const cookieHeader = request.headers.get('cookie');
  const token = parseSessionCookie(cookieHeader);

  // Also support Authorization: Bearer token for API tools
  const authHeader = request.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  const validToken = token || bearerToken;
  if (!validToken) {
    throw new AuthError('AUTH_REQUIRED', 'Authentication required', 401);
  }

  const payload = verifySessionToken(validToken);
  if (!payload) {
    throw new AuthError('AUTH_REQUIRED', 'Invalid or expired session', 401);
  }

  return payload;
}

/**
 * Verify that user is a member of workspace and has the required permission.
 */
export async function authorizeWorkspaceMember(
  request: Request,
  workspaceId: string,
  requiredPermission?: Permission
): Promise<{ user: UserSessionPayload; role: UserRole; workspaceId: string }> {
  const user = getAuthenticatedUser(request);

  // Check if user is platform admin
  if (user.role === 'platform_admin') {
    return { user, role: 'platform_admin', workspaceId };
  }

  // Find workspace membership
  const member = await prisma.workspaceMember.findUnique({
    where: {
      workspace_id_user_id: {
        workspace_id: workspaceId,
        user_id: user.userId,
      },
    },
    include: {
      workspace: true,
    },
  });

  if (!member) {
    throw new AuthError(
      'WORKSPACE_ACCESS_DENIED',
      'You are not a member of this workspace',
      403
    );
  }

  if (member.workspace.status === 'suspended') {
    throw new AuthError(
      'WORKSPACE_SUSPENDED',
      'This workspace has been suspended',
      403
    );
  }

  const userRole = member.role as UserRole;

  if (requiredPermission && !hasPermission(userRole, requiredPermission)) {
    throw new AuthError(
      'PERMISSION_DENIED',
      `Role '${userRole}' lacks permission '${requiredPermission}'`,
      403
    );
  }

  return { user, role: userRole, workspaceId };
}
