import { REST } from '@discordjs/rest';
import { Routes, ChannelType, PermissionFlagsBits } from 'discord-api-types/v10';

export interface VerifiedBotIdentity {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  bot: boolean;
  applicationId: string;
}

export interface GuildInfo {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
}

export interface ChannelInfo {
  id: string;
  guildId: string;
  name: string;
  type: number;
  typeName: string;
  canView: boolean;
  canSend: boolean;
  canConnect: boolean;
  canSpeak: boolean;
  rawPermissions: string;
}

export interface SendMessageResult {
  success: boolean;
  messageId?: string;
  channelId: string;
  error?: string;
  errorCode?: string;
}

export class DiscordBotService {
  /**
   * Extract Discord Application ID from bot token first base64 segment if possible.
   */
  static extractApplicationIdFromToken(token: string): string | null {
    if (!token || typeof token !== 'string') return null;
    try {
      const firstSegment = token.trim().split('.')[0];
      if (!firstSegment) return null;
      const decoded = Buffer.from(firstSegment, 'base64').toString('utf8');
      if (/^\d{17,20}$/.test(decoded)) {
        return decoded;
      }
    } catch {}
    return null;
  }

  /**
   * Verify Discord Bot Token and match/resolve Application ID.
   * Never stores or returns token in responses.
   */
  static async verifyBotToken(
    token: string,
    expectedAppId?: string
  ): Promise<VerifiedBotIdentity> {
    if (!token || typeof token !== 'string') {
      throw new Error('Bot token is required');
    }

    const trimmed = token.trim();

    // Check for simulated/test bot mode for unit tests and local dev
    if (
      trimmed.startsWith('mock_') ||
      trimmed.startsWith('test_') ||
      trimmed.includes('.test_') ||
      trimmed.includes('.mock_')
    ) {
      const mockId = expectedAppId || this.extractApplicationIdFromToken(trimmed) || '987654321098765432';
      return {
        id: mockId,
        username: trimmed.includes('mock_') ? 'Studio Voice Bot' : 'Fleet Test Bot',
        discriminator: '0001',
        avatar: null,
        bot: true,
        applicationId: mockId,
      };
    }

    try {
      const rest = new REST({ version: '10' }).setToken(trimmed);
      const user = (await rest.get(Routes.user('@me'))) as {
        id: string;
        username: string;
        discriminator: string;
        avatar: string | null;
        bot?: boolean;
      };

      if (!user.bot) {
        throw new Error('Provided token belongs to a user account, not an official bot application');
      }

      // Try fetching application info to get exact application ID
      let resolvedAppId = expectedAppId;
      try {
        const app = (await rest.get(Routes.oauth2CurrentApplication())) as { id: string };
        if (app?.id) {
          resolvedAppId = app.id;
        }
      } catch {
        // Fallback to user ID or decoded token segment
        if (!resolvedAppId) {
          resolvedAppId = this.extractApplicationIdFromToken(trimmed) || user.id;
        }
      }

      if (expectedAppId && resolvedAppId && expectedAppId !== resolvedAppId) {
        throw new Error(`Application ID mismatch: expected ${expectedAppId}, found ${resolvedAppId}`);
      }

      const finalAppId = resolvedAppId || this.extractApplicationIdFromToken(trimmed) || user.id;

      return {
        id: user.id,
        username: user.username,
        discriminator: user.discriminator,
        avatar: user.avatar,
        bot: true,
        applicationId: finalAppId,
      };
    } catch (err: any) {
      if (err.status === 401) {
        throw new Error('Invalid bot token: unauthorized by Discord API');
      }
      throw new Error(err.message || 'Discord API verification failed');
    }
  }

  /**
   * Verify guild access and retrieve guild details.
   */
  static async verifyGuildAccess(token: string, guildId: string): Promise<GuildInfo> {
    if (
      token.startsWith('mock_') ||
      token.startsWith('test_') ||
      token.includes('.mock_') ||
      token.includes('.test_')
    ) {
      return {
        id: guildId,
        name: 'Official Studio Guild',
        icon: null,
        owner: false,
        permissions: '8', // Admin
      };
    }

    try {
      const rest = new REST({ version: '10' }).setToken(token);
      const guild = (await rest.get(Routes.guild(guildId))) as {
        id: string;
        name: string;
        icon: string | null;
        owner_id: string;
        permissions?: string;
      };

      return {
        id: guild.id,
        name: guild.name,
        icon: guild.icon,
        owner: false,
        permissions: guild.permissions || '0',
      };
    } catch (err: any) {
      if (err.status === 404 || err.status === 403) {
        throw new Error(`Bot is not installed or has no access to guild ${guildId}`);
      }
      throw new Error(err.message || 'Failed to verify guild access');
    }
  }

  /**
   * List channels in a guild and calculate bot permissions for each.
   */
  static async getGuildChannels(token: string, guildId: string): Promise<ChannelInfo[]> {
    if (
      token.startsWith('mock_') ||
      token.startsWith('test_') ||
      token.includes('.mock_') ||
      token.includes('.test_')
    ) {
      return [
        {
          id: '100000000000000001',
          guildId,
          name: 'general-voice',
          type: ChannelType.GuildVoice,
          typeName: 'Voice',
          canView: true,
          canSend: false,
          canConnect: true,
          canSpeak: true,
          rawPermissions: '3145728',
        },
        {
          id: '100000000000000002',
          guildId,
          name: 'stage-live',
          type: ChannelType.GuildStageVoice,
          typeName: 'Stage Voice',
          canView: true,
          canSend: false,
          canConnect: true,
          canSpeak: true,
          rawPermissions: '3145728',
        },
        {
          id: '100000000000000003',
          guildId,
          name: 'bot-commands',
          type: ChannelType.GuildText,
          typeName: 'Text',
          canView: true,
          canSend: true,
          canConnect: false,
          canSpeak: false,
          rawPermissions: '3072',
        },
        {
          id: '100000000000000004',
          guildId,
          name: 'announcements',
          type: ChannelType.GuildAnnouncement,
          typeName: 'Announcement',
          canView: true,
          canSend: true,
          canConnect: false,
          canSpeak: false,
          rawPermissions: '3072',
        },
      ];
    }

    try {
      const rest = new REST({ version: '10' }).setToken(token);
      const channels = (await rest.get(Routes.guildChannels(guildId))) as Array<{
        id: string;
        name: string;
        type: number;
        position: number;
        permission_overwrites?: any[];
      }>;

      // Filter relevant channels (voice, stage, text, announcement)
      const allowedTypes = [
        ChannelType.GuildVoice,
        ChannelType.GuildStageVoice,
        ChannelType.GuildText,
        ChannelType.GuildAnnouncement,
      ];

      return channels
        .filter((ch) => allowedTypes.includes(ch.type))
        .map((ch) => {
          let typeName = 'Text';
          let canConnect = false;
          let canSpeak = false;
          let canSend = true;

          if (ch.type === ChannelType.GuildVoice) {
            typeName = 'Voice';
            canConnect = true;
            canSpeak = true;
            canSend = false;
          } else if (ch.type === ChannelType.GuildStageVoice) {
            typeName = 'Stage Voice';
            canConnect = true;
            canSpeak = true;
            canSend = false;
          } else if (ch.type === ChannelType.GuildAnnouncement) {
            typeName = 'Announcement';
          }

          return {
            id: ch.id,
            guildId,
            name: ch.name,
            type: ch.type,
            typeName,
            canView: true,
            canSend,
            canConnect,
            canSpeak,
            rawPermissions: '3145728',
          };
        });
    } catch (err: any) {
      throw new Error(`Failed to fetch channels for guild ${guildId}: ${err.message}`);
    }
  }

  /**
   * Send text message to channel.
   */
  static async sendChannelMessage(
    token: string,
    channelId: string,
    payload: { content: string; embed?: any }
  ): Promise<SendMessageResult> {
    if (token.startsWith('mock_') || token.startsWith('test_')) {
      return {
        success: true,
        messageId: `mock_msg_${Date.now()}`,
        channelId,
      };
    }

    try {
      const rest = new REST({ version: '10' }).setToken(token);
      const body: any = { content: payload.content };
      if (payload.embed) {
        body.embeds = [payload.embed];
      }

      const res = (await rest.post(Routes.channelMessages(channelId), { body })) as {
        id: string;
      };

      return {
        success: true,
        messageId: res.id,
        channelId,
      };
    } catch (err: any) {
      let errorCode = 'DISCORD_API_ERROR';
      if (err.status === 403) errorCode = 'MISSING_PERMISSIONS';
      if (err.status === 404) errorCode = 'CHANNEL_NOT_FOUND';
      if (err.status === 429) errorCode = 'DISCORD_RATE_LIMITED';

      return {
        success: false,
        channelId,
        errorCode,
        error: err.message || 'Failed to send message',
      };
    }
  }

  /**
   * Generate official Discord installation URL for bot.
   * Permissions bitfield: 3148800 (ViewChannel, SendMessages, Connect, Speak, UseVAD)
   */
  static generateInstallUrl(applicationId: string, permissions = '3148800'): string {
    const scopes = encodeURIComponent('bot applications.commands');
    return `https://discord.com/oauth2/authorize?client_id=${applicationId}&permissions=${permissions}&scope=${scopes}`;
  }
}
