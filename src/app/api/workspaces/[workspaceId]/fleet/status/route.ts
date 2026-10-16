import { NextRequest } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { authorizeWorkspaceMember } from '@/server/security/rbac';
import { okResponse, handleApiError } from '@/server/utils/api-response';
import { FleetGatewayService } from '@/server/services/fleet-gateway.service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await params;
    await authorizeWorkspaceMember(request, workspaceId);

    let bots = await prisma.botApplication.findMany({
      where: {
        workspace_id: workspaceId,
        status: { notIn: ['removed', 'disabled'] },
      },
      select: {
        id: true,
        display_name: true,
        application_id: true,
        status: true,
      },
    });

    if (bots.length === 0) {
      const devBots = await FleetGatewayService.getFreeTierDeveloperBots();
      bots = devBots.map((b) => ({
        id: b.id,
        display_name: b.display_name,
        application_id: b.application_id,
        status: b.status,
      }));
    }

    const botIds = bots.map((b) => b.id);
    const liveStatuses = FleetGatewayService.getBotStatuses(botIds);

    const enrichedBots = bots.map((b) => {
      const live = liveStatuses[b.id];
      const isOnline = live?.online || b.status === 'connected';
      return {
        ...b,
        online: isOnline,
        pingMs: live?.pingMs || 0,
        status: isOnline ? 'connected' : b.status,
      };
    });

    const onlineCount = enrichedBots.filter((b) => b.online).length;

    return okResponse({
      totalBots: bots.length,
      onlineCount,
      offlineCount: bots.length - onlineCount,
      bots: enrichedBots,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
