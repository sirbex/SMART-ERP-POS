#!/usr/bin/env node
/**
 * Read-only proof: decompose AR (1200) integrityGlDrift into auditable line items.
 * No mutations. Exit 0 only if arithmetic reconciles to reported integrityGlDrift.
 *
 * Usage (production — required):
 *   HENBER_DATABASE_URL=... node scripts/proof-ar-drift-decompose.mjs
 *
 * Usage (local dev only):
 *   PROOF_ALLOW_LOCAL=1 DATABASE_URL=... node scripts/proof-ar-drift-decompose.mjs
 */
import pg from 'pg';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveVerificationEnvironment } from '../../scripts/lib/production-verification-guard.mjs';

const { mode, henberDatabaseUrl } = resolveVerificationEnvironment({
  scriptName: 'Henber AR drift decomposition',
  requireHenberDatabase: true,
});

const NET_ACTIVE = `
  lt."Status" = 'POSTED'
  AND lt."IsReversed" = FALSE
  AND lt."Id" NOT IN (
    SELECT "ReversedByTransactionId" FROM ledger_transactions
    WHERE "ReversedByTransactionId" IS NOT NULL
  )
`;

const pool = new pg.Pool({
  connectionString: henberDatabaseUrl,
});

const fmt = (n) =>
  Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (v) => Number(v || 0);
const lines = [];
const log = (s = '') => {
  lines.push(s);
  console.log(s);
};

function assertEq(label, a, b, tolerance = 0.02) {
  const diff = Math.abs(a - b);
  const ok = diff <= tolerance;
  log(`${ok ? '✓' : '✗'} ${label}: ${fmt(a)} ${ok ? '==' : '!='} ${fmt(b)}${ok ? '' : ` (Δ ${fmt(diff)})`}`);
  return ok;
}

try {
  const ts = new Date().toISOString();
  log('═'.repeat(72));
  log(' AR DRIFT DECOMPOSITION PROOF (read-only)');
  log(` Generated: ${ts}`);
  log(` Mode: ${mode}`);
  log(` Database: ${mode === 'production' ? 'HENBER_DATABASE_URL (configured)' : henberDatabaseUrl.replace(/:[^:@/]+@/, ':***@')}`);
  log('═'.repeat(72));

  const snap = await pool.query(`
    WITH gl_total AS (
      SELECT COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0) AS v
      FROM ledger_entries le JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
      JOIN accounts a ON le."AccountId" = a."Id"
      WHERE a."AccountCode" = '1200' AND ${NET_ACTIVE}
    ),
    gl_customer AS (
      SELECT COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0) AS v
      FROM ledger_entries le JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
      JOIN accounts a ON le."AccountId" = a."Id"
      WHERE a."AccountCode" = '1200'
        AND UPPER(le."EntityType") = 'CUSTOMER'
        AND le."EntityId" IS NOT NULL
        AND ${NET_ACTIVE}
    ),
    gl_gross AS (
      SELECT COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0) AS v
      FROM ledger_entries le JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
      JOIN accounts a ON le."AccountId" = a."Id"
      WHERE a."AccountCode" = '1200' AND lt."Status" = 'POSTED'
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
    customers_cache AS (
      SELECT COALESCE(SUM(balance), 0) AS v FROM customers WHERE is_active = true
    ),
    stored AS (
      SELECT COALESCE("CurrentBalance", 0) AS v FROM accounts WHERE "AccountCode" = '1200'
    ),
    unallocated AS (
      SELECT COALESCE(SUM(unallocated_amount), 0) AS v
      FROM ar_customer_payments
      WHERE status IN ('POSTED', 'PARTIALLY_ALLOCATED', 'FULLY_ALLOCATED')
        AND COALESCE(unallocated_amount, 0) > 0.009
    ),
    non_customer_gl AS (
      SELECT COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0) AS v
      FROM ledger_entries le JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
      JOIN accounts a ON le."AccountId" = a."Id"
      WHERE a."AccountCode" = '1200'
        AND (le."EntityId" IS NULL OR UPPER(COALESCE(le."EntityType", '')) != 'CUSTOMER')
        AND ${NET_ACTIVE}
    )
    SELECT
      gl_total.v AS gl_total,
      gl_customer.v AS gl_customer,
      gl_gross.v AS gl_gross,
      open_item.v AS open_item,
      customers_cache.v AS customers_cache,
      stored.v AS stored,
      unallocated.v AS unallocated,
      non_customer_gl.v AS non_customer_gl
    FROM gl_total, gl_customer, gl_gross, open_item, customers_cache, stored, unallocated, non_customer_gl
  `);

  const s = snap.rows[0];
  const glTotal = num(s.gl_total);
  const glCustomer = num(s.gl_customer);
  const glGross = num(s.gl_gross);
  const openItem = num(s.open_item);
  const integrityDrift = glTotal - openItem;
  const customerDrift = glCustomer - openItem;
  const nonCustomerGl = num(s.non_customer_gl);
  const reversalImpact = glGross - glTotal;
  const cacheDrift = num(s.customers_cache) - openItem;

  log('\n── Layer 1: Integrity (net-active GL vs open-item subledger) ──');
  log(`  GL 1200 total (net-active):           UGX ${fmt(glTotal)}`);
  log(`  GL customer-scoped (net-active):      UGX ${fmt(glCustomer)}`);
  log(`  Open-item subledger:                  UGX ${fmt(openItem)}`);
  log(`  integrityGlDrift (total − subledger): UGX ${fmt(integrityDrift)}`);
  log(`  customerScopeDrift:                   UGX ${fmt(customerDrift)}`);
  log(`  NON_CUSTOMER_AR on 1200:              UGX ${fmt(nonCustomerGl)}`);
  log(`  Unallocated receipts:                 UGX ${fmt(s.unallocated)}`);
  log(`  customers cache sum:                  UGX ${fmt(s.customers_cache)}`);
  log(`  cacheDrift (cache − open-item):       UGX ${fmt(cacheDrift)}`);
  log(`  accounts.CurrentBalance 1200:         UGX ${fmt(s.stored)}`);
  log(`  reversalImpact (gross − net-active):  UGX ${fmt(reversalImpact)}`);

  log('\n── Layer 2: Per-customer integrity exceptions (top 20) ──');
  const custRes = await pool.query(`
    WITH gl_by_customer AS (
      SELECT NULLIF(TRIM(le."EntityId"), '')::uuid AS customer_id,
        COALESCE(SUM(le."DebitAmount" - le."CreditAmount"), 0) AS gl_bal
      FROM ledger_entries le
      JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
      JOIN accounts a ON a."Id" = le."AccountId"
      WHERE a."AccountCode" = '1200'
        AND UPPER(le."EntityType") = 'CUSTOMER'
        AND le."EntityId" IS NOT NULL
        AND ${NET_ACTIVE}
      GROUP BY le."EntityId"
    ),
    open_item AS (
      SELECT c.id AS customer_id,
        GREATEST(0, COALESCE(inv.inv_due, 0) - COALESCE(pay.unalloc, 0)) AS open_bal
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
    SELECT c.name,
      COALESCE(g.gl_bal, 0)::numeric AS gl_bal,
      COALESCE(oi.open_bal, 0)::numeric AS open_bal,
      (COALESCE(g.gl_bal, 0) - COALESCE(oi.open_bal, 0))::numeric AS diff
    FROM customers c
    LEFT JOIN gl_by_customer g ON g.customer_id = c.id
    LEFT JOIN open_item oi ON oi.customer_id = c.id
    WHERE ABS(COALESCE(g.gl_bal, 0) - COALESCE(oi.open_bal, 0)) > 0.01
    ORDER BY ABS(COALESCE(g.gl_bal, 0) - COALESCE(oi.open_bal, 0)) DESC
    LIMIT 20
  `);

  let sumCustomerDiff = 0;
  for (const row of custRes.rows) {
    const diff = num(row.diff);
    sumCustomerDiff += diff;
    log(`  ${row.name}: GL ${fmt(row.gl_bal)} | open-item ${fmt(row.open_bal)} | Δ ${fmt(diff)}`);
  }
  log(`  Sum of per-customer diffs (partial): UGX ${fmt(sumCustomerDiff)}`);

  log('\n── Layer 3: Assertions ──');
  let ok = true;
  const expectedDrift = Number(process.env.EXPECTED_INTEGRITY_DRIFT ?? 0);
  ok = assertEq('integrityGlDrift', integrityDrift, expectedDrift, 1) && ok;
  ok = assertEq('non-customer + customer ≈ total GL', glCustomer + nonCustomerGl, glTotal, 1) && ok;
  ok = assertEq('cache healthy (open-item = cache)', openItem, num(s.customers_cache), 1) && ok;

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const outPath = path.join(__dirname, '..', '..', 'PROOF_AR_DRIFT_DECOMPOSE.md');
  writeFileSync(outPath, lines.join('\n') + '\n');
  log(`\nWrote ${outPath}`);

  log('\n' + '═'.repeat(72));
  if (!ok) {
    log('RESULT: ASSERTION FAILURE');
    process.exit(1);
  }
  log(`RESULT: PROOF OK — integrityGlDrift = UGX ${fmt(integrityDrift)}`);
  process.exit(0);
} catch (e) {
  console.error(e);
  process.exit(1);
} finally {
  await pool.end();
}
