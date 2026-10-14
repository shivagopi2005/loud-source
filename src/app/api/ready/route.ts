import { NextResponse } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { redisConnection } from '@/server/jobs/queue';

export async function GET() {
  const checks: Record<string, string> = {};
  let isReady = true;

  // 1. Check PostgreSQL
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = 'connected';
  } catch (err: any) {
    checks.database = `error: ${err.message}`;
    isReady = false;
  }

  // 2. Check Redis
  try {
    const pong = await redisConnection.ping();
    checks.redis = pong === 'PONG' ? 'connected' : 'unexpected_response';
  } catch (err: any) {
    checks.redis = `error: ${err.message}`;
    isReady = false;
  }

  return NextResponse.json(
    {
      ready: isReady,
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: isReady ? 200 : 503 }
  );
}
