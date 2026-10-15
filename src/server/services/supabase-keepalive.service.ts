import { prisma } from '../db/prisma';

export interface KeepAliveStatus {
  lastPingAt: Date | null;
  dbSuccess: boolean;
  apiSuccess: boolean;
  dbLatencyMs: number;
  apiLatencyMs: number;
  consecutiveFailures: number;
  intervalMs: number;
  isRunning: boolean;
}

export class SupabaseKeepAliveService {
  private static timer: NodeJS.Timeout | null = null;
  private static intervalMs: number = 10 * 60 * 1000; // 10 minutes default
  private static status: KeepAliveStatus = {
    lastPingAt: null,
    dbSuccess: false,
    apiSuccess: false,
    dbLatencyMs: 0,
    apiLatencyMs: 0,
    consecutiveFailures: 0,
    intervalMs: 10 * 60 * 1000,
    isRunning: false,
  };

  /**
   * Performs an immediate keepalive ping across both PostgreSQL Database and Supabase HTTP API
   */
  public static async pingOnce(): Promise<{
    success: boolean;
    dbSuccess: boolean;
    apiSuccess: boolean;
    dbLatencyMs: number;
    apiLatencyMs: number;
    timestamp: string;
    error?: string;
  }> {
    const timestamp = new Date().toISOString();
    let dbSuccess = false;
    let apiSuccess = false;
    let dbLatencyMs = 0;
    let apiLatencyMs = 0;
    const errors: string[] = [];

    // 1. Direct PostgreSQL Database Keep-Alive (via Prisma)
    try {
      const dbStart = Date.now();
      await prisma.$queryRaw`SELECT 1 as keepalive`;
      dbLatencyMs = Date.now() - dbStart;
      dbSuccess = true;
    } catch (err: any) {
      errors.push(`DB Error: ${err?.message || 'Database ping failed'}`);
    }

    // 2. Supabase Cloud REST / Auth API Keep-Alive
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    if (supabaseUrl && supabaseKey) {
      try {
        const apiStart = Date.now();
        const res = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/health`, {
          method: 'GET',
          headers: {
            apikey: supabaseKey,
          },
          signal: AbortSignal.timeout(10000), // 10s timeout
        });

        apiLatencyMs = Date.now() - apiStart;
        if (res.ok) {
          apiSuccess = true;
        } else {
          errors.push(`API Status: HTTP ${res.status}`);
        }
      } catch (err: any) {
        errors.push(`API Error: ${err?.message || 'HTTP health ping failed'}`);
      }
    } else {
      // If no Supabase URL configured, treat DB success as primary
      apiSuccess = true;
    }

    const overallSuccess = dbSuccess || apiSuccess;

    // Update internal status
    this.status.lastPingAt = new Date();
    this.status.dbSuccess = dbSuccess;
    this.status.apiSuccess = apiSuccess;
    this.status.dbLatencyMs = dbLatencyMs;
    this.status.apiLatencyMs = apiLatencyMs;

    if (overallSuccess) {
      this.status.consecutiveFailures = 0;
      console.log(
        `[SupabaseKeepAlive] Ping successful at ${timestamp} (DB: ${dbLatencyMs}ms, API: ${apiLatencyMs}ms)`
      );
    } else {
      this.status.consecutiveFailures++;
      console.warn(
        `[SupabaseKeepAlive] Ping warning at ${timestamp} (Failures: ${this.status.consecutiveFailures}): ${errors.join('; ')}`
      );
    }

    return {
      success: overallSuccess,
      dbSuccess,
      apiSuccess,
      dbLatencyMs,
      apiLatencyMs,
      timestamp,
      error: errors.length > 0 ? errors.join('; ') : undefined,
    };
  }

  /**
   * Starts the keepalive loop
   */
  public static start(intervalMs: number = 10 * 60 * 1000): void {
    if (this.timer) {
      console.log('[SupabaseKeepAlive] Keepalive service is already running.');
      return;
    }

    this.intervalMs = intervalMs;
    this.status.intervalMs = intervalMs;
    this.status.isRunning = true;

    console.log(
      `[SupabaseKeepAlive] Starting automated keepalive heartbeat (interval: ${Math.round(intervalMs / 1000 / 60)} minutes)...`
    );

    // Initial ping immediately
    this.pingOnce().catch((err) => {
      console.warn('[SupabaseKeepAlive] Initial ping error:', err.message);
    });

    // Schedule regular heartbeat
    this.timer = setInterval(() => {
      this.pingOnce().catch((err) => {
        console.warn('[SupabaseKeepAlive] Periodic ping error:', err.message);
      });
    }, intervalMs);

    // Prevent blocking process shutdown
    if (this.timer.unref) {
      this.timer.unref();
    }
  }

  /**
   * Stops the keepalive loop
   */
  public static stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.status.isRunning = false;
    console.log('[SupabaseKeepAlive] Keepalive service stopped.');
  }

  /**
   * Returns current keepalive diagnostic status
   */
  public static getStatus(): KeepAliveStatus {
    return { ...this.status };
  }
}
