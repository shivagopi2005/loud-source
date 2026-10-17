import { NextRequest } from 'next/server';
import { authorizeWorkspaceMember } from '@/server/security/rbac';
import { okResponse, handleApiError } from '@/server/utils/api-response';
import { FleetGatewayService } from '@/server/services/fleet-gateway.service';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await params;
    const { user } = await authorizeWorkspaceMember(request, workspaceId, 'workspace:manage');

    const { prisma } = await import('@/server/db/prisma');
    const dbUser = await prisma.user.findUnique({
      where: { id: user.userId },
      select: { discord_id: true },
    });

    await FleetGatewayService.disconnectWorkspaceFleet(workspaceId, dbUser?.discord_id || '');

    return okResponse({
      message: 'All workspace bots disconnected from Discord Gateway (Offline)',
    });
  } catch (err) {
    return handleApiError(err);
  }
}
