import { ActivityType } from 'discord.js';
import { prisma } from '../db/prisma';
import { decryptSecret } from '../security/encryption';
import { FleetGatewayService } from './fleet-gateway.service';
import { AuditService } from './audit.service';
import { realtimeBroadcaster } from '../realtime/events';
import { BotProfilePresets, ProfilePreset, createPngFromHex } from './bot-profile-presets';

export interface UpdateProfilePayload {
  workspaceId: string;
  actorUserId?: string;
  actorDiscordId?: string;
  isDeveloper?: boolean;
  targetMode: 'single' | 'selected' | 'all';
  botIds?: string[];
  applyOptions?: {
    updateAvatar?: boolean;
    updateBanner?: boolean;
    updateBio?: boolean;
    updateStatus?: boolean;
    updateName?: boolean;
  };
  profileData?: {
    displayName?: string;
    avatarUrl?: string;
    bannerUrl?: string;
    bio?: string;
    customStatus?: string;
    activityType?: 'PLAYING' | 'LISTENING' | 'STREAMING' | 'WATCHING' | 'COMPETING' | 'CUSTOM';
    accentColor?: string;
  };
  randomize?: {
    enabled: boolean;
    theme?: string;
    randomizeAvatar?: boolean;
    randomizeBanner?: boolean;
    randomizeBio?: boolean;
    randomizeStatus?: boolean;
    randomizeName?: boolean;
    uniquePerBot?: boolean;
  };
}

export interface BotProfileUpdateResult {
  botId: string;
  displayName: string;
  success: boolean;
  avatarUpdated?: boolean;
  bannerUpdated?: boolean;
  bioUpdated?: boolean;
  statusUpdated?: boolean;
  rateLimited?: boolean;
  avatarRateLimited?: boolean;
  bannerRateLimited?: boolean;
  rateLimitMessage?: string;
  error?: string;
  profileLocked?: boolean;
  profileLockedReason?: string;
}

export interface BotProfilePermission {
  canEditProfile: boolean;
  profileLocked: boolean;
  profileLockedReason?: string;
  isOriginalOwner: boolean;
  originalOwnerId?: string;
  originalOwnerUsername?: string;
  isDeveloperBot: boolean;
}

export class BotProfileService {
  /**
   * Determine whether an actor is allowed to edit a bot's profile.
   * Rules:
   * 1. Platform Developer (788970167907778562) can edit all developer bots and has supreme authority.
   * 2. If a bot token belongs to Developer Fleet:
   *    - Non-developer users CANNOT edit profile/banner/avatar.
   *    - Non-developer users CAN stream voice, play songs, and run commands.
   * 3. If a bot token was registered by regular users (User A first, User B second):
   *    - User A (earliest created_at) has priority and can edit profile.
   *    - User B cannot edit profile, but retains full voice, music, and command rights.
   */
  public static async getBotProfilePermission(
    botId: string,
    actorUserId: string,
    actorDiscordId?: string
  ): Promise<BotProfilePermission> {
    const DEVELOPER_ID = '788970167907778562';
    const isActorDeveloper = actorDiscordId === DEVELOPER_ID;

    const targetBot = await prisma.botApplication.findUnique({
      where: { id: botId },
      include: {
        workspace: {
          include: { owner: true },
        },
      },
    });

    if (!targetBot) {
      return {
        canEditProfile: false,
        profileLocked: true,
        profileLockedReason: 'Bot application not found.',
        isOriginalOwner: false,
        isDeveloperBot: false,
      };
    }

    // Check if this bot token is a Developer Fleet Bot (owned by DEVELOPER_ID in any workspace)
    const devOwnedBot = await prisma.botApplication.findFirst({
      where: {
        application_id: targetBot.application_id,
        workspace: {
          owner: { discord_id: DEVELOPER_ID },
        },
      },
      include: {
        workspace: { include: { owner: true } },
      },
    });

    const isDeveloperBot = !!devOwnedBot;

    // Case 1: The bot is a developer fleet bot
    if (isDeveloperBot) {
      if (isActorDeveloper) {
        return {
          canEditProfile: true,
          profileLocked: false,
          isOriginalOwner: true,
          originalOwnerId: devOwnedBot.workspace?.owner?.id,
          originalOwnerUsername: devOwnedBot.workspace?.owner?.username || 'Developer',
          isDeveloperBot: true,
        };
      } else {
        return {
          canEditProfile: false,
          profileLocked: true,
          profileLockedReason:
            'This bot was registered by the Platform Developer. You have full access to stream voice, play songs, and run commands, but profile and banner customizations are restricted to the developer.',
          isOriginalOwner: false,
          originalOwnerId: devOwnedBot.workspace?.owner?.id,
          originalOwnerUsername: devOwnedBot.workspace?.owner?.username || 'Developer',
          isDeveloperBot: true,
        };
      }
    }

    // Case 2: Shared bot token between regular users
    // Find the earliest registration of this application_id across all workspaces
    const earliestBot = await prisma.botApplication.findFirst({
      where: {
        application_id: targetBot.application_id,
      },
      orderBy: { created_at: 'asc' },
      include: {
        workspace: {
          include: { owner: true },
        },
      },
    });

    const isFirstRegistrant =
      isActorDeveloper ||
      earliestBot?.workspace?.owner_user_id === actorUserId ||
      earliestBot?.id === targetBot.id ||
      earliestBot?.workspace_id === targetBot.workspace_id;

    if (isFirstRegistrant) {
      return {
        canEditProfile: true,
        profileLocked: false,
        isOriginalOwner: true,
        originalOwnerId: earliestBot?.workspace?.owner?.id,
        originalOwnerUsername: earliestBot?.workspace?.owner?.username,
        isDeveloperBot: false,
      };
    }

    const originalOwnerName = earliestBot?.workspace?.owner?.username || 'the original owner';
    return {
      canEditProfile: false,
      profileLocked: true,
      profileLockedReason: `This bot was first registered by ${originalOwnerName}. Priority belongs to the original owner. You have full access to stream voice, play songs, and run commands, but profile customizations are managed by the original owner.`,
      isOriginalOwner: false,
      originalOwnerId: earliestBot?.workspace?.owner?.id,
      originalOwnerUsername: originalOwnerName,
      isDeveloperBot: false,
    };
  }
  /**
   * Converts any image input (URL, Hex color, or Base64) into a valid PNG/JPEG Data URI for Discord API.
   */
  public static async resolveImageToDiscordDataUri(
    input: string | null | undefined,
    type: 'avatar' | 'banner'
  ): Promise<string | null> {
    if (!input || !input.trim()) return null;
    const trimmed = input.trim();

    // 1. If already valid Base64 PNG/JPEG/GIF
    if (
      trimmed.startsWith('data:image/png;base64,') ||
      trimmed.startsWith('data:image/jpeg;base64,') ||
      trimmed.startsWith('data:image/jpg;base64,') ||
      trimmed.startsWith('data:image/gif;base64,')
    ) {
      return trimmed;
    }

    // 2. If it's a Hex Color (e.g. #5865F2, #1e1b4b), generate a crisp Discord-compatible PNG
    if (/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed)) {
      const w = type === 'banner' ? 600 : 128;
      const h = type === 'banner' ? 240 : 128;
      return createPngFromHex(w, h, trimmed.startsWith('#') ? trimmed : `#${trimmed}`);
    }

    // 3. If it's an HTTP/HTTPS URL, download and convert to Base64
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      try {
        const res = await fetch(trimmed, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
          signal: AbortSignal.timeout(6000),
        });
        if (res.ok) {
          const buffer = Buffer.from(await res.arrayBuffer());
          const contentType = res.headers.get('content-type') || 'image/png';
          const mime =
            contentType.includes('jpeg') || contentType.includes('jpg')
              ? 'image/jpeg'
              : contentType.includes('gif')
              ? 'image/gif'
              : 'image/png';
          return `data:${mime};base64,${buffer.toString('base64')}`;
        }
      } catch (err: any) {
        console.warn(`[BotProfileService] Could not download image URL: ${err.message}`);
      }
    }

    // 4. Fallback if SVG data URI was provided: generate solid PNG fallback
    if (trimmed.startsWith('data:image/svg+xml')) {
      const w = type === 'banner' ? 600 : 128;
      const h = type === 'banner' ? 240 : 128;
      return createPngFromHex(w, h, '#5865f2');
    }

    return null;
  }

  private static parseActivityType(type?: string): ActivityType {
    switch (type?.toUpperCase()) {
      case 'PLAYING':
        return ActivityType.Playing;
      case 'LISTENING':
        return ActivityType.Listening;
      case 'STREAMING':
        return ActivityType.Streaming;
      case 'WATCHING':
        return ActivityType.Watching;
      case 'COMPETING':
        return ActivityType.Competing;
      case 'CUSTOM':
      default:
        return ActivityType.Custom;
    }
  }

  public static async updateProfiles(payload: UpdateProfilePayload): Promise<{
    success: boolean;
    totalTargeted: number;
    updatedCount: number;
    failedCount: number;
    rateLimitedCount: number;
    lockedCount?: number;
    results: BotProfileUpdateResult[];
  }> {
    const {
      workspaceId,
      targetMode,
      botIds = [],
      profileData,
      randomize,
      applyOptions = {
        updateAvatar: true,
        updateBanner: true,
        updateBio: true,
        updateStatus: true,
        updateName: true,
      },
      actorUserId,
      actorDiscordId,
      isDeveloper = false,
    } = payload;

    const shouldApplyAvatar = applyOptions.updateAvatar ?? true;
    const shouldApplyBanner = applyOptions.updateBanner ?? true;
    const shouldApplyBio = applyOptions.updateBio ?? true;
    const shouldApplyStatus = applyOptions.updateStatus ?? true;
    const shouldApplyName = applyOptions.updateName ?? true;

    let botsToUpdate;
    if (targetMode === 'all') {
      botsToUpdate = await prisma.botApplication.findMany({
        where: {
          workspace_id: workspaceId,
          status: { notIn: ['removed', 'disabled'] },
        },
        include: {
          credentials: { where: { status: 'active' }, orderBy: { credential_version: 'desc' }, take: 1 },
        },
        orderBy: { created_at: 'asc' },
      });
    } else {
      botsToUpdate = await prisma.botApplication.findMany({
        where: {
          id: { in: botIds },
          workspace_id: workspaceId,
          status: { notIn: ['removed', 'disabled'] },
        },
        include: {
          credentials: { where: { status: 'active' }, orderBy: { credential_version: 'desc' }, take: 1 },
        },
        orderBy: { created_at: 'asc' },
      });
    }

    const redirectClientId = process.env.DISCORD_CLIENT_ID?.trim() || '1560261747137454161';
    const isRedirectBot = (bot: { application_id?: string | null; operational_role?: string | null }) => {
      return (
        bot.operational_role === 'oauth_redirect' ||
        (bot.application_id && redirectClientId && bot.application_id.trim() === redirectClientId)
      );
    };

    // Permanently protect OAuth bot: never modify its username, name, bio, avatar, or banner
    botsToUpdate = botsToUpdate.filter((b) => !isRedirectBot(b));

    // Check profile update permissions per bot (first-to-add priority & developer protection)
    const editableBots: typeof botsToUpdate = [];
    const lockedResults: BotProfileUpdateResult[] = [];

    for (const bot of botsToUpdate) {
      const perm = await this.getBotProfilePermission(bot.id, actorUserId || '', actorDiscordId);
      if (perm.canEditProfile) {
        editableBots.push(bot);
      } else {
        lockedResults.push({
          botId: bot.id,
          displayName: bot.display_name,
          success: true,
          profileLocked: true,
          profileLockedReason: perm.profileLockedReason,
          rateLimitMessage: perm.profileLockedReason || 'Profile locked: Shared bot token owned by original registrant.',
          error: perm.profileLockedReason || 'Profile locked: Priority belongs to original registrant.',
        });
      }
    }

    if (editableBots.length === 0) {
      return {
        success: true,
        totalTargeted: botsToUpdate.length,
        updatedCount: 0,
        lockedCount: lockedResults.length,
        failedCount: 0,
        rateLimitedCount: 0,
        results: lockedResults,
      };
    }

    const themePool = BotProfilePresets.getPresetsByTheme(randomize?.theme || 'all');
    const isBulkUniform = !randomize?.enabled;
    const targetIds = editableBots.map((b) => b.id);

    // Pre-resolve uniform images once to avoid redundant downloads
    let uniformAvatarBase64: string | null = null;
    let uniformBannerBase64: string | null = null;
    if (isBulkUniform && profileData) {
      if (shouldApplyAvatar && profileData.avatarUrl) {
        uniformAvatarBase64 = await this.resolveImageToDiscordDataUri(profileData.avatarUrl, 'avatar');
      }
      if (shouldApplyBanner && profileData.bannerUrl) {
        uniformBannerBase64 = await this.resolveImageToDiscordDataUri(profileData.bannerUrl, 'banner');
      }

      // Fast Database Batch Update
      const updateData: any = {};
      if (shouldApplyAvatar && profileData.avatarUrl !== undefined) updateData.avatar_url = profileData.avatarUrl;
      if (shouldApplyBanner && profileData.bannerUrl !== undefined) updateData.banner_url = profileData.bannerUrl;
      if (shouldApplyBio && profileData.bio !== undefined) updateData.bio = profileData.bio;
      if (shouldApplyStatus && profileData.customStatus !== undefined) updateData.custom_status = profileData.customStatus;
      if (shouldApplyStatus && profileData.activityType !== undefined) updateData.activity_type = profileData.activityType;
      if (profileData.accentColor !== undefined) updateData.accent_color = profileData.accentColor;
      if (shouldApplyName && profileData.displayName !== undefined && profileData.displayName.trim().length > 0) {
        updateData.display_name = profileData.displayName.trim();
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.botApplication.updateMany({
          where: { id: { in: targetIds } },
          data: updateData,
        });
      }
    }

    // Function to update an individual bot with independent retries
    const updateSingleBot = async (bot: any, i: number): Promise<BotProfileUpdateResult> => {
      if (isRedirectBot(bot)) {
        return {
          botId: bot.id,
          displayName: 'Roynix Loud',
          success: true,
          avatarUpdated: false,
          bannerUpdated: false,
          bioUpdated: false,
          statusUpdated: false,
          error: 'Protected OAuth bot (Roynix Loud)',
        };
      }
      try {
        let finalAvatar = profileData?.avatarUrl;
        let finalBanner = profileData?.bannerUrl;
        let finalBio = profileData?.bio;
        let finalStatus = profileData?.customStatus;
        let finalActivity = profileData?.activityType || 'PLAYING';
        let finalName = profileData?.displayName;
        let finalAccent = profileData?.accentColor;

        let avatarBase64ToSend = shouldApplyAvatar ? uniformAvatarBase64 : null;
        let bannerBase64ToSend = shouldApplyBanner ? uniformBannerBase64 : null;

        // If randomization is active
        if (randomize?.enabled) {
          const presetIndex = randomize.uniquePerBot
            ? i % themePool.length
            : Math.floor(Math.random() * themePool.length);
          const preset: ProfilePreset = themePool[presetIndex] || themePool[0];

          if (randomize.randomizeAvatar ?? true) {
            finalAvatar = preset.avatarUrl;
            avatarBase64ToSend = preset.avatarUrl;
          } else {
            avatarBase64ToSend = null;
          }

          if (randomize.randomizeBanner ?? true) {
            finalBanner = preset.bannerUrl;
            bannerBase64ToSend = preset.bannerUrl;
          } else {
            bannerBase64ToSend = null;
          }

          if (randomize.randomizeBio ?? true) finalBio = preset.bio;
          if (randomize.randomizeStatus ?? true) {
            finalStatus = preset.customStatus;
            finalActivity = preset.activityType;
          }
          if (randomize.randomizeName) {
            finalName = randomize.uniquePerBot
              ? `${preset.displayName} #${i + 1}`
              : preset.displayName;
          }
          if (!finalAccent) finalAccent = preset.accentColor;

          // Individual DB update for randomized bot
          const updateData: any = {};
          if (finalAvatar !== undefined && (randomize.randomizeAvatar ?? true)) updateData.avatar_url = finalAvatar;
          if (finalBanner !== undefined && (randomize.randomizeBanner ?? true)) updateData.banner_url = finalBanner;
          if (finalBio !== undefined && (randomize.randomizeBio ?? true)) updateData.bio = finalBio;
          if (finalStatus !== undefined && (randomize.randomizeStatus ?? true)) updateData.custom_status = finalStatus;
          if (finalActivity !== undefined && (randomize.randomizeStatus ?? true)) updateData.activity_type = finalActivity;
          if (finalAccent !== undefined) updateData.accent_color = finalAccent;
          if (finalName !== undefined && finalName.trim().length > 0) updateData.display_name = finalName.trim();

          await prisma.botApplication.update({
            where: { id: bot.id },
            data: updateData,
          });
        }

        // 1. Live Gateway Presence Update (< 0.1ms, zero rate limits)
        let statusUpdated = false;
        const client = FleetGatewayService.getClient(bot.id);
        if (client?.user && shouldApplyStatus) {
          try {
            client.user.setPresence({
              status: 'online',
              activities: [
                {
                  name: finalStatus || bot.custom_status || 'Studio Voice Fleet • !help',
                  type: this.parseActivityType(finalActivity || bot.activity_type || 'PLAYING'),
                },
              ],
            });
            statusUpdated = true;

            if (shouldApplyName && finalName && finalName !== bot.display_name) {
              for (const guild of client.guilds.cache.values()) {
                guild.members.me?.setNickname(finalName).catch(() => null);
              }
            }
          } catch {}
        }

        // 2. Discord REST API Updates
        let avatarUpdated = false;
        let bannerUpdated = false;
        let bioUpdated = false;
        let rateLimited = false;
        let avatarRateLimited = false;
        let bannerRateLimited = false;
        let rateLimitMessage = '';

        if (bot.credentials.length > 0) {
          const rawToken = decryptSecret(bot.credentials[0].secret_reference).trim();
          if (!rawToken.startsWith('mock_') && !rawToken.startsWith('test_')) {
            // A. Update Application Description (Bio) + Icon via PATCH /applications/@me
            const appPayload: any = {};
            if (shouldApplyBio && finalBio !== undefined) {
              appPayload.description = finalBio;
            }
            if (shouldApplyAvatar && avatarBase64ToSend) {
              appPayload.icon = avatarBase64ToSend;
            }
            if (shouldApplyBanner && bannerBase64ToSend) {
              appPayload.cover_image = bannerBase64ToSend;
            }

            if (Object.keys(appPayload).length > 0) {
              try {
                const appRes = await fetch('https://discord.com/api/v10/applications/@me', {
                  method: 'PATCH',
                  headers: {
                    Authorization: `Bot ${rawToken}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify(appPayload),
                  signal: AbortSignal.timeout(5000),
                });
                if (appRes.ok) {
                  if (appPayload.description) bioUpdated = true;
                  // If application icon updated, Discord also mirrors to bot user
                  if (appPayload.icon) avatarUpdated = true;
                }
              } catch (appErr: any) {
                console.warn(`[BotProfileService] Application PATCH error for ${bot.display_name}:`, appErr.message);
              }
            }

            // B. Update Bot User Avatar and Banner via PATCH /users/@me
            const userPayload: any = {};
            if (shouldApplyAvatar && avatarBase64ToSend) userPayload.avatar = avatarBase64ToSend;
            if (shouldApplyBanner && bannerBase64ToSend) userPayload.banner = bannerBase64ToSend;
            if (shouldApplyName && finalName && finalName !== bot.display_name) userPayload.username = finalName;

            if (Object.keys(userPayload).length > 0) {
              try {
                const userRes = await fetch('https://discord.com/api/v10/users/@me', {
                  method: 'PATCH',
                  headers: {
                    Authorization: `Bot ${rawToken}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify(userPayload),
                  signal: AbortSignal.timeout(5000),
                });

                if (userRes.ok) {
                  if (userPayload.avatar) avatarUpdated = true;
                  if (userPayload.banner) bannerUpdated = true;
                } else {
                  const errJson: any = await userRes.json().catch(() => ({}));
                  const hasBannerLimit = errJson?.errors?.banner?._errors?.some((e: any) =>
                    e.code?.includes('RATE_LIMIT')
                  );
                  const hasAvatarLimit = errJson?.errors?.avatar?._errors?.some((e: any) =>
                    e.code?.includes('RATE_LIMIT')
                  );

                  if (hasBannerLimit) bannerRateLimited = true;
                  if (hasAvatarLimit) avatarRateLimited = true;

                  if (hasBannerLimit || hasAvatarLimit) {
                    rateLimited = true;

                    // Fallback 1: If BANNER was rate-limited, retry AVATAR alone
                    if (hasBannerLimit && userPayload.avatar && !avatarUpdated) {
                      try {
                        const avatarOnlyPayload: any = { avatar: userPayload.avatar };
                        if (userPayload.username) avatarOnlyPayload.username = userPayload.username;

                        const avRes = await fetch('https://discord.com/api/v10/users/@me', {
                          method: 'PATCH',
                          headers: {
                            Authorization: `Bot ${rawToken}`,
                            'Content-Type': 'application/json',
                          },
                          body: JSON.stringify(avatarOnlyPayload),
                          signal: AbortSignal.timeout(4000),
                        });
                        if (avRes.ok) {
                          avatarUpdated = true;
                        }
                      } catch {}
                    }

                    // Fallback 2: If AVATAR was rate-limited, retry BANNER alone
                    if (hasAvatarLimit && userPayload.banner && !bannerUpdated) {
                      try {
                        const bannerOnlyPayload: any = { banner: userPayload.banner };
                        if (userPayload.username) bannerOnlyPayload.username = userPayload.username;

                        const bnRes = await fetch('https://discord.com/api/v10/users/@me', {
                          method: 'PATCH',
                          headers: {
                            Authorization: `Bot ${rawToken}`,
                            'Content-Type': 'application/json',
                          },
                          body: JSON.stringify(bannerOnlyPayload),
                          signal: AbortSignal.timeout(4000),
                        });
                        if (bnRes.ok) {
                          bannerUpdated = true;
                        }
                      } catch {}
                    }

                    if (bannerRateLimited && avatarRateLimited) {
                      rateLimitMessage = 'Both avatar & banner are on Discord 10-minute cooldown.';
                    } else if (bannerRateLimited) {
                      rateLimitMessage = 'Banner on Discord 10-minute cooldown (avatar updated).';
                    } else if (avatarRateLimited) {
                      rateLimitMessage = 'Avatar on Discord 10-minute cooldown (banner updated).';
                    }
                  }
                }
              } catch (userErr: any) {
                console.warn(`[BotProfileService] User PATCH error for ${bot.display_name}:`, userErr.message);
              }
            }
          }
        }

        return {
          botId: bot.id,
          displayName: finalName || bot.display_name,
          success: true,
          avatarUpdated,
          bannerUpdated,
          bioUpdated,
          statusUpdated,
          rateLimited,
          avatarRateLimited,
          bannerRateLimited,
          rateLimitMessage,
        };
      } catch (err: any) {
        return {
          botId: bot.id,
          displayName: bot.display_name,
          success: false,
          error: err.message,
        };
      }
    };

    // Execute in controlled chunks of 4 bots with a 150ms buffer
    // to prevent Discord Cloudflare edge from dropping rapid burst requests
    const CHUNK_SIZE = 4;
    const results: BotProfileUpdateResult[] = [];

    for (let i = 0; i < editableBots.length; i += CHUNK_SIZE) {
      const chunk = editableBots.slice(i, i + CHUNK_SIZE);
      const chunkResults = await Promise.all(
        chunk.map((bot, idx) => updateSingleBot(bot, i + idx))
      );
      results.push(...chunkResults);

      if (i + CHUNK_SIZE < editableBots.length) {
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    }

    const allResults = [...results, ...lockedResults];
    const updatedCount = results.filter((r) => r.success).length;
    const lockedCount = lockedResults.length;
    const failedCount = results.filter((r) => !r.success).length;
    const rateLimitedCount = results.filter((r) => r.rateLimited).length;

    // Record audit event
    if (actorUserId) {
      AuditService.record({
        workspaceId,
        actorUserId,
        action: 'bot_profiles.bulk_updated',
        resourceType: 'bot',
        result: failedCount === 0 ? 'success' : 'failure',
        metadata: {
          targetMode,
          totalTargeted: botsToUpdate.length,
          updatedCount,
          lockedCount,
          rateLimitedCount,
          failedCount,
        },
      }).catch(() => null);
    }

    // Realtime broadcast to studio clients
    realtimeBroadcaster.broadcast(workspaceId, 'METRICS_UPDATED', {
      timestamp: new Date().toISOString(),
      updatedCount,
      lockedCount,
    });

    return {
      success: true,
      totalTargeted: botsToUpdate.length,
      updatedCount,
      lockedCount,
      failedCount,
      rateLimitedCount,
      results: allResults,
    };
  }
}
