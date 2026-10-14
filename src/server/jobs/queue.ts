import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6380';

// Shared Redis connection for BullMQ
export const redisConnection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy(times) {
    return Math.min(times * 100, 3000);
  },
});

redisConnection.on('error', (err) => {
  console.warn('[Redis] Connection warning (queue operations will retry):', err.message);
});

// 1. Message Delivery Queue
export const messageQueue = new Queue('message-jobs', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 100 },
  },
});

// 2. Bot Health Check Queue
export const healthCheckQueue = new Queue('health-check-jobs', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: 'fixed',
      delay: 5000,
    },
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 50 },
  },
});

// 3. Scheduled / Maintenance Jobs Queue
export const scheduledQueue = new Queue('scheduled-jobs', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 50 },
  },
});

/**
 * Cancel a pending job before it executes.
 */
export async function cancelJob(queueName: string, jobId: string): Promise<boolean> {
  let queue: Queue | null = null;
  if (queueName === 'message-jobs') queue = messageQueue;
  else if (queueName === 'health-check-jobs') queue = healthCheckQueue;
  else if (queueName === 'scheduled-jobs') queue = scheduledQueue;

  if (!queue) return false;

  const job = await queue.getJob(jobId);
  if (!job) return false;

  const state = await job.getState();
  if (state === 'waiting' || state === 'delayed') {
    await job.remove();
    return true;
  }
  return false;
}
