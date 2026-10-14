import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/server/db/prisma';
import { authorizeWorkspaceMember } from '@/server/security/rbac';
import { okResponse, handleApiError } from '@/server/utils/api-response';

const PreviewSchema = z.object({
  workspaceId: z.string().uuid(),
  title: z.string().min(1).max(128),
  content: z.string().min(1).max(2000),
  destinationChannelIds: z.array(z.string()).min(1),
  botId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = PreviewSchema.parse(body);

    await authorizeWorkspaceMember(request, data.workspaceId, 'message:announce');

    // Fetch verified destination channels
    const channels = await prisma.channelConfig.findMany({
      where: {
        workspace_id: data.workspaceId,
        channel_id: { in: data.destinationChannelIds },
        status: 'active',
      },
      include: { guild: true },
    });

    const eligibleChannelIds = new Set(channels.map((c) => c.channel_id));
    const ineligibleCount = data.destinationChannelIds.filter(
      (id) => !eligibleChannelIds.has(id)
    ).length;

    const embedPreview = {
      title: data.title,
      description: data.content,
      color: 0x5865f2, // Discord Blurple
      timestamp: new Date().toISOString(),
      footer: { text: 'Studio Fleet Operational Announcement' },
    };

    return okResponse({
      previewEmbed: embedPreview,
      totalDestinations: data.destinationChannelIds.length,
      eligibleDestinations: channels.map((c) => ({
        id: c.id,
        channelId: c.channel_id,
        name: c.display_name,
        guildName: c.guild.display_name,
      })),
      ineligibleCount,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
