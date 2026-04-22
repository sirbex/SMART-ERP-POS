/**
 * Accounting Remediation Script
 * Run once to correct two confirmed GL discrepancies:
 *
 * 1. INVENTORY (account 1300): Brain Active Denk original receipt was never GL-posted.
 *    200,000 units were sold, refunded (20K), and voided (200K) — but the initial
 *    goods receipt was never posted to the ledger. Corrective entry:
 *      DR Inventory (1300) 195,800,000
 *      CR Opening Balance Equity (3050) 195,800,000
 *
 * 2. AR (account 1200): Three DEPOSIT sales (0037/0038/0039) with no customer_id
 *    left AR permanently open. Amount was fully collected (amount_paid = total_amount).
 *    Corrective entries per sale:
 *      DR Cash (1010) [money was received]
 *      CR AR (1200) [clear the receivable]
 *
 * 3. INVENTORY WRITE-DOWN: After fix 1, a secondary 2,195,767 GL > Physical gap remains.
 *    Root cause: opening stock GL imports used higher unit costs than cost_layers.
 *    When those products were sold, FEFO credited account 1300 at cost_layers cost
 *    (lower), leaving an unrecoverable overage in the GL.
 *    Corrective entry:
 *      DR Inventory Shrinkage (5110) 2,195,767
 *      CR Inventory (1300) 2,195,767
 *
 * Usage:
 *   cd SamplePOS.Server
 *   npx tsx src/scripts/remediation-accounting-2026-04.ts
 */

import { AccountingCore } from '../services/accountingCore.js';
import pool from '../db/pool.js';
import { randomUUID } from 'crypto';

const ADMIN_USER_ID = '00000000-0000-0000-0000-000000000000';
const TODAY = '2026-04-21';

async function main() {
  console.log('=== Accounting Remediation 2026-04-21 ===\n');

  // ----------------------------------------------------------------
  // FIX 1: Inventory — Brain Active Denk missing receipt GL
  // ----------------------------------------------------------------
  console.log('Fix 1: Posting corrective inventory entry for Brain Active Denk...');

  const inventoryFix = await AccountingCore.createJournalEntry(
    {
      entryDate: TODAY,
      description:
        'Corrective entry: Brain Active Denk original receipt was never GL-posted. ' +
        '200,000 units sold in SALE-2026-0045 (voided) had no corresponding receipt in account 1300. ' +
        'Restores opening inventory value to match physical cost_layers.',
      referenceType: 'ADJUSTMENT',
      referenceId: randomUUID(),
      referenceNumber: 'ADJ-REMEDIATION-001',
      idempotencyKey: 'remediation-inventory-brain-active-2026-04-21',
      source: 'SYSTEM_CORRECTION' as const,
      userId: ADMIN_USER_ID,
      lines: [
        {
          accountCode: '1300',
          description: 'Brain Active Denk inventory — missing original receipt correction (200,000 units × 979)',
          debitAmount: 195800000,
          creditAmount: 0,
        },
        {
          accountCode: '3050',
          description: 'Opening Balance Equity — recognition of pre-system inventory asset',
          debitAmount: 0,
          creditAmount: 195800000,
        },
      ],
    },
    pool
  );
  console.log(`  ✓ Posted: ${inventoryFix.transactionNumber} (DR Inventory 195,800,000 / CR Opening Equity 195,800,000)\n`);

  // ----------------------------------------------------------------
  // FIX 2: AR — Clear orphan DEPOSIT sales against Cash
  // ----------------------------------------------------------------
  const orphanSales = [
    { saleNumber: 'SALE-2026-0037', amount: 4100, idempotencyKey: 'remediation-ar-clear-0037-2026-04-21' },
    { saleNumber: 'SALE-2026-0038', amount: 8056, idempotencyKey: 'remediation-ar-clear-0038-2026-04-21' },
    { saleNumber: 'SALE-2026-0039', amount: 40000, idempotencyKey: 'remediation-ar-clear-0039-2026-04-21' },
  ];

  for (const sale of orphanSales) {
    console.log(`Fix 2: Clearing AR for ${sale.saleNumber} (${sale.amount.toLocaleString()})...`);
    const arFix = await AccountingCore.createJournalEntry(
      {
        entryDate: TODAY,
        description:
          `Corrective entry: ${sale.saleNumber} was a DEPOSIT sale with no customer_id. ` +
          `Full payment of ${sale.amount} was collected (amount_paid = total_amount) but AR was never cleared. ` +
          `Reclassified to Cash — cashier used DEPOSIT instead of CASH payment method.`,
        referenceType: 'ADJUSTMENT',
        referenceId: randomUUID(),
        referenceNumber: `ADJ-REMEDIATION-${sale.saleNumber.replace('SALE-', '')}`,

        idempotencyKey: sale.idempotencyKey,
        source: 'SYSTEM_CORRECTION' as const,
        userId: ADMIN_USER_ID,
        lines: [
          {
            accountCode: '1010',
            description: `Cash received for ${sale.saleNumber} — DEPOSIT/CASH reclassification`,
            debitAmount: sale.amount,
            creditAmount: 0,
          },
          {
            accountCode: '1200',
            description: `Clear AR for ${sale.saleNumber} — payment confirmed, no customer on file`,
            debitAmount: 0,
            creditAmount: sale.amount,
          },
        ],
      },
      pool
    );
    console.log(`  ✓ Posted: ${arFix.transactionNumber} (DR Cash ${sale.amount.toLocaleString()} / CR AR ${sale.amount.toLocaleString()})`);
  }

  // ----------------------------------------------------------------
  // FIX 3: Inventory write-down — GL/Physical unit cost mismatch
  // ----------------------------------------------------------------
  console.log('\nFix 3: Posting inventory write-down for historical cost mismatch...');

  const writeDown = await AccountingCore.createJournalEntry(
    {
      entryDate: TODAY,
      description:
        'Inventory write-down: opening stock GL imports used higher unit costs than cost_layers. ' +
        'When those products were subsequently sold via FEFO, account 1300 was credited at cost_layer ' +
        'costs (lower), leaving a 2,195,767 GL overage with no physical counterpart. ' +
        'Write-down brings GL into agreement with cost_layers physical valuation.',
      referenceType: 'ADJUSTMENT',
      referenceId: randomUUID(),
      referenceNumber: 'ADJ-REMEDIATION-002',
      idempotencyKey: 'remediation-inventory-writedown-2026-04-21',
      source: 'SYSTEM_CORRECTION' as const,
      userId: ADMIN_USER_ID,
      lines: [
        {
          accountCode: '5110',
          description: 'Inventory Shrinkage — historical cost mismatch write-down (GL vs cost_layers reconciliation)',
          debitAmount: 2195767,
          creditAmount: 0,
        },
        {
          accountCode: '1300',
          description: 'Inventory — write-down to match physical cost_layers valuation',
          debitAmount: 0,
          creditAmount: 2195767,
        },
      ],
    },
    pool
  );
  console.log(`  ✓ Posted: ${writeDown.transactionNumber} (DR Inventory Shrinkage 2,195,767 / CR Inventory 2,195,767)\n`);

  console.log('\n=== Remediation complete ===');
  console.log('Run the accounting integrity test to verify:\n');
  console.log('  cd SamplePOS.Server && npx tsx src/tests/accounting-integrity.test.ts\n');

  await pool.end();
}

main().catch((err) => {
  console.error('Remediation failed:', err);
  process.exit(1);
});
