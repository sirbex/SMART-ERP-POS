#!/usr/bin/env node
/**
 * Henber AP drift investigation — find payments in GL not reflected in supplier subledger.
 * Run inside smarterp-backend: node henber-ap-payment-investigate.mjs
 */
import pg from 'pg';

function henberDatabaseUrl() {
  if (process.env.HENBER_DATABASE_URL) return process.env.HENBER_DATABASE_URL;
  const base = process.env.DATABASE_URL;
  if (base) {
    return base.replace(/\/([^/?]+)(\?.*)?$/, '/pos_tenant_henber_pharmacy$2');
  }
  return 'postgresql://postgres:55b9bed51c599b26e7115ab126a974e8@postgres:5432/pos_tenant_henber_pharmacy';
}

const pool = new pg.Pool({ connectionString: henberDatabaseUrl() });

function fmt(n) {
  return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function section(title, sql, params = []) {
  console.log(`\n=== ${title} ===`);
  const res = await pool.query(sql, params);
  if (res.rows.length === 0) {
    console.log('(no rows)');
    return res.rows;
  }
  console.table(res.rows);
  return res.rows;
}

try {
  console.log('Henber DB:', henberDatabaseUrl().replace(/\/\/[^@]+@/, '//***@'));

  await section('Reconciliation totals (Report Integrity style)', `
    WITH gl_total AS (
      SELECT COALESCE(SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0) AS balance
      FROM ledger_entries le
      JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
      JOIN accounts a ON le."AccountId" = a."Id"
      WHERE a."AccountCode" = '2100' AND lt."Status" = 'POSTED'
    ),
    gl_supplier AS (
      SELECT COALESCE(SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0) AS balance
      FROM ledger_entries le
      JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
      JOIN accounts a ON le."AccountId" = a."Id"
      WHERE a."AccountCode" = '2100'
        AND UPPER(le."EntityType") = 'SUPPLIER'
        AND lt."Status" = 'POSTED'
    ),
    supplier_table AS (
      SELECT COALESCE(SUM("OutstandingBalance"), 0) AS balance FROM suppliers
    ),
    invoice_sum AS (
      SELECT COALESCE(SUM(
        CASE WHEN document_type = 'SUPPLIER_CREDIT_NOTE'
          THEN -COALESCE("OutstandingBalance", 0)
          ELSE COALESCE("OutstandingBalance", 0)
        END
      ), 0) AS balance
      FROM supplier_invoices
      WHERE deleted_at IS NULL
        AND UPPER("Status") NOT IN ('PAID', 'CANCELLED', 'DELETED')
    )
    SELECT
      gt.balance AS gl_2100,
      gs.balance AS supplier_gl_entity,
      st.balance AS suppliers_table_sum,
      inv.balance AS invoice_outstanding_sum,
      gs.balance - st.balance AS gl_vs_suppliers,
      gs.balance - inv.balance AS gl_vs_invoices
    FROM gl_total gt, gl_supplier gs, supplier_table st, invoice_sum inv
  `);

  await section('Total unallocated supplier payments (completed)', `
    SELECT
      COUNT(*) AS payment_count,
      COALESCE(SUM(sp."UnallocatedAmount"), 0) AS total_unallocated,
      COALESCE(SUM(sp."Amount"), 0) AS total_paid,
      COALESCE(SUM(sp."AllocatedAmount"), 0) AS total_allocated
    FROM supplier_payments sp
    WHERE UPPER(sp."Status") NOT IN ('CANCELLED', 'VOID', 'DELETED')
      AND COALESCE(sp."UnallocatedAmount", sp."Amount" - COALESCE(sp."AllocatedAmount", 0)) > 0.01
  `);

  await section('Unallocated payments ~350k–400k (likely culprits)', `
    SELECT
      sp."Id",
      sp."PaymentNumber",
      sp."PaymentDate"::date,
      s."CompanyName" AS supplier,
      sp."Amount",
      sp."AllocatedAmount",
      COALESCE(sp."UnallocatedAmount", sp."Amount" - COALESCE(sp."AllocatedAmount", 0)) AS unallocated,
      sp."Status",
      sp."PaymentMethod"
    FROM supplier_payments sp
    JOIN suppliers s ON s."Id" = sp."SupplierId"
    WHERE UPPER(sp."Status") NOT IN ('CANCELLED', 'VOID', 'DELETED')
      AND COALESCE(sp."UnallocatedAmount", sp."Amount" - COALESCE(sp."AllocatedAmount", 0)) BETWEEN 300000 AND 450000
    ORDER BY sp."PaymentDate" DESC
  `);

  await section('All unallocated payments > 10k (top 30)', `
    SELECT
      sp."PaymentNumber",
      sp."PaymentDate"::date,
      s."CompanyName" AS supplier,
      sp."Amount",
      sp."AllocatedAmount",
      COALESCE(sp."UnallocatedAmount", sp."Amount" - COALESCE(sp."AllocatedAmount", 0)) AS unallocated,
      sp."Status"
    FROM supplier_payments sp
    JOIN suppliers s ON s."Id" = sp."SupplierId"
    WHERE UPPER(sp."Status") NOT IN ('CANCELLED', 'VOID', 'DELETED')
      AND COALESCE(sp."UnallocatedAmount", sp."Amount" - COALESCE(sp."AllocatedAmount", 0)) > 10000
    ORDER BY unallocated DESC
    LIMIT 30
  `);

  await section('Payments: GL posted vs allocation mismatch', `
    WITH pay AS (
      SELECT
        sp."Id",
        sp."PaymentNumber",
        sp."PaymentDate"::date AS pay_date,
        sp."SupplierId",
        s."CompanyName" AS supplier,
        sp."Amount"::numeric AS amount,
        COALESCE(sp."AllocatedAmount", 0)::numeric AS allocated,
        COALESCE(sp."UnallocatedAmount", sp."Amount" - COALESCE(sp."AllocatedAmount", 0))::numeric AS unallocated,
        COALESCE((
          SELECT SUM(spa."AmountAllocated")
          FROM supplier_payment_allocations spa
          WHERE spa."SupplierPaymentId" = sp."Id"
        ), 0)::numeric AS alloc_rows_sum
      FROM supplier_payments sp
      JOIN suppliers s ON s."Id" = sp."SupplierId"
      WHERE UPPER(sp."Status") NOT IN ('CANCELLED', 'VOID', 'DELETED')
    ),
    gl AS (
      SELECT
        lt."ReferenceId" AS payment_id,
        SUM(le."DebitAmount" - le."CreditAmount")::numeric AS ap_debit
      FROM ledger_entries le
      JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
      JOIN accounts a ON a."Id" = le."AccountId"
      WHERE a."AccountCode" = '2100'
        AND lt."ReferenceType" = 'SUPPLIER_PAYMENT'
        AND lt."Status" = 'POSTED'
        AND lt."IsReversed" = FALSE
      GROUP BY lt."ReferenceId"
    )
    SELECT
      p."PaymentNumber",
      p.pay_date,
      p.supplier,
      p.amount,
      p.allocated,
      p.unallocated,
      p.alloc_rows_sum,
      COALESCE(g.ap_debit, 0) AS gl_ap_debit,
      p.amount - COALESCE(g.ap_debit, 0) AS amount_minus_gl,
      p.allocated - COALESCE(g.ap_debit, 0) AS allocated_minus_gl
    FROM pay p
    LEFT JOIN gl g ON g.payment_id = p."Id"::text
    WHERE ABS(p.amount - COALESCE(g.ap_debit, 0)) > 0.01
       OR ABS(p.allocated - COALESCE(g.ap_debit, 0)) > 0.01
       OR p.unallocated > 0.01
    ORDER BY p.unallocated DESC, ABS(p.amount - COALESCE(g.ap_debit, 0)) DESC
    LIMIT 40
  `);

  await section('Per-supplier: GL entity balance vs invoice outstanding vs suppliers table', `
    WITH gl_by_supplier AS (
      SELECT
        le."EntityId"::uuid AS supplier_id,
        COALESCE(SUM(le."CreditAmount" - le."DebitAmount"), 0) AS gl_balance
      FROM ledger_entries le
      JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
      JOIN accounts a ON a."Id" = le."AccountId"
      WHERE a."AccountCode" = '2100'
        AND UPPER(le."EntityType") = 'SUPPLIER'
        AND lt."Status" = 'POSTED'
        AND le."EntityId" IS NOT NULL
      GROUP BY le."EntityId"
    ),
    inv_by_supplier AS (
      SELECT
        si."SupplierId" AS supplier_id,
        COALESCE(SUM(
          CASE WHEN si.document_type = 'SUPPLIER_CREDIT_NOTE'
            THEN -COALESCE(si."OutstandingBalance", 0)
            ELSE COALESCE(si."OutstandingBalance", 0)
          END
        ), 0) AS invoice_outstanding
      FROM supplier_invoices si
      WHERE si.deleted_at IS NULL
        AND UPPER(si."Status") NOT IN ('PAID', 'CANCELLED', 'DELETED')
      GROUP BY si."SupplierId"
    )
    SELECT
      s."CompanyName" AS supplier,
      COALESCE(g.gl_balance, 0) AS gl_entity,
      COALESCE(i.invoice_outstanding, 0) AS invoice_sum,
      COALESCE(s."OutstandingBalance", 0) AS suppliers_cached,
      COALESCE(g.gl_balance, 0) - COALESCE(s."OutstandingBalance", 0) AS gl_minus_cached
    FROM suppliers s
    LEFT JOIN gl_by_supplier g ON g.supplier_id = s."Id"
    LEFT JOIN inv_by_supplier i ON i.supplier_id = s."Id"
    WHERE ABS(COALESCE(g.gl_balance, 0) - COALESCE(s."OutstandingBalance", 0)) > 100
    ORDER BY ABS(COALESCE(g.gl_balance, 0) - COALESCE(s."OutstandingBalance", 0)) DESC
    LIMIT 25
  `);

  await section('Recent SUPPLIER_PAYMENT GL entries on 2100 (last 20)', `
    SELECT
      lt."TransactionNumber",
      lt."TransactionDate"::date,
      lt."ReferenceNumber" AS payment_number,
      s."CompanyName" AS supplier,
      le."DebitAmount" AS ap_debit,
      le."CreditAmount" AS ap_credit,
      le."EntityType",
      le."EntityId"
    FROM ledger_transactions lt
    JOIN ledger_entries le ON le."TransactionId" = lt."Id"
    JOIN accounts a ON a."Id" = le."AccountId"
    LEFT JOIN suppliers s ON s."Id" = le."EntityId"::uuid
    WHERE lt."ReferenceType" = 'SUPPLIER_PAYMENT'
      AND a."AccountCode" = '2100'
      AND lt."Status" = 'POSTED'
      AND lt."IsReversed" = FALSE
    ORDER BY lt."TransactionDate" DESC, lt."CreatedAt" DESC
    LIMIT 20
  `);

  await section('Invoices where AmountPaid != sum(allocations)', `
    WITH alloc AS (
      SELECT spa."SupplierInvoiceId", SUM(spa."AmountAllocated") AS paid_from_allocs
      FROM supplier_payment_allocations spa
      GROUP BY spa."SupplierInvoiceId"
    )
    SELECT
      si."SupplierInvoiceNumber",
      si."InternalReferenceNumber",
      s."CompanyName" AS supplier,
      si."TotalAmount",
      si."AmountPaid",
      COALESCE(a.paid_from_allocs, 0) AS paid_from_allocs,
      si."OutstandingBalance",
      si."Status"
    FROM supplier_invoices si
    JOIN suppliers s ON s."Id" = si."SupplierId"
    LEFT JOIN alloc a ON a."SupplierInvoiceId" = si."Id"
    WHERE si.deleted_at IS NULL
      AND ABS(COALESCE(si."AmountPaid", 0) - COALESCE(a.paid_from_allocs, 0)) > 0.01
    ORDER BY ABS(COALESCE(si."AmountPaid", 0) - COALESCE(a.paid_from_allocs, 0)) DESC
    LIMIT 25
  `);

  console.log('\nDone.');
} catch (e) {
  console.error(e?.message || e);
  process.exit(1);
} finally {
  await pool.end();
}
