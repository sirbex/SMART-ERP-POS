#!/usr/bin/env node
/**
 * Phase 3 — Henber AR remediation DRY-RUN (no mutations unless DRY_RUN=0).
 *
 * Batch A: Reverse erroneous TXN-015298 SALE_REFUND (−52,800) — clears headline drift
 * Batch B: Retag untagged CREDIT SALE GL with EntityType=CUSTOMER (reporting hygiene)
 *
 * Usage:
 *   node scripts/henber-ar-phase3-remediate.mjs           # dry-run (default)
 *   DRY_RUN=0 node scripts/henber-ar-phase3-remediate.mjs   # apply (finance sign-off)
 *   BATCH=A DRY_RUN=0 node scripts/henber-ar-phase3-remediate.mjs   # Batch A only (reversal)
 */
import pg from 'pg';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { resolveVerificationEnvironment } from '../../scripts/lib/production-verification-guard.mjs';

const DRY_RUN = process.env.DRY_RUN !== '0';
const BATCH = (process.env.BATCH || 'ALL').toUpperCase();
const RUN_BATCH_A = BATCH === 'A' || BATCH === 'ALL';
const RUN_BATCH_B = BATCH === 'B' || BATCH === 'ALL';
const REVERSAL_DATE = process.env.REVERSAL_DATE || new Date().toISOString().slice(0, 10);
const SYSTEM_USER = process.env.SYSTEM_USER_ID || '4971ceff-c094-41b0-bfaf-a3d88ea634a1';

const { henberDatabaseUrl } = resolveVerificationEnvironment({
  scriptName: 'Henber AR Phase 3 remediation',
  requireHenberDatabase: true,
});

const pool = new pg.Pool({ connectionString: henberDatabaseUrl });

const NET_ACTIVE = `
  lt."Status" = 'POSTED'
  AND lt."IsReversed" = FALSE
  AND lt."Id" NOT IN (
    SELECT "ReversedByTransactionId" FROM ledger_transactions
    WHERE "ReversedByTransactionId" IS NOT NULL
  )
`;

const REFUND_TXN_NUMBER = 'TXN-015298';
const REFUND_REF_PREFIX = 'bcf407e3';

const fmt = (n) =>
  Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (v) => Number(v || 0);

const lines = [];
const log = (s = '') => {
  lines.push(s);
  console.log(s);
};

async function computeIntegrity() {
  const r = await pool.query(`
    WITH gl_total AS (
      SELECT COALESCE(SUM(le."DebitAmount" - le."CreditAmount"), 0) AS v
      FROM ledger_entries le JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
      JOIN accounts a ON le."AccountId" = a."Id"
      WHERE a."AccountCode" = '1200' AND ${NET_ACTIVE}
    ),
    open_item AS (
      SELECT COALESCE(SUM(
        GREATEST(0, COALESCE(inv.inv_due, 0) - COALESCE(pay.unalloc, 0))
      ), 0) AS v
      FROM customers c
      LEFT JOIN LATERAL (
        SELECT SUM(i.amount_due) AS inv_due FROM invoices i
        WHERE i.customer_id = c.id
          AND COALESCE(i.document_type, 'INVOICE') IN ('INVOICE', 'OPENING_BALANCE')
          AND i.status NOT IN ('CANCELLED', 'VOIDED', 'DRAFT')
      ) inv ON TRUE
      LEFT JOIN LATERAL (
        SELECT SUM(p.unallocated_amount) AS unalloc FROM ar_customer_payments p
        WHERE p.customer_id = c.id
          AND p.status IN ('POSTED', 'PARTIALLY_ALLOCATED', 'FULLY_ALLOCATED')
      ) pay ON TRUE
      WHERE c.is_active = true
    )
    SELECT gl_total.v AS gl_total, open_item.v AS open_item, (gl_total.v - open_item.v) AS drift
    FROM gl_total, open_item
  `);
  return r.rows[0];
}

async function investigateRefund() {
  const txn = await pool.query(
    `
    SELECT lt."Id", lt."TransactionNumber", lt."ReferenceType", lt."ReferenceId",
           lt."TransactionDate", lt."Description", lt."IsReversed"
    FROM ledger_transactions lt
    WHERE lt."TransactionNumber" = $1
    `,
    [REFUND_TXN_NUMBER],
  );

  const entries = txn.rows[0]
    ? await pool.query(
        `
        SELECT a."AccountCode", le."DebitAmount", le."CreditAmount",
               le."EntityType", le."EntityId"
        FROM ledger_entries le
        JOIN accounts a ON a."Id" = le."AccountId"
        WHERE le."TransactionId" = $1
        ORDER BY a."AccountCode"
        `,
        [txn.rows[0].Id],
      )
    : { rows: [] };

  const refund = await pool.query(
    `
    SELECT sr.*, s.sale_number, s.customer_id, s.payment_method, s.status AS sale_status,
           c.name AS customer_name
    FROM sale_refunds sr
    JOIN sales s ON s.id = sr.sale_id
    LEFT JOIN customers c ON c.id = s.customer_id
    WHERE sr.id::text LIKE $1 || '%'
       OR EXISTS (
         SELECT 1 FROM ledger_transactions lt
         WHERE lt."TransactionNumber" = $2 AND lt."ReferenceId"::text = sr.id::text
       )
    LIMIT 5
    `,
    [REFUND_REF_PREFIX, REFUND_TXN_NUMBER],
  );

  return { txn: txn.rows[0], entries: entries.rows, refunds: refund.rows };
}

async function listRetagCandidates() {
  return pool.query(`
    SELECT lt."Id" AS txn_id, lt."TransactionNumber", lt."ReferenceId" AS sale_id,
           SUM(le."DebitAmount" - le."CreditAmount")::numeric AS net_1200,
           s.sale_number, s.customer_id, c.name AS customer_name, s.payment_method
    FROM ledger_entries le
    JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
    JOIN accounts a ON a."Id" = le."AccountId"
    LEFT JOIN sales s ON s.id::text = lt."ReferenceId"::text
    LEFT JOIN customers c ON c.id = s.customer_id
    WHERE a."AccountCode" = '1200'
      AND lt."ReferenceType" = 'SALE'
      AND s.customer_id IS NOT NULL
      AND s.payment_method = 'CREDIT'
      AND (le."EntityId" IS NULL OR UPPER(COALESCE(le."EntityType", '')) != 'CUSTOMER')
      AND ${NET_ACTIVE}
    GROUP BY lt."Id", lt."TransactionNumber", lt."ReferenceId",
             s.sale_number, s.customer_id, c.name, s.payment_method
    ORDER BY ABS(SUM(le."DebitAmount" - le."CreditAmount")) DESC
  `);
}

function reverseRefundTxnLive(txnId) {
  const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const child = spawnSync(
    'npx',
    ['tsx', 'scripts/henber-ar-phase3-reverse-txn.ts'],
    {
      cwd: serverRoot,
      env: {
        ...process.env,
        HENBER_DATABASE_URL: henberDatabaseUrl,
        ORIGINAL_TXN_ID: txnId,
        REVERSAL_DATE,
        SYSTEM_USER_ID: SYSTEM_USER,
        IDEMPOTENCY_KEY: `AR-PHASE3-REV-${txnId}`,
      },
      encoding: 'utf8',
      shell: true,
    },
  );
  const out = (child.stdout || '').trim();
  const err = (child.stderr || '').trim();
  if (child.status !== 0) {
    throw new Error(`AccountingCore reversal failed (exit ${child.status}): ${err || out || 'no output'}`);
  }
  const lines = out.split(/\r?\n/).filter((l) => l.trim().startsWith('{'));
  const jsonLine = lines[lines.length - 1];
  if (!jsonLine) {
    throw new Error(`AccountingCore reversal produced no JSON result: ${err || out || 'empty stdout'}`);
  }
  return JSON.parse(jsonLine);
}

async function reverseRefundTxn(txnId) {
  const check = await pool.query(
    `SELECT "TransactionNumber", "IsReversed" FROM ledger_transactions WHERE "Id" = $1`,
    [txnId],
  );
  if (!check.rows.length) {
    log(`  skip: transaction not found`);
    return false;
  }
  if (check.rows[0].IsReversed) {
    log(`  skip ${check.rows[0].TransactionNumber}: already reversed`);
    return false;
  }
  if (DRY_RUN) {
    log(`  would reverse ${check.rows[0].TransactionNumber} (restores +52,800 to GL 1200 net)`);
    return true;
  }
  const r = reverseRefundTxnLive(txnId);
  log(`  reversed ${check.rows[0].TransactionNumber} → ${r.transactionNumber}`);
  return true;
}

async function retagSaleEntries(candidates) {
  let count = 0;
  for (const row of candidates.rows) {
    if (DRY_RUN) {
      log(`  would retag ${row.TransactionNumber} → CUSTOMER ${row.customer_name} (${String(row.customer_id).slice(0, 8)}) net ${fmt(row.net_1200)}`);
      count += 1;
      continue;
    }
    const r = await pool.query(
      `
      UPDATE ledger_entries le
      SET "EntityType" = 'CUSTOMER', "EntityId" = $2::text
      FROM ledger_transactions lt, accounts a
      WHERE le."TransactionId" = lt."Id"
        AND le."AccountId" = a."Id"
        AND lt."Id" = $1
        AND a."AccountCode" = '1200'
        AND (le."EntityId" IS NULL OR UPPER(COALESCE(le."EntityType", '')) != 'CUSTOMER')
      `,
      [row.txn_id, row.customer_id],
    );
    log(`  retagged ${row.TransactionNumber}: ${r.rowCount} ledger_entries`);
    count += r.rowCount > 0 ? 1 : 0;
  }
  return count;
}

try {
  log('═'.repeat(72));
  log(` HENBER AR PHASE 3 REMEDIATION — ${DRY_RUN ? 'DRY-RUN' : 'LIVE'} | BATCH=${BATCH}`);
  log(` Generated: ${new Date().toISOString()}`);
  log('═'.repeat(72));

  const before = await computeIntegrity();
  log('\n── Before ──');
  log(`  GL 1200 net-active:  UGX ${fmt(before.gl_total)}`);
  log(`  Open-item subledger: UGX ${fmt(before.open_item)}`);
  log(`  integrityGlDrift:    UGX ${fmt(before.drift)}`);

  log('\n── Investigate TXN-015298 ──');
  const inv = await investigateRefund();
  if (inv.txn) {
    log(`  Txn: ${inv.txn.TransactionNumber} | ${inv.txn.ReferenceType} | ref ${inv.txn.ReferenceId}`);
    log(`  Date: ${inv.txn.TransactionDate} | Reversed: ${inv.txn.IsReversed}`);
    for (const e of inv.entries) {
      log(`    ${e.AccountCode} DR ${fmt(e.DebitAmount)} CR ${fmt(e.CreditAmount)} entity=${e.EntityType || 'null'}`);
    }
  } else {
    log('  WARNING: TXN-015298 not found');
  }
  for (const sr of inv.refunds) {
    log(`  Refund: ${sr.refund_number} | sale ${sr.sale_number} | customer ${sr.customer_name}`);
    log(`    amount ${fmt(sr.total_amount)} | sale status ${sr.sale_status} | pay ${sr.payment_method}`);
  }

  log('\n── Batch A: Reverse TXN-015298 SALE_REFUND (−52,800) ──');
  let batchA = false;
  if (RUN_BATCH_A && inv.txn && !inv.txn.IsReversed) {
    batchA = await reverseRefundTxn(inv.txn.Id);
  } else if (!RUN_BATCH_A) {
    log('  skipped (BATCH excludes A)');
  }

  const simAfterA = {
    gl_total: num(before.gl_total) + (batchA || DRY_RUN ? 52800 : 0),
    open_item: num(before.open_item),
  };
  simAfterA.drift = simAfterA.gl_total - simAfterA.open_item;
  log('\n── Simulated after Batch A (if reversal applied) ──');
  log(`  GL 1200:        UGX ${fmt(simAfterA.gl_total)}`);
  log(`  integrityGlDrift: UGX ${fmt(simAfterA.drift)} ${Math.abs(simAfterA.drift) < 1 ? '✓ RECONCILED' : ''}`);

  let retagged = 0;
  if (RUN_BATCH_B) {
    log('\n── Batch B: Retag untagged CREDIT SALE GL (customer entity) ──');
    const candidates = await listRetagCandidates();
    log(`  Candidates: ${candidates.rows.length} transactions`);
    retagged = await retagSaleEntries(candidates);
    log(`  ${DRY_RUN ? 'Would retag' : 'Retagged'}: ${retagged} transaction(s)`);
    log('  Note: Retag does not change gl_total — integrityGlDrift unchanged.');
  } else {
    log('\n── Batch B: skipped (BATCH excludes B) ──');
  }

  if (!DRY_RUN) {
    log('\n── Re-proof ──');
    const after = await computeIntegrity();
    log(`  integrityGlDrift after apply: UGX ${fmt(after.drift)}`);
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
    const proofRun = spawnSync(
      'node',
      ['SamplePOS.Server/scripts/proof-ar-drift-decompose.mjs'],
      {
        cwd: repoRoot,
        env: { ...process.env, HENBER_DATABASE_URL: henberDatabaseUrl },
        encoding: 'utf8',
        shell: true,
      },
    );
    if (proofRun.status === 0) log('  proof-ar-drift-decompose: PASS');
    else log(`  proof-ar-drift-decompose: FAIL\n${(proofRun.stderr || proofRun.stdout || '').slice(0, 400)}`);
  }

  log('\n' + '═'.repeat(72));
  if (DRY_RUN) {
    log(' DRY-RUN COMPLETE — no mutations');
    log(' Finance sign-off required before: DRY_RUN=0 node scripts/henber-ar-phase3-remediate.mjs');
  } else {
    log(' LIVE REMEDIATION COMPLETE');
  }
  log('═'.repeat(72));

  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  writeFileSync(path.join(root, 'PROOF_AR_PHASE3_DRYRUN.md'), lines.join('\n') + '\n');
  log(`\nWrote ${path.join(root, 'PROOF_AR_PHASE3_DRYRUN.md')}`);
} catch (e) {
  console.error(e);
  process.exit(1);
} finally {
  await pool.end();
}
