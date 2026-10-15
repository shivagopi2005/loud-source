import { describe, it, expect } from 'vitest';
import { MediaGatewayManager, mediaGateway } from '../../src/server/voice/media-gateway';
import { FleetGatewayService } from '../../src/server/services/fleet-gateway.service';
import { prisma } from '../../src/server/db/prisma';

describe('Global Singleton Synchronization across Next.js / Server module boundaries', () => {
  it('MediaGatewayManager is stored on globalThis and returns the identical instance', () => {
    const instanceA = MediaGatewayManager.getInstance();
    const instanceB = (globalThis as any).__mediaGatewayManager;
    expect(instanceA).toBeDefined();
    expect(instanceB).toBeDefined();
    expect(instanceA).toBe(instanceB);
    expect(mediaGateway).toBe(instanceA);
  });

  it('FleetGatewayService connections Map is stored on globalThis and shared', () => {
    const testBotId = 'mock-global-bot-123';
    FleetGatewayService['connections'].set(testBotId, {
      botId: testBotId,
      applicationId: 'app-123',
      displayName: 'Global Shared Bot',
      client: null,
      status: 'connected',
      isMock: true,
    });

    const globalMap = (globalThis as any).__fleetGatewayConnections;
    expect(globalMap).toBeDefined();
    expect(globalMap.has(testBotId)).toBe(true);

    const client = FleetGatewayService.getClient(testBotId);
    expect(client).toBeNull(); // is mock, so null client, but retrieved without error

    // Clean up
    FleetGatewayService['connections'].delete(testBotId);
    expect(globalMap.has(testBotId)).toBe(false);
  });

  it('prisma client is stored on globalThis across all environments', () => {
    const globalPrisma = (globalThis as any).__prisma;
    expect(globalPrisma).toBeDefined();
    expect(globalPrisma).toBe(prisma);
  });
});
