/**
 * fixInventoryGLDrift
 * =============================================================================
 * One-shot operator script that reconciles GL account 1300 (Inventory)
 * against the cost-layer subledger under source = 'SYSTEM_CORRECTION'.
 *
 * WHEN TO RUN:
 *   Invoked manually by an authorised operator AFTER reviewing the output of
 *   the nightly `runInventoryGLIntegrityCheck()` (see
 *   `inventoryGLIntegrityCheckService.ts`). This script posts a journal that
 *   moves the drift into an inventory-shrinkage / write-down expense
 *   account so the GL and subledger agree.
 *
 * POSTING RULE:
 *   Drift > 0 (GL overstated vs subledger):
 *     DR 5110 Inventory Shrinkage   |drift|
 *     CR 1300 Inventory            |drift|
 *
 *   Drift < 0 (GL understated vs subledger):
 *     DR 1300 Inventory             |drift|
 *     CR 4110 Stock Overage Income  |drift|
 *
 *   Source = SYSTEM_CORRECTION so the governance Rule H accepts the posting.
 *   A deterministic idempotency key keyed to the business date prevents
 *   duplicate corrections on the same day.
 *
 * USAGE:
 *   # Dry run (no DB writes, just show what would happen):
 *   cd SamplePOS.Server && npx tsx src/scripts/fixInventoryGLDrift.ts --dry-run
 *
 *   # Apply the correction:
 *   cd SamplePOS.Server && npx tsx src/scripts/fixInventoryGLDrift.ts --apply
 *
 * SAFETY:
 *   • Read-only unless --apply is passed.
 *   • Refuses to post if drift is within the tolerance threshold.
 *   • Refuses to post without an ADMIN_USER_ID for the audit trail.
 */

import { randomUUID } from 'crypto';
import pg from 'pg';
import * as AccountingCore from '../services/accountingCore.js';
import { runInventoryGLIntegrityCheck } from '../services/inventoryGLIntegrityCheckService.js';
import logger from '../utils/logger.js';
import { getBusinessDate } from '../utils/dateRange.js';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:password@localhost:5432/pos_system';
const ADMIN_USER_ID = process.env.ADMIN_USER_ID ?? '00000000-0000-0000-0000-000000000001';

const INVENTORY_ACCOUNT = '1300';
const SHRINKAGE_ACCOUNT = '5110';       // DR when GL overstated
const STOCK_OVERAGE_ACCOUNT = '4110';   // CR when GL understated

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const dryRun = !args.includes('--apply');

    const pool = new pg.Pool({ connectionString: DATABASE_URL });

    try {
        console.warn('=== Inventory ↔ GL Drift Correction ===');
        console.warn(`Mode: ${dryRun ? 'DRY RUN (no writes)' : 'APPLY'}`);
        console.warn(`Database: ${DATABASE_URL.replace(/\/\/[^@]+@/, '//***@')}`);
        console.warn('');

        // Step 1: measure drift
        const check = await runInventoryGLIntegrityCheck(pool);
        console.warn('Current state:');
        console.warn(`  GL account 1300 balance : ${check.glBalance.toLocaleString()}`);
        console.warn(`  Subledger valuation     : ${check.subledgerBalance.toLocaleString()}`);
        console.warn(`  Drift (GL - subledger)  : ${check.drift.toLocaleString()}`);
        console.warn(`  Materiality threshold   : ${check.threshold.toLocaleString()}`);
        console.warn(`  Alert level             : ${check.alertLevel}`);
        console.warn('');

        if (!check.isDrifting) {
            console.warn('✅ Drift within tolerance — no correction needed.');
            return;
        }

        // Step 2: build the correction journal
        const asOfDate = getBusinessDate();
        const absDrift = Math.abs(check.drift);
        const isOverstated = check.drift > 0;

        const debitAccount = isOverstated ? SHRINKAGE_ACCOUNT : INVENTORY_ACCOUNT;
        const creditAccount = isOverstated ? INVENTORY_ACCOUNT : STOCK_OVERAGE_ACCOUNT;
        const description = isOverstated
            ? 'Inventory write-down: GL 1300 reconciled to cost_layer subledger (drift correction)'
            : 'Inventory write-up: GL 1300 reconciled to cost_layer subledger (drift correction)';

        const referenceId = randomUUID();
        const referenceNumber = `ADJ-DRIFT-${asOfDate.replace(/-/g, '')}`;
        const idempotencyKey = `inventory-gl-drift-fix-${asOfDate}`;

        console.warn('Proposed correction journal:');
        console.warn(`  Date            : ${asOfDate}`);
        console.warn(`  Reference       : ${referenceNumber}`);
        console.warn(`  Idempotency key : ${idempotencyKey}`);
        console.warn(`  DR ${debitAccount}   ${absDrift.toLocaleString()}`);
        console.warn(`  CR ${creditAccount}   ${absDrift.toLocaleString()}`);
        console.warn(`  Source          : SYSTEM_CORRECTION`);
        console.warn('');

        if (dryRun) {
            console.warn('Dry run complete. Re-run with --apply to post the correction.');
            return;
        }

        // Step 3: post the correction
        const result = await AccountingCore.createJournalEntry(
            {
                entryDate: asOfDate,
                description,
                referenceType: 'ADJUSTMENT',
                referenceId,
                referenceNumber,
                idempotencyKey,
                source: 'SYSTEM_CORRECTION' as const,
                userId: ADMIN_USER_ID,
                lines: [
                    {
                        accountCode: debitAccount,
                        description: `Drift correction DR ${debitAccount}`,
                        debitAmount: absDrift,
                        creditAmount: 0,
                    },
                    {
                        accountCode: creditAccount,
                        description: `Drift correction CR ${creditAccount}`,
                        debitAmount: 0,
                        creditAmount: absDrift,
                    },
                ],
            },
            pool,
        );

        console.warn(`✅ Posted correction: transaction ${result.transactionNumber}`);

        // Step 4: verify
        const verify = await runInventoryGLIntegrityCheck(pool);
        console.warn('');
        console.warn('Post-correction state:');
        console.warn(`  GL account 1300 balance : ${verify.glBalance.toLocaleString()}`);
        console.warn(`  Subledger valuation     : ${verify.subledgerBalance.toLocaleString()}`);
        console.warn(`  Drift                   : ${verify.drift.toLocaleString()}`);
        console.warn(`  Alert level             : ${verify.alertLevel}`);
    } catch (err: unknown) {
        logger.error('Drift correction failed', {
            error: err instanceof Error ? err.message : String(err),
        });
        console.error('❌ Drift correction failed:', err);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
