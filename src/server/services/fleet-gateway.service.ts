import { Client, GatewayIntentBits, ActivityType, Options } from 'discord.js';
import { getVoiceConnection } from '@discordjs/voice';
import { prisma } from '../db/prisma';
import { decryptSecret } from '../security/encryption';
import { BotCommandService } from './bot-command.service';

export interface BotGatewayConnection {
  botId: string;
  applicationId: string;
  displayName: string;
  client: Client | null;
  status: 'connected' | 'connecting' | 'disconnected' | 'error';
  isMock: boolean;
  connectedAt?: Date;
  pingMs?: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __fleetGatewayConnections: Map<string, BotGatewayConnection> | undefined;
}

export class FleetGatewayService {
  private static get connections(): Map<string, BotGatewayConnection> {
    if (!global.__fleetGatewayConnections) {
      global.__fleetGatewayConnections = new Map<string, BotGatewayConnection>();
    }
    return global.__fleetGatewayConnections;
  }

  /**
   * Retrieve active Discord Client for a bot if currently connected.
   */
  public static getClient(botId: string): Client | null {
    const conn = this.connections.get(botId);
    return conn?.client || null;
  }

  /**
   * Retrieve all active gateway connections.
   */
  public static getAllConnections(): BotGatewayConnection[] {
    return Array.from(this.connections.values());
  }

  /**
   * Determine whether a Client, bot ID, application ID, or token belongs to
   * the dedicated Redirect / OAuth Application bot.
   * The Redirect bot is strictly reserved for Discord OAuth authentication and !premium commands,
   * and is completely excluded from DM blasts, channel spam, and worker raids.
   */
  public static isRedirectBot(identifier: Client | string | null | undefined): boolean {
    if (!identifier) return false;

    const redirectClientId = process.env.DISCORD_CLIENT_ID?.trim() || '1560261747137454161';
    const redirectBotId = process.env.REDIRECT_BOT_ID?.trim() || '1560261747137454161';
    const knownRedirectIds = ['1560261747137454161', '0f146450-9db5-45f6-bef3-34fd98e12634'];

    // 1. Check if passed a Discord.js Client instance
    if (typeof identifier === 'object' && 'user' in identifier) {
      const clientId = identifier.user?.id;
      if (clientId && (clientId === redirectClientId || clientId === redirectBotId || knownRedirectIds.includes(clientId))) {
        return true;
      }
      if (identifier.user?.username?.toLowerCase().includes('roynix')) {
        return true;
      }
      return false;
    }

    // 2. Check if passed a string (can be application_id, DB bot ID, Discord snowflake, or token)
    if (typeof identifier === 'string') {
      const trimmed = identifier.trim();
      if (!trimmed) return false;

      if (trimmed === redirectClientId || trimmed === redirectBotId || knownRedirectIds.includes(trimmed)) return true;

      // Check token if base64 extractable
      try {
        const firstSegment = trimmed.split('.')[0];
        if (firstSegment && firstSegment.length >= 16) {
          const decoded = Buffer.from(firstSegment, 'base64').toString('utf8');
          if (decoded && (decoded === redirectClientId || decoded === redirectBotId || knownRedirectIds.includes(decoded))) {
            return true;
          }
        }
      } catch {}

      // Check active connections map by botId or applicationId
      const conn = this.connections.get(trimmed);
      if (conn) {
        if (
          conn.applicationId === redirectClientId ||
          conn.applicationId === redirectBotId ||
          knownRedirectIds.includes(conn.applicationId) ||
          conn.client?.user?.id === redirectClientId ||
          conn.client?.user?.id === redirectBotId ||
          (conn.client?.user?.id && knownRedirectIds.includes(conn.client.user.id)) ||
          conn.displayName?.toLowerCase().includes('roynix')
        ) {
          return true;
        }
      }

      // Check if any connection matches
      for (const c of this.connections.values()) {
        if (c.botId === trimmed || c.applicationId === trimmed || c.client?.user?.id === trimmed) {
          if (
            c.applicationId === redirectClientId ||
            c.applicationId === redirectBotId ||
            knownRedirectIds.includes(c.applicationId) ||
            c.client?.user?.id === redirectClientId ||
            c.client?.user?.id === redirectBotId ||
            (c.client?.user?.id && knownRedirectIds.includes(c.client.user.id)) ||
            c.displayName?.toLowerCase().includes('roynix')
          ) {
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * Determine whether a bot belongs to the developer fleet (owned by DEVELOPER_ID).
   * Developer bots are strictly protected: other users CANNOT disconnect them.
   */
  public static async isDeveloperBot(botIdOrAppId: string, applicationId?: string): Promise<boolean> {
    const DEVELOPER_ID = '788970167907778562';
    if (!botIdOrAppId && !applicationId) return false;

    // 1. Is redirect bot
    if (this.isRedirectBot(botIdOrAppId) || (applicationId && this.isRedirectBot(applicationId))) {
      return true;
    }

    // 2. Check in database if this bot belongs to developer's workspace
    try {
      const devBots = await prisma.botApplication.findMany({
        where: {
          OR: [
            { id: botIdOrAppId },
            ...(applicationId ? [{ application_id: applicationId }] : [{ application_id: botIdOrAppId }]),
            ...(applicationId ? [{ verified_bot_user_id: applicationId }] : [{ verified_bot_user_id: botIdOrAppId }]),
          ],
        },
        include: {
          workspace: {
            include: { owner: true },
          },
        },
      });

      for (const b of devBots) {
        if (b.workspace?.owner?.discord_id === DEVELOPER_ID) {
          return true;
        }
      }

      // Check if the application_id matches any bot owned by DEVELOPER_ID in any workspace
      const targetAppId = devBots[0]?.application_id || applicationId || botIdOrAppId;
      if (targetAppId) {
        const devOwned = await prisma.botApplication.findFirst({
          where: {
            application_id: targetAppId,
            workspace: { owner: { discord_id: DEVELOPER_ID } },
          },
        });
        if (devOwned) return true;
      }
    } catch (err) {
      console.warn('[FleetGateway] isDeveloperBot check error:', err);
    }

    return false;
  }

  /**
   * Retrieve all active Discord Clients across the fleet EXCEPT the protected Redirect/OAuth bot.
   * Used for all DM, spam, and fleet operations to keep the OAuth bot safe.
   */
  public static getWorkerClients(): Client[] {
    return this.getAllClients().filter((client) => !this.isRedirectBot(client));
  }

  /**
   * Retrieve active Discord Clients strictly belonging to a specific workspace EXCEPT the protected Redirect/OAuth bot.
   */
  public static async getWorkspaceWorkerClients(workspaceId: string): Promise<Client[]> {
    if (!workspaceId) return [];
    const workspaceBots = await prisma.botApplication.findMany({
      where: {
        workspace_id: workspaceId,
        operational_role: { not: 'oauth_redirect' },
        application_id: { notIn: [process.env.DISCORD_CLIENT_ID || '', '1560261747137454161'].filter(Boolean) },
      },
      select: { id: true, application_id: true },
    });

    const clients: Client[] = [];
    for (const b of workspaceBots) {
      if (this.isRedirectBot(b.id) || this.isRedirectBot(b.application_id)) continue;
      const client = this.getClient(b.id);
      if (client && !this.isRedirectBot(client)) {
        clients.push(client);
      }
    }

    // If workspace has no custom bots, check if workspace owner is on Free Tier (trial/free)
    if (clients.length === 0) {
      try {
        const ws = await prisma.workspace.findUnique({
          where: { id: workspaceId },
          include: { owner: true },
        });
        const { PremiumService } = await import('./premium.service');
        const tier = await PremiumService.getUserTier(ws?.owner?.discord_id || '');
        if (!tier.isDeveloper && (tier.tier === 'trial' || tier.tier === 'free')) {
          return this.getFreeTierDeveloperClients();
        }
      } catch {}
    }

    return clients;
  }

  /**
   * Retrieves the 5 designated developer fleet worker bots allocated for Free Tier usage.
   */
  public static async getFreeTierDeveloperBots(): Promise<any[]> {
    const redirectClientId = process.env.DISCORD_CLIENT_ID?.trim() || '1560261747137454161';
    const DEVELOPER_ID = '788970167907778562';

    // 1. Look for bots owned by developer account
    let bots = await prisma.botApplication.findMany({
      where: {
        workspace: {
          owner: { discord_id: DEVELOPER_ID },
        },
        operational_role: { not: 'oauth_redirect' },
        display_name: { not: 'Roynix Loud' },
        application_id: { notIn: [redirectClientId, '1560261747137454161'].filter(Boolean) },
        status: { notIn: ['removed', 'disabled'] },
      },
      include: {
        credentials: {
          select: {
            id: true,
            credential_version: true,
            status: true,
            created_at: true,
            rotated_at: true,
          },
          orderBy: { credential_version: 'desc' },
          take: 1,
        },
        guild_accesses: {
          include: {
            guild: {
              select: { id: true, guild_id: true, display_name: true, verification_status: true },
            },
          },
        },
        group_memberships: {
          include: { group: true },
        },
      },
      orderBy: { created_at: 'asc' },
      take: 5,
    });

    // Fallback if not found via workspace.owner
    if (bots.length < 5) {
      const existingIds = bots.map((b) => b.id);
      const extraBots = await prisma.botApplication.findMany({
        where: {
          id: { notIn: existingIds },
          operational_role: { not: 'oauth_redirect' },
          display_name: { not: 'Roynix Loud' },
          application_id: { notIn: [redirectClientId, '1560261747137454161'].filter(Boolean) },
          status: { notIn: ['removed', 'disabled'] },
        },
        include: {
          credentials: {
            select: {
              id: true,
              credential_version: true,
              status: true,
              created_at: true,
              rotated_at: true,
            },
            orderBy: { credential_version: 'desc' },
            take: 1,
          },
          guild_accesses: {
            include: {
              guild: {
                select: { id: true, guild_id: true, display_name: true, verification_status: true },
              },
            },
          },
          group_memberships: {
            include: { group: true },
          },
        },
        orderBy: { created_at: 'asc' },
        take: 5 - bots.length,
      });
      bots = [...bots, ...extraBots];
    }

    return bots;
  }

  /**
   * Retrieves active Discord Clients for the 5 developer bots allocated to Free Tier.
   */
  public static getFreeTierDeveloperClients(): Client[] {
    return this.getWorkerClients().slice(0, 5);
  }

  /**
   * Retrieve all active Discord Clients across the fleet.
   */
  public static getAllClients(): Client[] {
    return Array.from(this.connections.values())
      .map((c) => c.client)
      .filter((c): c is Client => Boolean(c));
  }

  /**
   * Instruct all active Discord bots in the fleet to exit / leave a specific guild.
   */
  public static async leaveGuildAcrossFleet(guildDiscordId: string): Promise<{ departedCount: number }> {
    const clients = this.getAllClients();
    let departedCount = 0;

    await Promise.allSettled(
      clients.map(async (client) => {
        try {
          const guild =
            client.guilds.cache.get(guildDiscordId) ||
            (await client.guilds.fetch(guildDiscordId).catch(() => null));
          if (guild) {
            await guild.leave();
            departedCount++;
            console.log(
              `[FleetGateway] Bot ${client.user?.tag || client.user?.id} successfully exited guild ${guildDiscordId}`
            );
          }
        } catch (err: any) {
          console.warn(
            `[FleetGateway] Bot ${client.user?.tag || client.user?.id} failed to leave guild ${guildDiscordId}:`,
            err?.message || err
          );
        }
      })
    );

    return { departedCount };
  }

  /**
   * Connect a single bot to Discord Gateway.
   * Brings the bot ONLINE in Discord with a green dot and updates its status.
   */
  public static async connectBot(botId: string, token: string): Promise<boolean> {
    const existing = this.connections.get(botId);
    if (existing && existing.status === 'connected') {
      return true;
    }

    const trimmed = token.trim();
    const isMock =
      trimmed.startsWith('mock_') ||
      trimmed.startsWith('test_') ||
      trimmed.includes('.mock_') ||
      trimmed.includes('.test_');

    if (isMock) {
      this.connections.set(botId, {
        botId,
        applicationId: 'mock',
        displayName: 'Mock Bot',
        client: null,
        status: 'connected',
        isMock: true,
        connectedAt: new Date(),
        pingMs: 15,
      });

      try {
        await prisma.botApplication.update({
          where: { id: botId },
          data: { status: 'connected', last_health_check_at: new Date() },
        });
      } catch {}

      return true;
    }

    try {
      this.connections.set(botId, {
        botId,
        applicationId: '',
        displayName: '',
        client: null,
        status: 'connecting',
        isMock: false,
      });

      const client = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildVoiceStates,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
          GatewayIntentBits.DirectMessages,
        ],
        makeCache: Options.cacheWithLimits({
          MessageManager: 0,
          PresenceManager: 0,
          ReactionManager: 0,
          ReactionUserManager: 0,
          ThreadManager: 0,
          ThreadMemberManager: 0,
          StageInstanceManager: 0,
          GuildScheduledEventManager: 0,
          GuildBanManager: 0,
          GuildInviteManager: 0,
          AutoModerationRuleManager: 0,
          GuildEmojiManager: 0,
          GuildStickerManager: 0,
        }),
        sweepers: {
          ...Options.DefaultSweeperSettings,
          messages: {
            interval: 120,
            lifetime: 60,
          },
        },
      });

      // Attach prefix message listener (!dm, !status, !join, !leave, !fleet, etc.)
      client.on('messageCreate', (message) => {
        BotCommandService.handleMessage(client, botId, message).catch((err) =>
          console.error(`[FleetGateway] Error in messageCreate for bot ${botId}:`, err)
        );
      });

      // Attach interaction listener for button clicks (e.g. reveal license key)
      client.on('interactionCreate', (interaction) => {
        BotCommandService.handleInteraction(client, botId, interaction).catch((err) =>
          console.error(`[FleetGateway] Error in interactionCreate for bot ${botId}:`, err)
        );
      });

      const loginPromise = new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => {
          console.warn(`[FleetGateway] Connection timeout for bot ${botId}`);
          resolve(false);
        }, 30000);

        client.once('ready', async () => {
          clearTimeout(timeout);
          try {
            const isRedirect = FleetGatewayService.isRedirectBot(client) || FleetGatewayService.isRedirectBot(botId);
            client.user?.setPresence({
              status: 'online',
              activities: [
                {
                  name: isRedirect
                    ? 'OAuth & Premium Manager • !premium'
                    : 'Studio Voice Fleet • !help',
                  type: ActivityType.Custom,
                },
              ],
            });

            const botUserId = client.user?.id || '';
            this.connections.set(botId, {
              botId,
              applicationId: botUserId,
              displayName: client.user?.username || '',
              client,
              status: 'connected',
              isMock: false,
              connectedAt: new Date(),
              pingMs: client.ws.ping >= 0 ? client.ws.ping : 25,
            });

            // Sync all bot applications sharing this application ID / user ID to connected
            try {
              await prisma.botApplication.updateMany({
                where: {
                  OR: [
                    { id: botId },
                    ...(botUserId ? [{ application_id: botUserId }, { verified_bot_user_id: botUserId }] : []),
                  ],
                },
                data: { status: 'connected', last_health_check_at: new Date() },
              });
            } catch {}

            console.log(`[FleetGateway] Bot ${client.user?.tag} (${botId}) is now ONLINE in Discord (!prefix commands enabled)`);

            resolve(true);
          } catch (readyErr) {
            console.error(`[FleetGateway] Error in ready handler for bot ${botId}:`, readyErr);
            resolve(true);
          }
        });

        client.on('error', (err) => {
          console.error(`[FleetGateway] Discord client error for bot ${botId}:`, err);
        });

        client.on('disconnect', async () => {
          console.warn(`[FleetGateway] Bot ${botId} disconnected from Discord Gateway`);
          const conn = this.connections.get(botId);
          if (conn) conn.status = 'disconnected';

          try {
            await prisma.botApplication.update({
              where: { id: botId },
              data: { status: 'disconnected' },
            });
          } catch {}

          const isRedirect = FleetGatewayService.isRedirectBot(client) || FleetGatewayService.isRedirectBot(botId);
          if (isRedirect) {
            console.log(`[FleetGateway] Roynix Loud (OAuth Redirect bot) auto-reconnecting to maintain 100% uptime...`);
            setTimeout(() => {
              this.ensureRedirectBotOnline().catch(() => {});
            }, 2500);
          }
        });
      });

      await client.login(trimmed);
      const connected = await loginPromise;
      return connected;
    } catch (err: any) {
      console.error(`[FleetGateway] Failed to connect bot ${botId} to Discord Gateway:`, err.message);
      this.connections.set(botId, {
        botId,
        applicationId: '',
        displayName: '',
        client: null,
        status: 'error',
        isMock: false,
      });

      const isInvalidToken =
        err.message?.includes('TOKEN_INVALID') ||
        err.message?.includes('401') ||
        err.code === 'TokenInvalid' ||
        err.message?.includes('An invalid token was provided');

      try {
        await prisma.botApplication.update({
          where: { id: botId },
          data: {
            status: isInvalidToken ? 'credential_invalid' : 'disconnected',
            last_health_check_at: new Date(),
          },
        });
      } catch {}

      return false;
    }
  }

  /**
   * Disconnect a single bot from Discord Gateway.
   * Protects Roynix Loud and Developer bots from being disconnected by non-developers.
   * Synchronizes offline status across all workspaces sharing the same bot token/application ID.
   */
  public static async disconnectBot(
    botId: string,
    force: boolean = false,
    actorDiscordId?: string
  ): Promise<{ success: boolean; error?: string }> {
    const DEVELOPER_ID = '788970167907778562';
    const isDev = await this.isDeveloperBot(botId);

    if (isDev && !force && actorDiscordId !== DEVELOPER_ID) {
      console.warn(`[FleetGateway] Disconnect blocked: Bot ${botId} is a developer bot and actor is ${actorDiscordId}`);
      return {
        success: false,
        error: 'Developer bot tokens cannot be taken offline by other users. Only the developer (788970167907778562) can make developer bots offline.',
      };
    }

    if (!force && this.isRedirectBot(botId)) {
      console.log(`[FleetGateway] Bot ${botId} is Roynix Loud (OAuth Redirect) — staying always online.`);
      return { success: true };
    }

    // Look up bot record to find application_id and verified_bot_user_id
    const bot = await prisma.botApplication.findUnique({
      where: { id: botId },
      select: { id: true, application_id: true, verified_bot_user_id: true, workspace_id: true },
    });

    const targetAppIds = new Set<string>();
    if (bot?.application_id) targetAppIds.add(bot.application_id);
    if (bot?.verified_bot_user_id) targetAppIds.add(bot.verified_bot_user_id);

    // Destroy all matching client connections
    const connsToRemove: string[] = [];
    for (const [id, conn] of this.connections.entries()) {
      const match =
        id === botId ||
        (conn.applicationId && targetAppIds.has(conn.applicationId)) ||
        (conn.client?.user?.id && targetAppIds.has(conn.client.user.id));

      if (match) {
        if (conn.client) {
          try {
            conn.client.destroy();
          } catch {}
        }
        connsToRemove.push(id);
      }
    }

    for (const id of connsToRemove) {
      this.connections.delete(id);
    }

    // Update DB status for ALL bot applications sharing this application ID across all workspaces
    const whereOr: any[] = [{ id: botId }];
    if (bot?.application_id) whereOr.push({ application_id: bot.application_id });
    if (bot?.verified_bot_user_id) whereOr.push({ verified_bot_user_id: bot.verified_bot_user_id });

    try {
      await prisma.botApplication.updateMany({
        where: { OR: whereOr },
        data: { status: 'ready' },
      });
    } catch {}

    // Realtime broadcast to all affected workspaces
    try {
      const { realtimeBroadcaster } = await import('../realtime/events');
      const affectedWorkspaces = await prisma.botApplication.findMany({
        where: { OR: whereOr },
        select: { workspace_id: true, id: true },
      });
      for (const aw of affectedWorkspaces) {
        realtimeBroadcaster.broadcast(aw.workspace_id, 'bot.disconnected', {
          botId: aw.id,
          online: false,
          status: 'ready',
        });
      }
    } catch {}

    return { success: true };
  }

  /**
   * Connect all active bots in a workspace to Discord Gateway so they all appear ONLINE.
   */
  public static async connectWorkspaceFleet(
    workspaceId: string
  ): Promise<{ total: number; connected: number; results: any[] }> {
    // Keep Roynix Loud online
    await this.ensureRedirectBotOnline();
    this.startRedirectBotWatchdog();

    const bots = await prisma.botApplication.findMany({
      where: {
        workspace_id: workspaceId,
        status: { notIn: ['removed', 'disabled'] },
      },
      include: {
        credentials: {
          where: { status: 'active' },
          orderBy: { credential_version: 'desc' },
          take: 1,
        },
      },
    });

    const results = [];
    let connectedCount = 0;

    for (const bot of bots) {
      if (!bot.credentials.length) {
        results.push({ botId: bot.id, name: bot.display_name, success: false, reason: 'No active credential' });
        continue;
      }

      try {
        const token = decryptSecret(bot.credentials[0].secret_reference);
        const success = await this.connectBot(bot.id, token);
        if (success) {
          connectedCount++;
          results.push({ botId: bot.id, name: bot.display_name, success: true });
        } else {
          results.push({ botId: bot.id, name: bot.display_name, success: false, reason: 'Gateway login failed' });
        }
      } catch (err: any) {
        results.push({ botId: bot.id, name: bot.display_name, success: false, reason: err.message });
      }
    }

    return {
      total: bots.length,
      connected: connectedCount,
      results,
    };
  }

  /**
   * Disconnect all active worker bots in a workspace.
   * Roynix Loud and Developer Bots are strictly protected if actor is not developer.
   */
  public static async disconnectWorkspaceFleet(workspaceId: string, actorDiscordId?: string): Promise<void> {
    const bots = await prisma.botApplication.findMany({
      where: {
        workspace_id: workspaceId,
        operational_role: { not: 'oauth_redirect' },
        application_id: { notIn: [process.env.DISCORD_CLIENT_ID?.trim() || '', '1560261747137454161'].filter(Boolean) },
      },
      select: { id: true, application_id: true },
    });

    for (const b of bots) {
      if (this.isRedirectBot(b.id)) continue;
      const isDev = await this.isDeveloperBot(b.id, b.application_id);
      if (isDev && actorDiscordId !== '788970167907778562') {
        console.log(`[FleetGateway] Skipped disconnecting developer bot ${b.id} during workspace fleet disconnect.`);
        continue;
      }
      await this.disconnectBot(b.id, false, actorDiscordId);
    }
  }

  private static redirectWatchdogTimer: NodeJS.Timeout | null = null;

  /**
   * Guarantee that Roynix Loud (OAuth Redirect / Developer Bot) is ALWAYS connected and stays online.
   * Auto-reconnects on boot, on disconnect, and runs a periodic 30-second watchdog.
   */
  public static async ensureRedirectBotOnline(): Promise<boolean> {
    const redirectClientId = process.env.DISCORD_CLIENT_ID?.trim() || '1560261747137454161';

    // 1. Check if already connected in Gateway
    for (const conn of this.connections.values()) {
      if (
        conn.status === 'connected' &&
        conn.client?.isReady() &&
        (conn.applicationId === redirectClientId ||
          conn.botId === redirectClientId ||
          this.isRedirectBot(conn.botId) ||
          this.isRedirectBot(conn.applicationId))
      ) {
        return true;
      }
    }

    // 2. Locate Roynix Loud bot record from database
    try {
      const redirectBot = await prisma.botApplication.findFirst({
        where: {
          OR: [
            { operational_role: 'oauth_redirect' },
            { application_id: redirectClientId },
            { application_id: '1560261747137454161' },
            { display_name: 'Roynix Loud' },
          ],
        },
        include: {
          credentials: {
            where: { status: 'active' },
            orderBy: { credential_version: 'desc' },
            take: 1,
          },
        },
      });

      let tokenToUse: string | null = null;
      let botIdToUse: string | null = null;

      if (redirectBot) {
        botIdToUse = redirectBot.id;
        if (redirectBot.credentials.length > 0) {
          try {
            tokenToUse = decryptSecret(redirectBot.credentials[0].secret_reference);
          } catch {}
        }
      }

      // Fallback to DISCORD_BOT_TOKEN environment variable if DB token not found
      if (!tokenToUse && process.env.DISCORD_BOT_TOKEN) {
        tokenToUse = process.env.DISCORD_BOT_TOKEN.trim();
        if (!botIdToUse) {
          botIdToUse = redirectBot?.id || '0f146450-9db5-45f6-bef3-34fd98e12634';
        }
      }

      if (tokenToUse && botIdToUse) {
        console.log(`[FleetGateway] Ensuring Roynix Loud (${botIdToUse}) is online in Discord Gateway...`);
        const connected = await this.connectBot(botIdToUse, tokenToUse);
        return connected;
      }
    } catch (err: any) {
      console.warn(`[FleetGateway] ensureRedirectBotOnline error:`, err.message);
    }

    return false;
  }

  /**
   * Start 30-second watchdog to keep Roynix Loud 100% online
   */
  public static startRedirectBotWatchdog(): void {
    if (this.redirectWatchdogTimer) return;
    this.redirectWatchdogTimer = setInterval(() => {
      this.ensureRedirectBotOnline().catch(() => {});
    }, 30000);
    // Initial immediate check
    this.ensureRedirectBotOnline().catch(() => {});
  }

  /**
   * Auto-connect all ready bots across all workspaces on server startup.
   */
  public static async autoConnectAll(): Promise<void> {
    try {
      // 1. Ensure Roynix Loud connects first and stays online
      await this.ensureRedirectBotOnline();
      this.startRedirectBotWatchdog();

      const bots = await prisma.botApplication.findMany({
        where: {
          status: { notIn: ['removed', 'disabled'] },
          display_name: { not: 'Integration Test Bot' },
        },
        include: {
          credentials: {
            where: { status: 'active' },
            orderBy: { credential_version: 'desc' },
            take: 1,
          },
        },
      });

      console.log(`[FleetGateway] Auto-connecting ${bots.length} registered bot(s) to Discord Gateway (staggered 400ms)...`);
      for (const bot of bots) {
        if (bot.credentials.length > 0) {
          try {
            const token = decryptSecret(bot.credentials[0].secret_reference);
            this.connectBot(bot.id, token).catch((err) => {
              console.warn(`[FleetGateway] Auto-connect error for ${bot.display_name}:`, err.message);
            });
            // Stagger bot logins by 400ms so Discord API does not rate-limit or timeout
            await new Promise((r) => setTimeout(r, 400));
          } catch {}
        }
      }
    } catch (err: any) {
      console.warn('[FleetGateway] Auto-connect query warning:', err.message);
    }
  }

  /**
   * Check if a bot is currently online in Discord Gateway.
   * Supports cross-workspace token sharing: if any connection matches the same application ID or bot user ID, it reports online.
   */
  public static isBotOnline(botId: string, applicationId?: string, botUserId?: string): boolean {
    const directConn = this.connections.get(botId);
    if (directConn && directConn.status === 'connected' && (!directConn.client || directConn.client.isReady())) {
      return true;
    }

    const targetIds = [applicationId, botUserId].filter(Boolean) as string[];
    if (targetIds.length > 0) {
      for (const conn of this.connections.values()) {
        if (conn.status === 'connected' && (!conn.client || conn.client.isReady())) {
          if (
            targetIds.includes(conn.applicationId) ||
            (conn.client?.user?.id && targetIds.includes(conn.client.user.id))
          ) {
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * Check if a bot client is connected and present in a specific guild.
   */
  public static isBotInGuild(botId: string, guildId: string, applicationId?: string): boolean {
    const directConn = this.connections.get(botId);
    if (directConn?.client && directConn.client.isReady()) {
      return directConn.client.guilds.cache.has(guildId);
    }

    if (applicationId) {
      for (const conn of this.connections.values()) {
        if (conn?.client && conn.client.isReady()) {
          if (conn.applicationId === applicationId || conn.client.user?.id === applicationId) {
            return conn.client.guilds.cache.has(guildId);
          }
        }
      }
    }

    return false;
  }

  /**
   * Get all guild IDs that the connected bot client is currently in.
   * Supports cross-workspace token sharing.
   */
  public static getBotGuildIds(botId: string, applicationId?: string, botUserId?: string): string[] {
    const directConn = this.connections.get(botId);
    if (directConn?.client && directConn.client.isReady()) {
      return Array.from(directConn.client.guilds.cache.keys());
    }

    const targetIds = [applicationId, botUserId].filter(Boolean) as string[];
    if (targetIds.length > 0) {
      for (const conn of this.connections.values()) {
        if (conn?.client && conn.client.isReady()) {
          if (
            targetIds.includes(conn.applicationId) ||
            (conn.client?.user?.id && targetIds.includes(conn.client.user.id))
          ) {
            return Array.from(conn.client.guilds.cache.keys());
          }
        }
      }
    }

    return [];
  }

  /**
   * Get ping and online status for all specified bots.
   */
  public static getBotStatuses(
    botIds: string[]
  ): Record<string, { online: boolean; pingMs: number }> {
    const statuses: Record<string, { online: boolean; pingMs: number }> = {};
    for (const id of botIds) {
      const conn = this.connections.get(id);
      const isOnline = !!(conn && conn.status === 'connected');
      statuses[id] = {
        online: isOnline,
        pingMs: conn?.pingMs ?? 0,
      };
    }
    return statuses;
  }

  /**
   * Force disconnect ALL active bot clients in the fleet from voice channels simultaneously.
   * Sends raw Discord Gateway Opcode 4 (channel_id: null) and terminates all voice connections in parallel.
   */
  public static async forceDisconnectAllVoice(targetGuildId?: string): Promise<{ total: number; disconnected: number }> {
    const clients = this.getAllClients();
    console.log(`[FleetGateway] Force-disconnecting voice across all ${clients.length} active bot client(s)...`);

    let disconnectedCount = 0;

    await Promise.allSettled(
      clients.map(async (client) => {
        try {
          const guildsToProcess = targetGuildId
            ? [client.guilds.cache.get(targetGuildId)].filter(Boolean)
            : Array.from(client.guilds.cache.values());

          for (const guild of guildsToProcess) {
            if (!guild) continue;
            try {
              const currentVoiceChannelId = guild.members.me?.voice?.channelId;
              const botGroupId = client.user?.id || '';

              // Clean up any @discordjs/voice connection
              const globalConn = getVoiceConnection(guild.id, botGroupId);
              if (globalConn) {
                try {
                  globalConn.removeAllListeners('error');
                  globalConn.destroy();
                } catch {}
              }

              // Disconnect member voice state
              if (guild.members.me?.voice) {
                try {
                  guild.members.me.voice.disconnect().catch(() => {});
                } catch {}
              }

              // Send raw Discord Gateway Opcode 4 (Voice State Update with channel_id: null)
              if (guild.shard) {
                try {
                  guild.shard.send({
                    op: 4,
                    d: {
                      guild_id: guild.id,
                      channel_id: null,
                      self_mute: false,
                      self_deaf: false,
                    },
                  });
                } catch {}
              }

              // Clean up client voice adapter
              try {
                guild.client.voice.adapters.delete(guild.id);
              } catch {}

              if (currentVoiceChannelId || globalConn) {
                disconnectedCount++;
              }
            } catch (gErr: any) {
              console.warn(`[FleetGateway] Force disconnect error in guild ${guild.id}:`, gErr?.message || gErr);
            }
          }
        } catch (cErr: any) {
          console.warn(`[FleetGateway] Force disconnect client error:`, cErr?.message || cErr);
        }
      })
    );

    console.log(`[FleetGateway] Force-disconnect complete. Disconnected ${disconnectedCount} bot voice instance(s) simultaneously!`);
    return { total: clients.length, disconnected: disconnectedCount };
  }

  /**
   * Force disconnect active bot clients belonging strictly to a specific workspace from voice channels simultaneously.
   */
  public static async forceDisconnectWorkspaceVoice(workspaceId: string, targetGuildId?: string): Promise<{ total: number; disconnected: number }> {
    if (!workspaceId) return { total: 0, disconnected: 0 };
    const clients = await this.getWorkspaceWorkerClients(workspaceId);
    console.log(`[FleetGateway] Force-disconnecting voice across ${clients.length} active bot client(s) for workspace ${workspaceId}...`);

    let disconnectedCount = 0;

    await Promise.allSettled(
      clients.map(async (client) => {
        try {
          const guildsToProcess = targetGuildId
            ? [client.guilds.cache.get(targetGuildId)].filter(Boolean)
            : Array.from(client.guilds.cache.values());

          for (const guild of guildsToProcess) {
            if (!guild) continue;
            try {
              const currentVoiceChannelId = guild.members.me?.voice?.channelId;
              const botGroupId = client.user?.id || '';

              // Clean up any @discordjs/voice connection
              const globalConn = getVoiceConnection(guild.id, botGroupId);
              if (globalConn) {
                try {
                  globalConn.removeAllListeners('error');
                  globalConn.destroy();
                } catch {}
              }

              // Disconnect member voice state
              if (guild.members.me?.voice) {
                try {
                  guild.members.me.voice.disconnect().catch(() => {});
                } catch {}
              }

              // Send raw Discord Gateway Opcode 4 (Voice State Update with channel_id: null)
              if (guild.shard) {
                try {
                  guild.shard.send({
                    op: 4,
                    d: {
                      guild_id: guild.id,
                      channel_id: null,
                      self_mute: false,
                      self_deaf: false,
                    },
                  });
                } catch {}
              }

              // Clean up client voice adapter
              try {
                guild.client.voice.adapters.delete(guild.id);
              } catch {}

              if (currentVoiceChannelId || globalConn) {
                disconnectedCount++;
              }
            } catch (gErr: any) {
              console.warn(`[FleetGateway] Workspace force disconnect error in guild ${guild.id}:`, gErr?.message || gErr);
            }
          }
        } catch (cErr: any) {
          console.warn(`[FleetGateway] Workspace force disconnect client error:`, cErr?.message || cErr);
        }
      })
    );

    console.log(`[FleetGateway] Workspace force-disconnect complete for ${workspaceId}. Disconnected ${disconnectedCount} bot voice instance(s)!`);
    return { total: clients.length, disconnected: disconnectedCount };
  }
}
