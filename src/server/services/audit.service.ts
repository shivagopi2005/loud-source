import crypto from 'crypto';
import { prisma } from '../db/prisma';

export interface RecordAuditParams {
  workspaceId: string;
  actorUserId?: string | null;
  actorType?: 'user' | 'system' | 'worker' | 'api';
  action: string;
  resourceType: 'bot' | 'guild' | 'channel' | 'voice_session' | 'message_job' | 'member' | 'workspace';
  resourceId?: string | null;
  result?: 'success' | 'failure' | 'denied';
  errorCode?: string | null;
  correlationId?: string;
  metadata?: Record<string, unknown>;
}

export class AuditService {
  /**
   * Record an audit event securely in PostgreSQL.
   */
  static async record(params: RecordAuditParams) {
    try {
      const correlationId = params.correlationId || crypto.randomUUID();
      
      // Sanitise metadata to ensure no sensitive fields can ever leak
      const sanitizedMeta: Record<string, unknown> = { ...(params.metadata || {}) };
      delete sanitizedMeta.token;
      delete sanitizedMeta.secret;
      delete sanitizedMeta.credential;
      delete sanitizedMeta.password;
      delete sanitizedMeta.authorization;

      return await prisma.auditEvent.create({
        data: {
          workspace_id: params.workspaceId,
          actor_user_id: params.actorUserId || null,
          actor_type: params.actorType || 'user',
          action: params.action,
          resource_type: params.resourceType,
          resource_id: params.resourceId || null,
          result: params.result || 'success',
          error_code: params.errorCode || null,
          correlation_id: correlationId,
          metadata: JSON.parse(JSON.stringify(sanitizedMeta)),
        },
      });
    } catch (err) {
      console.error('[AuditService] Failed to record audit event:', err);
      // Non-blocking in case of audit storage degradation
      return null;
    }
  }

  /**
   * Query recent audit events for a workspace.
   */
  static async listEvents(workspaceId: string, limit = 50, offset = 0) {
    return prisma.auditEvent.findMany({
      where: { workspace_id: workspaceId },
      orderBy: { created_at: 'desc' },
      take: Math.min(limit, 100),
      skip: offset,
      include: {
        actor: {
          select: {
            id: true,
            username: true,
            avatar_url: true,
          },
        },
      },
    });
  }
}
