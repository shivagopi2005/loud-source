import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUser } from '@/server/security/rbac';
import { okResponse, handleApiError, errorResponse } from '@/server/utils/api-response';
import { DiscordBotService } from '@/server/services/discord-bot.service';

const ResolveTokenSchema = z.object({
  token: z.string().min(10, 'Discord bot token is required'),
});

export async function POST(request: NextRequest) {
  try {
    getAuthenticatedUser(request);
    const body = await request.json();
    const { token } = ResolveTokenSchema.parse(body);

    const verified = await DiscordBotService.verifyBotToken(token);

    return okResponse({
      applicationId: verified.applicationId,
      username: verified.username,
      discriminator: verified.discriminator,
      avatarUrl: verified.avatar
        ? `https://cdn.discordapp.com/avatars/${verified.id}/${verified.avatar}.png`
        : null,
      bot: verified.bot,
    });
  } catch (err: any) {
    return errorResponse(
      'INVALID_TOKEN',
      err.message || 'Failed to verify bot token with Discord',
      400
    );
  }
}
