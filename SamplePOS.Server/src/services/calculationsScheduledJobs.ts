/**
 * Single Bull processor for the `calculations` queue.
 * All scheduled job modules register handlers first; this starts dispatch once.
 */

import type { Pool } from 'pg';
import { jobQueue } from './jobQueue.js';
import logger from '../utils/logger.js';
import {
    registerDemandForecastCalculationsHandlers,
    scheduleDemandForecastJobs,
} from '../modules/reports/demandForecastJobs.js';
import {
    registerInventoryGLIntegrityCalculationsHandlers,
    scheduleInventoryGLIntegrityJobs,
} from './inventoryGLIntegrityJobs.js';
import {
    registerExpiryAutomationCalculationsHandlers,
    scheduleExpiryAutomationJobs,
} from './expiryAutomationJobs.js';

let started = false;

export function initCalculationsScheduledJobs(pool: Pool): void {
    const calculationsQueue = jobQueue.getQueue('calculations');
    if (!calculationsQueue) {
        logger.warn('[CalculationsJobs] Queue unavailable — skipping scheduled jobs (Redis may be offline)');
        return;
    }

    registerDemandForecastCalculationsHandlers(pool);
    registerInventoryGLIntegrityCalculationsHandlers(pool);
    registerExpiryAutomationCalculationsHandlers(pool);

    if (!started) {
        jobQueue.startCalculationsProcessor();
        started = true;
        logger.info('[CalculationsJobs] Unified calculations dispatcher started');
    }

    scheduleDemandForecastJobs();
    scheduleInventoryGLIntegrityJobs();
    scheduleExpiryAutomationJobs(pool);
}
