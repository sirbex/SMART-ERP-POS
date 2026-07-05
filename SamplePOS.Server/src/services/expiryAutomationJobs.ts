/**
 * Nightly expiry automation — moves expired sellable stock to EXPIRED store.
 */

import type { Pool } from 'pg';
import { jobQueue } from './jobQueue.js';
import { runScheduledExpiryAutomation } from '../modules/inventory/warehouse/expiryAutomationService.js';
import logger from '../utils/logger.js';

const JOB_ID = 'expiry-automation-nightly';
const JOB_TYPE = 'expiry-automation';
const CRON_PATTERN = '0 4 * * *'; // 04:00 server time (after GL integrity check)

export function initExpiryAutomationJobs(pool: Pool): void {
    const calculationsQueue = jobQueue.getQueue('calculations');
    if (!calculationsQueue) {
        logger.warn('[ExpiryAutomation] Calculations queue not available — skipping scheduled job');
        return;
    }

    jobQueue.processQueue('calculations', async (job) => {
        if (job.data.type !== JOB_TYPE) {
            return null;
        }
        await runScheduledExpiryAutomation(pool);
        return { ok: true };
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
                removeOnComplete: 14,
                removeOnFail: 50,
            },
        )
        .then(() => {
            logger.info('[ExpiryAutomation] Nightly job scheduled (04:00 server time)');
        })
        .catch((err: unknown) => {
            logger.warn('[ExpiryAutomation] Failed to schedule nightly job', {
                error: err instanceof Error ? err.message : String(err),
            });
        });
}
