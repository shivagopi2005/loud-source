import { describe, it, expect } from 'vitest';
import { DiscordBotService } from '../../src/server/services/discord-bot.service';

describe('DiscordBotService (PRD Section 6.2, 7.1, 7.5, 9.1)', () => {
  it('verifies mock/test bot token successfully', async () => {
    const verified = await DiscordBotService.verifyBotToken(
      'mock_bot_token_sample',
      '990000000000000001'
    );
    expect(verified).toBeDefined();
    expect(verified.bot).toBe(true);
    expect(verified.applicationId).toBe('990000000000000001');
    expect(verified.username).toBe('Studio Voice Bot');
  });

  it('generates official Discord OAuth2 installation URL with required permissions', () => {
    const appId = '123456789012345678';
    const url = DiscordBotService.generateInstallUrl(appId, '3148800');

    expect(url).toContain('https://discord.com/oauth2/authorize');
    expect(url).toContain('client_id=123456789012345678');
    expect(url).toContain('permissions=3148800');
    expect(url).toContain('scope=bot');
  });

  it('fetches guild channels and assigns correct permission flags', async () => {
    const channels = await DiscordBotService.getGuildChannels(
      'mock_bot_token',
      '888888888888888888'
    );

    expect(channels.length).toBeGreaterThan(0);
    const voiceChannel = channels.find((c) => c.typeName === 'Voice');
    expect(voiceChannel).toBeDefined();
    expect(voiceChannel?.canConnect).toBe(true);
    expect(voiceChannel?.canSpeak).toBe(true);

    const textChannel = channels.find((c) => c.typeName === 'Text');
    expect(textChannel).toBeDefined();
    expect(textChannel?.canSend).toBe(true);
  });

  it('sends test channel message successfully', async () => {
    const result = await DiscordBotService.sendChannelMessage(
      'mock_bot_token',
      '100000000000000003',
      { content: 'Studio Fleet operational test message' }
    );

    expect(result.success).toBe(true);
    expect(result.messageId).toBeDefined();
    expect(result.channelId).toBe('100000000000000003');
  });
});
