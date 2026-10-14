import { describe, it, expect } from 'vitest';
import { DiscordBotService } from '../../src/server/services/discord-bot.service';

describe('Auto-collect Application ID & Bulk Bot Registration', () => {
  it('extracts Application ID directly from base64 token segment', () => {
    // 1204489001894273058 in base64 is MTIwNDQ4OTAwMTg5NDI3MzA1OA
    const token = 'MTIwNDQ4OTAwMTg5NDI3MzA1OA.Gh81j9.mock_discord_token';
    const appId = DiscordBotService.extractApplicationIdFromToken(token);
    expect(appId).toBe('1204489001894273058');
  });

  it('verifies bot token and auto-resolves Application ID when expectedAppId is omitted', async () => {
    const token = 'MTIwNDQ4OTAwMTg5NDI3MzA1OA.Gh81j9.test_bot_token';
    const verified = await DiscordBotService.verifyBotToken(token);

    expect(verified).toBeDefined();
    expect(verified.bot).toBe(true);
    expect(verified.applicationId).toBe('1204489001894273058');
  });
});
