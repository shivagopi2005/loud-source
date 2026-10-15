import { describe, it, expect, afterEach } from 'vitest';
import { SupabaseKeepAliveService } from '../../src/server/services/supabase-keepalive.service';

describe('Supabase KeepAlive Safeguard', () => {
  afterEach(() => {
    SupabaseKeepAliveService.stop();
  });

  it('executes pingOnce and updates diagnostic status successfully', async () => {
    const result = await SupabaseKeepAliveService.pingOnce();

    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.timestamp).toBeDefined();

    const status = SupabaseKeepAliveService.getStatus();
    expect(status.lastPingAt).not.toBeNull();
    expect(status.consecutiveFailures).toBe(0);
  });

  it('starts and stops the keepalive service without leaks', () => {
    SupabaseKeepAliveService.start(60000);
    const runningStatus = SupabaseKeepAliveService.getStatus();
    expect(runningStatus.isRunning).toBe(true);

    SupabaseKeepAliveService.stop();
    const stoppedStatus = SupabaseKeepAliveService.getStatus();
    expect(stoppedStatus.isRunning).toBe(false);
  });
});
