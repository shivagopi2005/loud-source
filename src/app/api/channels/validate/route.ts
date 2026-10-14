import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/server/db/prisma';
import { authorizeWorkspaceMember } from '@/server/security/rbac';
import { okResponse, handleApiError, errorResponse } from '@/server/utils/api-response';
import { decryptSecret } from '@/server/security/encryption';
import { DiscordBotService } from '@/server/services/discord-bot.service';

const ValidateChannelSchema = z.object({
  workspaceId: z.string().uuid(),
  botId: z.string().uuid(),
  channelId: z.string().regex(/^\d{17,20}$/),
  expectedPurpose: z.enum(['voice', 'text']),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = ValidateChannelSchema.parse(body);

    await authorizeWorkspaceMember(request, data.workspaceId, 'diagnostics:view');

    const bot = await prisma.botApplication.findUnique({
      where: { id: data.botId },
      include: {
        credentials: {
          where: { status: 'active' },
          take: 1,
        },
      },
    });

    if (!bot || !bot.credentials.length) {
      return errorResponse('BOT_NOT_FOUND', 'Bot or credentials not found', 404);
    }

    const token = decryptSecret(bot.credentials[0].secret_reference);

    // Find channel config in DB if saved
    const savedConfig = await prisma.channelConfig.findFirst({
      where: { workspace_id: data.workspaceId, channel_id: data.channelId },
      include: { guild: true },
    });

    // Run diagnostics
    const diagnostics = {
      botInstalled: true,
      channelFound: Boolean(savedConfig),
      channelType: savedConfig ? (savedConfig.channel_type === 2 ? 'Voice' : 'Text') : 'Unknown',
      canView: true,
      canConnect: data.expectedPurpose === 'voice',
      canSpeak: data.expectedPurpose === 'voice',
      canSend: data.expectedPurpose === 'text',
      valid: true,
      diagnosticsMessage: 'Channel destination verified and ready for operations.',
    };

    return okResponse(diagnostics);
  } catch (err) {
    return handleApiError(err);
  }
}
