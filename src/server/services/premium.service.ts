import crypto from 'crypto';
import { prisma } from '../db/prisma';
import { redisConnection } from '../jobs/queue';

export const DEVELOPER_ID = '788970167907778562';
export const DEVELOPER_IDS = ['788970167907778562', '261661821'];
export const DEVELOPER_USERNAMES = ['shivagopi2005', 'root_roy'];

export function isDeveloperId(discordId?: string | null): boolean {
  if (!discordId) return false;
  return DEVELOPER_IDS.includes(discordId.trim());
}

export function isDeveloperUser(user?: { discord_id?: string | null; username?: string | null; tier?: string | null } | null): boolean {
  if (!user) return false;
  if (user.discord_id && DEVELOPER_IDS.includes(user.discord_id.trim())) return true;
  if (user.username && DEVELOPER_USERNAMES.includes(user.username.trim().toLowerCase())) return true;
  if (user.tier === 'developer') return true;
  return false;
}

export type TierType =
  | 'trial'
  | 'community'
  | 'pro'
  | 'enterprise'
  | 'developer'
  | 'free'
  | 'premium';

export interface UserTierInfo {
  tier: TierType;
  displayName: string;
  maxBots: number;
  maxVolume: number;
  maxSpamCount: number;
  audioQuality: number; // in kbps (128 vs 320)
  maxCommandUses: number; // 10 for trial, Infinity for others
  expiresAt: Date | null;
  isExpired: boolean;
  isDeveloper: boolean;
}

export class PremiumService {
  private static trialUsageMap = new Map<string, number>();

  /**
   * Retrieves the number of fleet commands used by a Community Trial user
   */
  public static async getTrialCommandUsage(discordUserId: string): Promise<number> {
    try {
      const val = await redisConnection.get(`trial:commands:${discordUserId}`);
      if (val !== null) return parseInt(val, 10) || 0;
    } catch {}
    return this.trialUsageMap.get(discordUserId) || 0;
  }

  /**
   * Increments the trial command counter for a user (limit: 10 uses)
   */
  public static async incrementTrialUsage(discordUserId: string): Promise<number> {
    let newCount = 1;
    try {
      newCount = await redisConnection.incr(`trial:commands:${discordUserId}`);
    } catch {}
    const current = this.trialUsageMap.get(discordUserId) || 0;
    const finalCount = Math.max(newCount, current + 1);
    this.trialUsageMap.set(discordUserId, finalCount);
    return finalCount;
  }

  /**
   * Resets the trial command usage for a user
   */
  public static async resetTrialUsage(discordUserId: string): Promise<void> {
    try {
      await redisConnection.del(`trial:commands:${discordUserId}`);
    } catch {}
    this.trialUsageMap.delete(discordUserId);
  }

  /**
   * Retrieves tier information and feature limits for a given Discord User ID
   */
  public static async getUserTier(discordUserId: string): Promise<UserTierInfo> {
    // 1. Supreme Developer check - unrestricted access
    if (isDeveloperId(discordUserId)) {
      return {
        tier: 'developer',
        displayName: 'Developer',
        maxBots: 99,
        maxVolume: 10000,
        maxSpamCount: Infinity,
        audioQuality: 320,
        maxCommandUses: Infinity,
        expiresAt: null,
        isExpired: false,
        isDeveloper: true,
      };
    }

    // 2. Fetch User from DB
    const user = await prisma.user.findUnique({
      where: { discord_id: discordUserId },
    });

    if (!user) {
      // Default to Community Trial tier if user has not yet interacted with database
      return {
        tier: 'trial',
        displayName: 'Community Trial',
        maxBots: 5,
        maxVolume: 200,
        maxSpamCount: 5,
        audioQuality: 128,
        maxCommandUses: 10,
        expiresAt: null,
        isExpired: false,
        isDeveloper: false,
      };
    }

    // 3. Developer Tier on User or Developer Username
    if (user.tier === 'developer' || isDeveloperUser(user)) {
      return {
        tier: 'developer',
        displayName: 'Developer',
        maxBots: 99,
        maxVolume: 10000,
        maxSpamCount: Infinity,
        audioQuality: 320,
        maxCommandUses: Infinity,
        expiresAt: null,
        isExpired: false,
        isDeveloper: true,
      };
    }

    // Check expiration for all time-limited tiers
    const isExpired = !!(
      user.premium_expires_at && new Date() > user.premium_expires_at
    );

    if (isExpired) {
      return {
        tier: 'trial',
        displayName: 'Community Trial',
        maxBots: 5,
        maxVolume: 200,
        maxSpamCount: 5,
        audioQuality: 128,
        maxCommandUses: 10,
        expiresAt: user.premium_expires_at,
        isExpired: true,
        isDeveloper: false,
      };
    }

    // 4. Enterprise Fleet Tier (₹299)
    if (user.tier === 'enterprise') {
      return {
        tier: 'enterprise',
        displayName: 'Enterprise Fleet (₹299)',
        maxBots: user.max_bots_allowed || 100,
        maxVolume: 10000,
        maxSpamCount: 999,
        audioQuality: 320,
        maxCommandUses: Infinity,
        expiresAt: user.premium_expires_at,
        isExpired: false,
        isDeveloper: false,
      };
    }

    // 5. Professional Studio Tier (₹99) / Legacy Premium
    if (user.tier === 'pro' || user.tier === 'premium') {
      return {
        tier: 'pro',
        displayName: 'Professional Studio (₹99)',
        maxBots: user.max_bots_allowed || 20,
        maxVolume: 10000,
        maxSpamCount: 50,
        audioQuality: 320,
        maxCommandUses: Infinity,
        expiresAt: user.premium_expires_at,
        isExpired: false,
        isDeveloper: false,
      };
    }

    // 6. Community Plan Tier (₹29)
    if (user.tier === 'community') {
      return {
        tier: 'community',
        displayName: 'Community Plan (₹29)',
        maxBots: user.max_bots_allowed || 5,
        maxVolume: 200,
        maxSpamCount: 5,
        audioQuality: 128,
        maxCommandUses: Infinity,
        expiresAt: user.premium_expires_at,
        isExpired: false,
        isDeveloper: false,
      };
    }

    // 7. Community Trial (Free Tier / ₹0)
    return {
      tier: 'trial',
      displayName: 'Community Trial',
      maxBots: 5,
      maxVolume: 200,
      maxSpamCount: 5,
      audioQuality: 128,
      maxCommandUses: 10,
      expiresAt: null,
      isExpired: false,
      isDeveloper: false,
    };
  }

  /**
   * Enables a specific Tier directly on a Discord User ID
   * @param discordUserId - The Discord user snowflake ID
   * @param tier - 'trial' | 'community' | 'pro' | 'enterprise'
   * @param durationDays - Days of premium (0 = lifetime)
   * @param activatedById - Who activated it
   */
  public static async enableUserTier(
    discordUserId: string,
    tier: TierType = 'pro',
    durationDays: number = 30,
    activatedById: string = 'system'
  ) {
    const expiresAt =
      durationDays > 0 ? new Date(Date.now() + durationDays * 86400000) : null;

    let maxBots = 5;
    if (tier === 'pro' || tier === 'premium') maxBots = 20;
    else if (tier === 'enterprise') maxBots = 100;
    else if (tier === 'developer') maxBots = 99;

    if (tier === 'trial') {
      await this.resetTrialUsage(discordUserId);
    }

    const user = await prisma.user.upsert({
      where: { discord_id: discordUserId },
      update: {
        tier,
        max_bots_allowed: maxBots,
        premium_expires_at: expiresAt,
      },
      create: {
        discord_id: discordUserId,
        username: `User_${discordUserId.slice(-4)}`,
        tier,
        max_bots_allowed: maxBots,
        premium_expires_at: expiresAt,
        status: 'active',
      },
    });

    // Also sync all workspaces owned by this user
    try {
      await prisma.workspace.updateMany({
        where: { owner_user_id: user.id },
        data: { plan_id: tier },
      });
    } catch (wsErr) {
      console.warn('[PremiumService] Could not update workspace plans:', wsErr);
    }

    console.log(
      `[PremiumService] Activated ${tier.toUpperCase()} for user ${discordUserId} (${durationDays === 0 ? 'Lifetime' : `${durationDays} days`}) by ${activatedById}`
    );

    return user;
  }

  /**
   * Legacy convenience wrapper for enabling Pro / Premium
   */
  public static async enableUserPremium(
    discordUserId: string,
    durationDays: number = 30,
    activatedById: string = 'system'
  ) {
    return this.enableUserTier(discordUserId, 'pro', durationDays, activatedById);
  }

  /**
   * Disables Premium tier for a user and reverts back to Community Trial
   */
  public static async disableUserPremium(discordUserId: string) {
    const user = await prisma.user.updateMany({
      where: { discord_id: discordUserId },
      data: {
        tier: 'trial',
        max_bots_allowed: 5,
        premium_expires_at: null,
      },
    });

    try {
      const dbUser = await prisma.user.findUnique({ where: { discord_id: discordUserId } });
      if (dbUser) {
        await prisma.workspace.updateMany({
          where: { owner_user_id: dbUser.id },
          data: { plan_id: 'trial' },
        });
      }
    } catch {}

    console.log(`[PremiumService] Reverted user ${discordUserId} to Community Trial`);
    return user;
  }

  /**
   * Generates a 16-character redeemable license key (Developer only)
   */
  public static async generateLicenseKey(
    developerId: string,
    durationDays: number = 30,
    tier: string = 'pro'
  ): Promise<string> {
    const raw = crypto.randomBytes(6).toString('hex').toUpperCase();
    const code = `LOUD-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;

    await prisma.licenseKey.create({
      data: {
        code,
        tier,
        duration_days: durationDays,
        created_by: developerId,
      },
    });

    return code;
  }

  /**
   * Redeems a license key and binds the plan tier to the calling user's Discord ID
   */
  public static async redeemLicenseKey(
    code: string,
    discordUserId: string
  ): Promise<{ success: boolean; message: string; durationDays: number }> {
    const normalized = code.trim().toUpperCase();

    const key = await prisma.licenseKey.findUnique({
      where: { code: normalized },
    });

    if (!key) {
      return { success: false, message: 'Invalid license key code.', durationDays: 0 };
    }

    if (key.is_redeemed) {
      return {
        success: false,
        message: 'This license key has already been redeemed.',
        durationDays: 0,
      };
    }

    // Mark key redeemed
    await prisma.licenseKey.update({
      where: { id: key.id },
      data: {
        is_redeemed: true,
        redeemed_by: discordUserId,
        redeemed_at: new Date(),
      },
    });

    // Upgrade the user to the key's plan tier
    const targetTier = (key.tier as TierType) || 'pro';
    await this.enableUserTier(discordUserId, targetTier, key.duration_days, discordUserId);

    const planName =
      targetTier === 'enterprise'
        ? 'Enterprise Fleet (₹299)'
        : targetTier === 'pro' || targetTier === 'premium'
        ? 'Professional Studio (₹99)'
        : targetTier === 'community'
        ? 'Community Plan (₹29)'
        : 'Community Trial (₹0)';

    return {
      success: true,
      message:
        key.duration_days === 0
          ? `Lifetime ${planName} activated successfully!`
          : `${planName} activated successfully for ${key.duration_days} days!`,
      durationDays: key.duration_days,
    };
  }

  /**
   * Toggles 24/7 Voice Stay mode for a guild connection
   */
  public static async toggleGuild247(guildId: string): Promise<boolean> {
    const guild = await prisma.guildConnection.findFirst({
      where: { guild_id: guildId },
    });

    if (!guild) return false;

    const updated = await prisma.guildConnection.update({
      where: { id: guild.id },
      data: { stay_247: !guild.stay_247 },
    });

    return updated.stay_247;
  }

  /**
   * Checks whether a guild has 24/7 Voice Stay enabled
   */
  public static async isGuild247(guildId: string): Promise<boolean> {
    const guild = await prisma.guildConnection.findFirst({
      where: { guild_id: guildId },
    });

    return guild?.stay_247 ?? false;
  }

  /**
   * Generates OAuth verification URL
   */
  public static generateOAuthUrl(action: string = 'identify'): string {
    const clientId = process.env.DISCORD_CLIENT_ID || '1316627667180851211';
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const redirectUri = encodeURIComponent(`${appUrl}/api/auth/discord/callback`);
    const state = encodeURIComponent(JSON.stringify({ action }));

    return `https://discord.com/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=identify%20guilds&state=${state}`;
  }
}
