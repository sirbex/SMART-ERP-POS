/**
 * Inventory ↔ GL Integrity scheduled jobs.
 *
 * Registers a nightly Bull cron that runs
 * `runInventoryGLIntegrityCheck(pool)` and logs a CRITICAL/WARN event
 * whenever GL account 1300 drifts from the cost-layer subledger.
 *
 * Runs at 02:30 UTC — 30 minutes after the existing demand-forecast job
 * so they don't contend for the same DB connection pool window.
 *
 * Call `initInventoryGLIntegrityJobs(pool)` once during server startup.
 */

import type { Pool } from 'pg';
import { jobQueue, JobTypes } from './jobQueue.js';
import { runInventoryGLIntegrityCheck } from './inventoryGLIntegrityCheckService.js';
import logger from '../utils/logger.js';

// Extend JobTypes for observability
(JobTypes as Record<string, string>).INVENTORY_GL_INTEGRITY_CHECK = 'inventory-gl-integrity-check';

const JOB_ID = 'inventory-gl-integrity-check';
const JOB_TYPE = 'inventory-gl-integrity-check';
const CRON_PATTERN = '30 2 * * *'; // every day at 02:30 server time

export function initInventoryGLIntegrityJobs(pool: Pool): void {
    const calculationsQueue = jobQueue.getQueue('calculations');
    if (!calculationsQueue) {
        logger.warn('[InventoryGLIntegrity] Calculations queue not available — skipping scheduled jobs (Redis may be offline)');
        return;
    }

    // Processor: detect our job type, run the check, swallow errors
    // (bull's default retry policy will handle transient failures).
    jobQueue.processQueue('calculations', async (job) => {
        if (job.data.type !== JOB_TYPE) {
            return null; // another processor owns this job
        }
        try {
            const result = await runInventoryGLIntegrityCheck(pool);
            return result;
        } catch (err: unknown) {
            logger.error('[InventoryGLIntegrity] Scheduled check failed', {
                error: err instanceof Error ? err.message : String(err),
            });
            throw err; // let Bull record as failed
        }
    });

    calculationsQueue
        .add(
            {
                type: JOB_TYPE,
                payload: {},
                userId: 'system',
                timestamp: new Date().toISOString(),
            },
            {
                repeat: { cron: CRON_PATTERN },
                jobId: JOB_ID,
                removeOnComplete: 30,
                removeOnFail: 100,
            },
        )
        .then(() => {
            logger.info('[InventoryGLIntegrity] Nightly integrity check scheduled (02:30 server time)');
        })
        .catch((err: unknown) => {
            logger.warn('[InventoryGLIntegrity] Failed to schedule nightly job', {
                error: err instanceof Error ? err.message : String(err),
            });
        });
}
