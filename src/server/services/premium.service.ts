import crypto from 'crypto';
import { prisma } from '../db/prisma';

export const DEVELOPER_ID = '788970167907778562';

export type TierType = 'free' | 'premium' | 'developer';

export interface UserTierInfo {
  tier: TierType;
  maxBots: number;
  maxVolume: number;
  maxSpamCount: number;
  audioQuality: number; // in kbps (128 vs 320)
  expiresAt: Date | null;
  isExpired: boolean;
  isDeveloper: boolean;
}

export class PremiumService {
  /**
   * Retrieves tier information and feature limits for a given Discord User ID
   */
  public static async getUserTier(discordUserId: string): Promise<UserTierInfo> {
    // 1. Supreme Developer check - unrestricted access
    if (discordUserId === DEVELOPER_ID) {
      return {
        tier: 'developer',
        maxBots: 99,
        maxVolume: 10000,
        maxSpamCount: 100,
        audioQuality: 320,
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
      // Default to Free tier if user has not yet interacted with database
      return {
        tier: 'free',
        maxBots: 5,
        maxVolume: 200,
        maxSpamCount: 5,
        audioQuality: 128,
        expiresAt: null,
        isExpired: false,
        isDeveloper: false,
      };
    }

    // 3. Developer Tier on User
    if (user.tier === 'developer') {
      return {
        tier: 'developer',
        maxBots: 99,
        maxVolume: 10000,
        maxSpamCount: 100,
        audioQuality: 320,
        expiresAt: null,
        isExpired: false,
        isDeveloper: false,
      };
    }

    // 4. Premium Tier
    if (user.tier === 'premium') {
      // Check expiration
      if (user.premium_expires_at && new Date() > user.premium_expires_at) {
        return {
          tier: 'free',
          maxBots: 5,
          maxVolume: 200,
          maxSpamCount: 5,
          audioQuality: 128,
          expiresAt: user.premium_expires_at,
          isExpired: true,
          isDeveloper: false,
        };
      }

      return {
        tier: 'premium',
        maxBots: user.max_bots_allowed || 20,
        maxVolume: 10000,
        maxSpamCount: 50,
        audioQuality: 320,
        expiresAt: user.premium_expires_at,
        isExpired: false,
        isDeveloper: false,
      };
    }

    // 5. Default Free Tier
    return {
      tier: 'free',
      maxBots: 5,
      maxVolume: 200,
      maxSpamCount: 5,
      audioQuality: 128,
      expiresAt: null,
      isExpired: false,
      isDeveloper: false,
    };
  }

  /**
   * Enables Premium tier directly on a Discord User ID
   * @param discordUserId - The Discord user snowflake ID
   * @param durationDays - Days of premium (0 = lifetime)
   * @param activatedById - Who activated it
   */
  public static async enableUserPremium(
    discordUserId: string,
    durationDays: number = 30,
    activatedById: string = 'system'
  ) {
    const expiresAt =
      durationDays > 0 ? new Date(Date.now() + durationDays * 86400000) : null;

    const user = await prisma.user.upsert({
      where: { discord_id: discordUserId },
      update: {
        tier: 'premium',
        max_bots_allowed: 20,
        premium_expires_at: expiresAt,
      },
      create: {
        discord_id: discordUserId,
        username: `User_${discordUserId.slice(-4)}`,
        tier: 'premium',
        max_bots_allowed: 20,
        premium_expires_at: expiresAt,
        status: 'active',
      },
    });

    console.log(
      `[PremiumService] Activated Premium for user ${discordUserId} (${durationDays === 0 ? 'Lifetime' : `${durationDays} days`}) by ${activatedById}`
    );

    return user;
  }

  /**
   * Disables Premium tier for a user and reverts back to Free (5 bots)
   */
  public static async disableUserPremium(discordUserId: string) {
    const user = await prisma.user.update({
      where: { discord_id: discordUserId },
      data: {
        tier: 'free',
        max_bots_allowed: 5,
        premium_expires_at: null,
      },
    });

    console.log(`[PremiumService] Disabled Premium for user ${discordUserId}`);
    return user;
  }

  /**
   * Generates a 16-character redeemable license key (Developer only)
   */
  public static async generateLicenseKey(
    developerId: string,
    durationDays: number = 30
  ): Promise<string> {
    const raw = crypto.randomBytes(6).toString('hex').toUpperCase();
    const code = `LOUD-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;

    await prisma.licenseKey.create({
      data: {
        code,
        tier: 'premium',
        duration_days: durationDays,
        created_by: developerId,
      },
    });

    return code;
  }

  /**
   * Redeems a license key and binds Premium to the calling user's Discord ID
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

    // Upgrade the user
    await this.enableUserPremium(discordUserId, key.duration_days, discordUserId);

    return {
      success: true,
      message:
        key.duration_days === 0
          ? 'Lifetime Premium Tier activated successfully! You now have 20 bots in your fleet.'
          : `Premium Tier activated successfully for ${key.duration_days} days! You now have 20 bots in your fleet.`,
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
