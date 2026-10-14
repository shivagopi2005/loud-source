import { NextRequest } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { authorizeWorkspaceMember } from '@/server/security/rbac';
import { okResponse, handleApiError } from '@/server/utils/api-response';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await params;
    await authorizeWorkspaceMember(request, workspaceId);

    const guilds = await prisma.guildConnection.findMany({
      where: { workspace_id: workspaceId },
      include: {
        bot_accesses: {
          include: {
            bot: {
              select: {
                id: true,
                application_id: true,
                display_name: true,
                status: true,
              },
            },
          },
        },
        channel_configs: {
          orderBy: { created_at: 'asc' },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    return okResponse(
      guilds.map((g) => ({
        id: g.id,
        guildId: g.guild_id,
        displayName: g.display_name,
        verificationStatus: g.verification_status,
        verifiedAt: g.verified_at,
        bots: g.bot_accesses.map((ba) => ({
          botId: ba.bot.id,
          name: ba.bot.display_name,
          status: ba.status,
          permissions: ba.permissions_snapshot,
        })),
        channels: g.channel_configs.map((c) => ({
          id: c.id,
          channelId: c.channel_id,
          name: c.display_name,
          type: c.channel_type,
          purpose: c.purpose,
          status: c.status,
        })),
      }))
    );
  } catch (err) {
    return handleApiError(err);
  }
}
