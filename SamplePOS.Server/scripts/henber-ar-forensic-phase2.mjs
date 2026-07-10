#!/usr/bin/env node
/**
 * Read-only AR forensic Phase 2 — transaction-level Lane A + case hospital trace.
 * Writes PROOF_AR_FORENSIC_PHASE2.md
 */
import pg from 'pg';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveVerificationEnvironment } from '../../scripts/lib/production-verification-guard.mjs';

const { mode, henberDatabaseUrl } = resolveVerificationEnvironment({
  scriptName: 'Henber AR forensic Phase 2',
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

function mdTable(headers, rows) {
  if (!rows.length) return '_No rows._\n';
  const h = `| ${headers.join(' | ')} |`;
  const sep = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((r) => `| ${r.map((c) => String(c ?? '').replace(/\|/g, '\\|')).join(' | ')} |`);
  return [h, sep, ...body, ''].join('\n');
}

try {
  const ts = new Date().toISOString();
  log('# AR Forensic Phase 2 — Henber (read-only)');
  log('');
  log(`**Generated:** ${ts}`);
  log(`**Mode:** ${mode}`);
  log('');

  // ── Lane A: all non-customer 1200 transactions ─────────────────────────────
  log('## Lane A — NON_CUSTOMER_AR transactions on 1200');
  log('');

  const laneA = await pool.query(`
    SELECT
      lt."TransactionNumber" AS txn_num,
      lt."ReferenceType" AS ref_type,
      lt."ReferenceId" AS ref_id,
      lt."TransactionDate"::date AS txn_date,
      le."EntityType" AS entity_type,
      le."EntityId" AS entity_id,
      SUM(le."DebitAmount" - le."CreditAmount")::numeric AS net_1200,
      lt."Description" AS description
    FROM ledger_entries le
    JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
    JOIN accounts a ON a."Id" = le."AccountId"
    WHERE a."AccountCode" = '1200'
      AND (le."EntityId" IS NULL OR UPPER(COALESCE(le."EntityType", '')) != 'CUSTOMER')
      AND ${NET_ACTIVE}
    GROUP BY lt."Id", lt."TransactionNumber", lt."ReferenceType", lt."ReferenceId",
             lt."TransactionDate", le."EntityType", le."EntityId", lt."Description"
    ORDER BY ABS(SUM(le."DebitAmount" - le."CreditAmount")) DESC
  `);

  let laneANet = 0;
  const laneARows = [];
  for (const r of laneA.rows) {
    laneANet += num(r.net_1200);
    laneARows.push([
      r.txn_num,
      r.ref_type,
      (r.ref_id || '').slice(0, 8),
      r.txn_date,
      fmt(r.net_1200),
      r.entity_type || '(null)',
      (r.entity_id || '').slice(0, 8) || '—',
    ]);
  }
  log(mdTable(
    ['Txn', 'RefType', 'RefId', 'Date', 'Net 1200', 'EntityType', 'EntityId'],
    laneARows,
  ));
  log(`**Lane A net on 1200:** UGX ${fmt(laneANet)}`);
  log('');

  // ── Lane A: SALE rows joined to sales + customer ───────────────────────────
  log('## Lane A detail — SALE reference join');
  log('');

  const saleJoin = await pool.query(`
    SELECT
      lt."TransactionNumber" AS txn_num,
      lt."ReferenceId" AS sale_id,
      lt."TransactionDate"::date AS txn_date,
      SUM(le."DebitAmount" - le."CreditAmount")::numeric AS net_1200,
      s.sale_number,
      s.payment_method,
      s.total_amount AS sale_total,
      s.status AS sale_status,
      c.name AS customer_name,
      c.id AS customer_id
    FROM ledger_entries le
    JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
    JOIN accounts a ON a."Id" = le."AccountId"
    LEFT JOIN sales s ON s.id::text = lt."ReferenceId"::text
    LEFT JOIN customers c ON c.id = s.customer_id
    WHERE a."AccountCode" = '1200'
      AND lt."ReferenceType" = 'SALE'
      AND (le."EntityId" IS NULL OR UPPER(COALESCE(le."EntityType", '')) != 'CUSTOMER')
      AND ${NET_ACTIVE}
    GROUP BY lt."Id", lt."TransactionNumber", lt."ReferenceId", lt."TransactionDate",
             s.sale_number, s.payment_method, s.total_amount, s.status, c.name, c.id
    ORDER BY ABS(SUM(le."DebitAmount" - le."CreditAmount")) DESC
  `);

  const saleRows = saleJoin.rows.map((r) => [
    r.txn_num,
    r.sale_number || '?',
    r.customer_name || '**NO CUSTOMER**',
    r.payment_method || '?',
    fmt(r.net_1200),
    fmt(r.sale_total),
    r.sale_status || '?',
  ]);
  log(mdTable(
    ['Txn', 'Sale#', 'Customer', 'PayMethod', 'Net 1200', 'SaleTotal', 'Status'],
    saleRows,
  ));

  const saleWithCustomer = saleJoin.rows.filter((r) => r.customer_id);
  const saleMissingCustomer = saleJoin.rows.filter((r) => !r.customer_id);
  log(`- SALE GL rows with resolvable customer: **${saleWithCustomer.length}**`);
  log(`- SALE GL rows without sale/customer join: **${saleMissingCustomer.length}**`);
  log('');

  // Retag simulation: if all SALE net were customer-scoped, customer drift impact
  const saleNetSum = saleJoin.rows.reduce((a, r) => a + num(r.net_1200), 0);
  log(`**Untagged SALE net sum:** UGX ${fmt(saleNetSum)}`);
  log('**Classification:** Retag candidate when `sales.customer_id` is present but ledger `EntityType` ≠ CUSTOMER.');
  log('');

  // ── Lane B: case hospital deep trace ───────────────────────────────────────
  log('## Lane B — case hospital trace');
  log('');

  const caseCust = await pool.query(`
    SELECT id, name, balance FROM customers WHERE name ILIKE '%case hospital%' LIMIT 1
  `);
  const caseId = caseCust.rows[0]?.id;
  log(`**Customer:** ${caseCust.rows[0]?.name} (\`${caseId}\`)`);
  log(`**Cache balance:** UGX ${fmt(caseCust.rows[0]?.balance)}`);
  log('');

  if (caseId) {
    log('### Invoices');
    const inv = await pool.query(
      `
      SELECT invoice_number, document_type, status, total_amount, amount_due, amount_paid,
             sale_id::text, issue_date, created_at::date AS created
      FROM invoices
      WHERE customer_id = $1 AND status NOT IN ('CANCELLED', 'VOIDED', 'DRAFT')
      ORDER BY amount_due DESC
      `,
      [caseId],
    );
    log(mdTable(
      ['Invoice', 'Type', 'Status', 'Total', 'Due', 'Paid', 'SaleId', 'Issue'],
      inv.rows.map((r) => [
        r.invoice_number,
        r.document_type || 'INVOICE',
        r.status,
        fmt(r.total_amount),
        fmt(r.amount_due),
        fmt(r.amount_paid),
        (r.sale_id || '—').slice(0, 8),
        r.issue_date,
      ]),
    ));

    log('### Sales linked to invoices or customer');
    const sales = await pool.query(
      `
      SELECT DISTINCT s.sale_number, s.id::text AS sale_id, s.payment_method, s.total_amount,
             s.status, s.sale_date::date
      FROM sales s
      WHERE s.customer_id = $1
         OR s.id IN (SELECT sale_id FROM invoices WHERE customer_id = $1 AND sale_id IS NOT NULL)
      ORDER BY s.sale_date DESC
      LIMIT 20
      `,
      [caseId],
    );
    log(mdTable(
      ['Sale#', 'SaleId', 'PayMethod', 'Total', 'Status', 'Date'],
      sales.rows.map((r) => [
        r.sale_number,
        r.sale_id.slice(0, 8),
        r.payment_method,
        fmt(r.total_amount),
        r.status,
        r.sale_date,
      ]),
    ));

    log('### Ledger 1200 — by ReferenceId (sale/invoice), any entity tag');
    const caseLedger = await pool.query(
      `
      SELECT lt."TransactionNumber", lt."ReferenceType", lt."ReferenceId",
             le."EntityType", le."EntityId",
             SUM(le."DebitAmount" - le."CreditAmount")::numeric AS net_1200,
             lt."TransactionDate"::date AS txn_date
      FROM ledger_entries le
      JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
      JOIN accounts a ON a."Id" = le."AccountId"
      WHERE a."AccountCode" = '1200'
        AND (
          lt."ReferenceId"::text IN (SELECT id::text FROM sales WHERE customer_id = $1)
          OR lt."ReferenceId"::text IN (SELECT id::text FROM invoices WHERE customer_id = $1)
        )
      GROUP BY lt."Id", lt."TransactionNumber", lt."ReferenceType", lt."ReferenceId",
               le."EntityType", le."EntityId", lt."TransactionDate"
      ORDER BY lt."TransactionDate"
      `,
      [caseId],
    );
    if (caseLedger.rows.length) {
      log(mdTable(
        ['Txn', 'RefType', 'RefId', 'EntityType', 'EntityId', 'Net 1200', 'Date'],
        caseLedger.rows.map((r) => [
          r.TransactionNumber,
          r.ReferenceType,
          (r.ReferenceId || '').slice(0, 8),
          r.EntityType || '(null)',
          (r.EntityId || '—').slice(0, 8),
          fmt(r.net_1200),
          r.txn_date,
        ]),
      ));
    } else {
      log('_No ledger 1200 rows found referencing case hospital sales/invoices._');
      log('');
      log('**Finding:** Open-item subledger has ~2.62M due but **no AR GL** tied to this customer\'s documents.');
    }

    log('### AR customer payments');
    const pays = await pool.query(
      `
      SELECT payment_number, status, total_amount, allocated_amount, unallocated_amount, payment_date::date
      FROM ar_customer_payments
      WHERE customer_id = $1
      ORDER BY payment_date DESC
      LIMIT 10
      `,
      [caseId],
    );
    if (pays.rows.length) {
      log(mdTable(
        ['Payment#', 'Status', 'Amount', 'Allocated', 'Unalloc', 'Date'],
        pays.rows.map((r) => [
          r.payment_number,
          r.status,
          fmt(r.total_amount),
          fmt(r.allocated_amount),
          fmt(r.unallocated_amount),
          r.payment_date,
        ]),
      ));
    } else {
      log('_No ar_customer_payments rows._');
    }
  }

  log('');
  log('## Lane C — BOU & African Humanitarian (payment vs GL sample)');
  log('');

  for (const name of ['BOU', 'African Humanitarian']) {
    try {
    const cust = await pool.query(
      `SELECT id, name FROM customers WHERE name ILIKE $1 LIMIT 1`,
      [`%${name}%`],
    );
    if (!cust.rows[0]) continue;
    const cid = cust.rows[0].id;
    log(`### ${cust.rows[0].name}`);
    const over = await pool.query(
      `
      WITH gl AS (
        SELECT COALESCE(SUM(le."DebitAmount" - le."CreditAmount"), 0) AS v
        FROM ledger_entries le JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
        JOIN accounts a ON a."Id" = le."AccountId"
        WHERE a."AccountCode" = '1200' AND UPPER(le."EntityType") = 'CUSTOMER'
          AND le."EntityId" = $1::text AND ${NET_ACTIVE}
      ),
      oi AS (
        SELECT COALESCE(SUM(GREATEST(0, COALESCE(inv.inv_due, 0) - COALESCE(pay.unalloc, 0))), 0) AS v
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
        WHERE c.id = $1
      )
      SELECT gl.v AS gl_bal, oi.v AS open_bal, (gl.v - oi.v) AS diff FROM gl, oi
      `,
      [cid],
    );
    const o = over.rows[0];
    log(`- GL: ${fmt(o.gl_bal)} | open-item: ${fmt(o.open_bal)} | Δ: ${fmt(o.diff)}`);

    const recentPay = await pool.query(
      `
      SELECT payment_number, total_amount, allocated_amount, unallocated_amount, status, payment_date::date
      FROM ar_customer_payments WHERE customer_id = $1
      ORDER BY payment_date DESC LIMIT 5
      `,
      [cid],
    );
    if (recentPay.rows.length) {
      log(mdTable(
        ['Payment#', 'Amount', 'Allocated', 'Unalloc', 'Status', 'Date'],
        recentPay.rows.map((r) => [
          r.payment_number,
          fmt(r.total_amount),
          fmt(r.allocated_amount),
          fmt(r.unallocated_amount),
          r.status,
          r.payment_date,
        ]),
      ));
    }
    log('');
    } catch (e) {
      log(`_Lane C sample failed for ${name}: ${e instanceof Error ? e.message : e}_`);
      log('');
    }
  }

  log('## Smoking gun — integrity residual');
  log('');
  const refund528 = laneA.rows.find((r) => r.ref_type === 'SALE_REFUND' && Math.abs(num(r.net_1200) + 52800) < 1);
  if (refund528) {
    log(`**TXN ${refund528.txn_num}** (SALE_REFUND) net **UGX ${fmt(refund528.net_1200)}** — equals headline integrityGlDrift.`);
    log('This refund credits 1200 without a matching open-item reduction → primary remediation target.');
  }
  log('');

  log('## Remediation hypotheses (Phase 3 input)');
  log('');
  log('1. **TXN-015298 SALE_REFUND (−52,800)** — align refund GL with open-item / invoice (primary fix for headline drift).');
  log('2. **Retag untagged CREDIT SALE GL** — EntityType=CUSTOMER for case hospital, Musa Semanda, PHARMACURE, HENBER RUBAGA (fixes customer-scope reporting, not gl_total).');
  log('3. **BOU / African Humanitarian** — payment allocation vs invoice amount_due (secondary).');
  log('4. Dry-run simulate `integrityGlDrift` after each batch before `DRY_RUN=0`.');
  log('');
  log('## Pass criteria for Phase 3');
  log('');
  log('- Every Lane A row classified: retag | repost | legitimate non-customer');
  log('- case hospital: document-level root cause confirmed (missing GL vs untagged GL)');
  log('- Simulated drift within materiality (~2,243 UGX)');

  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const outPath = path.join(root, 'PROOF_AR_FORENSIC_PHASE2.md');
  writeFileSync(outPath, lines.join('\n') + '\n');
  log(`\nWrote ${outPath}`);
} catch (e) {
  console.error(e);
  process.exit(1);
} finally {
  await pool.end();
}
