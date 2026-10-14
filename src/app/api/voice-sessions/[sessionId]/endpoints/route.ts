import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/server/db/prisma';
import { authorizeWorkspaceMember } from '@/server/security/rbac';
import { okResponse, handleApiError, errorResponse } from '@/server/utils/api-response';
import { mediaGateway } from '@/server/voice/media-gateway';
import { VoiceWorkerInstance } from '@/server/voice/voice-worker';
import { decryptSecret } from '@/server/security/encryption';

const AddEndpointSchema = z.object({
  botId: z.string().uuid(),
  guildConnectionId: z.string().uuid(),
  channelConfigId: z.string().uuid(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const session = await prisma.voiceSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      return errorResponse('SESSION_NOT_FOUND', 'Voice session not found', 404);
    }

    await authorizeWorkspaceMember(request, session.workspace_id, 'voice:start');
    const body = await request.json();
    const data = AddEndpointSchema.parse(body);

    const bot = await prisma.botApplication.findUnique({
      where: { id: data.botId },
      include: {
        credentials: {
          where: { status: 'active' },
          orderBy: { credential_version: 'desc' },
          take: 1,
        },
      },
    });

    if (!bot || !bot.credentials.length) {
      return errorResponse('BOT_NOT_FOUND', 'Bot or active credentials not found', 404);
    }

    const guild = await prisma.guildConnection.findUnique({
      where: { id: data.guildConnectionId },
    });

    const channel = await prisma.channelConfig.findUnique({
      where: { id: data.channelConfigId },
    });

    if (!guild || !channel) {
      return errorResponse('DESTINATION_NOT_FOUND', 'Guild or channel not found', 404);
    }

    const token = decryptSecret(bot.credentials[0].secret_reference);

    const endpoint = await prisma.voiceEndpoint.create({
      data: {
        voice_session_id: sessionId,
        bot_id: bot.id,
        guild_connection_id: guild.id,
        channel_config_id: channel.id,
        state: 'connecting',
      },
    });

    const activeSession = mediaGateway.getSession(sessionId);
    if (activeSession) {
      const worker = new VoiceWorkerInstance({
        endpointId: endpoint.id,
        botId: bot.id,
        botToken: token,
        guildId: guild.guild_id,
        channelId: channel.channel_id,
      });

      activeSession.endpoints.set(endpoint.id, worker);
      if (activeSession.state === 'streaming') {
        await worker.connect();
      }
    }

    return okResponse(endpoint, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
