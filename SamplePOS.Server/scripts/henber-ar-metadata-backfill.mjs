#!/usr/bin/env node
/**
 * Henber AR metadata backfill — EntityType/EntityId ONLY.
 *
 * Integrity contract (hard):
 *   - Never UPDATE DebitAmount / CreditAmount / Status / IsReversed
 *   - Never INSERT / DELETE ledger rows
 *   - Never touch invoices, payments, customers.balance
 *   - integrityGlDrift must be unchanged after apply
 *   - Default DRY_RUN=1 (no mutations)
 *
 * Scope:
 *   - Untagged SALE → customer from sales.customer_id
 *   - Untagged SALE_REFUND / SALE_REFUND_CORRECTION → customer from refund→sale
 *   - Untagged INVOICE_PAYMENT → customer from invoice (when resolvable)
 *
 * Usage:
 *   node scripts/henber-ar-metadata-backfill.mjs              # dry-run
 *   DRY_RUN=0 node scripts/henber-ar-metadata-backfill.mjs   # apply (finance-authorized)
 */
import pg from 'pg';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { resolveVerificationEnvironment } from '../../scripts/lib/production-verification-guard.mjs';

const DRY_RUN = process.env.DRY_RUN !== '0';

const { henberDatabaseUrl } = resolveVerificationEnvironment({
  scriptName: 'Henber AR metadata backfill',
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

const fmt = (n) =>
  Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (v) => Number(v || 0);

const lines = [];
const log = (s = '') => {
  lines.push(s);
  console.log(s);
};

async function snapshot(client) {
  const r = await client.query(`
    WITH gl_total AS (
      SELECT COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0) AS v
      FROM ledger_entries le
      JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
      JOIN accounts a ON le."AccountId" = a."Id"
      WHERE a."AccountCode" = '1200' AND ${NET_ACTIVE}
    ),
    gl_customer AS (
      SELECT COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0) AS v
      FROM ledger_entries le
      JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
      JOIN accounts a ON le."AccountId" = a."Id"
      WHERE a."AccountCode" = '1200'
        AND UPPER(le."EntityType") = 'CUSTOMER'
        AND le."EntityId" IS NOT NULL
        AND ${NET_ACTIVE}
    ),
    non_customer AS (
      SELECT COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0) AS v
      FROM ledger_entries le
      JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
      JOIN accounts a ON le."AccountId" = a."Id"
      WHERE a."AccountCode" = '1200'
        AND (le."EntityId" IS NULL OR UPPER(COALESCE(le."EntityType", '')) != 'CUSTOMER')
        AND ${NET_ACTIVE}
    ),
    open_item AS (
      SELECT COALESCE(SUM(
        GREATEST(0, COALESCE(inv.inv_due, 0) - COALESCE(pay.unalloc, 0))
      ), 0) AS v
      FROM customers c
      LEFT JOIN LATERAL (
        SELECT SUM(i.amount_due) AS inv_due
        FROM invoices i
        WHERE i.customer_id = c.id
          AND COALESCE(i.document_type, 'INVOICE') IN ('INVOICE', 'OPENING_BALANCE')
          AND i.status NOT IN ('CANCELLED', 'VOIDED', 'DRAFT')
      ) inv ON TRUE
      LEFT JOIN LATERAL (
        SELECT SUM(p.unallocated_amount) AS unalloc
        FROM ar_customer_payments p
        WHERE p.customer_id = c.id
          AND p.status IN ('POSTED', 'PARTIALLY_ALLOCATED', 'FULLY_ALLOCATED')
      ) pay ON TRUE
      WHERE c.is_active = true
    ),
    cache AS (
      SELECT COALESCE(SUM(balance), 0) AS v FROM customers WHERE is_active = true
    ),
    amount_fingerprint AS (
      SELECT
        COUNT(*)::bigint AS entry_count,
        COALESCE(SUM(le."DebitAmount"), 0) AS sum_debit,
        COALESCE(SUM(le."CreditAmount"), 0) AS sum_credit
      FROM ledger_entries le
      JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
      JOIN accounts a ON le."AccountId" = a."Id"
      WHERE a."AccountCode" = '1200' AND lt."Status" = 'POSTED'
    )
    SELECT
      gl_total.v AS gl_total,
      gl_customer.v AS gl_customer,
      non_customer.v AS non_customer,
      open_item.v AS open_item,
      cache.v AS cache_sum,
      amount_fingerprint.entry_count,
      amount_fingerprint.sum_debit,
      amount_fingerprint.sum_credit
    FROM gl_total, gl_customer, non_customer, open_item, cache, amount_fingerprint
  `);
  const s = r.rows[0];
  return {
    glTotal: num(s.gl_total),
    glCustomer: num(s.gl_customer),
    nonCustomer: num(s.non_customer),
    openItem: num(s.open_item),
    cacheSum: num(s.cache_sum),
    integrityDrift: num(s.gl_total) - num(s.open_item),
    scopeDrift: num(s.gl_customer) - num(s.open_item),
    cacheDrift: num(s.cache_sum) - num(s.open_item),
    entryCount: Number(s.entry_count),
    sumDebit: num(s.sum_debit),
    sumCredit: num(s.sum_credit),
  };
}

function logSnap(label, s) {
  log(`\n── ${label} ──`);
  log(`  GL 1200 total:           UGX ${fmt(s.glTotal)}`);
  log(`  GL customer-scoped:      UGX ${fmt(s.glCustomer)}`);
  log(`  NON_CUSTOMER_AR:         UGX ${fmt(s.nonCustomer)}`);
  log(`  Open-item subledger:     UGX ${fmt(s.openItem)}`);
  log(`  integrityGlDrift:        UGX ${fmt(s.integrityDrift)}`);
  log(`  customerScopeDrift:      UGX ${fmt(s.scopeDrift)}`);
  log(`  cacheDrift:              UGX ${fmt(s.cacheDrift)}`);
  log(`  1200 fingerprint:        entries=${s.entryCount} DR=${fmt(s.sumDebit)} CR=${fmt(s.sumCredit)}`);
}

async function listCandidates(client) {
  return client.query(`
    WITH candidates AS (
      -- SALE → sales.customer_id
      SELECT
        lt."Id" AS txn_id,
        lt."TransactionNumber" AS txn_num,
        lt."ReferenceType" AS ref_type,
        lt."ReferenceId" AS ref_id,
        s.sale_number AS doc_number,
        s.status::text AS doc_status,
        s.payment_method::text AS pay_method,
        c.id AS customer_id,
        c.name AS customer_name,
        SUM(le."DebitAmount" - le."CreditAmount")::numeric AS net_1200,
        COUNT(*)::int AS untagged_lines
      FROM ledger_entries le
      JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
      JOIN accounts a ON a."Id" = le."AccountId"
      JOIN sales s ON s.id::text = lt."ReferenceId"::text
      JOIN customers c ON c.id = s.customer_id
      WHERE a."AccountCode" = '1200'
        AND lt."ReferenceType" = 'SALE'
        AND (le."EntityId" IS NULL OR UPPER(COALESCE(le."EntityType", '')) != 'CUSTOMER')
        AND ${NET_ACTIVE}
      GROUP BY lt."Id", lt."TransactionNumber", lt."ReferenceType", lt."ReferenceId",
               s.sale_number, s.status, s.payment_method, c.id, c.name

      UNION ALL

      -- SALE_REFUND / SALE_REFUND_CORRECTION → refund → sale → customer
      SELECT
        lt."Id",
        lt."TransactionNumber",
        lt."ReferenceType",
        lt."ReferenceId",
        COALESCE(sr.refund_number, lt."TransactionNumber"),
        sr.status::text,
        s.payment_method::text,
        c.id,
        c.name,
        SUM(le."DebitAmount" - le."CreditAmount")::numeric,
        COUNT(*)::int
      FROM ledger_entries le
      JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
      JOIN accounts a ON a."Id" = le."AccountId"
      JOIN sale_refunds sr ON sr.id::text = lt."ReferenceId"::text
      JOIN sales s ON s.id = sr.sale_id
      JOIN customers c ON c.id = s.customer_id
      WHERE a."AccountCode" = '1200'
        AND lt."ReferenceType" IN ('SALE_REFUND', 'SALE_REFUND_CORRECTION')
        AND (le."EntityId" IS NULL OR UPPER(COALESCE(le."EntityType", '')) != 'CUSTOMER')
        AND ${NET_ACTIVE}
      GROUP BY lt."Id", lt."TransactionNumber", lt."ReferenceType", lt."ReferenceId",
               sr.refund_number, sr.status, s.payment_method, c.id, c.name

      UNION ALL

      -- INVOICE_PAYMENT → invoice_payments → invoice → customer
      SELECT
        lt."Id",
        lt."TransactionNumber",
        lt."ReferenceType",
        lt."ReferenceId",
        COALESCE(ip.receipt_number, i.invoice_number),
        i.status::text,
        ip.payment_method::text,
        c.id,
        c.name,
        SUM(le."DebitAmount" - le."CreditAmount")::numeric,
        COUNT(*)::int
      FROM ledger_entries le
      JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
      JOIN accounts a ON a."Id" = le."AccountId"
      JOIN invoice_payments ip ON ip.id::text = lt."ReferenceId"::text
      JOIN invoices i ON i.id = ip.invoice_id
      JOIN customers c ON c.id = i.customer_id
      WHERE a."AccountCode" = '1200'
        AND lt."ReferenceType" = 'INVOICE_PAYMENT'
        AND (le."EntityId" IS NULL OR UPPER(COALESCE(le."EntityType", '')) != 'CUSTOMER')
        AND ${NET_ACTIVE}
      GROUP BY lt."Id", lt."TransactionNumber", lt."ReferenceType", lt."ReferenceId",
               ip.receipt_number, i.invoice_number, i.status, ip.payment_method, c.id, c.name
    )
    SELECT * FROM candidates
    ORDER BY ABS(net_1200) DESC, txn_num
  `);
}

async function listUnresolved(client) {
  return client.query(`
    SELECT
      lt."TransactionNumber" AS txn_num,
      lt."ReferenceType" AS ref_type,
      lt."ReferenceId" AS ref_id,
      SUM(le."DebitAmount" - le."CreditAmount")::numeric AS net_1200,
      le."EntityType" AS entity_type
    FROM ledger_entries le
    JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
    JOIN accounts a ON a."Id" = le."AccountId"
    WHERE a."AccountCode" = '1200'
      AND (le."EntityId" IS NULL OR UPPER(COALESCE(le."EntityType", '')) != 'CUSTOMER')
      AND ${NET_ACTIVE}
      AND NOT EXISTS (
        SELECT 1 FROM sales s
        WHERE lt."ReferenceType" = 'SALE'
          AND s.id::text = lt."ReferenceId"::text
          AND s.customer_id IS NOT NULL
      )
      AND NOT EXISTS (
        SELECT 1 FROM sale_refunds sr
        JOIN sales s ON s.id = sr.sale_id
        WHERE lt."ReferenceType" IN ('SALE_REFUND', 'SALE_REFUND_CORRECTION')
          AND sr.id::text = lt."ReferenceId"::text
          AND s.customer_id IS NOT NULL
      )
      AND NOT EXISTS (
        SELECT 1 FROM invoice_payments ip
        JOIN invoices i ON i.id = ip.invoice_id
        WHERE lt."ReferenceType" = 'INVOICE_PAYMENT'
          AND ip.id::text = lt."ReferenceId"::text
          AND i.customer_id IS NOT NULL
      )
    GROUP BY lt."Id", lt."TransactionNumber", lt."ReferenceType", lt."ReferenceId", le."EntityType"
    ORDER BY ABS(SUM(le."DebitAmount" - le."CreditAmount")) DESC
  `);
}

async function applyRetag(client, row) {
  const r = await client.query(
    `
    UPDATE ledger_entries le
    SET "EntityType" = 'CUSTOMER',
        "EntityId" = $2::text
    FROM ledger_transactions lt, accounts a
    WHERE le."TransactionId" = lt."Id"
      AND le."AccountId" = a."Id"
      AND lt."Id" = $1
      AND a."AccountCode" = '1200'
      AND (le."EntityId" IS NULL OR UPPER(COALESCE(le."EntityType", '')) != 'CUSTOMER')
    RETURNING le."Id", le."DebitAmount", le."CreditAmount"
    `,
    [row.txn_id, row.customer_id],
  );
  return r.rows;
}

function assertNoFinancialChange(before, after) {
  const checks = [
    ['integrityGlDrift', before.integrityDrift, after.integrityDrift],
    ['glTotal', before.glTotal, after.glTotal],
    ['openItem', before.openItem, after.openItem],
    ['cacheSum', before.cacheSum, after.cacheSum],
    ['entryCount', before.entryCount, after.entryCount],
    ['sumDebit', before.sumDebit, after.sumDebit],
    ['sumCredit', before.sumCredit, after.sumCredit],
  ];
  const failures = [];
  for (const [label, a, b] of checks) {
    if (Math.abs(a - b) > 0.009) {
      failures.push(`${label}: ${fmt(a)} → ${fmt(b)}`);
    }
  }
  return failures;
}

try {
  log('═'.repeat(72));
  log(` HENBER AR METADATA BACKFILL — ${DRY_RUN ? 'DRY-RUN' : 'LIVE'}`);
  log(` Generated: ${new Date().toISOString()}`);
  log(' Contract: EntityType/EntityId only — zero amount mutation');
  log('═'.repeat(72));

  const client = await pool.connect();
  try {
    const before = await snapshot(client);
    logSnap('BEFORE', before);

    if (Math.abs(before.integrityDrift) > 0.02) {
      throw new Error(
        `Abort: integrityGlDrift is ${fmt(before.integrityDrift)}. ` +
          'Metadata backfill requires control-account integrity first.',
      );
    }

    const candidates = await listCandidates(client);
    const unresolved = await listUnresolved(client);

    log('\n── Resolvable candidates (metadata retag) ──');
    log(`  Count: ${candidates.rows.length}`);
    let candidateNet = 0;
    for (const row of candidates.rows) {
      candidateNet += num(row.net_1200);
      log(
        `  ${row.txn_num} | ${row.ref_type} | ${row.doc_number ?? '—'} | ` +
          `${row.customer_name} | net ${fmt(row.net_1200)} | status=${row.doc_status ?? '—'} | ` +
          `pay=${row.pay_method ?? '—'} | lines=${row.untagged_lines}`,
      );
    }
    log(`  Candidate net on 1200: UGX ${fmt(candidateNet)}`);

    log('\n── Unresolved NON_CUSTOMER_AR (manual queue — not touched) ──');
    if (unresolved.rows.length === 0) {
      log('  (none)');
    } else {
      for (const row of unresolved.rows) {
        log(
          `  ${row.txn_num} | ${row.ref_type} | ref=${String(row.ref_id || '').slice(0, 8)} | ` +
            `net ${fmt(row.net_1200)} | entity=${row.entity_type || 'null'}`,
        );
      }
    }

    const simulatedScope = before.glCustomer + candidateNet - before.openItem;
    log('\n── Simulated after full resolvable retag ──');
    log(`  customerScopeDrift → UGX ${fmt(simulatedScope)} (integrity unchanged)`);
    log(`  NON_CUSTOMER residual ≈ unresolved net (manual)`);

    if (!DRY_RUN && Math.abs(simulatedScope) > 1.0 && process.env.FORCE !== '1') {
      throw new Error(
        `Abort LIVE: simulated customerScopeDrift ${fmt(simulatedScope)} exceeds ±1. ` +
          'Fix candidate set or set FORCE=1 with finance sign-off.',
      );
    }

    if (DRY_RUN) {
      log('\n── DRY-RUN: no UPDATE executed ──');
    } else {
      log('\n── LIVE APPLY (single transaction) ──');
      await client.query('BEGIN');
      let txnCount = 0;
      let lineCount = 0;
      const amountGuard = [];

      for (const row of candidates.rows) {
        const updated = await applyRetag(client, row);
        if (updated.length === 0) {
          log(`  skip ${row.txn_num}: no untagged 1200 lines`);
          continue;
        }
        for (const u of updated) {
          amountGuard.push({
            txn: row.txn_num,
            debit: num(u.DebitAmount),
            credit: num(u.CreditAmount),
          });
        }
        txnCount += 1;
        lineCount += updated.length;
        log(
          `  retagged ${row.txn_num} → CUSTOMER ${row.customer_name} ` +
            `(${String(row.customer_id).slice(0, 8)}) lines=${updated.length} net=${fmt(row.net_1200)}`,
        );
      }

      const afterTx = await snapshot(client);
      const failures = assertNoFinancialChange(before, afterTx);
      if (failures.length) {
        await client.query('ROLLBACK');
        throw new Error(`ROLLBACK — financial fingerprint changed:\n  ${failures.join('\n  ')}`);
      }

      await client.query('COMMIT');
      log(`  COMMITTED: ${txnCount} txn(s), ${lineCount} ledger line(s)`);
      log(`  Amount guard samples retained: ${amountGuard.length} (debit/credit untouched by UPDATE)`);

      const after = await snapshot(client);
      logSnap('AFTER', after);
      const postFailures = assertNoFinancialChange(before, after);
      if (postFailures.length) {
        throw new Error(`Post-commit integrity failure: ${postFailures.join('; ')}`);
      }
      log(`  customerScopeDrift improved: ${fmt(before.scopeDrift)} → ${fmt(after.scopeDrift)}`);
    }
  } finally {
    client.release();
  }

  if (!DRY_RUN) {
    log('\n── External proof: proof-ar-drift-decompose ──');
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
    const proof = spawnSync('node', ['SamplePOS.Server/scripts/proof-ar-drift-decompose.mjs'], {
      cwd: repoRoot,
      env: { ...process.env, HENBER_DATABASE_URL: henberDatabaseUrl },
      encoding: 'utf8',
      shell: true,
    });
    const out = (proof.stdout || '') + (proof.stderr || '');
    for (const line of out.split(/\r?\n/).slice(0, 40)) {
      if (line.trim()) log(`  ${line}`);
    }
    if (proof.status === 0) log('  proof-ar-drift-decompose: PASS');
    else log(`  proof-ar-drift-decompose: FAIL (exit ${proof.status})`);
  }

  log('\n' + '═'.repeat(72));
  if (DRY_RUN) {
    log(' DRY-RUN COMPLETE — zero mutations');
    log(' To apply (finance-authorized): DRY_RUN=0 node scripts/henber-ar-metadata-backfill.mjs');
  } else {
    log(' LIVE METADATA BACKFILL COMPLETE — amounts unchanged');
  }
  log('═'.repeat(72));

  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const outPath = path.join(root, DRY_RUN ? 'PROOF_AR_METADATA_BACKFILL_DRYRUN.md' : 'PROOF_AR_METADATA_BACKFILL_LIVE.md');
  writeFileSync(outPath, lines.join('\n') + '\n');
  log(`\nWrote ${outPath}`);
} catch (e) {
  console.error(e);
  process.exit(1);
} finally {
  await pool.end();
}
