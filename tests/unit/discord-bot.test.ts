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

  it('identifies OAuth / Redirect bot correctly and excludes it from worker operations', async () => {
    const { FleetGatewayService } = await import('../../src/server/services/fleet-gateway.service');
    process.env.DISCORD_CLIENT_ID = '1560261747137454161';

    expect(FleetGatewayService.isRedirectBot('1560261747137454161')).toBe(true);
    expect(FleetGatewayService.isRedirectBot('999999999999999999')).toBe(false);

    const mockOAuthClient = {
      user: { id: '1560261747137454161' },
    } as any;
    expect(FleetGatewayService.isRedirectBot(mockOAuthClient)).toBe(true);

    const mockWorkerClient = {
      user: { id: '888888888888888888' },
    } as any;
    expect(FleetGatewayService.isRedirectBot(mockWorkerClient)).toBe(false);
  });

  it('OAuth bot ignores normal commands (replays nothing) and only responds with premium commands on help', async () => {
    const { BotCommandService } = await import('../../src/server/services/bot-command.service');
    process.env.DISCORD_CLIENT_ID = '1560261747137454161';

    let replyMessage = '';
    const mockOAuthClient = {
      user: { id: '1560261747137454161' },
      mentions: { has: () => false },
    } as any;

    // 1. Normal command (!play) on OAuth bot -> Should replay nothing!
    const normalMsg = {
      id: 'test_msg_play_' + Date.now(),
      content: '!play despacito',
      author: { bot: false, id: '788970167907778562' },
      mentions: { has: () => false },
      reply: async (text: string) => {
        replyMessage = text;
      },
    } as any;

    replyMessage = '';
    await BotCommandService.handleMessage(mockOAuthClient, '0f146450-9db5-45f6-bef3-34fd98e12634', normalMsg);
    expect(replyMessage).toBe(''); // Replays NOTHING!

    // 2. Help command (!help) on OAuth bot -> Should ONLY show Premium Commands!
    const helpMsg = {
      id: 'test_msg_help_' + Date.now(),
      content: '!help',
      author: { bot: false, id: '788970167907778562' },
      mentions: { has: () => false },
      reply: async (text: string) => {
        replyMessage = text;
      },
    } as any;

    replyMessage = '';
    await BotCommandService.handleMessage(mockOAuthClient, '0f146450-9db5-45f6-bef3-34fd98e12634', helpMsg);
    expect(replyMessage).toContain('LOUD PREMIUM COMMANDS');
    expect(replyMessage).toContain('!premium status');
    expect(replyMessage).toContain('!premium redeem');
    // Normal commands must NOT be shown!
    expect(replyMessage).not.toContain('!play');
    expect(replyMessage).not.toContain('!spam');
    expect(replyMessage).not.toContain('!dm');
    expect(replyMessage).not.toContain('!join');
  });
});

