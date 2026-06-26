#!/usr/bin/env node
/**
 * Reverse mistaken untagged heal-ap-drift CORRECTION entries on Henber tenant.
 *
 * Reverses:
 *   TXN-013389  (−1,557,560 net on 2100)  id 608e297c-6120-492d-8fa4-120a71f85824
 *   TXN-011802  (−50,000 net on 2100)      id 2b9188be-b9a8-442e-99ca-f5b6d6e9fd75
 *
 * Usage:
 *   HENBER_DATABASE_URL=... node scripts/henber-reverse-ap-corrections.mjs          # dry-run
 *   DRY_RUN=0 HENBER_DATABASE_URL=... node scripts/henber-reverse-ap-corrections.mjs
 */
import pg from 'pg';
import { AccountingCore } from '../dist/SamplePOS.Server/src/services/accountingCore.js';

const DRY_RUN = process.env.DRY_RUN !== '0';
const REVERSAL_DATE = process.env.REVERSAL_DATE || new Date().toISOString().slice(0, 10);
const SYSTEM_USER = process.env.SYSTEM_USER_ID || '4971ceff-c094-41b0-bfaf-a3d88ea634a1';

const CORRECTIONS = [
  {
    id: '608e297c-6120-492d-8fa4-120a71f85824',
    number: 'TXN-013389',
    amount: 1_557_560,
  },
  {
    id: '2b9188be-b9a8-442e-99ca-f5b6d6e9fd75',
    number: 'TXN-011802',
    amount: 50_000,
  },
];

const pool = new pg.Pool({
  connectionString:
    process.env.HENBER_DATABASE_URL
    || 'postgresql://postgres:55b9bed51c599b26e7115ab126a974e8@209.38.203.138:5432/pos_tenant_henber_pharmacy',
});

const fmt = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 });

try {
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE REVERSAL'}`);
  console.log(`Reversal date: ${REVERSAL_DATE}\n`);

  for (const c of CORRECTIONS) {
    const check = await pool.query(
      `SELECT "Id", "TransactionNumber", "IsReversed", "Status", "Description"
       FROM ledger_transactions WHERE "Id" = $1`,
      [c.id],
    );
    if (!check.rows.length) {
      console.error(`❌ ${c.number} not found (${c.id})`);
      continue;
    }
    const row = check.rows[0];
    if (row.IsReversed) {
      console.log(`⏭️  ${row.TransactionNumber} already reversed — skip`);
      continue;
    }
    console.log(`→ ${row.TransactionNumber}: ${row.Description?.slice(0, 80)}`);
    console.log(`  Credits AP back by UGX ${fmt(c.amount)}`);

    if (DRY_RUN) continue;

    const result = await AccountingCore.reverseTransaction(
      {
        originalTransactionId: c.id,
        reversalDate: REVERSAL_DATE,
        reason: 'Reverse mistaken untagged heal-ap-drift; GL was reduced without subledger movement',
        userId: SYSTEM_USER,
        idempotencyKey: `REVERSAL-${c.id}`,
      },
      pool,
    );
    console.log(`  ✅ Reversed → ${result.transactionNumber} (${result.transactionId})`);
  }

  if (DRY_RUN) {
    console.log('\nDry run complete. Set DRY_RUN=0 to execute reversals.');
    console.log('Then: POST /api/system/gl/heal-ap-reconciliation-caches');
    console.log('Then: fix SALUD RGRNs (see _ap_reversal_diagnostic.sql section 2).');
  } else {
    const snap = await pool.query(`
      SELECT COALESCE(SUM(le."CreditAmount")-SUM(le."DebitAmount"),0)::numeric AS gl_scope
      FROM ledger_entries le JOIN ledger_transactions lt ON lt."Id"=le."TransactionId"
      JOIN accounts a ON a."Id"=le."AccountId"
      WHERE a."AccountCode"='2100' AND lt."ReferenceType" NOT IN ('EXPENSE','EXPENSE_PAYMENT')
        AND lt."Status"='POSTED' AND lt."IsReversed"=FALSE
    `);
    console.log(`\nPost-reversal GL supplier scope 2100: UGX ${fmt(snap.rows[0].gl_scope)}`);
    console.log('Run heal-ap-reconciliation-caches and re-check AP reconciliation.');
  }
} catch (e) {
  console.error(e?.message || e);
  process.exit(1);
} finally {
  await pool.end();
}
