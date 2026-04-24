/**
 * ONE-TIME reconciliation script for historical void cost-mismatch drift.
 *
 * Root cause:
 *   Prior to fix (commit after 99298d2), voidSale() restored inventory to the
 *   "newest active batch" at THAT BATCH'S cost_price. But the GL reversal used
 *   the original sale unit_cost. For 5 voided sales (Apr 2026), this caused:
 *     GL 1300 (Inventory) > subledger (inventory_batches) by 24,172.59
 *
 * This script posts a reconciling journal entry:
 *   DR Price Variance (5020)  [amount]
 *   CR Inventory (1300)       [amount]
 *
 * The amount is computed dynamically as (GL 1300 balance - subledger value)
 * so it's safe to re-run if the drift changes before this runs.
 *
 * Idempotency key: VOID_COST_VARIANCE_RECONCILE_APR2026 — runs only once.
 *
 * Usage:
 *   npx tsx scripts/reconcile-void-cost-variance.ts
 */
import pg from 'pg';
import * as dotenv from 'dotenv';
import { AccountingCore } from '../src/services/accountingCore.js';
import { getBusinessDate } from '../src/utils/dateUtils.js';

dotenv.config();

const IDEMPOTENCY_KEY = 'VOID_COST_VARIANCE_RECONCILE_APR2026';
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';

async function main() {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

    try {
        // 1. Check if already applied
        const existing = await pool.query(
            `SELECT "Id" FROM ledger_transactions WHERE "IdempotencyKey" = $1`,
            [IDEMPOTENCY_KEY]
        );
        if (existing.rows.length > 0) {
            console.warn('Reconciling entry already posted — nothing to do.');
            return;
        }

        // 2. Compute current drift: GL 1300 balance − physical subledger
        const glRes = await pool.query(`
      SELECT ROUND(
        COALESCE(SUM(le."DebitAmount"), 0) - COALESCE(SUM(le."CreditAmount"), 0),
        2
      ) AS gl_balance
      FROM ledger_entries le
      JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
      JOIN accounts a ON a."Id" = le."AccountId"
      WHERE a."AccountCode" = '1300'
    `);
        const glBalance = parseFloat(glRes.rows[0].gl_balance ?? '0');

        const subRes = await pool.query(`
      SELECT ROUND(
        COALESCE(SUM(remaining_quantity * cost_price), 0),
        2
      ) AS sub_balance
      FROM inventory_batches
    `);
        const subBalance = parseFloat(subRes.rows[0].sub_balance ?? '0');

        const drift = parseFloat((glBalance - subBalance).toFixed(2));

        console.log(`GL 1300 balance : ${glBalance.toFixed(2)}`);
        console.log(`Subledger value : ${subBalance.toFixed(2)}`);
        console.log(`Drift (GL - Sub): ${drift.toFixed(2)}`);

        if (Math.abs(drift) < 0.01) {
            console.log('Drift is within tolerance — no entry needed.');
            return;
        }

        // 3. Post reconciling entry
        // GL > Sub (drift > 0): CR Inventory 1300 (reduce GL), DR Price Variance
        // GL < Sub (drift < 0): DR Inventory 1300 (increase GL), CR Price Variance
        const absAmount = Math.abs(drift);
        const isGLHigh = drift > 0;

        const lines = isGLHigh
            ? [
                { accountCode: '5020', description: 'Void cost-mismatch variance (inventory restored at lower cost than original COGS)', debitAmount: absAmount, creditAmount: 0 },
                { accountCode: '1300', description: 'Inventory correction: align GL to subledger (void cost variance Apr 2026)', debitAmount: 0, creditAmount: absAmount },
            ]
            : [
                { accountCode: '1300', description: 'Inventory correction: align GL to subledger (void cost variance Apr 2026)', debitAmount: absAmount, creditAmount: 0 },
                { accountCode: '5020', description: 'Void cost-mismatch variance (inventory restored at higher cost than original COGS)', debitAmount: 0, creditAmount: absAmount },
            ];

        await AccountingCore.createJournalEntry({
            entryDate: getBusinessDate(),
            description: `VOID COST VARIANCE: Reconcile GL 1300 to subledger (historical void restorations at mismatched cost). Drift: ${drift.toFixed(2)}`,
            referenceType: 'INVENTORY_ADJUSTMENT',
            referenceId: IDEMPOTENCY_KEY,
            referenceNumber: 'VOID-COST-VAR-APR2026',
            lines,
            userId: SYSTEM_USER_ID,
            idempotencyKey: IDEMPOTENCY_KEY,
            source: 'INVENTORY_MOVE' as const,
        }, pool);

        console.log(`\n✅ Reconciling entry posted. Adjusted GL 1300 by ${isGLHigh ? '-' : '+'}${absAmount.toFixed(2)}.`);

        // 4. Verify
        const verify = await pool.query(`
      SELECT
        ROUND(COALESCE(SUM(le."DebitAmount"), 0) - COALESCE(SUM(le."CreditAmount"), 0), 2) AS gl_balance,
        (SELECT ROUND(COALESCE(SUM(remaining_quantity * cost_price), 0), 2) FROM inventory_batches) AS sub_balance
      FROM ledger_entries le
      JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
      JOIN accounts a ON a."Id" = le."AccountId"
      WHERE a."AccountCode" = '1300'
    `);
        const newGl = parseFloat(verify.rows[0].gl_balance);
        const newSub = parseFloat(verify.rows[0].sub_balance);
        console.log(`\nPost-reconciliation:`);
        console.log(`  GL 1300   : ${newGl.toFixed(2)}`);
        console.log(`  Subledger : ${newSub.toFixed(2)}`);
        console.log(`  Drift     : ${(newGl - newSub).toFixed(2)}`);
    } finally {
        await pool.end();
    }
}

main().catch(err => {
    console.error('Failed:', err);
    process.exit(1);
});
