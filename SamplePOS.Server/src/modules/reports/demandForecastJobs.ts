// Demand Forecast Scheduled Jobs
// Registers Bull cron jobs for the self-learning reorder engine:
//   - Daily at 02:00 AM: refresh demand statistics
//   - Monthly on the 1st at 03:00 AM: refresh seasonality
//
// Handlers register on the shared calculations dispatcher; call initDemandForecastJobs(pool) at startup.

import type { Pool } from 'pg';
import { jobQueue, JobTypes } from '../../services/jobQueue.js';
import { demandForecastService } from './demandForecastService.js';
import logger from '../../utils/logger.js';

(JobTypes as Record<string, string>).DEMAND_DAILY_REFRESH = 'demand-daily-refresh';
(JobTypes as Record<string, string>).DEMAND_MONTHLY_REFRESH = 'demand-monthly-refresh';

const DAILY_TYPE = 'demand-daily-refresh';
const MONTHLY_TYPE = 'demand-monthly-refresh';

export function registerDemandForecastCalculationsHandlers(pool: Pool): void {
    jobQueue.registerCalculationsHandler(DAILY_TYPE, async () => {
        return demandForecastService.runDailyUpdate(pool);
    });
    jobQueue.registerCalculationsHandler(MONTHLY_TYPE, async () => {
        return demandForecastService.runMonthlyUpdate(pool);
    });
}

export function scheduleDemandForecastJobs(): void {
    const calculationsQueue = jobQueue.getQueue('calculations');
    if (!calculationsQueue) {
        logger.warn('[DemandForecast] Calculations queue not available — skipping scheduled jobs (Redis may be offline)');
        return;
    }

    calculationsQueue
        .add(
            {
                type: DAILY_TYPE,
                payload: {},
                userId: 'system',
                timestamp: new Date().toISOString(),
            },
            {
                repeat: { cron: '0 2 * * *' },
                jobId: 'demand-daily-refresh',
                removeOnComplete: 30,
                removeOnFail: 100,
            },
        )
        .then(() => {
            logger.info('[DemandForecast] Daily refresh job scheduled (02:00 AM)');
        })
        .catch((err: unknown) => {
            logger.warn('[DemandForecast] Failed to schedule daily job', {
                error: err instanceof Error ? err.message : String(err),
            });
        });

    calculationsQueue
        .add(
            {
                type: MONTHLY_TYPE,
                payload: {},
                userId: 'system',
                timestamp: new Date().toISOString(),
            },
            {
                repeat: { cron: '0 3 1 * *' },
                jobId: 'demand-monthly-refresh',
                removeOnComplete: 12,
                removeOnFail: 24,
            },
        )
        .then(() => {
            logger.info('[DemandForecast] Monthly seasonality job scheduled (1st of month, 03:00 AM)');
        })
        .catch((err: unknown) => {
            logger.warn('[DemandForecast] Failed to schedule monthly job', {
                error: err instanceof Error ? err.message : String(err),
            });
        });

    logger.info('[DemandForecast] Self-learning reorder engine initialized');
}

export function initDemandForecastJobs(pool: Pool): void {
    registerDemandForecastCalculationsHandlers(pool);
    scheduleDemandForecastJobs();
}
