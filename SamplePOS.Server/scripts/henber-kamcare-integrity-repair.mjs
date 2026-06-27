#!/usr/bin/env node
/**
 * KAMCARE integrity repair — SCN-2026-0008 missing application offset on 2100.
 *
 * Root cause (live Henber 2026-06-27):
 *   SCN-0007 has net-active 2100 impact 0 (TXN-010561 debit + TXN-011801 credit).
 *   SCN-0008 has net-active 2100 impact -17500 (TXN-013737 only).
 *   Open-item subledger = 220020 (pending bills); GL = 202520 → integrity -17500.
 *
 * Repair (document-level, mirrors existing SCN-0007 pattern):
 *   1. Post missing SUPPLIER_INVOICE offset journal (idempotent) if absent
 *   2. Set is_posted_to_gl = TRUE on SCN-0007 and SCN-0008 (metadata only)
 *   3. Normalize negative OutstandingBalance on reference bills (SBILL-0252, SBILL-0382)
 *   4. Recalc KAMCARE supplier cache
 *
 * Usage:
 *   node scripts/henber-kamcare-integrity-repair.mjs           # dry-run
 *   DRY_RUN=0 node scripts/henber-kamcare-integrity-repair.mjs
 */
import pg from 'pg';

const DRY_RUN = process.env.DRY_RUN !== '0';
const pool = new pg.Pool({
  connectionString:
    process.env.HENBER_DATABASE_URL
    || 'postgresql://postgres:55b9bed51c599b26e7115ab126a974e8@209.38.203.138:5432/pos_tenant_henber_pharmacy',
});

const NET_ACTIVE = `
  lt."Status" = 'POSTED'
  AND lt."IsReversed" = FALSE
  AND lt."Id" NOT IN (
    SELECT "ReversedByTransactionId" FROM ledger_transactions
    WHERE "ReversedByTransactionId" IS NOT NULL
  )
`;

const fmt = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
const num = (v) => Number(v || 0);

const SCN_0008_ID = '942244b8-de7a-4a36-b34b-30fb8fee3a34';
const SCN_0008_NO = 'SCN-2026-0008';
const OFFSET_AMOUNT = 17_500;
const OFFSET_IDEMPOTENCY = `SUPPLIER_INVOICE-${SCN_0008_ID}`;

async function kamcareSupplierId(client) {
  const r = await client.query(
    `SELECT "Id", "CompanyName" FROM suppliers WHERE "CompanyName" ILIKE '%KAMCARE%' LIMIT 1`,
  );
  return r.rows[0];
}

async function scnNetActive2100(client, scnId) {
  const r = await client.query(
    `
    SELECT COALESCE(SUM(le."CreditAmount" - le."DebitAmount"), 0)::numeric AS net
    FROM ledger_transactions lt
    JOIN ledger_entries le ON le."TransactionId" = lt."Id"
    JOIN accounts a ON a."Id" = le."AccountId"
    WHERE a."AccountCode" = '2100'
      AND (
        (lt."ReferenceId"::text = $1 AND lt."ReferenceType" IN ('SUPPLIER_CREDIT_NOTE', 'SUPPLIER_INVOICE'))
      )
      AND ${NET_ACTIVE}`,
    [scnId],
  );
  return num(r.rows[0]?.net);
}

async function offsetExists(client) {
  const r = await client.query(
    `SELECT "TransactionNumber", "Status", "IsReversed"
     FROM ledger_transactions WHERE "IdempotencyKey" = $1 LIMIT 1`,
    [OFFSET_IDEMPOTENCY],
  );
  return r.rows[0] ?? null;
}

async function main() {
  console.log(`KAMCARE integrity repair — ${DRY_RUN ? 'DRY RUN' : 'LIVE'}\n`);

  const { captureApReconciliationMetrics } = await import(
    '../dist/SamplePOS.Server/src/modules/supplier-payments/apReconciliationMetrics.js'
  );
  const { AccountingCore } = await import(
    '../dist/SamplePOS.Server/src/services/accountingCore.js'
  );
  const { recalculateOutstandingBalance } = await import(
    '../dist/SamplePOS.Server/src/modules/suppliers/supplierRepository.js'
  );

  const before = await captureApReconciliationMetrics(pool);
  console.log('BEFORE:');
  console.log(`  integrityGlDrift:  ${fmt(before.integrityGlDrift)}`);
  console.log(`  glSupplierScope:   ${fmt(before.glSupplierScopeNetActive)}`);
  console.log(`  openItemSubledger: ${fmt(before.openItemSubledger)}`);

  const client = await pool.connect();
  try {
    const supplier = await kamcareSupplierId(client);
    if (!supplier) throw new Error('KAMCARE supplier not found');

    const scn8Net = await scnNetActive2100(client, SCN_0008_ID);
    console.log(`\nSCN-0008 net-active 2100 impact: ${fmt(scn8Net)}`);

    if (Math.abs(scn8Net + OFFSET_AMOUNT) > 0.01) {
      console.error(`Expected SCN-0008 net ~-${OFFSET_AMOUNT}, got ${fmt(scn8Net)} — abort`);
      process.exit(2);
    }

    const existingOffset = await offsetExists(client);
    if (existingOffset?.Status === 'POSTED' && !existingOffset.IsReversed) {
      console.log(`Offset journal already exists: ${existingOffset.TransactionNumber}`);
    } else if (DRY_RUN) {
      console.log(`Would post offset journal ${OFFSET_IDEMPOTENCY}: Cr 2100 / Dr 6900 ${fmt(OFFSET_AMOUNT)}`);
    } else {
      await client.query('BEGIN');
      const scnRow = await client.query(
        `SELECT "InvoiceDate"::date AS note_date FROM supplier_invoices WHERE "Id" = $1`,
        [SCN_0008_ID],
      );
      const entryDate = scnRow.rows[0]?.note_date ?? new Date().toISOString().slice(0, 10);

      const result = await AccountingCore.createJournalEntry(
        {
          entryDate,
          description: `Supplier credit note application offset: ${SCN_0008_NO}`,
          referenceType: 'SUPPLIER_INVOICE',
          referenceId: SCN_0008_ID,
          referenceNumber: SCN_0008_NO,
          lines: [
            {
              accountCode: '6900',
              description: `CN application offset — ${SCN_0008_NO}`,
              debitAmount: OFFSET_AMOUNT,
              creditAmount: 0,
              entityType: 'SUPPLIER',
              entityId: supplier.Id,
            },
            {
              accountCode: '2100',
              description: `CN application offset — ${SCN_0008_NO}`,
              debitAmount: 0,
              creditAmount: OFFSET_AMOUNT,
              entityType: 'SUPPLIER',
              entityId: supplier.Id,
            },
          ],
          userId: process.env.REPAIR_USER_ID || '00000000-0000-0000-0000-000000000000',
          idempotencyKey: OFFSET_IDEMPOTENCY,
          source: 'PURCHASE_BILL',
        },
        pool,
        client,
      );
      console.log(`Posted offset journal: ${result.transactionNumber}`);
      await client.query('COMMIT');
    }

    const scnIds = [
      '24987e1e-ea20-466f-b70d-8c9fe0f03c72',
      SCN_0008_ID,
    ];
    const billFixes = [
      { no: 'SBILL-2026-0252', from: -44_000 },
      { no: 'SBILL-2026-0382', from: -17_500 },
    ];

    if (DRY_RUN) {
      console.log('\nWould set is_posted_to_gl=TRUE on SCN-0007, SCN-0008');
      for (const b of billFixes) {
        console.log(`Would set ${b.no} OutstandingBalance 0 (was ${fmt(b.from)})`);
      }
      console.log('Would recalc KAMCARE supplier cache');
    } else {
      await client.query('BEGIN');
      for (const id of scnIds) {
        await client.query(
          `UPDATE supplier_invoices
           SET is_posted_to_gl = TRUE, posted_to_gl_at = COALESCE(posted_to_gl_at, NOW()), "UpdatedAt" = NOW()
           WHERE "Id" = $1 AND COALESCE(is_posted_to_gl, FALSE) = FALSE`,
          [id],
        );
      }
      for (const b of billFixes) {
        await client.query(
          `UPDATE supplier_invoices
           SET "OutstandingBalance" = 0, "UpdatedAt" = NOW()
           WHERE "SupplierInvoiceNumber" = $1 AND "OutstandingBalance" < -0.01`,
          [b.no],
        );
      }
      await recalculateOutstandingBalance(client, supplier.Id);
      await client.query('COMMIT');
      console.log('\nMetadata + bill OB normalized; supplier cache recalculated');
    }
  } finally {
    client.release();
  }

  if (!DRY_RUN) {
    const after = await captureApReconciliationMetrics(pool);
    console.log('\nAFTER:');
    console.log(`  integrityGlDrift:  ${fmt(after.integrityGlDrift)}`);
    console.log(`  glSupplierScope:   ${fmt(after.glSupplierScopeNetActive)}`);
    console.log(`  openItemSubledger: ${fmt(after.openItemSubledger)}`);
    if (Math.abs(after.integrityGlDrift) > 0.01) {
      console.error('Integrity drift remains — manual review required');
      process.exit(1);
    }
    console.log('\n✓ KAMCARE integrity repair complete');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(2);
  })
  .finally(() => pool.end());
