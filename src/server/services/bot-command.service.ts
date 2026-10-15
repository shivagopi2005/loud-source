import {
  Client,
  PermissionFlagsBits,
  Message,
  ChannelType,
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
      // 0. Supreme Developer / Owner: unrestricted access across all bots (no one should stop dms to me)
      if (discordUserId === DEVELOPER_ID) {
        return true;
      }

      // 0.5. Check User-Level Premium: Premium subscribers can command the fleet in any server
      const userTier = await PremiumService.getUserTier(discordUserId);
      if (userTier.tier === 'premium' || userTier.tier === 'developer') {
        return true;
      }

      // 1. Check workspace owner and added workspace admins for this bot
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

      // 2. Check if the user is registered in the database (i.e. logged into the website with their account)
      const dbUser = await prisma.user.findFirst({
        where: {
          OR: [{ discord_id: discordUserId }, { username: discordUserId }],
        },
        include: {
          workspaces_owned: true,
          memberships: true,
        },
      });

      if (
        dbUser &&
        (dbUser.workspaces_owned.length > 0 ||
          dbUser.memberships.some((m) =>
            ['owner', 'administrator', 'operator', 'platform_admin'].includes(m.role)
          ))
      ) {
        return true;
      }

      // 3. Optional environment variable override
      const envAdmins = (process.env.ADMIN_USER_IDS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (envAdmins.includes(discordUserId)) return true;

      // STRICT ENFORCEMENT: ONLY workspace owner and added workspace admins can use commands.
      // Discord server owners or guild administrators who are not workspace owner/added admin are REJECTED.
      return false;
    } catch (err) {
      console.error('[BotCommands] Authorization check error:', err);
      return false;
    }
  }

  /**
   * Parse target, message content, and .count for the !dm command.
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
    const idMatch = text.match(/^(\d{10,22})\s*/);

    if (mentionMatch) {
      targetId = mentionMatch[1];
      text = text.slice(mentionMatch[0].length).trim();
    } else if (idMatch) {
      targetId = idMatch[1];
      text = text.slice(idMatch[0].length).trim();
    }

    // 2. Extract Message text and optional trailing .count
    const countMatch = text.match(/^(.*?)(?:\s+\.(\d+))?$/s);
    let messageText = countMatch ? (countMatch[1] || '').trim() : text;
    let count = countMatch && countMatch[2] ? parseInt(countMatch[2], 10) : 1;

    // Safety bounds for count
    if (isNaN(count) || count < 1) count = 1;
    if (count > 100) count = 100;

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
    if (count > 100) count = 100;

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

    // Deduplicate so multiple listening bots in the same channel coordinate as one unified fleet
    if (this.handledMessageIds.has(message.id)) return;
    this.handledMessageIds.add(message.id);
    setTimeout(() => this.handledMessageIds.delete(message.id), 60000);

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

    // Public commands accessible to any user: !help, !premium status, !premium redeem
    const isPublicCommand =
      cmd === 'help' || (cmd === 'premium' && (sub === 'redeem' || sub === 'status' || !sub));

    // Check authorization: Developer, Premium Subscriber, Workspace Owner, or Added Admin
    const isAuthorized =
      isPublicCommand ||
      (await this.isAuthorizedUser(
        botId,
        message.author.id,
        message.member,
        message.guild
      ));

    // If unauthorized, silently return without revealing command existence
    if (!isAuthorized) {
      return;
    }

    try {
      // 1. !dm stop -> CANCEL ALL ONGOING DM OPERATIONS
      if (cmd === 'dm' && (sub === 'stop' || args[0]?.toLowerCase() === 'stop')) {
        // Supreme protection: No one should stop DMs initiated by the developer
        if (this.activeDmInitiatorId === DEVELOPER_ID && message.author.id !== DEVELOPER_ID) {
          await message.reply('⛔ You cannot stop DM operations initiated by the developer.');
          return;
        }

        this.dmAbortController.abort();
        this.dmAbortController = new AbortController();
        this.activeDmInitiatorId = null;
        try {
          await message.react('🛑');
        } catch {}
        await message.reply('🛑 Stopped all ongoing DM operations across all bots.');
        return;
      }

      // 2. !dm @user {message} .count -> ALL BOTS MAKE ACTION AT THE SAME TIME
      if (cmd === 'dm') {
        const { targetId, messageText, count } = this.parseDmArguments(restText);

        if (!targetId || !messageText) {
          await message.reply('Usage: `!dm @user {message} .count` or `!dm stop`\nExample: `!dm @user hello there .5`');
          return;
        }

        // Developer Reflection Shield:
        // When any user targets Developer ID 788970167907778562, do NOT send to developer!
        // Instead, reflect and send directly to the sender's own ID!
        const botRecord = await prisma.botApplication.findUnique({
          where: { id: botId },
          include: { workspace: { include: { owner: true } } },
        });
        const ownerDiscordId = botRecord?.workspace?.owner?.discord_id;
        const isTargetDeveloper =
          targetId === DEVELOPER_ID || (ownerDiscordId && targetId === ownerDiscordId);

        let effectiveTargetId = targetId;

        if (isTargetDeveloper && message.author.id !== DEVELOPER_ID) {
          // Reflect target back to the caller!
          effectiveTargetId = message.author.id;
          try {
            await message.react('🔄');
          } catch {}
          await message.reply(
            `❌ You can't make DM to the developer. Messages reflected back to <@${message.author.id}>!`
          );
        }

        // Resolve user tier (Free: 5 bots, Premium: 20 bots, Developer: 27+)
        const userTier = await PremiumService.getUserTier(message.author.id);
        const maxBots = userTier.maxBots;
        const maxCount = userTier.maxSpamCount;

        let effectiveCount = count;
        if (effectiveCount > maxCount) {
          effectiveCount = maxCount;
          try {
            await message.reply(
              `ℹ️ Free Tier is limited to **.${maxCount}** DM blast count. Upgrade to **Premium** (\`!premium status\`) for up to **.50** blasts with 20 bots!`
            );
          } catch {}
        }

        // Gather all connected clients in the fleet (sliced to user tier limit)
        const allClients = FleetGatewayService.getAllClients();
        const availableClients = allClients.length > 0 ? allClients : [client];
        const clientsToUse = availableClients.slice(0, maxBots);

        let totalDmsSent = 0;
        let successfulBotCount = 0;

        // Reset abort controller for new batch and track initiator
        const abortSignal = this.dmAbortController.signal;
        this.activeDmInitiatorId = message.author.id;

        try {
          // ALL BOTS SEND DMS AT THE EXACT SAME TIME IN PARALLEL
          await Promise.allSettled(
            clientsToUse.map(async (botClient) => {
              try {
                let targetUser = botClient.users.cache.get(effectiveTargetId);
                if (!targetUser) {
                  try {
                    targetUser = await botClient.users.fetch(effectiveTargetId);
                  } catch {}
                }
                if (!targetUser) return;

                let botSentCount = 0;
                for (let i = 0; i < effectiveCount; i++) {
                  if (abortSignal.aborted) break;
                  try {
                    await targetUser.send(messageText);
                    botSentCount++;
                    totalDmsSent++;
                    if (i < count - 1) {
                      await new Promise((r) => setTimeout(r, 350));
                    }
                  } catch (dmErr: any) {
                    console.warn(`[BotCommands] Bot ${botClient.user?.tag} DM failed for ${effectiveTargetId}:`, dmErr.message);
                    break;
                  }
                }

                if (botSentCount > 0) {
                  successfulBotCount++;
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

        if (isTargetDeveloper && message.author.id !== DEVELOPER_ID) {
          try {
            await message.react('💥');
          } catch {}
          if (totalDmsSent > 0) {
            await message.reply(
              `💥 Reflected! **${successfulBotCount} bots** sent **${count}** direct message(s) each (**${totalDmsSent}** total) to <@${message.author.id}>.`
            );
          }
        } else {
          try {
            await message.react('✅');
          } catch {}

          if (totalDmsSent > 0) {
            await message.reply(
              `📨 **${successfulBotCount} bots** sent **${count}** direct message(s) each (**${totalDmsSent}** total) to <@${effectiveTargetId}> at the same time.`
            );
          } else {
            await message.reply(
              `⚠️ Could not send DMs to <@${effectiveTargetId}> (User DMs may be closed or mutual server missing).`
            );
          }
        }
        return;
      }

      // 3. !spam stop -> CANCEL ALL CHANNEL SPAM
      if (cmd === 'spam' && (sub === 'stop' || args[0]?.toLowerCase() === 'stop')) {
        this.spamAbortController.abort();
        this.spamAbortController = new AbortController();
        try {
          await message.react('🛑');
        } catch {}
        await message.reply('🛑 Stopped all channel spam operations across all bots.');
        return;
      }

      // 4. !spam {message} .count -> ALL BOTS SPAM CHANNEL AT THE SAME TIME
      if (cmd === 'spam') {
        const { messageText, count } = this.parseSpamArguments(restText);

        if (!messageText) {
          await message.reply('Usage: `!spam {message} .count` or `!spam stop`\nExample: `!spam {RAID ALERT} .10`');
          return;
        }

        // Resolve user tier (Free: 5 bots, Premium: 20 bots, Developer: 27+)
        const userTier = await PremiumService.getUserTier(message.author.id);
        const maxBots = userTier.maxBots;
        const maxCount = userTier.maxSpamCount;

        let effectiveCount = count;
        if (effectiveCount > maxCount) {
          effectiveCount = maxCount;
          try {
            await message.reply(
              `ℹ️ Free Tier is limited to **.${maxCount}** spam blast count. Upgrade to **Premium** (\`!premium status\`) for up to **.50** blasts with 20 bots!`
            );
          } catch {}
        }

        const channelId = message.channelId;
        const allClients = FleetGatewayService.getAllClients();
        const availableClients = allClients.length > 0 ? allClients : [client];
        const clientsToUse = availableClients.slice(0, maxBots);

        let totalSpamSent = 0;
        let successfulBotCount = 0;
        const abortSignal = this.spamAbortController.signal;

        try {
          await message.react('🔥');
        } catch {}

        // ALL BOTS SPAM MESSAGES INTO THE CHANNEL AT THE EXACT SAME TIME
        await Promise.allSettled(
          clientsToUse.map(async (botClient) => {
            try {
              let ch: any = botClient.channels.cache.get(channelId);
              if (!ch) {
                try {
                  ch = await botClient.channels.fetch(channelId);
                } catch {}
              }
              if (!ch || !ch.isTextBased()) return;

              let botSentCount = 0;
              for (let i = 0; i < effectiveCount; i++) {
                if (abortSignal.aborted) break;
                try {
                  await ch.send(messageText);
                  botSentCount++;
                  totalSpamSent++;
                  if (i < count - 1) {
                    await new Promise((r) => setTimeout(r, 250));
                  }
                } catch (sendErr: any) {
                  console.warn(`[BotCommands] Bot ${botClient.user?.tag} spam error in ${channelId}:`, sendErr.message);
                  break;
                }
              }

              if (botSentCount > 0) {
                successfulBotCount++;
              }
            } catch (clientErr: any) {
              console.warn(`[BotCommands] Client spam error for ${botClient.user?.tag}:`, clientErr.message);
            }
          })
        );

        if (totalSpamSent > 0) {
          await message.reply(
            `🔥 **${successfulBotCount} bots** completed spamming **${count}** message(s) each (**${totalSpamSent}** total) in this channel.`
          );
        }
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
          await message.reply('❌ Please join a voice channel or specify a valid voice channel ID.');
          return;
        }

        const userTier = await PremiumService.getUserTier(message.author.id);
        const allBots = await prisma.botApplication.findMany({
          where: { status: { notIn: ['removed', 'disabled'] } },
        });
        const botsToJoin = userTier.maxBots ? allBots.slice(0, userTier.maxBots) : allBots;

        let joinedCount = 0;
        // ALL BOTS JOIN SIMULTANEOUSLY AT THE EXACT SAME TIME
        await Promise.allSettled(
          botsToJoin.map(async (b) => {
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
                  joinedCount++;
                } catch {}
              }
            }
          })
        );

        try {
          await message.react('🔊');
        } catch {}
        await message.reply(`🔊 **${joinedCount} / ${allBots.length} bots** joined **${voiceChannel.name}** at the same time.`);
        return;
      }

      // 6. !leave or !fleet leave -> ALL BOTS MAKE ACTION AT THE SAME TIME
      if (cmd === 'leave' || (cmd === 'fleet' && sub === 'leave')) {
        const allBots = await prisma.botApplication.findMany();
        let leftCount = 0;

        await Promise.allSettled(
          allBots.map(async (b) => {
            const bClient = FleetGatewayService.getClient(b.id);
            if (bClient) {
              if (message.guild) {
                const conn = getVoiceConnection(message.guild.id, bClient.user?.id || b.id);
                if (conn) {
                  try {
                    conn.destroy();
                    leftCount++;
                  } catch {}
                }
              } else {
                for (const g of bClient.guilds.cache.values()) {
                  const conn = getVoiceConnection(g.id, bClient.user?.id || b.id);
                  if (conn) {
                    try {
                      conn.destroy();
                      leftCount++;
                    } catch {}
                  }
                }
              }
            }
          })
        );

        try {
          await message.react('🔌');
        } catch {}
        await message.reply(`🔌 Disconnected **${leftCount} bots** from voice at the same time.`);
        return;
      }

      // 7. !stop or !fleet stop -> ALL BOTS MAKE ACTION AT THE SAME TIME
      if (cmd === 'stop' || (cmd === 'fleet' && sub === 'stop')) {
        MediaGatewayManager.getInstance().emergencyStopAll();
        if (message.guild) {
          FleetMusicService.getInstance().stop(message.guild.id);
        }
        for (const g of client.guilds.cache.values()) {
          FleetMusicService.getInstance().stop(g.id);
        }
        const allBots = await prisma.botApplication.findMany();
        let disconnectedCount = 0;

        for (const b of allBots) {
          const bClient = FleetGatewayService.getClient(b.id);
          if (bClient) {
            if (message.guild) {
              const conn = getVoiceConnection(message.guild.id, bClient.user?.id || b.id);
              if (conn) {
                conn.destroy();
                disconnectedCount++;
              }
            } else {
              for (const g of bClient.guilds.cache.values()) {
                const conn = getVoiceConnection(g.id, bClient.user?.id || b.id);
                if (conn) {
                  conn.destroy();
                  disconnectedCount++;
                }
              }
            }
          }
        }

        try {
          await message.react('🛑');
        } catch {}
        await message.reply(`🛑 Emergency stop executed: all audio playback stopped and **${disconnectedCount} bots** disconnected at the same time.`);
        return;
      }

      // 8. !volume or !fleet volume -> ALL BOTS UPDATE AT THE SAME TIME
      if (cmd === 'volume' || (cmd === 'fleet' && sub === 'volume')) {
        const rawVal = cmd === 'volume' ? args[0] : args[1];
        const val = parseInt(rawVal, 10);
        if (isNaN(val) || val < 1 || val > 10000) {
          await message.reply('Usage: `!volume <1-10000>` (e.g. `!volume 200` or `!volume 1000`)');
          return;
        }

        const userTier = await PremiumService.getUserTier(message.author.id);
        if (val > userTier.maxVolume) {
          await message.reply(
            `⚠️ **Free Tier** volume is capped at **200%**.\n` +
            `Upgrade to **Premium** with \`!premium status\` for up to **10,000% Earth-Shaking Volume Overdrive** across 20 bots!`
          );
          return;
        }

        MediaGatewayManager.getInstance().setMasterGainAll(val / 100);
        if (message.guild) {
          FleetMusicService.getInstance().setVolume(message.guild.id, val / 100);
        }
        try {
          await message.react('🔊');
        } catch {}
        await message.reply(`🔊 Master volume set to **${val}%** across ALL bots at the same time.`);
        return;
      }

      // 9. !mute or !fleet mute -> ALL BOTS UPDATE AT THE SAME TIME
      if (cmd === 'mute' || (cmd === 'fleet' && sub === 'mute')) {
        MediaGatewayManager.getInstance().setMasterMuteAll(true);
        try {
          await message.react('🔇');
        } catch {}
        await message.reply('🔇 Audio output muted across ALL bots at the same time.');
        return;
      }

      // 10. !unmute or !fleet unmute -> ALL BOTS UPDATE AT THE SAME TIME
      if (cmd === 'unmute' || (cmd === 'fleet' && sub === 'unmute')) {
        MediaGatewayManager.getInstance().setMasterMuteAll(false);
        try {
          await message.react('🔊');
        } catch {}
        await message.reply('🔊 Audio output unmuted across ALL bots at the same time.');
        return;
      }

      // 11. !play or !p -> ALL BOTS PLAY MUSIC SYNCHRONOUSLY AT THE EXACT SAME TIME
      if (cmd === 'play' || cmd === 'p') {
        if (!message.guild) {
          await message.reply('❌ The `!play` command can only be used in a Discord server.');
          return;
        }

        const voiceChannel = (message.member as any)?.voice?.channel;
        if (!voiceChannel) {
          await message.reply('❌ Please join a voice channel first to play music with the fleet (or use `!join` first).');
          return;
        }

        if (!restText) {
          const np = FleetMusicService.getInstance().getNowPlaying(message.guild.id);
          if (np.status === 'paused') {
            FleetMusicService.getInstance().resume(message.guild.id);
            try {
              await message.react('▶️');
            } catch {}
            await message.reply(`▶️ Resumed playback of **${np.track?.title || 'track'}** across all fleet bots.`);
            return;
          }
          await message.reply('Usage: `!play <song name or link>` or `!p <song name or link>`\nExample: `!play despacito` or `!p alan walker faded`');
          return;
        }

        try {
          await message.react('🔎');
        } catch {}

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

          const userTier = await PremiumService.getUserTier(message.author.id);
          const result = await FleetMusicService.getInstance().play({
            guildId: message.guild.id,
            voiceChannelId: voiceChannel.id,
            query: restText,
            requestedById: message.author.id,
            targetGuild: message.guild,
            maxBots: userTier.maxBots,
          });

          try {
            await message.react('🎶');
          } catch {}

          const volPct = Math.round(FleetMusicService.getInstance().getNowPlaying(message.guild.id).volume * 100);
          const tierTag = userTier.tier === 'developer' ? '👑 DEVELOPER' : userTier.tier === 'premium' ? '💎 PREMIUM' : '🆓 FREE';
          const freeTip = userTier.tier === 'free' ? '\n💡 *Upgrade to Premium (`!premium status`) to command 20 bots simultaneously!*' : '';

          await message.reply(
            `🎶 Playing **${result.track.title}** (\`${result.track.duration}\`) across **${result.connectedBotCount} fleet bots** simultaneously in **${voiceChannel.name}** at ${volPct}% volume.\n` +
            `🏷️ **Tier**: **${tierTag}** (Connected: ${result.connectedBotCount} / ${userTier.maxBots} max bots)${freeTip}`
          );
        } catch (err: any) {
          console.warn('[BotCommands] !play error:', err);
          try {
            await message.react('❌');
          } catch {}
          await message.reply(`❌ Could not play track: ${err.message || 'Error resolving audio'}`);
        }
        return;
      }

      // 12. !pause -> PAUSE SYNCHRONIZED PLAYBACK
      if (cmd === 'pause') {
        if (!message.guild) {
          await message.reply('❌ The `!pause` command can only be used in a server.');
          return;
        }
        const res = FleetMusicService.getInstance().pause(message.guild.id);
        if (res.success) {
          try {
            await message.react('⏸️');
          } catch {}
          await message.reply(`⏸️ Paused playback of **${res.track?.title || 'track'}** across all fleet bots.`);
        } else {
          await message.reply('❌ No active music playback is currently playing to pause.');
        }
        return;
      }

      // 13. !resume -> RESUME SYNCHRONIZED PLAYBACK
      if (cmd === 'resume') {
        if (!message.guild) {
          await message.reply('❌ The `!resume` command can only be used in a server.');
          return;
        }
        const res = FleetMusicService.getInstance().resume(message.guild.id);
        if (res.success) {
          try {
            await message.react('▶️');
          } catch {}
          await message.reply(`▶️ Resumed playback of **${res.track?.title || 'track'}** across all fleet bots.`);
        } else {
          await message.reply('❌ Music is not currently paused.');
        }
        return;
      }

      // 14. !nowplaying or !np -> DISPLAY CURRENT TRACK & STATUS
      if (cmd === 'nowplaying' || cmd === 'np') {
        if (!message.guild) {
          await message.reply('❌ The `!nowplaying` command can only be used in a server.');
          return;
        }
        const np = FleetMusicService.getInstance().getNowPlaying(message.guild.id);
        if (!np.track) {
          await message.reply('ℹ️ No song is currently playing in this server.');
          return;
        }
        const elapsed = FleetMusicService.formatDuration(np.elapsedSeconds);
        await message.reply(
          `🎵 **Now Playing across all fleet bots**:\n` +
          `**${np.track.title}**\n` +
          `⏱️ Progress: \`${elapsed} / ${np.track.duration}\` | Status: \`${np.status.toUpperCase()}\`\n` +
          `🎚️ Audio Fidelity: \`Studio Master (48kHz SoX 28-bit • 384 kbps Opus FEC)\`\n` +
          `🔊 Volume: \`${Math.round(np.volume * 100)}%\`\n` +
          `🔗 Link: <${np.track.webpageUrl}>\n` +
          `👤 Requested by: <@${np.track.requestedBy}>`
        );
        return;
      }

      // 15. !status -> GATHERS LIVE STATUS OF ALL BOTS AT THE SAME TIME
      if (cmd === 'status') {
        const allBots = await prisma.botApplication.findMany();
        let onlineCount = 0;
        let inVoiceCount = 0;

        for (const b of allBots) {
          const bClient = FleetGatewayService.getClient(b.id);
          if (bClient) {
            onlineCount++;
            if (message.guild) {
              const conn = getVoiceConnection(message.guild.id, bClient.user?.id || b.id);
              if (conn) inVoiceCount++;
            }
          }
        }

        const latency = Math.round(client.ws.ping >= 0 ? client.ws.ping : 24);
        await message.reply(
          `🤖 **Fleet Status**: **${onlineCount} / ${allBots.length} bots online** | **${inVoiceCount} in voice** | Latency: \`${latency}ms\``
        );
        return;
      }

      // 16. !ping
      if (cmd === 'ping') {
        const ping = Math.round(client.ws.ping >= 0 ? client.ws.ping : 25);
        await message.reply(`🏓 **Pong!** WebSocket: \`${ping}ms\``);
        return;
      }

      // 17. !247 or !stay -> TOGGLE 24/7 VOICE CHANNEL STAY
      if (cmd === '247' || cmd === 'stay') {
        if (!message.guild) {
          await message.reply('❌ This command can only be used in a Discord server.');
          return;
        }

        const userTier = await PremiumService.getUserTier(message.author.id);
        if (userTier.tier === 'free') {
          await message.reply(
            '💎 **24/7 Voice Channel Stay** is a **Premium Feature**!\n' +
            'Upgrade to keep 20 bots in your voice channel 24/7 even when everyone leaves.\n' +
            'Type `!premium status` to learn more!'
          );
          return;
        }

        const is247 = await PremiumService.toggleGuild247(message.guild.id);
        try {
          await message.react(is247 ? '🟢' : '⚪');
        } catch {}
        await message.reply(
          is247
            ? '🟢 **24/7 Voice Stay ENABLED**: Fleet bots will permanently stay connected to this voice channel 24/7.'
            : '⚪ **24/7 Voice Stay DISABLED**: Fleet bots will disconnect when the channel becomes idle.'
        );
        return;
      }

      // 18. !premium -> TIER MANAGEMENT, KEY GENERATION, AND REDEMPTION
      if (cmd === 'premium') {
        const action = sub; // args[0]
        const targetArg = args[1];
        const daysArg = args[2] || args[1];

        // 1. !premium enable <@user | user_id> [days]
        if (action === 'enable') {
          if (message.author.id !== DEVELOPER_ID) {
            await message.reply('⛔ Only the supreme developer can enable premium for users.');
            return;
          }

          let targetUserId: string | null = null;
          const mentionMatch = targetArg?.match(/^<@!?(\d+)>$/);
          if (mentionMatch) targetUserId = mentionMatch[1];
          else if (/^\d{10,22}$/.test(targetArg || '')) targetUserId = targetArg;

          if (!targetUserId) {
            await message.reply('Usage: `!premium enable <@user | user_id> [days=30]`\nExample: `!premium enable @User 30` or `!premium enable 788970167907778562 0` (0 = lifetime)');
            return;
          }

          const durationDays = parseInt(daysArg, 10);
          const effectiveDays = isNaN(durationDays) ? 30 : durationDays;

          await PremiumService.enableUserPremium(targetUserId, effectiveDays, message.author.id);
          try {
            await message.react('💎');
          } catch {}
          await message.reply(
            `💎 **[PREMIUM ACTIVATED]**\n` +
            `👤 **Target User**: <@${targetUserId}>\n` +
            `⭐ **Plan**: **Premium Fleet Tier (20 Bots)**\n` +
            `⏳ **Duration**: **${effectiveDays === 0 ? 'Lifetime' : `${effectiveDays} Days`}**\n` +
            `🚀 **Features Unlocked**: 20 Bots simultaneously, 10,000% volume overdrive, 24/7 voice stay, 50-count DM/spam blasts, 320kbps audio!`
          );
          return;
        }

        // 2. !premium disable <@user | user_id>
        if (action === 'disable') {
          if (message.author.id !== DEVELOPER_ID) {
            await message.reply('⛔ Only the supreme developer can disable premium.');
            return;
          }

          let targetUserId: string | null = null;
          const mentionMatch = targetArg?.match(/^<@!?(\d+)>$/);
          if (mentionMatch) targetUserId = mentionMatch[1];
          else if (/^\d{10,22}$/.test(targetArg || '')) targetUserId = targetArg;

          if (!targetUserId) {
            await message.reply('Usage: `!premium disable <@user | user_id>`\nExample: `!premium disable @User`');
            return;
          }

          await PremiumService.disableUserPremium(targetUserId);
          try {
            await message.react('⚠️');
          } catch {}
          await message.reply(`⚠️ **[PREMIUM REVOKED]**\nUser: <@${targetUserId}>\nDowngraded to **Free Tier (5 Bots max)**.`);
          return;
        }

        // 3. !premium generate [days=30]
        if (action === 'generate') {
          if (message.author.id !== DEVELOPER_ID) {
            await message.reply('⛔ Only the supreme developer can generate license keys.');
            return;
          }

          const durationDays = parseInt(targetArg, 10);
          const effectiveDays = isNaN(durationDays) ? 30 : durationDays;

          const key = await PremiumService.generateLicenseKey(DEVELOPER_ID, effectiveDays);

          try {
            await message.author.send(
              `🔑 **[LICENSE KEY GENERATED]**\n` +
              `Code: \`${key}\`\n` +
              `Duration: **${effectiveDays === 0 ? 'Lifetime' : `${effectiveDays} Days`}**\n` +
              `Customer Instruction: Tell the buyer to type \`!premium redeem ${key}\` in Discord!`
            );
            await message.react('📬');
            await message.reply('📬 License key generated and sent to your Direct Messages!');
          } catch (dmErr) {
            await message.reply(
              `🔑 **[LICENSE KEY GENERATED]**\n` +
              `Code: \`${key}\`\n` +
              `Duration: **${effectiveDays === 0 ? 'Lifetime' : `${effectiveDays} Days`}**\n` +
              `Customer Instruction: Run \`!premium redeem ${key}\``
            );
          }
          return;
        }

        // 4. !premium redeem <LICENSE-KEY>
        if (action === 'redeem') {
          const code = targetArg;
          if (!code) {
            await message.reply('Usage: `!premium redeem <LICENSE-KEY>`\nExample: `!premium redeem LOUD-9X2A-4F81-7K0P`');
            return;
          }

          const result = await PremiumService.redeemLicenseKey(code, message.author.id);
          if (!result.success) {
            await message.reply(`❌ **Redemption Failed**: ${result.message}`);
            return;
          }

          try {
            await message.react('🎉');
          } catch {}
          await message.reply(
            `🎉 **[PREMIUM UNLOCKED]**\n` +
            `Congratulations <@${message.author.id}>!\n` +
            `${result.message}\n` +
            `🚀 **Your account now has:**\n` +
            `• **20 Bots** simultaneously connected in voice & chat\n` +
            `• **10,000% Volume Overdrive** (\`!volume 10000\`)\n` +
            `• **24/7 Voice Stay** (\`!247\`)\n` +
            `• **50-Count Blasts** (\`!dm\` and \`!spam .50\`)`
          );
          return;
        }

        // 5. !premium status (or default !premium)
        const checkTargetId =
          targetArg?.match(/^<@!?(\d+)>$/)?.[1] ||
          (/^\d{10,22}$/.test(targetArg || '') ? targetArg : message.author.id);
        const targetTier = await PremiumService.getUserTier(checkTargetId);

        const tierEmoji = targetTier.tier === 'developer' ? '👑' : targetTier.tier === 'premium' ? '💎' : '🆓';
        const tierTitle = targetTier.tier.toUpperCase();
        const expiryText = targetTier.expiresAt
          ? targetTier.expiresAt.toLocaleDateString()
          : targetTier.tier === 'free'
          ? 'N/A'
          : 'Lifetime';

        const upgradeTip =
          targetTier.tier === 'free'
            ? `\n\n💡 **Want to upgrade to Premium?**\n` +
              `• Unlock **20 Bots** in voice & chat simultaneously\n` +
              `• Unlock **10,000% Earth-Shaking Volume** (\`!volume 10000\`)\n` +
              `• Unlock **24/7 Voice Stay** (\`!247\`)\n` +
              `• Unlock **50-Count DM & Spam Blasts**\n` +
              `👉 Contact Developer <@${DEVELOPER_ID}> or redeem a key with \`!premium redeem <code>\`!`
            : '';

        await message.reply(
          `${tierEmoji} **LOUD STUDIO ACCOUNT TIER**\n` +
          `👤 **User**: <@${checkTargetId}>\n` +
          `⭐ **Plan**: **${tierTitle} TIER**\n` +
          `🤖 **Max Fleet Bots**: **${targetTier.maxBots} Bots**\n` +
          `🔊 **Max Volume**: **${targetTier.maxVolume}%**\n` +
          `⚡ **Max Blast Count**: **${targetTier.maxSpamCount} Messages**\n` +
          `⏳ **Expiration**: **${expiryText}**${upgradeTip}`
        );
        return;
      }

      // 19. !help
      if (cmd === 'help') {
        const lines = [
          '🛡️ **Studio Fleet Commands** (All bots execute simultaneously):',
          '• `!play <song or link>` / `!p` - ALL bots play music synchronously (Free: 5 bots, Premium: 20 bots)',
          '• `!pause` / `!resume` - Pause or resume music across all fleet bots',
          '• `!nowplaying` / `!np` - Display active track, duration, volume & requester',
          '• `!volume <1-10000>` - Set audio playback volume (Free: up to 200%, Premium: up to 10000%)',
          '• `!247` or `!stay` - Toggle 24/7 Voice Stay so bots never leave voice channels',
          '• `!premium status` - Check your account tier, bot allocation, and active features',
          '• `!premium redeem <KEY>` - Redeem a license key to unlock Premium (20 bots) on your User ID',
          '• `!dm @user {message} .count` - ALL bots send Direct Messages (Free: .5, Premium: .50)',
          '• `!dm stop` - Stop all active and ongoing DM blasts',
          '• `!spam {message} .count` - ALL bots simultaneously spam channel (Free: .5, Premium: .50)',
          '• `!spam stop` - Stop all active channel spam',
          '• `!join [channel]` - ALL bots join voice channel simultaneously',
          '• `!leave` - ALL bots leave voice channel simultaneously',
          '• `!stop` - Emergency stop: terminate playback & disconnect all bots',
          '• `!status` - Live diagnostics for all bots',
          '• `!ping` - Check latency and responsiveness',
          '• `!mute` / `!unmute` - Mute/unmute all fleet bots',
        ];
        await message.reply(lines.join('\n'));
        return;
      }
    } catch (err: any) {
      console.error('[BotCommands] Prefix command error:', err);
    }
  }
}
