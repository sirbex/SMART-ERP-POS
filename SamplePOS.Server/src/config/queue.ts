/**
 * Job Queue Configuration
 * 
 * Configures Bull queues for background job processing:
 * - PDF report generation
 * - Email notifications
 * - Data exports
 * - Scheduled tasks
 */

import Queue from 'bull';

// Redis connection for Bull (uses default localhost:6379)
// For production, configure Redis connection from environment
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  // For development without Redis, Bull falls back to in-memory
};

// Create job queues
export const pdfQueue = new Queue('pdf-generation', {
  redis: redisConfig,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000, // 2 seconds, 4 seconds, 8 seconds
    },
    removeOnComplete: 50, // Keep last 50 completed jobs
    removeOnFail: 100, // Keep last 100 failed jobs for debugging
  },
});

export const emailQueue = new Queue('email-notifications', {
  redis: redisConfig,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: 100,
    removeOnFail: 100,
  },
});

export const reportQueue = new Queue('report-generation', {
  redis: redisConfig,
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: 'fixed',
      delay: 10000, // 10 seconds
    },
    removeOnComplete: 50,
    removeOnFail: 50,
  },
});

// Graceful shutdown
export async function closeQueues() {
  await Promise.all([
    pdfQueue.close(),
    emailQueue.close(),
    reportQueue.close(),
  ]);
}

export default {
  pdfQueue,
  emailQueue,
  reportQueue,
  closeQueues,
};
