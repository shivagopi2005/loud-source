import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PremiumService, DEVELOPER_ID } from '../../src/server/services/premium.service';
import { PREFIX_COMMANDS } from '../../src/server/services/bot-command.service';
import { prisma } from '../../src/server/db/prisma';

describe('User-Level Premium Tier & Monetization Architecture', () => {
  const testUserId = '999888777111222333';
  const testUserId2 = '888777666555444333';

  afterAll(async () => {
    // Clean up test data
    await prisma.licenseKey.deleteMany({
      where: { created_by: DEVELOPER_ID },
    });
    await prisma.user.deleteMany({
      where: { discord_id: { in: [testUserId, testUserId2] } },
    });
  });

  describe('User Tier Resolution', () => {
    it('grants supreme unrestricted access to Developer ID', async () => {
      const devTier = await PremiumService.getUserTier(DEVELOPER_ID);

      expect(devTier.tier).toBe('developer');
      expect(devTier.maxBots).toBeGreaterThanOrEqual(27);
      expect(devTier.maxVolume).toBe(10000);
      expect(devTier.maxSpamCount).toBe(Infinity);
      expect(devTier.audioQuality).toBe(320);
      expect(devTier.isDeveloper).toBe(true);
      expect(devTier.isExpired).toBe(false);
    });

    it('defaults unknown/free users to Community Trial (₹0, 5 bots max, 10 command limit)', async () => {
      const freeTier = await PremiumService.getUserTier('000000000000000000');

      expect(freeTier.tier).toBe('trial');
      expect(freeTier.maxBots).toBe(5);
      expect(freeTier.maxVolume).toBe(200);
      expect(freeTier.maxSpamCount).toBe(5);
      expect(freeTier.audioQuality).toBe(128);
      expect(freeTier.isDeveloper).toBe(false);
    });
  });

  describe('Enable and Disable User Premium', () => {
    it('activates Pro Tier (₹99, 20 bots) on user ID', async () => {
      await PremiumService.enableUserTier(testUserId, 'pro', 30, DEVELOPER_ID);

      const tier = await PremiumService.getUserTier(testUserId);
      expect(tier.tier).toBe('pro');
      expect(tier.maxBots).toBe(20);
      expect(tier.maxVolume).toBe(10000);
      expect(tier.maxSpamCount).toBe(50);
      expect(tier.audioQuality).toBe(320);
      expect(tier.expiresAt).not.toBeNull();
      expect(tier.isExpired).toBe(false);
    });

    it('disables Premium and reverts user back to Community Trial', async () => {
      await PremiumService.disableUserPremium(testUserId);

      const tier = await PremiumService.getUserTier(testUserId);
      expect(tier.tier).toBe('trial');
      expect(tier.maxBots).toBe(5);
      expect(tier.maxVolume).toBe(200);
    });
  });

  describe('Automated License Key Sales & Redemption Engine', () => {
    it('generates formatted 16-character license key', async () => {
      const code = await PremiumService.generateLicenseKey(DEVELOPER_ID, 30, 'pro');

      expect(code).toMatch(/^LOUD-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    });

    it('redeems license key and unlocks Pro Tier (20 bots) on user ID', async () => {
      const code = await PremiumService.generateLicenseKey(DEVELOPER_ID, 60, 'pro');

      const result = await PremiumService.redeemLicenseKey(code, testUserId2);
      expect(result.success).toBe(true);
      expect(result.durationDays).toBe(60);

      const userTier = await PremiumService.getUserTier(testUserId2);
      expect(userTier.tier).toBe('pro');
      expect(userTier.maxBots).toBe(20);
    });

    it('rejects redeeming an already redeemed license key', async () => {
      const code = await PremiumService.generateLicenseKey(DEVELOPER_ID, 30);
      await PremiumService.redeemLicenseKey(code, testUserId);

      const secondAttempt = await PremiumService.redeemLicenseKey(code, testUserId2);
      expect(secondAttempt.success).toBe(false);
      expect(secondAttempt.message).toContain('already been redeemed');
    });

    it('rejects invalid license key', async () => {
      const result = await PremiumService.redeemLicenseKey('LOUD-INVALID-KEY-9999', testUserId);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid license key');
    });
  });

  describe('PREFIX_COMMANDS Registration', () => {
    it('registers all premium and 24/7 commands in command index', () => {
      const names = PREFIX_COMMANDS.map((c) => c.name);

      expect(names).toContain('premium status');
      expect(names).toContain('premium redeem');
      expect(names).toContain('premium enable');
      expect(names).toContain('premium disable');
      expect(names).toContain('premium generate');
      expect(names).toContain('247 / stay');
    });
  });
});
