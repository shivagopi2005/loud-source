import { NextRequest } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { authorizeWorkspaceMember } from '@/server/security/rbac';
import { okResponse, handleApiError, errorResponse } from '@/server/utils/api-response';
import { FleetGatewayService } from '@/server/services/fleet-gateway.service';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; guildId: string }> }
) {
  try {
    const { workspaceId, guildId } = await params;
    await authorizeWorkspaceMember(request, workspaceId);

    const guildConnection = await prisma.guildConnection.findFirst({
      where: {
        workspace_id: workspaceId,
        OR: [{ id: guildId }, { guild_id: guildId }],
      },
      include: {
        bot_accesses: true,
      },
    });

    if (!guildConnection) {
      return errorResponse('NOT_FOUND', 'Discord server connection not found in workspace.', 404);
    }

    // 1. Instruct all connected Discord bots in the fleet to leave the guild immediately
    const { departedCount } = await FleetGatewayService.leaveGuildAcrossFleet(
      guildConnection.guild_id
    );

    // 2. Cascade delete the guild connection, channel configs, and bot access records
    await prisma.guildConnection.delete({
      where: { id: guildConnection.id },
    });

    return okResponse({
      deleted: true,
      guildId: guildConnection.guild_id,
      displayName: guildConnection.display_name,
      departedBots: departedCount,
      message: `Successfully removed server "${guildConnection.display_name}" and instructed ${departedCount} bot(s) to exit.`,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
