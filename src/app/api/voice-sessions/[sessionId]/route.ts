import { NextRequest } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { authorizeWorkspaceMember } from '@/server/security/rbac';
import { okResponse, handleApiError, errorResponse } from '@/server/utils/api-response';
import { mediaGateway } from '@/server/voice/media-gateway';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const session = await prisma.voiceSession.findUnique({
      where: { id: sessionId },
      include: {
        created_by: {
          select: { id: true, username: true, avatar_url: true },
        },
        endpoints: {
          include: {
            bot: { select: { id: true, display_name: true, status: true } },
            channel: { select: { id: true, display_name: true, channel_id: true } },
            guild: { select: { id: true, display_name: true, guild_id: true } },
          },
        },
      },
    });

    if (!session) {
      return errorResponse('SESSION_NOT_FOUND', 'Voice session not found', 404);
    }

    await authorizeWorkspaceMember(request, session.workspace_id);

    // Merge live in-memory gateway metrics
    const activeGatewaySession = mediaGateway.getSession(sessionId);

    return okResponse({
      id: session.id,
      workspaceId: session.workspace_id,
      state: activeGatewaySession ? activeGatewaySession.state : session.state,
      startedAt: session.started_at,
      stoppedAt: session.stopped_at,
      stopReason: session.stop_reason,
      masterGain: activeGatewaySession ? activeGatewaySession.masterGain : 1.0,
      masterMuted: activeGatewaySession ? activeGatewaySession.masterMuted : false,
      endpoints: session.endpoints.map((ep) => {
        const liveWorker = activeGatewaySession?.endpoints.get(ep.id);
        return {
          id: ep.id,
          botId: ep.bot_id,
          botName: ep.bot.display_name,
          guildId: ep.guild.guild_id,
          guildName: ep.guild.display_name,
          channelId: ep.channel.channel_id,
          channelName: ep.channel.display_name,
          state: liveWorker ? liveWorker.state : ep.state,
          gain: liveWorker ? liveWorker.gain : 1.0,
          muted: liveWorker ? liveWorker.muted : false,
          vuLevel: liveWorker ? liveWorker.vuLevel : 0,
          lastErrorCode: liveWorker?.lastErrorCode || ep.last_error_code,
        };
      }),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
