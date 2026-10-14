import { NextRequest } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { getAuthenticatedUser } from '@/server/security/rbac';
import { okResponse, handleApiError } from '@/server/utils/api-response';
import { messageQueue, healthCheckQueue } from '@/server/jobs/queue';

export async function GET(request: NextRequest) {
  try {
    getAuthenticatedUser(request);

    // Collect fleet metrics
    const [botCount, onlineBots, degradedBots, activeVoiceSessions] = await Promise.all([
      prisma.botApplication.count(),
      prisma.botApplication.count({ where: { status: { in: ['ready', 'connected'] } } }),
      prisma.botApplication.count({ where: { status: { in: ['degraded', 'credential_invalid'] } } }),
      prisma.voiceSession.count({ where: { state: 'streaming' } }),
    ]);

    // Queue depth metrics
    const [messageWaiting, messageActive, healthWaiting] = await Promise.all([
      messageQueue.getWaitingCount().catch(() => 0),
      messageQueue.getActiveCount().catch(() => 0),
      healthCheckQueue.getWaitingCount().catch(() => 0),
    ]);

    const memoryUsage = process.memoryUsage();

    return okResponse({
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      memory: {
        rssMb: Math.round(memoryUsage.rss / 1024 / 1024),
        heapUsedMb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        heapTotalMb: Math.round(memoryUsage.heapTotal / 1024 / 1024),
      },
      fleet: {
        totalBots: botCount,
        onlineBots,
        degradedBots,
        activeVoiceSessions,
      },
      queues: {
        messageQueueDepth: messageWaiting + messageActive,
        healthCheckQueueDepth: healthWaiting,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
