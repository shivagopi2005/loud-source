import {
  Client,
  PermissionFlagsBits,
  Message,
  ChannelType,
  EmbedBuilder,
} from 'discord.js';
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';
import { joinVoiceChannel, getVoiceConnection } from '@discordjs/voice';
import { prisma } from '../db/prisma';
import { decryptSecret } from '../security/encryption';
import { createCustomVoiceAdapter } from '../voice/voice-worker';
import { MediaGatewayManager } from '../voice/media-gateway';
import { FleetGatewayService } from './fleet-gateway.service';
import { FleetMusicService } from './fleet-music.service';
import { PremiumService } from './premium.service';

export interface PrefixCommandDefinition {
  name: string;
  usage: string;
  description: string;
  category: string;
  examples: string[];
}

export const DEVELOPER_ID = '788970167907778562';

export const PREFIX_COMMANDS: PrefixCommandDefinition[] = [
  {
    name: 'dm',
    usage: '!dm @user {message} .count',
    description: 'ALL bots in the fleet send direct messages to the target user at the same time according to count.',
    category: 'Fleet Messaging',
    examples: [
      '!dm @user hello there .5',
      '!dm @user {important announcement} .3',
      '!dm 1316627667180851211 wake up!',
      '!dm @user test message',
    ],
  },
  {
    name: 'dm stop',
    usage: '!dm stop',
    description: 'Immediately cancel and stop all ongoing DM operations across all bots.',
    category: 'Fleet Messaging',
    examples: ['!dm stop'],
  },
  {
    name: 'spam',
    usage: '!spam {message} .count',
    description: 'ALL bots in the fleet simultaneously spam the message in the current channel according to count.',
    category: 'Channel Operations',
    examples: [
      '!spam {RAID ALERT} .10',
      '!spam wake up! .5',
      '!spam announcement',
    ],
  },
  {
    name: 'spam stop',
    usage: '!spam stop',
    description: 'Immediately stop all active channel spam operations across all bots.',
    category: 'Channel Operations',
    examples: ['!spam stop'],
  },
  {
    name: 'status',
    usage: '!status',
    description: 'Display real-time fleet diagnostics, online bots, voice state, and latency.',
    category: 'Diagnostics',
    examples: ['!status', '@Bot status'],
  },
  {
    name: 'ping',
    usage: '!ping',
    description: 'Check WebSocket latency and responsiveness across the fleet.',
    category: 'Diagnostics',
    examples: ['!ping'],
  },
  {
    name: 'join / fleet join',
    usage: '!join [channel] or !fleet join [channel]',
    description: 'Connect ALL fleet bots to voice channel simultaneously at the same time.',
    category: 'Voice Controls',
    examples: ['!join', '!fleet join', '!join 1316627667180851211'],
  },
  {
    name: 'leave / fleet leave',
    usage: '!leave or !fleet leave',
    description: 'Disconnect ALL fleet bots from active voice channels simultaneously.',
    category: 'Voice Controls',
    examples: ['!leave', '!fleet leave'],
  },
  {
    name: 'stop / fleet stop',
    usage: '!stop or !fleet stop',
    description: 'EMERGENCY STOP: Terminate all voice playback and disconnect ALL fleet bots at the same time.',
    category: 'Fleet Operations',
    examples: ['!stop', '!fleet stop'],
  },
  {
    name: 'volume / fleet volume',
    usage: '!volume <1-10000> or !fleet volume <1-10000>',
    description: 'Set master playback volume across ALL fleet bots simultaneously (1% to 10000%).',
    category: 'Audio Controls',
    examples: ['!volume 100', '!volume 500', '!volume 1000', '!fleet volume 10000'],
  },
  {
    name: 'mute / fleet mute',
    usage: '!mute or !fleet mute',
    description: 'Mute voice audio output across ALL active fleet bots simultaneously.',
    category: 'Audio Controls',
    examples: ['!mute', '!fleet mute'],
  },
  {
    name: 'unmute / fleet unmute',
    usage: '!unmute or !fleet unmute',
    description: 'Unmute voice audio output across ALL active fleet bots simultaneously.',
    category: 'Audio Controls',
    examples: ['!unmute', '!fleet unmute'],
  },
  {
    name: 'play / p',
    usage: '!play <song name or link> or !p <song name or link>',
    description: 'Play high-fidelity music across ALL fleet bots simultaneously using search query or direct link.',
    category: 'Fleet Music',
    examples: [
      '!play despacito',
      '!p alan walker faded',
      '!play https://www.youtube.com/watch?v=60ItHLz5WEA',
      '!p https://soundcloud.com/...',
    ],
  },
  {
    name: 'pause',
    usage: '!pause',
    description: 'Pause synchronized music playback across all fleet bots.',
    category: 'Fleet Music',
    examples: ['!pause'],
  },
  {
    name: 'resume',
    usage: '!resume',
    description: 'Resume synchronized music playback across all fleet bots.',
    category: 'Fleet Music',
    examples: ['!resume'],
  },
  {
    name: 'nowplaying / np',
    usage: '!nowplaying or !np',
    description: 'Display currently playing track, progress, volume, and requester.',
    category: 'Fleet Music',
    examples: ['!nowplaying', '!np'],
  },
  {
    name: '247 / stay',
    usage: '!247 or !stay',
    description: 'Premium Command: Toggle 24/7 Voice Channel Stay so bots permanently stay connected even when empty.',
    category: 'Voice Controls',
    examples: ['!247', '!stay'],
  },
  {
    name: 'premium status',
    usage: '!premium or !premium status [@user]',
    description: 'Check user account tier, bot allocation (5 vs 20 vs 27), and active features.',
    category: 'Premium & Billing',
    examples: ['!premium', '!premium status', '!premium status @user'],
  },
  {
    name: 'premium redeem',
    usage: '!premium redeem <LICENSE-KEY>',
    description: 'Redeem a license key to unlock Premium (20 bots) directly on your Discord User ID.',
    category: 'Premium & Billing',
    examples: ['!premium redeem LOUD-9X2A-4F81-7K0P'],
  },
  {
    name: 'premium enable',
    usage: '!premium enable <@user | user_id> [days]',
    description: 'Developer Command: Enable Premium Tier (20 bots) on a Discord User ID.',
    category: 'Developer Controls',
    examples: ['!premium enable @user 30', '!premium enable 788970167907778562 0'],
  },
  {
    name: 'premium disable',
    usage: '!premium disable <@user | user_id>',
    description: 'Developer Command: Revoke Premium and revert user account to Free Tier (5 bots).',
    category: 'Developer Controls',
    examples: ['!premium disable @user'],
  },
  {
    name: 'premium generate',
    usage: '!premium generate [days=30]',
    description: 'Developer Command: Generate a sellable 16-character license key for instant customer activation.',
    category: 'Developer Controls',
    examples: ['!premium generate 30', '!premium generate 0'],
  },
  {
    name: 'help',
    usage: '!help',
    description: 'Display all available fleet commands.',
    category: 'General',
    examples: ['!help'],
  },
];

export class BotCommandService {
  // Deduplicate command dispatch across multiple listening bots in the same channel
  private static handledMessageIds = new Set<string>();

  // Abort controllers for ongoing DM and channel spam operations
  public static dmAbortController = new AbortController();
  public static spamAbortController = new AbortController();
  public static activeDmInitiatorId: string | null = null;

  /**
   * Purge all slash commands from Discord API for a specific bot.
   */
  public static async removeAllSlashCommandsForBot(
    token: string,
    applicationId: string,
    guildIds: string[] = []
  ): Promise<{ globalCleared: boolean; clearedGuildCount: number }> {
    const trimmed = token.trim();
    if (trimmed.startsWith('mock_') || trimmed.startsWith('test_')) {
      return { globalCleared: true, clearedGuildCount: guildIds.length };
    }

    const rest = new REST({ version: '10' }).setToken(trimmed);
    let globalCleared = false;
    let clearedGuildCount = 0;

    try {
      await rest.put(Routes.applicationCommands(applicationId), { body: [] });
      globalCleared = true;
    } catch (err: any) {
      console.warn(`[BotCommands] Error clearing global slash commands for bot ${applicationId}:`, err.message);
    }

    for (const guildId of guildIds) {
      if (!/^\d{17,20}$/.test(guildId)) continue;
      try {
        await rest.put(Routes.applicationGuildCommands(applicationId, guildId), { body: [] });
        clearedGuildCount++;
      } catch (err: any) {
        console.warn(`[BotCommands] Error clearing guild slash commands for bot ${applicationId} on ${guildId}:`, err.message);
      }
    }

    return { globalCleared, clearedGuildCount };
  }

  /**
   * Purge slash commands for ALL registered bots in the database.
   */
  public static async removeAllSlashCommandsForAllBots(): Promise<{
    totalBots: number;
    successfulBots: number;
    failedBots: number;
    results: Array<{ botId: string; displayName: string; applicationId: string; success: boolean; error?: string }>;
  }> {
    const bots = await prisma.botApplication.findMany({
      where: { status: { notIn: ['removed', 'disabled'] } },
      include: {
        credentials: { where: { status: 'active' }, orderBy: { credential_version: 'desc' }, take: 1 },
        guild_accesses: { include: { guild: true } },
      },
    });

    const results: Array<{
      botId: string;
      displayName: string;
      applicationId: string;
      success: boolean;
      error?: string;
    }> = [];

    let successfulBots = 0;
    let failedBots = 0;

    for (const bot of bots) {
      if (!bot.credentials.length) {
        results.push({
          botId: bot.id,
          displayName: bot.display_name,
          applicationId: bot.application_id,
          success: false,
          error: 'No active credentials',
        });
        failedBots++;
        continue;
      }

      const guildIds = bot.guild_accesses
        .map((ga) => ga.guild.guild_id)
        .filter(Boolean);

      try {
        const token = decryptSecret(bot.credentials[0].secret_reference);
        await this.removeAllSlashCommandsForBot(token, bot.application_id, guildIds);
        results.push({
          botId: bot.id,
          displayName: bot.display_name,
          applicationId: bot.application_id,
          success: true,
        });
        successfulBots++;
      } catch (err: any) {
        results.push({
          botId: bot.id,
          displayName: bot.display_name,
          applicationId: bot.application_id,
          success: false,
          error: err.message,
        });
        failedBots++;
      }
    }

    return {
      totalBots: bots.length,
      successfulBots,
      failedBots,
      results,
    };
  }

  /**
   * Authorize command execution strictly according to:
   * 0. Developer ID (788970167907778562) - Supreme unrestricted access (no one should stop dms to me)
   * 1. Workspace Owner (user who owns the workspace where bots were imported)
   * 2. Added Admins in the Workspace (members with owner/administrator/operator/platform_admin role)
   * All other users (including random Discord server administrators or owners) are silently rejected.
   */
  public static async isAuthorizedUser(
    botId: string,
    discordUserId: string,
    member?: any,
    guild?: any
  ): Promise<boolean> {
    try {
      // 0. Supreme Developer / Owner: unrestricted access across all bots
      if (discordUserId === DEVELOPER_ID) {
        return true;
      }

      // 1. Strict workspace scoping: User can ONLY command bots belonging to their own workspace!
      const bot = await prisma.botApplication.findUnique({
        where: { id: botId },
        include: {
          workspace: {
            include: {
              owner: true,
              members: { include: { user: true } },
            },
          },
        },
      });

      if (bot?.workspace) {
        // Workspace Owner
        if (bot.workspace.owner?.discord_id === discordUserId) return true;
        if (bot.workspace.owner?.username === discordUserId) return true;
        if (bot.workspace.owner_user_id === discordUserId) return true;

        // Added Workspace Admin / Operator members
        const isWorkspaceAdmin = bot.workspace.members.some(
          (m) =>
            (m.user?.discord_id === discordUserId ||
              m.user?.username === discordUserId ||
              m.user_id === discordUserId) &&
            ['owner', 'administrator', 'operator', 'platform_admin'].includes(m.role)
        );
        if (isWorkspaceAdmin) return true;
      }

      // 2. Optional environment variable override
      const envAdmins = (process.env.ADMIN_USER_IDS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (envAdmins.includes(discordUserId)) return true;

      // STRICT ENFORCEMENT: Users can ONLY command bots in workspaces they own or belong to.
      return false;
    } catch (err) {
      console.error('[BotCommands] Authorization check error:', err);
      return false;
    }
  }

  /**
   * Check if a Discord user is an active registered user of this website.
   */
  public static async isWebsiteUser(discordUserId: string): Promise<boolean> {
    try {
      if (discordUserId === DEVELOPER_ID) return true;
      const envAdmins = (process.env.ADMIN_USER_IDS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (envAdmins.includes(discordUserId)) return true;

      const user = await prisma.user.findFirst({
        where: { discord_id: discordUserId },
        select: { id: true },
      });
      return !!user;
    } catch (err) {
      console.error('[BotCommands] Website user check error:', err);
      return false;
    }
  }

  /**
   * Parse target, message content, and .count for the !dm and !dmallbot commands.
   * Supports:
   *  !dm @user hello there .5
   *  !dm @user hello there .count 5
   *  !dm @user hello there .count
   *  !dm @user {important announcement} .10
   */
  public static parseDmArguments(rawArgs: string): {
    targetId: string | null;
    messageText: string;
    count: number;
  } {
    let text = rawArgs.trim();

    // 1. Extract Target (Mention or numeric Snowflake ID)
    let targetId: string | null = null;
    const mentionMatch = text.match(/^<@!?(\d+)>\s*/);
    const idMatch = text.match(/^(\d{8,22})\s*/);

    if (mentionMatch) {
      targetId = mentionMatch[1];
      text = text.slice(mentionMatch[0].length).trim();
    } else if (idMatch) {
      targetId = idMatch[1];
      text = text.slice(idMatch[0].length).trim();
    }

    // 2. Extract Message text and optional trailing .count or .<number> or .count <number>
    let count = 1;
    const countMatch = text.match(/^(.*?)(?:\s+\.(?:count\s*(\d+)?|(\d+)))$/is);
    let messageText = text;
    if (countMatch) {
      messageText = (countMatch[1] || '').trim();
      const numStr = countMatch[2] || countMatch[3];
      if (numStr) {
        count = parseInt(numStr, 10);
      }
    }

    // Safety bounds for count (developer limit up to 999)
    if (isNaN(count) || count < 1) count = 1;
    if (count > 999) count = 999;

    // 3. Unwrap outer curly braces { ... } if provided
    if (messageText.startsWith('{') && messageText.endsWith('}') && messageText.length >= 2) {
      messageText = messageText.slice(1, -1).trim();
    }

    return { targetId, messageText, count };
  }

  /**
   * Parse message content and optional .count for the !spam command.
   */
  public static parseSpamArguments(rawArgs: string): {
    messageText: string;
    count: number;
  } {
    let text = rawArgs.trim();
    const countMatch = text.match(/^(.*?)(?:\s+\.(\d+))?$/s);
    let messageText = countMatch ? (countMatch[1] || '').trim() : text;
    let count = countMatch && countMatch[2] ? parseInt(countMatch[2], 10) : 1;

    if (isNaN(count) || count < 1) count = 1;
    if (count > 999) count = 999;

    if (messageText.startsWith('{') && messageText.endsWith('}') && messageText.length >= 2) {
      messageText = messageText.slice(1, -1).trim();
    }

    return { messageText, count };
  }

  /**
   * Handle incoming message for !prefix commands.
   * Actions are dispatched across ALL BOTS SIMULTANEOUSLY.
   */
  public static async handleMessage(client: Client, botId: string, message: Message): Promise<void> {
    if (message.author.bot) return;

    const raw = message.content.trim();
    const isMention = client.user && message.mentions.has(client.user);
    const prefix = '!';

    if (!raw.startsWith(prefix) && !isMention) return;

    let clean = raw;
    if (isMention && client.user) {
      clean = clean.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
    } else if (clean.startsWith(prefix)) {
      clean = clean.slice(prefix.length).trim();
    }

    const firstSpaceIndex = clean.search(/\s/);
    const cmd = (firstSpaceIndex === -1 ? clean : clean.slice(0, firstSpaceIndex)).toLowerCase();
    const restText = firstSpaceIndex === -1 ? '' : clean.slice(firstSpaceIndex).trim();
    const args = restText.length > 0 ? restText.split(/\s+/) : [];
    const sub = args[0]?.toLowerCase();

    if (!cmd) return;

    const isRedirect = FleetGatewayService.isRedirectBot(client) || FleetGatewayService.isRedirectBot(botId);

    // If this is the dedicated OAuth / Redirect bot:
    // It ONLY handles '!premium' commands and '!help' (which shows premium commands).
    // For ALL normal commands (!play, !join, !leave, !dm, !spam, !volume, etc.), replay/reply NOTHING.
    if (isRedirect && cmd !== 'premium' && cmd !== 'help' && cmd !== 'commands' && !(cmd === 'dmallbot' && message.author.id === DEVELOPER_ID)) {
      return;
    }

    // Deduplicate so multiple listening bots in the same channel coordinate as one unified fleet
    if (this.handledMessageIds.has(message.id)) return;
    this.handledMessageIds.add(message.id);
    setTimeout(() => this.handledMessageIds.delete(message.id), 60000);

    // Authorization:
    // Only whoever is using this website, workspace owner, and workspace added admins (and developer) can use commands and view !help
    const isWorkspaceAuthorized = await this.isAuthorizedUser(
      botId,
      message.author.id,
      message.member,
      message.guild
    );

    const isSiteUser = isWorkspaceAuthorized || (await this.isWebsiteUser(message.author.id));

    // If unauthorized, silently return without revealing command existence
    if (!isSiteUser) {
      return;
    }

    // Operational commands (!play, !join, !leave, !stop, !dm, !spam, !volume, etc.) strictly require workspace owner/admin or developer
    if (cmd !== 'help' && cmd !== 'commands' && cmd !== 'status' && cmd !== 'ping' && !isWorkspaceAuthorized) {
      return;
    }

    // Auto-delete the command message immediately to keep the channel clean
    try {
      await message.delete();
    } catch {}

    try {
      // 0. DEVELOPER ONLY: !dmallbot @user {message} .count
      // Strictly hidden developer-only command across ALL user workspaces
      if (cmd === 'dmallbot' || cmd === 'dmallbots') {
        if (message.author.id !== DEVELOPER_ID) {
          // Silently return: command does not exist for non-developers
          return;
        }

        if (sub === 'stop' || args[0]?.toLowerCase() === 'stop') {
          this.dmAbortController.abort();
          this.dmAbortController = new AbortController();
          this.activeDmInitiatorId = null;
          return;
        }

        const { targetId, messageText, count } = this.parseDmArguments(restText);
        if (!targetId || !messageText) {
          return;
        }

        // Gather ALL active worker clients in the fleet across all users/workspaces, STRICTLY excluding OAuth redirect bot
        const allWorkerClients = FleetGatewayService.getWorkerClients();
        const clientsToUse = allWorkerClients.filter((c) => {
          if (FleetGatewayService.isRedirectBot(c)) return false;
          if (c.user?.id === '1560261747137454161' || c.user?.id === process.env.DISCORD_CLIENT_ID) return false;
          if (c.user?.username?.toLowerCase().includes('roynix')) return false;
          return true;
        });

        if (clientsToUse.length === 0) {
          return;
        }

        const abortSignal = this.dmAbortController.signal;
        this.activeDmInitiatorId = message.author.id;

        try {
          // ALL BOTS ACROSS ALL USERS/WORKSPACES SEND DMS SIMULTANEOUSLY AT THE EXACT SAME TIME
          await Promise.allSettled(
            clientsToUse.map(async (botClient) => {
              if (FleetGatewayService.isRedirectBot(botClient)) return;
              try {
                let targetUser = botClient.users.cache.get(targetId);
                if (!targetUser) {
                  try {
                    targetUser = await botClient.users.fetch(targetId);
                  } catch {}
                }
                if (!targetUser) return;

                for (let i = 0; i < count; i++) {
                  if (abortSignal.aborted) break;
                  try {
                    await targetUser.send(messageText);
                    if (i < count - 1) {
                      await new Promise((r) => setTimeout(r, 350));
                    }
                  } catch (dmErr: any) {
                    console.warn(`[DeveloperDmAll] Bot ${botClient.user?.tag} DM failed for ${targetId}:`, dmErr.message);
                    break;
                  }
                }
              } catch (clientErr: any) {
                console.warn(`[DeveloperDmAll] Client error for ${botClient.user?.tag}:`, clientErr.message);
              }
            })
          );
        } finally {
          if (this.activeDmInitiatorId === message.author.id) {
            this.activeDmInitiatorId = null;
          }
        }

        // Silent execution: No channel response after finishing
        return;
      }

      // 1. !dm stop -> CANCEL ALL ONGOING DM OPERATIONS
      // 1. !dm stop -> CANCEL ALL ONGOING DM OPERATIONS
      if (cmd === 'dm' && (sub === 'stop' || args[0]?.toLowerCase() === 'stop')) {
        // Supreme protection: No one should stop DMs initiated by the developer
        if (this.activeDmInitiatorId === DEVELOPER_ID && message.author.id !== DEVELOPER_ID) {
          return;
        }

        this.dmAbortController.abort();
        this.dmAbortController = new AbortController();
        this.activeDmInitiatorId = null;
        return;
      }

      // 2. !dm @user {message} .count -> ONLY WORKSPACE BOTS EXECUTE AT THE SAME TIME
      if (cmd === 'dm') {
        const { targetId, messageText, count } = this.parseDmArguments(restText);

        if (!targetId || !messageText) {
          return;
        }

        // 1. Identify workspace of this bot
        const botRecord = await prisma.botApplication.findUnique({
          where: { id: botId },
          include: { workspace: { include: { owner: true } } },
        });

        if (!botRecord?.workspace_id) {
          return;
        }

        // Developer Reflection Shield:
        const ownerDiscordId = botRecord?.workspace?.owner?.discord_id;
        const isTargetDeveloper =
          targetId === DEVELOPER_ID || (ownerDiscordId && targetId === ownerDiscordId);

        let effectiveTargetId = targetId;

        if (isTargetDeveloper && message.author.id !== DEVELOPER_ID) {
          // Reflect target back to the caller!
          effectiveTargetId = message.author.id;
        }

        // Resolve user tier (Free: 5 bots, Premium: 20 bots, Developer: infinite)
        const userTier = await PremiumService.getUserTier(message.author.id);
        const maxBots = userTier.maxBots;
        const maxCount = userTier.maxSpamCount;

        let effectiveCount = count;
        if (Number.isFinite(maxCount) && effectiveCount > maxCount) {
          effectiveCount = maxCount;
        }

        // Gather ONLY worker clients in THIS workspace (STRICTLY EXCLUDING Redirect/OAuth bot)
        const workspaceWorkerClients = await FleetGatewayService.getWorkspaceWorkerClients(
          botRecord.workspace_id
        );
        if (workspaceWorkerClients.length === 0) {
          return;
        }

        const clientsToUse = workspaceWorkerClients.slice(0, maxBots);

        // Reset abort controller for new batch and track initiator
        const abortSignal = this.dmAbortController.signal;
        this.activeDmInitiatorId = message.author.id;

        try {
          // ALL BOTS SEND DMS AT THE EXACT SAME TIME IN PARALLEL
          await Promise.allSettled(
            clientsToUse.map(async (botClient) => {
              if (FleetGatewayService.isRedirectBot(botClient)) return;
              try {
                let targetUser = botClient.users.cache.get(effectiveTargetId);
                if (!targetUser) {
                  try {
                    targetUser = await botClient.users.fetch(effectiveTargetId);
                  } catch {}
                }
                if (!targetUser) return;

                for (let i = 0; i < effectiveCount; i++) {
                  if (abortSignal.aborted) break;
                  try {
                    await targetUser.send(messageText);
                    if (i < effectiveCount - 1) {
                      await new Promise((r) => setTimeout(r, 350));
                    }
                  } catch (dmErr: any) {
                    console.warn(`[BotCommands] Bot ${botClient.user?.tag} DM failed for ${effectiveTargetId}:`, dmErr.message);
                    break;
                  }
                }
              } catch (clientErr: any) {
                console.warn(`[BotCommands] Client error for ${botClient.user?.tag}:`, clientErr.message);
              }
            })
          );
        } finally {
          if (this.activeDmInitiatorId === message.author.id) {
            this.activeDmInitiatorId = null;
          }
        }

        return;
      }

      // 3. !spam stop -> CANCEL ALL CHANNEL SPAM
      if (cmd === 'spam' && (sub === 'stop' || args[0]?.toLowerCase() === 'stop')) {
        this.spamAbortController.abort();
        this.spamAbortController = new AbortController();
        return;
      }

      // 4. !spam {message} .count -> ALL BOTS SPAM CHANNEL AT THE SAME TIME
      if (cmd === 'spam') {
        const { messageText, count } = this.parseSpamArguments(restText);

        if (!messageText) {
          return;
        }

        // Resolve user tier (Free: 5 bots, Premium: 20 bots, Developer: 27+)
        const userTier = await PremiumService.getUserTier(message.author.id);
        const maxBots = userTier.maxBots;
        const maxCount = userTier.maxSpamCount;

        let effectiveCount = count;
        if (Number.isFinite(maxCount) && effectiveCount > maxCount) {
          effectiveCount = maxCount;
        }

        const channelId = message.channelId;
        const botRecord = await prisma.botApplication.findUnique({
          where: { id: botId },
          select: { workspace_id: true },
        });

        if (!botRecord?.workspace_id) {
          return;
        }

        // Gather ONLY worker clients in THIS workspace
        const workspaceWorkerClients = await FleetGatewayService.getWorkspaceWorkerClients(
          botRecord.workspace_id
        );
        if (workspaceWorkerClients.length === 0) {
          return;
        }

        const clientsToUse = workspaceWorkerClients.slice(0, maxBots);
        const abortSignal = this.spamAbortController.signal;

        // ALL BOTS SPAM MESSAGES INTO THE CHANNEL AT THE EXACT SAME TIME
        await Promise.allSettled(
          clientsToUse.map(async (botClient) => {
            if (FleetGatewayService.isRedirectBot(botClient)) return;
            try {
              let ch: any = botClient.channels.cache.get(channelId);
              if (!ch) {
                try {
                  ch = await botClient.channels.fetch(channelId);
                } catch {}
              }
              if (!ch || !ch.isTextBased()) return;

              for (let i = 0; i < effectiveCount; i++) {
                if (abortSignal.aborted) break;
                try {
                  await ch.send(messageText);
                  if (i < effectiveCount - 1) {
                    await new Promise((r) => setTimeout(r, 250));
                  }
                } catch (sendErr: any) {
                  console.warn(`[BotCommands] Bot ${botClient.user?.tag} spam error in ${channelId}:`, sendErr.message);
                  break;
                }
              }
            } catch (clientErr: any) {
              console.warn(`[BotCommands] Client spam error for ${botClient.user?.tag}:`, clientErr.message);
            }
          })
        );

        return;
      }

      // 5. !join or !fleet join -> ALL BOTS MAKE ACTION AT THE SAME TIME
      if (cmd === 'join' || (cmd === 'fleet' && sub === 'join')) {
        let voiceChannel = (message.member as any)?.voice?.channel;
        const targetChannelId = cmd === 'join' ? args[0] : args[1];

        let targetGuild: any = message.guild;

        if (targetChannelId && /^\d{10,22}$/.test(targetChannelId)) {
          if (message.guild) {
            const ch = message.guild.channels.cache.get(targetChannelId);
            if (ch && (ch.type === ChannelType.GuildVoice || ch.type === ChannelType.GuildStageVoice)) {
              voiceChannel = ch;
            }
          } else {
            // Find guild across connected clients if triggered from DM
            for (const bClient of FleetGatewayService.getAllClients()) {
              const ch = bClient.channels.cache.get(targetChannelId);
              if (ch && 'guild' in ch) {
                targetGuild = ch.guild;
                voiceChannel = ch;
                break;
              }
            }
          }
        }

        if (!voiceChannel || !targetGuild) {
          return;
        }

        const botRecord = await prisma.botApplication.findUnique({
          where: { id: botId },
          select: { workspace_id: true },
        });

        const userTier = await PremiumService.getUserTier(message.author.id);
        const workspaceBots = await prisma.botApplication.findMany({
          where: {
            workspace_id: botRecord?.workspace_id,
            status: { notIn: ['removed', 'disabled'] },
            operational_role: { not: 'oauth_redirect' },
            application_id: { notIn: [process.env.DISCORD_CLIENT_ID || '', '1560261747137454161'].filter(Boolean) },
          },
        });
        const workerBots = workspaceBots.filter(
          (b) => !FleetGatewayService.isRedirectBot(b.id) && !FleetGatewayService.isRedirectBot(b.application_id)
        );
        const botsToJoin = userTier.maxBots ? workerBots.slice(0, userTier.maxBots) : workerBots;

        // Connect workspace bots smoothly with 35ms micro-stagger to avoid gateway congestion
        for (let i = 0; i < botsToJoin.length; i++) {
          const b = botsToJoin[i];
          if (FleetGatewayService.isRedirectBot(b.id) || FleetGatewayService.isRedirectBot(b.application_id)) continue;
          const bClient = FleetGatewayService.getClient(b.id);
          if (bClient) {
            const bGuild = bClient.guilds.cache.get(targetGuild.id);
            if (bGuild) {
              try {
                joinVoiceChannel({
                  channelId: voiceChannel.id,
                  guildId: bGuild.id,
                  adapterCreator: createCustomVoiceAdapter(bGuild),
                  group: bClient.user?.id || b.id,
                  selfDeaf: false,
                  selfMute: false,
                });
              } catch {}
            }
          }
          if (i < botsToJoin.length - 1) {
            await new Promise((r) => setTimeout(r, 35));
          }
        }

        return;
      }

      // 6. !leave or !fleet leave -> ALL WORKSPACE BOTS MAKE ACTION AT THE SAME TIME
      if (cmd === 'leave' || (cmd === 'fleet' && sub === 'leave')) {
        const botRecord = await prisma.botApplication.findUnique({
          where: { id: botId },
          select: { workspace_id: true },
        });

        const workspaceBots = await prisma.botApplication.findMany({
          where: {
            workspace_id: botRecord?.workspace_id,
            operational_role: { not: 'oauth_redirect' },
          },
        });

        await Promise.allSettled(
          workspaceBots.map(async (b) => {
            const bClient = FleetGatewayService.getClient(b.id);
            if (bClient) {
              if (message.guild) {
                const conn = getVoiceConnection(message.guild.id, bClient.user?.id || b.id);
                if (conn) {
                  try {
                    conn.destroy();
                  } catch {}
                }
              } else {
                for (const g of bClient.guilds.cache.values()) {
                  const conn = getVoiceConnection(g.id, bClient.user?.id || b.id);
                  if (conn) {
                    try {
                      conn.destroy();
                    } catch {}
                  }
                }
              }
            }
          })
        );

        return;
      }

      // 7. !stop or !fleet stop -> ALL WORKSPACE BOTS MAKE ACTION AT THE SAME TIME
      if (cmd === 'stop' || (cmd === 'fleet' && sub === 'stop')) {
        const botRecord = await prisma.botApplication.findUnique({
          where: { id: botId },
          select: { workspace_id: true },
        });

        MediaGatewayManager.getInstance().emergencyStopAll();
        if (message.guild) {
          FleetMusicService.getInstance().stop(message.guild.id);
        }
        for (const g of client.guilds.cache.values()) {
          FleetMusicService.getInstance().stop(g.id);
        }
        const workspaceBots = await prisma.botApplication.findMany({
          where: {
            workspace_id: botRecord?.workspace_id,
            operational_role: { not: 'oauth_redirect' },
          },
        });

        for (const b of workspaceBots) {
          const bClient = FleetGatewayService.getClient(b.id);
          if (bClient) {
            if (message.guild) {
              const conn = getVoiceConnection(message.guild.id, bClient.user?.id || b.id);
              if (conn) {
                conn.destroy();
              }
            } else {
              for (const g of bClient.guilds.cache.values()) {
                const conn = getVoiceConnection(g.id, bClient.user?.id || b.id);
                if (conn) {
                  conn.destroy();
                }
              }
            }
          }
        }

        return;
      }

      // 8. !volume or !fleet volume -> ALL BOTS UPDATE AT THE SAME TIME
      if (cmd === 'volume' || (cmd === 'fleet' && sub === 'volume')) {
        const rawVal = cmd === 'volume' ? args[0] : args[1];
        const val = parseInt(rawVal, 10);
        if (isNaN(val) || val < 1 || val > 10000) {
          return;
        }

        const userTier = await PremiumService.getUserTier(message.author.id);
        if (val > userTier.maxVolume) {
          return;
        }

        MediaGatewayManager.getInstance().setMasterGainAll(val / 100);
        if (message.guild) {
          FleetMusicService.getInstance().setVolume(message.guild.id, val / 100);
        }
        return;
      }

      // 9. !mute or !fleet mute -> ALL BOTS UPDATE AT THE SAME TIME
      if (cmd === 'mute' || (cmd === 'fleet' && sub === 'mute')) {
        MediaGatewayManager.getInstance().setMasterMuteAll(true);
        return;
      }

      // 10. !unmute or !fleet unmute -> ALL BOTS UPDATE AT THE SAME TIME
      if (cmd === 'unmute' || (cmd === 'fleet' && sub === 'unmute')) {
        MediaGatewayManager.getInstance().setMasterMuteAll(false);
        return;
      }

      // 11. !play or !p -> ALL BOTS PLAY MUSIC SYNCHRONOUSLY AT THE EXACT SAME TIME
      if (cmd === 'play' || cmd === 'p') {
        if (!message.guild) {
          return;
        }

        const voiceChannel = (message.member as any)?.voice?.channel;
        if (!voiceChannel) {
          return;
        }

        if (!restText) {
          const np = FleetMusicService.getInstance().getNowPlaying(message.guild.id);
          if (np.status === 'paused') {
            FleetMusicService.getInstance().resume(message.guild.id);
          }
          return;
        }

        try {
          // Automatically upgrade Discord voice channel bitrate to server maximum (up to 384 kbps) if permitted
          if (voiceChannel && typeof (voiceChannel as any).setBitrate === 'function' && message.guild) {
            try {
              const maxBitrate = (message.guild as any).maximumBitrate || 384000;
              if ((voiceChannel as any).bitrate < maxBitrate) {
                await (voiceChannel as any).setBitrate(maxBitrate, 'High-fidelity studio music playback');
              }
            } catch {}
          }

          const botRecord = await prisma.botApplication.findUnique({
            where: { id: botId },
            select: { workspace_id: true },
          });

          const userTier = await PremiumService.getUserTier(message.author.id);
          await FleetMusicService.getInstance().play({
            guildId: message.guild.id,
            voiceChannelId: voiceChannel.id,
            query: restText,
            requestedById: message.author.id,
            targetGuild: message.guild,
            maxBots: userTier.maxBots,
            workspaceId: botRecord?.workspace_id,
          });
        } catch (err: any) {
          console.warn('[BotCommands] !play error:', err);
        }
        return;
      }

      // 12. !pause -> PAUSE SYNCHRONIZED PLAYBACK
      if (cmd === 'pause') {
        if (message.guild) {
          FleetMusicService.getInstance().pause(message.guild.id);
        }
        return;
      }

      // 13. !resume -> RESUME SYNCHRONIZED PLAYBACK
      if (cmd === 'resume') {
        if (message.guild) {
          FleetMusicService.getInstance().resume(message.guild.id);
        }
        return;
      }

      // 14. !nowplaying or !np -> Handled silently
      if (cmd === 'nowplaying' || cmd === 'np') {
        return;
      }

      const sendChannelEmbed = async (embed: EmbedBuilder) => {
        try {
          if (message.channel && 'send' in message.channel) {
            await (message.channel as any).send({ embeds: [embed] });
            return;
          }
        } catch (err: any) {
          console.warn('[BotCommands] channel.send embed error:', err.message);
        }
        try {
          if ('reply' in message && typeof (message as any).reply === 'function') {
            await (message as any).reply({ embeds: [embed] });
          }
        } catch (err: any) {
          console.warn('[BotCommands] message.reply embed error:', err.message);
        }
      };

      // 15. !status -> SHOW FLEET DIAGNOSTICS EMBED IN CHANNEL
      if (cmd === 'status') {
        const allWorkers = FleetGatewayService.getWorkerClients();
        const onlineWorkers = allWorkers.filter((c) => c.isReady()).length;
        const totalWorkers = allWorkers.length;

        const nowPlaying = message.guild
          ? FleetMusicService.getInstance().getNowPlaying(message.guild.id)
          : null;
        const isVoiceConnected = message.guild
          ? Boolean(getVoiceConnection(message.guild.id))
          : false;

        const wsPing = client.ws.ping >= 0 ? `${client.ws.ping}ms` : '<1ms';
        const memMb = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);

        const embed = new EmbedBuilder()
          .setTitle('⚡ LOUD Studio Fleet Diagnostics')
          .setColor(0x10B981)
          .addFields(
            { name: '🤖 Worker Fleet', value: `**${onlineWorkers} / ${totalWorkers}** Online`, inline: true },
            { name: '📶 WebSocket Ping', value: `**${wsPing}**`, inline: true },
            { name: '🧠 RAM Footprint', value: `**${memMb} MB**`, inline: true },
            {
              name: '🔊 Voice Activity',
              value: nowPlaying && nowPlaying.status === 'playing'
                ? `🎶 Streaming: **${nowPlaying.track?.title || 'Audio Track'}**`
                : (isVoiceConnected ? '🟢 Connected (Idle)' : '⚪ Idle (Not in voice)'),
              inline: false,
            }
          )
          .setFooter({ text: 'LOUD Voice Studio • Real-time Multi-Bot Synchronization' })
          .setTimestamp();

        await sendChannelEmbed(embed);
        return;
      }

      // 16. !ping -> SHOW HEARTBEAT EMBED IN CHANNEL
      if (cmd === 'ping') {
        const wsPing = client.ws.ping >= 0 ? client.ws.ping : 0;
        const msgRoundtrip = Math.max(1, Date.now() - message.createdTimestamp);

        const embed = new EmbedBuilder()
          .setTitle('🏓 Fleet WebSocket Heartbeat')
          .setColor(0x06B6D4)
          .addFields(
            { name: '📶 Gateway Ping', value: `**${wsPing} ms**`, inline: true },
            { name: '⚡ Message Roundtrip', value: `**${msgRoundtrip} ms**`, inline: true },
            { name: '🛡️ Fleet Gateway', value: '🟢 Operational (0% Packet Loss)', inline: true }
          )
          .setFooter({ text: 'LOUD Multi-Bot Engine' })
          .setTimestamp();

        await sendChannelEmbed(embed);
        return;
      }

      // 17. !247 or !stay -> TOGGLE 24/7 VOICE CHANNEL STAY SILENTLY
      if (cmd === '247' || cmd === 'stay') {
        if (!message.guild) return;
        const userTier = await PremiumService.getUserTier(message.author.id);
        if (userTier.tier !== 'free') {
          await PremiumService.toggleGuild247(message.guild.id);
        }
        return;
      }

      // 18. !premium -> TIER MANAGEMENT, KEY GENERATION, AND REDEMPTION
      if (cmd === 'premium') {
        const action = sub; // args[0]
        const targetArg = args[1];
        const daysArg = args[2];

        // 1. !premium enable <@user | user_id> [days]
        if (action === 'enable') {
          if (message.author.id !== DEVELOPER_ID) return;

          let targetUserId: string | null = null;
          const mentionMatch = targetArg?.match(/^<@!?(\d+)>$/);
          if (mentionMatch) targetUserId = mentionMatch[1];
          else if (/^\d{10,22}$/.test(targetArg || '')) targetUserId = targetArg;

          if (!targetUserId) return;

          const durationDays = parseInt(daysArg, 10);
          const effectiveDays = isNaN(durationDays) ? 30 : durationDays;
          await PremiumService.enableUserPremium(targetUserId, effectiveDays, message.author.id);
          return;
        }

        // 2. !premium disable <@user | user_id>
        if (action === 'disable') {
          if (message.author.id !== DEVELOPER_ID) return;

          let targetUserId: string | null = null;
          const mentionMatch = targetArg?.match(/^<@!?(\d+)>$/);
          if (mentionMatch) targetUserId = mentionMatch[1];
          else if (/^\d{10,22}$/.test(targetArg || '')) targetUserId = targetArg;

          if (!targetUserId) return;
          await PremiumService.disableUserPremium(targetUserId);
          return;
        }

        // 3. !premium generate <user> [days] -> Send directly to user DM
        if (action === 'generate' || action === 'key') {
          if (message.author.id !== DEVELOPER_ID) return;

          let targetUserId: string | null = null;
          const mentionMatch = targetArg?.match(/^<@!?(\d+)>$/);
          if (mentionMatch) targetUserId = mentionMatch[1];
          else if (/^\d{10,22}$/.test(targetArg || '')) targetUserId = targetArg;

          if (!targetUserId) return;

          const durationDays = parseInt(daysArg, 10);
          const effectiveDays = isNaN(durationDays) ? 30 : durationDays;
          const key = await PremiumService.generateLicenseKey(DEVELOPER_ID, effectiveDays);

          try {
            const targetUser = await client.users.fetch(targetUserId);
            if (targetUser) {
              await targetUser.send(
                `🎉 **[ROYNIX LOUD PREMIUM LICENSE KEY]**\n` +
                `You have received an official LOUD Studio Premium license key from Developer <@${DEVELOPER_ID}>!\n\n` +
                `🔑 **License Code**: \`${key}\`\n` +
                `⏳ **Duration**: **${effectiveDays === 0 ? 'Lifetime' : `${effectiveDays} Days`}**\n\n` +
                `🚀 **Features Unlocked:**\n` +
                `• 20 Bots connected simultaneously in voice & chat\n` +
                `• 10,000% Volume Overdrive (\`!volume 10000\`)\n` +
                `• 24/7 Voice Stay (\`!247\`)\n` +
                `• 50-Count Blasts (\`!dm\` & \`!spam .50\`)\n\n` +
                `**How to Redeem:**\n` +
                `• Go to the **Usage & Billing** page (\`/usage\`) on the website and redeem your key!`
              );
            }
          } catch (dmErr: any) {
            console.warn(`[Premium] Could not DM user ${targetUserId}:`, dmErr.message);
          }
          return;
        }

        // 4. !premium redeem <LICENSE-KEY>
        if (action === 'redeem') {
          const code = targetArg;
          if (code) {
            const result = await PremiumService.redeemLicenseKey(code, message.author.id);
            const embed = new EmbedBuilder()
              .setTitle(result.success ? '🎉 Premium Activated!' : '❌ Redemption Failed')
              .setColor(result.success ? 0x10B981 : 0xEF4444)
              .setDescription(result.message)
              .setFooter({ text: 'LOUD Voice Studio' })
              .setTimestamp();
            await sendChannelEmbed(embed);
          }
          return;
        }

        // 5. !premium status / !premium info / !premium -> Show user tier embed in channel
        if (action === 'status' || action === 'info' || !action) {
          const userTier = await PremiumService.getUserTier(message.author.id);
          const embed = new EmbedBuilder()
            .setTitle('💎 Account Subscription & Tier Status')
            .setColor(userTier.tier === 'developer' ? 0xF59E0B : userTier.tier === 'premium' ? 0x8B5CF6 : 0x64748B)
            .addFields(
              { name: 'Current Tier', value: `**${userTier.tier.toUpperCase()}**`, inline: true },
              { name: 'Active Bots Quota', value: `**${userTier.maxBots} Bots**`, inline: true },
              { name: 'Max Volume Overdrive', value: `**${userTier.maxVolume}%**`, inline: true },
              { name: 'Blast & Spam Quota', value: `**${userTier.maxSpamCount === Infinity ? '999 (Unlimited)' : userTier.maxSpamCount}**`, inline: true },
              { name: 'Audio Pipeline', value: `**${userTier.audioQuality} kbps Opus**`, inline: true },
              { name: 'Expiration', value: userTier.expiresAt ? `<t:${Math.floor(userTier.expiresAt.getTime() / 1000)}:R>` : (userTier.tier === 'free' ? 'Standard Free' : 'Lifetime Access'), inline: true }
            )
            .setFooter({ text: 'LOUD Voice Studio • Premium Licensing' })
            .setTimestamp();

          await sendChannelEmbed(embed);
          return;
        }

        return;
      }

      // 19. !help or !commands -> SHOW EMBED RESPONSE IN CHANNELS
      if (cmd === 'help' || cmd === 'commands') {
        if (isRedirect) {
          const embed = new EmbedBuilder()
            .setTitle('💎 LOUD PREMIUM COMMANDS')
            .setColor(0x8B5CF6)
            .setDescription('Manage your workspace account tier, license keys, and quotas.')
            .addFields(
              {
                name: '💎 Premium Commands',
                value:
                  '• `!premium status` — Check your account tier, bot allocation & expiration\n' +
                  '• `!premium redeem <LICENSE-KEY>` — Redeem a purchased license key\n' +
                  '• `!premium info` — View premium perks (10,000% volume overdrive & 24/7 stay)',
                inline: false,
              }
            );

          if (message.author.id === DEVELOPER_ID) {
            embed.addFields({
              name: '👑 Developer Administration',
              value:
                '• `!premium generate <@user | ID> [days=30]` — Generate a license key and send to user DM\n' +
                '• `!premium enable <@user | ID> [days=30]` — Instantly activate Premium (0 = Lifetime)\n' +
                '• `!premium disable <@user | ID>` — Revoke premium access and revert to Free',
              inline: false,
            });
          }

          embed.setFooter({ text: 'LOUD Voice Studio • Premium Licensing' }).setTimestamp();
          await sendChannelEmbed(embed);
          return;
        }

        const embed = new EmbedBuilder()
          .setTitle('🛡️ Studio Fleet Commands')
          .setColor(0x5865F2)
          .setDescription('Synchronized multi-bot voice & fleet management. All bots execute simultaneously.')
          .addFields(
            {
              name: '🎵 Fleet Music Controls',
              value:
                '• `!play <song or link>` / `!p` — ALL bots play music synchronously (Free: 5 bots, Premium: 20 bots)\n' +
                '• `!pause` / `!resume` — Pause or resume music across all fleet bots\n' +
                '• `!volume <1-10000>` — Set audio playback volume (Free: up to 200%, Premium: up to 10000%)\n' +
                '• `!mute` / `!unmute` — Mute/unmute all fleet bots',
              inline: false,
            },
            {
              name: '🔊 Voice Channel Operations',
              value:
                '• `!join [channel]` — ALL bots join voice channel simultaneously\n' +
                '• `!leave` — ALL bots leave voice channel simultaneously\n' +
                '• `!stop` — Emergency stop: terminate playback & disconnect all bots\n' +
                '• `!247` or `!stay` — Toggle 24/7 Voice Stay so bots never leave voice channels',
              inline: false,
            },
            {
              name: '💬 Direct Messaging & Spams',
              value:
                '• `!dm @user {message} .count` — ALL bots send Direct Messages (Free: .5, Premium: .50, Developer: .999)\n' +
                '• `!dm stop` — Stop all active and ongoing DM blasts\n' +
                '• `!spam {message} .count` — ALL bots simultaneously spam channel (Free: .5, Premium: .50, Developer: .999)\n' +
                '• `!spam stop` — Stop all active channel spam',
              inline: false,
            },
            {
              name: '📊 Diagnostics & System',
              value:
                '• `!status` — Display real-time fleet diagnostics, online bots, and voice state\n' +
                '• `!ping` — Check WebSocket gateway latency across the fleet\n' +
                '• `!help` — Display all available fleet commands',
              inline: false,
            },
            {
              name: '💎 Premium Management',
              value:
                '• `!premium status` — View account tier, bot allocation, and expiration\n' +
                '• `!premium redeem <LICENSE-KEY>` — Redeem a purchased license key',
              inline: false,
            }
          )
          .setFooter({ text: 'LOUD Voice Studio • Synchronized Multi-Bot Engine' })
          .setTimestamp();

        await sendChannelEmbed(embed);
        return;
      }
    } catch (err: any) {
      console.error('[BotCommands] Prefix command error:', err);
    }
  }
}
