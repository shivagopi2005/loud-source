import { NextRequest } from 'next/server';
import { okResponse, handleApiError } from '@/server/utils/api-response';
import { mediaGateway } from '@/server/voice/media-gateway';
import { FleetGatewayService } from '@/server/services/fleet-gateway.service';
import { prisma } from '@/server/db/prisma';

export async function POST(request: NextRequest) {
  try {
    let guildId: string | undefined;
    try {
      const body = await request.json();
      guildId = body?.guildId;
    } catch {}

    const [fleetRes] = await Promise.allSettled([
      FleetGatewayService.forceDisconnectAllVoice(guildId),
      mediaGateway.emergencyStopAll('force_disconnect_all'),
      prisma.voiceSession.updateMany({
        where: {
          state: { in: ['created', 'connecting', 'streaming', 'paused'] },
        },
        data: {
          state: 'stopped',
          stopped_at: new Date(),
          stop_reason: 'force_disconnect_all',
        },
      }),
    ]);

    const disconnectedCount =
      fleetRes.status === 'fulfilled' ? fleetRes.value.disconnected : 0;

    return okResponse({
      success: true,
      disconnectedCount,
      message: 'All Discord bots forcefully removed from voice channels simultaneously.',
    });
  } catch (err) {
    return handleApiError(err);
  }
}
