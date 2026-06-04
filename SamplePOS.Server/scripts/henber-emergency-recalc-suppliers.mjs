#!/usr/bin/env node
/** Emergency — rebuild all suppliers.OutstandingBalance from open-item SSOT */
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.HENBER_DATABASE_URL });
const fmt = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });

async function snapshot() {
  const r = await pool.query(`
    WITH gl AS (
      SELECT COALESCE(SUM(le."CreditAmount")-SUM(le."DebitAmount"),0) AS v
      FROM ledger_entries le JOIN ledger_transactions lt ON lt."Id"=le."TransactionId"
      JOIN accounts a ON a."Id"=le."AccountId"
      WHERE a."AccountCode"='2100' AND UPPER(le."EntityType")='SUPPLIER' AND lt."Status"='POSTED'
    ), sub AS (SELECT COALESCE(SUM("OutstandingBalance"),0) AS v FROM suppliers)
    SELECT gl.v::numeric AS gl, sub.v::numeric AS sub FROM gl, sub`);
  return { gl: Number(r.rows[0].gl), sub: Number(r.rows[0].sub) };
}

const before = await snapshot();
console.log('BEFORE cache sum:', fmt(before.sub), 'GL:', fmt(before.gl), 'diff:', fmt(before.gl - before.sub));

const res = await pool.query(`
  WITH open_item AS (
    SELECT si."SupplierId" AS id,
      GREATEST(
        COALESCE(SUM(
          CASE WHEN si.document_type = 'SUPPLIER_CREDIT_NOTE'
            THEN -COALESCE(si."OutstandingBalance", 0)
            ELSE COALESCE(si."OutstandingBalance", 0) END
        ), 0)
        - COALESCE((
          SELECT SUM(COALESCE(sp."UnallocatedAmount", sp."Amount" - COALESCE(sp."AllocatedAmount", 0)))
          FROM supplier_payments sp
          WHERE sp."SupplierId" = si."SupplierId"
            AND sp.deleted_at IS NULL AND sp."Status" = 'COMPLETED'
            AND COALESCE(sp."UnallocatedAmount", sp."Amount" - COALESCE(sp."AllocatedAmount", 0)) > 0.009
        ), 0),
        0
      ) AS bal
    FROM supplier_invoices si
    WHERE si.deleted_at IS NULL
      AND UPPER(si."Status") NOT IN ('PAID','CANCELLED','DELETED','DRAFT')
    GROUP BY si."SupplierId"
  ),
  gl_entity AS (
    SELECT le."EntityId"::text AS id,
           COALESCE(SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0) AS gl_net
    FROM ledger_entries le
    JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
    JOIN accounts a ON a."Id" = le."AccountId"
    WHERE a."AccountCode" = '2100'
      AND UPPER(le."EntityType") = 'SUPPLIER'
      AND lt."Status" = 'POSTED'
    GROUP BY le."EntityId"
  ),
  new_bal AS (
    SELECT s."Id",
           CASE
             WHEN COALESCE(ge.gl_net, 0) < -0.009 THEN ge.gl_net
             ELSE COALESCE(oi.bal, 0)
           END AS balance
    FROM suppliers s
    LEFT JOIN open_item oi ON oi.id = s."Id"
    LEFT JOIN gl_entity ge ON ge.id = s."Id"::text
  )
  UPDATE suppliers s
  SET "OutstandingBalance" = nb.balance,
      "UpdatedAt" = NOW()
  FROM new_bal nb
  WHERE s."Id" = nb."Id"
    AND ABS(COALESCE(s."OutstandingBalance", 0) - nb.balance) > 0.009
  RETURNING s."CompanyName", s."OutstandingBalance"::numeric AS new_balance
`);

console.log(`Updated ${res.rowCount} supplier cache row(s)`);
if (res.rowCount <= 30) {
  console.table(res.rows.map((r) => ({ supplier: r.CompanyName, balance: fmt(r.new_balance) })));
}

const after = await snapshot();
console.log('AFTER cache sum:', fmt(after.sub), 'GL:', fmt(after.gl), 'diff:', fmt(after.gl - after.sub));

const drifts = await pool.query(`
  SELECT s."CompanyName",
         COALESCE(gl.net,0)::numeric AS gl_e,
         s."OutstandingBalance"::numeric AS cache,
         (COALESCE(gl.net,0)-s."OutstandingBalance")::numeric AS diff
  FROM suppliers s
  LEFT JOIN LATERAL (
    SELECT SUM(le."CreditAmount")-SUM(le."DebitAmount") AS net
    FROM ledger_entries le JOIN ledger_transactions lt ON lt."Id"=le."TransactionId"
    JOIN accounts a ON a."Id"=le."AccountId"
    WHERE a."AccountCode"='2100' AND le."EntityId"::text=s."Id"::text
      AND UPPER(le."EntityType")='SUPPLIER' AND lt."Status"='POSTED'
  ) gl ON TRUE
  WHERE ABS(COALESCE(gl.net,0)-s."OutstandingBalance") > 0.01
  ORDER BY ABS(COALESCE(gl.net,0)-s."OutstandingBalance") DESC
  LIMIT 10
`);
console.log('Remaining drifts:');
console.table(drifts.rows.map((d) => ({ supplier: d.CompanyName, gl: fmt(d.gl_e), cache: fmt(d.cache), diff: fmt(d.diff) })));

await pool.end();
process.exit(Math.abs(after.gl - after.sub) >= 0.02 ? 1 : 0);
