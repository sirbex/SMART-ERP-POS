/**
 * Health Check Service
 * 
 * Monitors application health and dependencies
 * Used for: load balancers, monitoring systems, uptime checks
 */

import prisma from '../config/database.js';
import { pdfQueue, emailQueue, reportQueue } from '../config/queue.js';
import logger from '../utils/logger.js';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  checks: {
    database: HealthCheck;
    queues: HealthCheck;
    memory: HealthCheck;
  };
}

interface HealthCheck {
  status: 'pass' | 'warn' | 'fail';
  message?: string;
  details?: any;
}

/**
 * Check database connectivity
 */
async function checkDatabase(): Promise<HealthCheck> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      status: 'pass',
      message: 'Database connection healthy',
    };
  } catch (error) {
    logger.error('Database health check failed', { error });
    return {
      status: 'fail',
      message: error instanceof Error ? error.message : 'Database connection failed',
    };
  }
}

/**
 * Check job queue health
 */
async function checkQueues(): Promise<HealthCheck> {
  try {
    const [pdfStats, emailStats, reportStats] = await Promise.all([
      pdfQueue.getJobCounts(),
      emailQueue.getJobCounts(),
      reportQueue.getJobCounts(),
    ]);

    const totalFailed = pdfStats.failed + emailStats.failed + reportStats.failed;
    const totalActive = pdfStats.active + emailStats.active + reportStats.active;
    const totalWaiting = pdfStats.waiting + emailStats.waiting + reportStats.waiting;

    // Warn if too many failed jobs or jobs are stalling
    if (totalFailed > 100) {
      return {
        status: 'warn',
        message: `High number of failed jobs: ${totalFailed}`,
        details: { pdf: pdfStats.failed, email: emailStats.failed, report: reportStats.failed },
      };
    }

    // Warn if queue is backing up
    if (totalWaiting > 500) {
      return {
        status: 'warn',
        message: `High number of waiting jobs: ${totalWaiting}`,
        details: { pdf: pdfStats.waiting, email: emailStats.waiting, report: reportStats.waiting },
      };
    }

    return {
      status: 'pass',
      message: 'Job queues healthy',
      details: {
        active: totalActive,
        waiting: totalWaiting,
        failed: totalFailed,
      },
    };
  } catch (error) {
    logger.error('Queue health check failed', { error });
    return {
      status: 'fail',
      message: error instanceof Error ? error.message : 'Queue health check failed',
    };
  }
}

/**
 * Check memory usage
 */
function checkMemory(): HealthCheck {
  const usage = process.memoryUsage();
  const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(usage.heapTotal / 1024 / 1024);
  const heapPercent = Math.round((usage.heapUsed / usage.heapTotal) * 100);

  // Warn if using more than 80% of heap
  if (heapPercent > 80) {
    return {
      status: 'warn',
      message: `High memory usage: ${heapPercent}%`,
      details: {
        heapUsed: `${heapUsedMB} MB`,
        heapTotal: `${heapTotalMB} MB`,
        heapPercent: `${heapPercent}%`,
      },
    };
  }

  // Fail if using more than 95% of heap
  if (heapPercent > 95) {
    return {
      status: 'fail',
      message: `Critical memory usage: ${heapPercent}%`,
      details: {
        heapUsed: `${heapUsedMB} MB`,
        heapTotal: `${heapTotalMB} MB`,
        heapPercent: `${heapPercent}%`,
      },
    };
  }

  return {
    status: 'pass',
    message: 'Memory usage normal',
    details: {
      heapUsed: `${heapUsedMB} MB`,
      heapTotal: `${heapTotalMB} MB`,
      heapPercent: `${heapPercent}%`,
    },
  };
}

/**
 * Perform complete health check
 */
export async function getHealthStatus(): Promise<HealthStatus> {
  const [database, queues, memory] = await Promise.all([
    checkDatabase(),
    checkQueues(),
    Promise.resolve(checkMemory()),
  ]);

  const checks = { database, queues, memory };

  // Determine overall status
  const hasFail = Object.values(checks).some(check => check.status === 'fail');
  const hasWarn = Object.values(checks).some(check => check.status === 'warn');

  let status: 'healthy' | 'degraded' | 'unhealthy';
  if (hasFail) {
    status = 'unhealthy';
  } else if (hasWarn) {
    status = 'degraded';
  } else {
    status = 'healthy';
  }

  return {
    status,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks,
  };
}

/**
 * Simple liveness check (is process running?)
 */
export function getLiveness(): boolean {
  return true;
}

/**
 * Readiness check (is app ready to serve traffic?)
 */
export async function getReadiness(): Promise<boolean> {
  try {
    // Check if database is accessible
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    logger.error('Readiness check failed', { error });
    return false;
  }
}

export default {
  getHealthStatus,
  getLiveness,
  getReadiness,
};
