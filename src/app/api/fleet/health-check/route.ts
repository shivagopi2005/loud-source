import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/server/db/prisma';
import { authorizeWorkspaceMember } from '@/server/security/rbac';
import { okResponse, handleApiError } from '@/server/utils/api-response';
import { decryptSecret } from '@/server/security/encryption';
import { DiscordBotService } from '@/server/services/discord-bot.service';
import { AuditService } from '@/server/services/audit.service';

const FleetHealthCheckSchema = z.object({
  workspaceId: z.string().uuid(),
  botIds: z.array(z.string().uuid()).min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = FleetHealthCheckSchema.parse(body);

    const { user } = await authorizeWorkspaceMember(
      request,
      data.workspaceId,
      'diagnostics:view'
    );

    const bots = await prisma.botApplication.findMany({
      where: {
        id: { in: data.botIds },
        workspace_id: data.workspaceId,
      },
      include: {
        credentials: {
          where: { status: 'active' },
          orderBy: { credential_version: 'desc' },
          take: 1,
        },
      },
    });

    const results = [];

    // Bounded concurrency execution
    for (const bot of bots) {
      if (!bot.credentials.length) {
        results.push({ botId: bot.id, name: bot.display_name, status: 'no_credential' });
        continue;
      }

      try {
        const token = decryptSecret(bot.credentials[0].secret_reference);
        await DiscordBotService.verifyBotToken(token, bot.application_id);

        await prisma.botApplication.update({
          where: { id: bot.id },
          data: { status: 'ready', last_health_check_at: new Date() },
        });

        results.push({ botId: bot.id, name: bot.display_name, status: 'healthy' });
      } catch (err: any) {
        await prisma.botApplication.update({
          where: { id: bot.id },
          data: { status: 'credential_invalid', last_health_check_at: new Date() },
        });

        results.push({
          botId: bot.id,
          name: bot.display_name,
          status: 'degraded',
          error: err.message,
        });
      }
    }

    await AuditService.record({
      workspaceId: data.workspaceId,
      actorUserId: user.userId,
      action: 'fleet.health_check',
      resourceType: 'bot',
      metadata: { requestedCount: data.botIds.length, results },
    });

    return okResponse({
      total: results.length,
      healthy: results.filter((r) => r.status === 'healthy').length,
      degraded: results.filter((r) => r.status === 'degraded').length,
      results,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
