// Demand Forecast Scheduled Jobs
// Registers Bull cron jobs for the self-learning reorder engine:
//   - Daily at 02:00 AM: refresh demand statistics
//   - Monthly on the 1st at 03:00 AM: refresh seasonality
//
// Call initDemandForecastJobs(pool) once during server startup.

import type { Pool } from 'pg';
import { jobQueue, JobTypes } from '../../services/jobQueue.js';
import { demandForecastService } from './demandForecastService.js';
import logger from '../../utils/logger.js';

// Extend JobTypes
(JobTypes as Record<string, string>).DEMAND_DAILY_REFRESH = 'demand-daily-refresh';
(JobTypes as Record<string, string>).DEMAND_MONTHLY_REFRESH = 'demand-monthly-refresh';

export function initDemandForecastJobs(pool: Pool): void {
    const calculationsQueue = jobQueue.getQueue('calculations');
    if (!calculationsQueue) {
        logger.warn('[DemandForecast] Calculations queue not available — skipping scheduled jobs (Redis may be offline)');
        return;
    }

    // ── Register processors ──────────────────────────────
    jobQueue.processQueue('calculations', async (job) => {
        if (job.data.type === 'demand-daily-refresh') {
            return demandForecastService.runDailyUpdate(pool);
        }
        if (job.data.type === 'demand-monthly-refresh') {
            return demandForecastService.runMonthlyUpdate(pool);
        }
        // Not our job type — ignore (other processors handle their own types)
        return null;
    });

    // ── Schedule recurring jobs ──────────────────────────
    // Daily at 02:00 AM server time
    calculationsQueue.add(
        {
            type: 'demand-daily-refresh',
            payload: {},
            userId: 'system',
            timestamp: new Date().toISOString(),
        },
        {
            repeat: { cron: '0 2 * * *' }, // every day at 02:00
            jobId: 'demand-daily-refresh',
            removeOnComplete: 30,
            removeOnFail: 100,
        }
    ).then(() => {
        logger.info('[DemandForecast] Daily refresh job scheduled (02:00 AM)');
    }).catch((err: unknown) => {
        logger.warn('[DemandForecast] Failed to schedule daily job', { error: err instanceof Error ? err.message : String(err) });
    });

    // Monthly on the 1st at 03:00 AM
    calculationsQueue.add(
        {
            type: 'demand-monthly-refresh',
            payload: {},
            userId: 'system',
            timestamp: new Date().toISOString(),
        },
        {
            repeat: { cron: '0 3 1 * *' }, // 1st of every month at 03:00
            jobId: 'demand-monthly-refresh',
            removeOnComplete: 12,
            removeOnFail: 24,
        }
    ).then(() => {
        logger.info('[DemandForecast] Monthly seasonality job scheduled (1st of month, 03:00 AM)');
    }).catch((err: unknown) => {
        logger.warn('[DemandForecast] Failed to schedule monthly job', { error: err instanceof Error ? err.message : String(err) });
    });

    logger.info('[DemandForecast] Self-learning reorder engine initialized');
}
