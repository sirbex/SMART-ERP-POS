#!/usr/bin/env node
/**
 * Read-only AR forensic — Henber -52,800 investigation (Phase 1).
 */
import pg from 'pg';

const pool = new pg.Pool({
  connectionString:
    process.env.HENBER_DATABASE_URL ||
    'postgresql://postgres:55b9bed51c599b26e7115ab126a974e8@209.38.203.138:5432/pos_tenant_henber_pharmacy',
});

const NET_ACTIVE = `
  lt."Status" = 'POSTED'
  AND lt."IsReversed" = FALSE
  AND lt."Id" NOT IN (
    SELECT "ReversedByTransactionId" FROM ledger_transactions
    WHERE "ReversedByTransactionId" IS NOT NULL
  )
`;

try {
  console.log('=== AR algebra bridge ===');
  const bridge = await pool.query(`
    WITH gl_total AS (
      SELECT COALESCE(SUM(le."DebitAmount" - le."CreditAmount"), 0) AS v
      FROM ledger_entries le JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
      JOIN accounts a ON le."AccountId" = a."Id"
      WHERE a."AccountCode" = '1200' AND ${NET_ACTIVE}
    ),
    gl_customer AS (
      SELECT COALESCE(SUM(le."DebitAmount" - le."CreditAmount"), 0) AS v
      FROM ledger_entries le JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
      JOIN accounts a ON le."AccountId" = a."Id"
      WHERE a."AccountCode" = '1200' AND UPPER(le."EntityType") = 'CUSTOMER'
        AND le."EntityId" IS NOT NULL AND ${NET_ACTIVE}
    ),
    non_customer AS (
      SELECT COALESCE(SUM(le."DebitAmount" - le."CreditAmount"), 0) AS v
      FROM ledger_entries le JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
      JOIN accounts a ON le."AccountId" = a."Id"
      WHERE a."AccountCode" = '1200'
        AND (le."EntityId" IS NULL OR UPPER(COALESCE(le."EntityType", '')) != 'CUSTOMER')
        AND ${NET_ACTIVE}
    ),
    open_item AS (
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
      WHERE c.is_active = true
    )
    SELECT gl_total.v AS gl_total, gl_customer.v AS gl_customer, non_customer.v AS non_customer,
           open_item.v AS open_item,
           (gl_total.v - open_item.v) AS integrity_drift,
           (gl_customer.v - open_item.v) AS customer_drift
    FROM gl_total, gl_customer, non_customer, open_item
  `);
  console.log(bridge.rows[0]);

  console.log('\n=== NON_CUSTOMER_AR by ReferenceType (top) ===');
  const nonCust = await pool.query(`
    SELECT lt."ReferenceType", COUNT(*)::int AS cnt,
      SUM(le."DebitAmount" - le."CreditAmount")::numeric AS net
    FROM ledger_entries le
    JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
    JOIN accounts a ON a."Id" = le."AccountId"
    WHERE a."AccountCode" = '1200'
      AND (le."EntityId" IS NULL OR UPPER(COALESCE(le."EntityType", '')) != 'CUSTOMER')
      AND ${NET_ACTIVE}
    GROUP BY lt."ReferenceType"
    ORDER BY ABS(SUM(le."DebitAmount" - le."CreditAmount")) DESC
    LIMIT 15
  `);
  console.table(nonCust.rows);

  console.log('\n=== case hospital — open invoices (top 10) ===');
  const caseH = await pool.query(`
    SELECT i.invoice_number, i.document_type, i.status, i.total_amount, i.amount_due,
           i.created_at::date AS created
    FROM invoices i
    JOIN customers c ON c.id = i.customer_id
    WHERE c.name ILIKE '%case hospital%'
      AND i.status NOT IN ('CANCELLED', 'VOIDED', 'DRAFT')
    ORDER BY i.amount_due DESC NULLS LAST
    LIMIT 10
  `);
  console.table(caseH.rows);

  console.log('\n=== case hospital — GL 1200 entries (any) ===');
  const caseGl = await pool.query(`
    SELECT lt."TransactionNumber", lt."ReferenceType", lt."ReferenceId",
      SUM(le."DebitAmount" - le."CreditAmount")::numeric AS net
    FROM ledger_entries le
    JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
    JOIN accounts a ON a."Id" = le."AccountId"
    JOIN customers c ON c.id::text = le."EntityId"
    WHERE a."AccountCode" = '1200' AND c.name ILIKE '%case hospital%'
    GROUP BY lt."Id", lt."TransactionNumber", lt."ReferenceType", lt."ReferenceId"
    ORDER BY ABS(SUM(le."DebitAmount" - le."CreditAmount")) DESC
    LIMIT 10
  `);
  console.log('rows:', caseGl.rowCount);
  if (caseGl.rows.length) console.table(caseGl.rows);

  console.log('\n=== Customers: open-item > 0 but GL customer-scoped = 0 ===');
  const ghost = await pool.query(`
    WITH gl_by_customer AS (
      SELECT NULLIF(TRIM(le."EntityId"), '')::uuid AS customer_id,
        COALESCE(SUM(le."DebitAmount" - le."CreditAmount"), 0) AS gl_bal
      FROM ledger_entries le
      JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
      JOIN accounts a ON a."Id" = le."AccountId"
      WHERE a."AccountCode" = '1200' AND UPPER(le."EntityType") = 'CUSTOMER'
        AND le."EntityId" IS NOT NULL AND ${NET_ACTIVE}
      GROUP BY le."EntityId"
    ),
    open_item AS (
      SELECT c.id, c.name,
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
    SELECT oi.name, oi.open_bal
    FROM open_item oi
    LEFT JOIN gl_by_customer g ON g.customer_id = oi.id
    WHERE oi.open_bal > 0.01 AND COALESCE(g.gl_bal, 0) = 0
    ORDER BY oi.open_bal DESC
  `);
  console.table(ghost.rows);
} finally {
  await pool.end();
}
