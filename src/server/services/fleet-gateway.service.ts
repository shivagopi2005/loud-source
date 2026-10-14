import { Client, GatewayIntentBits, ActivityType } from 'discord.js';
import { prisma } from '../db/prisma';
import { decryptSecret } from '../security/encryption';

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

export class FleetGatewayService {
  private static connections = new Map<string, BotGatewayConnection>();

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
        ],
      });

      const loginPromise = new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => {
          console.warn(`[FleetGateway] Connection timeout for bot ${botId}`);
          resolve(false);
        }, 15000);

        client.once('ready', async () => {
          clearTimeout(timeout);
          try {
            client.user?.setPresence({
              status: 'online',
              activities: [
                {
                  name: 'Studio Voice Fleet',
                  type: ActivityType.Custom,
                },
              ],
            });

            this.connections.set(botId, {
              botId,
              applicationId: client.user?.id || '',
              displayName: client.user?.username || '',
              client,
              status: 'connected',
              isMock: false,
              connectedAt: new Date(),
              pingMs: client.ws.ping >= 0 ? client.ws.ping : 25,
            });

            await prisma.botApplication.update({
              where: { id: botId },
              data: { status: 'connected', last_health_check_at: new Date() },
            });

            console.log(`[FleetGateway] Bot ${client.user?.tag} (${botId}) is now ONLINE in Discord!`);
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

      try {
        await prisma.botApplication.update({
          where: { id: botId },
          data: { status: 'credential_invalid', last_health_check_at: new Date() },
        });
      } catch {}

      return false;
    }
  }

  /**
   * Disconnect a single bot from Discord Gateway.
   */
  public static async disconnectBot(botId: string): Promise<void> {
    const conn = this.connections.get(botId);
    if (conn) {
      if (conn.client) {
        try {
          conn.client.destroy();
        } catch {}
      }
      this.connections.delete(botId);
    }

    try {
      await prisma.botApplication.update({
        where: { id: botId },
        data: { status: 'ready' },
      });
    } catch {}
  }

  /**
   * Connect all active bots in a workspace to Discord Gateway so they all appear ONLINE.
   */
  public static async connectWorkspaceFleet(
    workspaceId: string
  ): Promise<{ total: number; connected: number; results: any[] }> {
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
   * Disconnect all active bots in a workspace.
   */
  public static async disconnectWorkspaceFleet(workspaceId: string): Promise<void> {
    const bots = await prisma.botApplication.findMany({
      where: { workspace_id: workspaceId },
      select: { id: true },
    });

    for (const b of bots) {
      await this.disconnectBot(b.id);
    }
  }

  /**
   * Auto-connect all ready bots across all workspaces on server startup.
   */
  public static async autoConnectAll(): Promise<void> {
    try {
      const bots = await prisma.botApplication.findMany({
        where: { status: { in: ['ready', 'connected'] } },
        include: {
          credentials: {
            where: { status: 'active' },
            orderBy: { credential_version: 'desc' },
            take: 1,
          },
        },
      });

      console.log(`[FleetGateway] Auto-connecting ${bots.length} registered bot(s) to Discord Gateway...`);
      for (const bot of bots) {
        if (bot.credentials.length > 0) {
          try {
            const token = decryptSecret(bot.credentials[0].secret_reference);
            // Non-blocking connection per bot
            this.connectBot(bot.id, token).catch((err) => {
              console.warn(`[FleetGateway] Auto-connect error for ${bot.display_name}:`, err.message);
            });
          } catch {}
        }
      }
    } catch (err: any) {
      console.warn('[FleetGateway] Auto-connect query warning:', err.message);
    }
  }

  /**
   * Check if a bot is currently online in Discord Gateway.
   */
  public static isBotOnline(botId: string): boolean {
    const conn = this.connections.get(botId);
    return !!(conn && conn.status === 'connected');
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
}
