#!/usr/bin/env node
/**
 * AP drift root-cause investigation (Wave 5 open-item SSOT).
 *
 * Decomposes GL 2100 vs open-item subledger into:
 *   - Wave 5 snapshot (current SSOT)
 *   - Pre-Wave-5 comparison (invoice-only subledger — what Report Integrity used before 573992f)
 *   - Unallocated payments, expense-on-AP, legacy GR in AP
 *   - Per-supplier GL entity vs open-item drift
 *   - 2100 net effect by ReferenceType
 *
 * Usage:
 *   node scripts/ap-drift-investigation.mjs
 *   HENBER_DATABASE_URL=postgresql://... node scripts/ap-drift-investigation.mjs
 */
import pg from 'pg';

function databaseUrl() {
  if (process.env.HENBER_DATABASE_URL) return process.env.HENBER_DATABASE_URL;
  const base = process.env.DATABASE_URL;
  if (base) {
    return base.replace(/\/([^/?]+)(\?.*)?$/, '/pos_tenant_henber_pharmacy$2');
  }
  throw new Error('Set DATABASE_URL (container) or HENBER_DATABASE_URL');
}

const NET_ACTIVE = `
  lt."Status" = 'POSTED'
  AND lt."IsReversed" = FALSE
  AND lt."Id" NOT IN (
    SELECT "ReversedByTransactionId" FROM ledger_transactions
    WHERE "ReversedByTransactionId" IS NOT NULL
  )
`;

const pool = new pg.Pool({ connectionString: databaseUrl() });

function fmt(n) {
  return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pct(n, total) {
  if (!total) return '0%';
  return `${((100 * n) / total).toFixed(1)}%`;
}

async function section(title, sql, params = []) {
  console.log(`\n${'═'.repeat(72)}\n  ${title}\n${'═'.repeat(72)}`);
  const res = await pool.query(sql, params);
  if (res.rows.length === 0) {
    console.log('  (no rows)');
    return res.rows;
  }
  console.table(res.rows.map((r) => {
    const out = {};
    for (const [k, v] of Object.entries(r)) {
      out[k] = typeof v === 'string' && /^-?\d+\.?\d*$/.test(v) ? fmt(v) : v;
    }
    return out;
  }));
  return res.rows;
}

try {
  const db = databaseUrl().replace(/\/\/[^@]+@/, '//***@');
  console.log('\n🔍 AP Drift Investigation');
  console.log(`   DB: ${db}`);
  console.log(`   Time: ${new Date().toISOString()}`);

  const snap = await pool.query(`
    WITH gl AS (
      SELECT COALESCE(SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0) AS v
      FROM ledger_entries le
      JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
      JOIN accounts a ON le."AccountId" = a."Id"
      WHERE a."AccountCode" = '2100'
        AND lt."ReferenceType" NOT IN ('EXPENSE', 'EXPENSE_PAYMENT')
        AND ${NET_ACTIVE}
    ),
    inv AS (
      SELECT COALESCE(SUM(
        CASE WHEN document_type = 'SUPPLIER_CREDIT_NOTE'
          THEN -COALESCE("OutstandingBalance", 0)
          ELSE COALESCE("OutstandingBalance", 0)
        END
      ), 0) AS v
      FROM supplier_invoices
      WHERE deleted_at IS NULL
        AND UPPER("Status") NOT IN ('PAID', 'CANCELLED', 'DELETED', 'DRAFT')
        AND COALESCE(is_posted_to_gl, FALSE) = TRUE
    ),
    inv_unposted AS (
      SELECT COALESCE(SUM(
        CASE WHEN document_type = 'SUPPLIER_CREDIT_NOTE'
          THEN -COALESCE("OutstandingBalance", 0)
          ELSE COALESCE("OutstandingBalance", 0)
        END
      ), 0) AS v
      FROM supplier_invoices
      WHERE deleted_at IS NULL
        AND UPPER("Status") NOT IN ('PAID', 'CANCELLED', 'DELETED', 'DRAFT')
        AND COALESCE(is_posted_to_gl, FALSE) = FALSE
    ),
    ua AS (
      SELECT COALESCE(SUM(
        COALESCE("UnallocatedAmount", "Amount" - COALESCE("AllocatedAmount", 0))
      ), 0) AS v
      FROM supplier_payments
      WHERE deleted_at IS NULL
        AND "Status" = 'COMPLETED'
        AND COALESCE("UnallocatedAmount", "Amount" - COALESCE("AllocatedAmount", 0)) > 0.009
    ),
    sup AS (
      SELECT COALESCE(SUM("OutstandingBalance"), 0) AS v FROM suppliers WHERE "IsActive" = true
    ),
    exp AS (
      SELECT COALESCE(SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0) AS v
      FROM ledger_entries le
      JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
      JOIN accounts a ON le."AccountId" = a."Id"
      WHERE a."AccountCode" = '2100'
        AND lt."ReferenceType" IN ('EXPENSE', 'EXPENSE_PAYMENT')
        AND ${NET_ACTIVE}
    ),
    legacy_gr AS (
      SELECT COALESCE(SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0) AS v
      FROM ledger_entries le
      JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
      JOIN accounts a ON le."AccountId" = a."Id"
      WHERE a."AccountCode" = '2100'
        AND lt."ReferenceType" = 'GOODS_RECEIPT'
        AND lt."IsReversed" = FALSE
    )
    SELECT
      gl.v::numeric AS gl_supplier_scope,
      inv.v::numeric AS invoice_open,
      ua.v::numeric AS unallocated_payments,
      GREATEST(inv.v - ua.v, 0)::numeric AS subledger_wave5,
      (gl.v - GREATEST(inv.v - ua.v, 0))::numeric AS drift_wave5,
      inv.v::numeric AS subledger_pre_wave5,
      (gl.v - inv.v)::numeric AS drift_pre_wave5,
      sup.v::numeric AS suppliers_cache,
      (gl.v - sup.v)::numeric AS gl_minus_cache,
      exp.v::numeric AS expense_on_ap,
      legacy_gr.v::numeric AS legacy_gr_in_ap,
      inv_unposted.v::numeric AS unposted_open_invoices,
      (gl.v - GREATEST(inv.v - ua.v, 0) + exp.v)::numeric AS residual_after_expense
    FROM gl, inv, ua, sup, exp, legacy_gr, inv_unposted
  `);

  const s = snap.rows[0];
  const drift = Number(s.drift_wave5);
  const unalloc = Number(s.unallocated_payments);
  const driftPre = Number(s.drift_pre_wave5);

  console.log('\n📊 RECONCILIATION SUMMARY');
  console.log(`   GL 2100 (supplier scope):     ${fmt(s.gl_supplier_scope)}`);
  console.log(`   Open invoices (gross):        ${fmt(s.invoice_open)}`);
  console.log(`   Unallocated payments:         ${fmt(s.unallocated_payments)}`);
  console.log(`   Subledger (Wave 5):           ${fmt(s.subledger_wave5)}  = invoices − unalloc`);
  console.log(`   Drift (Wave 5):               ${fmt(s.drift_wave5)}`);
  console.log(`   ─────────────────────────────────────────`);
  console.log(`   Drift PRE-Wave 5 (GL vs inv): ${fmt(s.drift_pre_wave5)}  ← old Report Integrity formula`);
  console.log(`   Suppliers cache sum:          ${fmt(s.suppliers_cache)}`);
  console.log(`   Expense on 2100 (excluded):   ${fmt(s.expense_on_ap)}`);
  console.log(`   Legacy GR credits in AP:      ${fmt(s.legacy_gr_in_ap)}`);
  console.log(`   Unposted open invoices:       ${fmt(s.unposted_open_invoices)}`);
  console.log(`   Residual after expense:       ${fmt(s.residual_after_expense)}`);
  if (Math.abs(Number(s.drift_wave5) + Number(s.unposted_open_invoices)) < 5000) {
    console.log('   → Drift ≈ −unposted: post supplier bills to GL; do NOT heal-ap-drift.');
  }

  console.log('\n🧭 VERDICT');
  if (Math.abs(drift) < 0.02) {
    console.log('   ✅ Balanced under Wave 5 formula.');
  } else if (Math.abs(drift - unalloc) < 100 && Math.abs(driftPre) < 5000) {
    console.log(`   ⚠️  FORMULA VISIBILITY — Wave 5 drift (${fmt(drift)}) ≈ unallocated payments (${fmt(unalloc)}).`);
    console.log('      Pre-Wave-5 check was PASS (GL ≈ invoice sum). New check subtracts prepayments.');
    console.log('      This is NOT a deploy regression — open-item SSOT is surfacing real prepayment liability.');
    console.log('      ❌ Do NOT run heal-ap-drift — GL already reflects payment debits; subledger is net of prepayments.');
    console.log('      ✅ Allocate unallocated payments to invoices OR accept as supplier prepayment (subledger correct).');
  } else if (Math.abs(driftPre) > 5000 && Math.abs(drift - unalloc) > 5000) {
    console.log(`   🔴 REAL GL GAP — drift exists even under old formula (${fmt(driftPre)}).`);
    console.log(`      Wave 5 adds ${fmt(drift - driftPre)} from unallocated payment subtraction.`);
    console.log('      Investigate per-supplier GL vs invoices below; heal-ap-drift only for residual after allocation fix.');
  } else {
    console.log('   🔴 Mixed — review breakdown sections below.');
  }

  if (Math.abs(Number(s.legacy_gr_in_ap)) > 5000) {
    console.log(`\n   ℹ️  Legacy GR in AP: ${fmt(s.legacy_gr_in_ap)} — post DR 2100 / CR 2150 (not heal-ap-drift).`);
  }

  await section('Unallocated payments > 50k (top 25)', `
    SELECT
      sp."PaymentNumber",
      sp."PaymentDate"::date AS pay_date,
      s."CompanyName" AS supplier,
      sp."Amount"::numeric AS amount,
      COALESCE(sp."AllocatedAmount", 0)::numeric AS allocated,
      COALESCE(sp."UnallocatedAmount", sp."Amount" - COALESCE(sp."AllocatedAmount", 0))::numeric AS unallocated,
      sp."Status"
    FROM supplier_payments sp
    JOIN suppliers s ON s."Id" = sp."SupplierId"
    WHERE sp.deleted_at IS NULL
      AND sp."Status" = 'COMPLETED'
      AND COALESCE(sp."UnallocatedAmount", sp."Amount" - COALESCE(sp."AllocatedAmount", 0)) > 50000
    ORDER BY unallocated DESC
    LIMIT 25
  `);

  await section('2100 net by ReferenceType (supplier scope, net-active)', `
    SELECT
      lt."ReferenceType" AS ref_type,
      COUNT(DISTINCT lt."Id") AS txn_count,
      COALESCE(SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0)::numeric AS net_ap
    FROM ledger_entries le
    JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
    JOIN accounts a ON a."Id" = le."AccountId"
    WHERE a."AccountCode" = '2100'
      AND lt."ReferenceType" NOT IN ('EXPENSE', 'EXPENSE_PAYMENT')
      AND ${NET_ACTIVE}
    GROUP BY lt."ReferenceType"
    ORDER BY ABS(COALESCE(SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0)) DESC
  `);

  await section('Per-supplier: GL entity vs open-item subledger (|drift| > 100k, top 20)', `
    WITH gl_by_supplier AS (
      SELECT NULLIF(TRIM(le."EntityId"), '')::uuid AS supplier_id,
             COALESCE(SUM(le."CreditAmount" - le."DebitAmount"), 0) AS gl_bal
      FROM ledger_entries le
      JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
      JOIN accounts a ON a."Id" = le."AccountId"
      WHERE a."AccountCode" = '2100'
        AND UPPER(le."EntityType") = 'SUPPLIER'
        AND le."EntityId" IS NOT NULL
        AND lt."ReferenceType" NOT IN ('EXPENSE', 'EXPENSE_PAYMENT')
        AND ${NET_ACTIVE}
      GROUP BY le."EntityId"
    ),
    inv AS (
      SELECT si."SupplierId" AS supplier_id,
             COALESCE(SUM(
               CASE WHEN si.document_type = 'SUPPLIER_CREDIT_NOTE'
                 THEN -COALESCE(si."OutstandingBalance", 0)
                 ELSE COALESCE(si."OutstandingBalance", 0) END
             ), 0) AS inv_bal
      FROM supplier_invoices si
      WHERE si.deleted_at IS NULL
        AND UPPER(si."Status") NOT IN ('PAID', 'CANCELLED', 'DELETED', 'DRAFT')
      GROUP BY si."SupplierId"
    ),
    ua AS (
      SELECT sp."SupplierId" AS supplier_id,
             COALESCE(SUM(
               COALESCE(sp."UnallocatedAmount", sp."Amount" - COALESCE(sp."AllocatedAmount", 0))
             ), 0) AS ua_bal
      FROM supplier_payments sp
      WHERE sp.deleted_at IS NULL
        AND sp."Status" = 'COMPLETED'
        AND COALESCE(sp."UnallocatedAmount", sp."Amount" - COALESCE(sp."AllocatedAmount", 0)) > 0.009
      GROUP BY sp."SupplierId"
    )
    SELECT
      s."CompanyName" AS supplier,
      COALESCE(g.gl_bal, 0)::numeric AS gl_entity,
      COALESCE(i.inv_bal, 0)::numeric AS invoice_open,
      COALESCE(u.ua_bal, 0)::numeric AS unallocated,
      GREATEST(COALESCE(i.inv_bal, 0) - COALESCE(u.ua_bal, 0), 0)::numeric AS open_item_sub,
      (COALESCE(g.gl_bal, 0) - GREATEST(COALESCE(i.inv_bal, 0) - COALESCE(u.ua_bal, 0), 0))::numeric AS drift,
      COALESCE(s."OutstandingBalance", 0)::numeric AS cache
    FROM suppliers s
    LEFT JOIN gl_by_supplier g ON g.supplier_id = s."Id"
    LEFT JOIN inv i ON i.supplier_id = s."Id"
    LEFT JOIN ua u ON u.supplier_id = s."Id"
    WHERE ABS(COALESCE(g.gl_bal, 0) - GREATEST(COALESCE(i.inv_bal, 0) - COALESCE(u.ua_bal, 0), 0)) > 100000
       OR COALESCE(u.ua_bal, 0) > 100000
    ORDER BY ABS(COALESCE(g.gl_bal, 0) - GREATEST(COALESCE(i.inv_bal, 0) - COALESCE(u.ua_bal, 0), 0)) DESC
    LIMIT 20
  `);

  await section('Payments: amount vs GL debit on 2100 (mismatch > 10k)', `
    WITH pay AS (
      SELECT sp."Id", sp."PaymentNumber", sp."PaymentDate"::date AS pay_date,
             s."CompanyName" AS supplier,
             sp."Amount"::numeric AS amount,
             COALESCE(sp."UnallocatedAmount", sp."Amount" - COALESCE(sp."AllocatedAmount", 0))::numeric AS unallocated
      FROM supplier_payments sp
      JOIN suppliers s ON s."Id" = sp."SupplierId"
      WHERE sp.deleted_at IS NULL AND sp."Status" = 'COMPLETED'
    ),
    gl AS (
      SELECT lt."ReferenceId"::uuid AS payment_id,
             SUM(le."DebitAmount" - le."CreditAmount")::numeric AS ap_debit
      FROM ledger_entries le
      JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
      JOIN accounts a ON a."Id" = le."AccountId"
      WHERE a."AccountCode" = '2100'
        AND lt."ReferenceType" = 'SUPPLIER_PAYMENT'
        AND ${NET_ACTIVE}
      GROUP BY lt."ReferenceId"
    )
    SELECT p."PaymentNumber", p.pay_date, p.supplier, p.amount, p.unallocated,
           COALESCE(g.ap_debit, 0) AS gl_ap_debit,
           (p.amount - COALESCE(g.ap_debit, 0)) AS amount_minus_gl
    FROM pay p
    LEFT JOIN gl g ON g.payment_id = p."Id"
    WHERE ABS(p.amount - COALESCE(g.ap_debit, 0)) > 10000
    ORDER BY ABS(p.amount - COALESCE(g.ap_debit, 0)) DESC
    LIMIT 20
  `);

  await section('Supplier cache ≠ open-item (top 15 by |delta|)', `
    WITH open_item AS (
      SELECT s."Id",
             GREATEST(
               COALESCE(inv.net, 0) - COALESCE(pay.ua, 0), 0
             ) AS expected
      FROM suppliers s
      LEFT JOIN (
        SELECT "SupplierId", COALESCE(SUM(
          CASE WHEN document_type = 'SUPPLIER_CREDIT_NOTE'
            THEN -COALESCE("OutstandingBalance", 0)
            ELSE COALESCE("OutstandingBalance", 0) END
        ), 0) AS net
        FROM supplier_invoices
        WHERE deleted_at IS NULL AND UPPER("Status") NOT IN ('PAID','CANCELLED','DELETED','DRAFT')
        GROUP BY "SupplierId"
      ) inv ON inv."SupplierId" = s."Id"
      LEFT JOIN (
        SELECT "SupplierId", COALESCE(SUM(
          COALESCE("UnallocatedAmount", "Amount" - COALESCE("AllocatedAmount", 0))
        ), 0) AS ua
        FROM supplier_payments
        WHERE deleted_at IS NULL AND "Status" = 'COMPLETED'
          AND COALESCE("UnallocatedAmount", "Amount" - COALESCE("AllocatedAmount", 0)) > 0.009
        GROUP BY "SupplierId"
      ) pay ON pay."SupplierId" = s."Id"
      WHERE s."IsActive" = true
    )
    SELECT s."CompanyName", s."OutstandingBalance"::numeric AS cache,
           o.expected::numeric AS open_item,
           (s."OutstandingBalance" - o.expected)::numeric AS cache_minus_open_item
    FROM suppliers s
    JOIN open_item o ON o."Id" = s."Id"
    WHERE ABS(s."OutstandingBalance" - o.expected) > 1000
    ORDER BY ABS(s."OutstandingBalance" - o.expected) DESC
    LIMIT 15
  `);

  console.log('\n✅ Investigation complete.\n');
} catch (e) {
  console.error(e?.message || e);
  process.exit(1);
} finally {
  await pool.end();
}
