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
    await authorizeWorkspaceMember(request, workspaceId, 'workspace:manage');

    const result = await FleetGatewayService.connectWorkspaceFleet(workspaceId);

    return okResponse({
      message: `Brought ${result.connected} of ${result.total} bot(s) ONLINE in Discord`,
      ...result,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
