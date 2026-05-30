#!/usr/bin/env node
/**
 * Report Integrity drift proof — read-only forensic breakdown.
 * Replicates financialIntegrityService checks and explains each delta with evidence.
 *
 * Usage:
 *   TENANT=dynamics node scripts/integrity-drift-proof.mjs
 *   TENANT=henber node scripts/integrity-drift-proof.mjs
 */
import pg from 'pg';

const NET_ACTIVE = `
  lt."Status" = 'POSTED'
  AND lt."IsReversed" = FALSE
  AND lt."Id" NOT IN (
    SELECT "ReversedByTransactionId" FROM ledger_transactions
    WHERE "ReversedByTransactionId" IS NOT NULL
  )
`;

const TENANT_DB = {
  henber: 'pos_tenant_henber_pharmacy',
  dynamics: 'pos_tenant_dynamics',
};

function resolveDatabaseUrl() {
  const tenantKey = (process.env.TENANT || 'dynamics').toLowerCase();
  const tenantDb = TENANT_DB[tenantKey] || tenantKey;
  const base = process.env.DATABASE_URL;
  if (base) return base.replace(/\/([^/?]+)(\?.*)?$/, `/${tenantDb}$2`);
  return `postgresql://postgres:55b9bed51c599b26e7115ab126a974e8@postgres:5432/${tenantDb}`;
}

function fmt(n) {
  return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function section(pool, title, sql, params = []) {
  console.log(`\n${'='.repeat(72)}\n${title}\n${'='.repeat(72)}`);
  const res = await pool.query(sql, params);
  if (!res.rows.length) {
    console.log('(no rows)');
    return res.rows;
  }
  console.table(res.rows);
  return res.rows;
}

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl() });

try {
  const db = resolveDatabaseUrl();
  console.log('INTEGRITY DRIFT PROOF');
  console.log('Database:', db.replace(/\/\/[^@]+@/, '//***@'));
  console.log('Time:', new Date().toISOString());

  const summary = await pool.query(`
    SELECT
      (SELECT COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0)
       FROM ledger_entries le
       JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
       JOIN accounts a ON a."Id" = le."AccountId"
       WHERE a."AccountCode" = '1300' AND ${NET_ACTIVE}) AS inv_gl,
      (SELECT COALESCE(SUM(remaining_quantity * cost_price), 0)
       FROM inventory_batches WHERE remaining_quantity > 0) AS inv_sub,
      (SELECT COALESCE(SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0)
       FROM ledger_entries le
       JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
       JOIN accounts a ON a."Id" = le."AccountId"
       WHERE a."AccountCode" = '2100'
         AND lt."ReferenceType" NOT IN ('EXPENSE', 'EXPENSE_PAYMENT')
         AND ${NET_ACTIVE}) AS ap_gl,
      (SELECT COALESCE(SUM(
         CASE WHEN si.document_type = 'SUPPLIER_CREDIT_NOTE'
           THEN -COALESCE(si."OutstandingBalance", 0)
           ELSE COALESCE(si."OutstandingBalance", 0) END
       ), 0)
       FROM supplier_invoices si
       WHERE si.deleted_at IS NULL
         AND UPPER(si."Status") NOT IN ('PAID', 'CANCELLED', 'DELETED')) AS ap_sub,
      (SELECT COALESCE(SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0)
       FROM ledger_entries le
       JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
       JOIN accounts a ON a."Id" = le."AccountId"
       WHERE a."AccountCode" = '2100'
         AND lt."ReferenceType" IN ('EXPENSE', 'EXPENSE_PAYMENT')
         AND ${NET_ACTIVE}) AS expense_on_ap,
      (SELECT COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0)
       FROM ledger_entries le
       JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
       JOIN accounts a ON a."Id" = le."AccountId"
       WHERE a."AccountCode" IN ('1010','1020','1030') AND ${NET_ACTIVE}) AS cash_gl
  `);
  const s = summary.rows[0];
  const invDiff = Number(s.inv_gl) - Number(s.inv_sub);
  const apDiff = Number(s.ap_gl) - Number(s.ap_sub);
  const cashGl = Number(s.cash_gl);

  console.log('\n--- REPORT INTEGRITY REPLICATION (same formulas as UI) ---');
  console.table([
    {
      check: 'Inventory 1300',
      gl: fmt(s.inv_gl),
      subledger: fmt(s.inv_sub),
      delta: fmt(invDiff),
      verdict: Math.abs(invDiff) < 5000 ? 'PASS/WARN' : 'FAIL',
    },
    {
      check: 'AP 2100 (supplier scope)',
      gl: fmt(s.ap_gl),
      subledger: fmt(s.ap_sub),
      delta: fmt(apDiff),
      expense_on_2100_excluded: fmt(s.expense_on_ap),
      verdict: Math.abs(apDiff) < 5000 ? 'PASS/WARN' : 'FAIL',
    },
    {
      check: 'Cash 1010/1020/1030',
      gl: fmt(cashGl),
      subledger: 'N/A (GL only)',
      delta: cashGl < 0 ? fmt(cashGl) : '0',
      verdict: cashGl >= 0 ? 'PASS' : 'FAIL',
    },
  ]);

  await section(
    pool,
    'INVENTORY PROOF: GL 1300 net by ReferenceType (find what adds +20,000 vs batches)',
    `
    SELECT lt."ReferenceType",
           COUNT(DISTINCT lt."Id")::int AS txns,
           COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0) AS net_1300
    FROM ledger_entries le
    JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
    JOIN accounts a ON a."Id" = le."AccountId"
    WHERE a."AccountCode" = '1300' AND ${NET_ACTIVE}
    GROUP BY lt."ReferenceType"
    ORDER BY ABS(COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0)) DESC
    `,
  );

  await section(
    pool,
    'INVENTORY PROOF: CREDIT_NOTE_RETURN / customer return GL on 1300 (batch-not-updated bug pattern)',
    `
    SELECT lt."TransactionNumber", lt."ReferenceNumber", lt."TransactionDate"::date AS dt,
           SUM(le."DebitAmount") - SUM(le."CreditAmount") AS net_1300
    FROM ledger_entries le
    JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
    JOIN accounts a ON a."Id" = le."AccountId"
    WHERE a."AccountCode" = '1300'
      AND lt."ReferenceType" IN ('CREDIT_NOTE_RETURN', 'CREDIT_NOTE')
      AND ${NET_ACTIVE}
    GROUP BY lt."Id", lt."TransactionNumber", lt."ReferenceNumber", lt."TransactionDate"
    HAVING ABS(SUM(le."DebitAmount") - SUM(le."CreditAmount")) > 0.01
    ORDER BY ABS(SUM(le."DebitAmount") - SUM(le."CreditAmount")) DESC
    LIMIT 25
    `,
  );

  await section(
    pool,
    'INVENTORY PROOF: RETURN stock movements vs batch on-hand (posted CNs)',
    `
    SELECT i.invoice_number, p.name AS product_name,
           ili."Quantity"::numeric AS cn_qty, ili."UnitPrice"::numeric AS unit_price,
           COALESCE(SUM(sm.quantity) FILTER (WHERE sm.movement_type = 'RETURN'), 0) AS return_qty,
           COALESCE((
             SELECT SUM(ib.remaining_quantity)
             FROM inventory_batches ib
             WHERE ib.product_id = NULLIF(TRIM(ili."ProductId"), '')::uuid
             AND ib.remaining_quantity > 0
           ), 0) AS batch_qty,
           (ili."Quantity" * ili."UnitPrice") AS cn_line_value,
           CASE
             WHEN COALESCE(SUM(sm.quantity) FILTER (WHERE sm.movement_type = 'RETURN'), 0)
                  < ili."Quantity" - 0.001 THEN 'MOVEMENT_QTY_GAP'
             WHEN COALESCE((
               SELECT SUM(ib.remaining_quantity) FROM inventory_batches ib
               WHERE ib.product_id = ili."ProductId" AND ib.remaining_quantity > 0
             ), 0) < ili."Quantity" - 0.001 THEN 'BATCH_QTY_GAP'
             ELSE 'OK'
           END AS flag
    FROM invoices i
    JOIN invoice_line_items ili ON ili."InvoiceId" = i.id
    JOIN products p ON p.id = ili."ProductId"
    LEFT JOIN stock_movements sm
      ON sm.reference_type = 'CREDIT_NOTE'
     AND sm.reference_id = i.id
     AND sm.product_id = NULLIF(TRIM(ili."ProductId"), '')::uuid
    WHERE i.document_type = 'CREDIT_NOTE'
      AND i.returns_goods = true
      AND i.status = 'POSTED'
      AND NULLIF(TRIM(ili."ProductId"), '') IS NOT NULL
    GROUP BY i.id, i.invoice_number, p.name, ili."ProductId", ili."Quantity", ili."UnitPrice"
    ORDER BY i.invoice_number
    LIMIT 30
    `,
  );

  await section(
    pool,
    'INVENTORY PROOF: GL entries on 1300 near exactly +20,000 net (smoking gun)',
    `
    SELECT lt."TransactionNumber", lt."ReferenceType", lt."ReferenceNumber",
           SUM(le."DebitAmount") - SUM(le."CreditAmount") AS net_1300
    FROM ledger_entries le
    JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
    JOIN accounts a ON a."Id" = le."AccountId"
    WHERE a."AccountCode" = '1300' AND ${NET_ACTIVE}
    GROUP BY lt."Id", lt."TransactionNumber", lt."ReferenceType", lt."ReferenceNumber"
    HAVING ABS((SUM(le."DebitAmount") - SUM(le."CreditAmount")) - 20000) < 1
        OR ABS((SUM(le."DebitAmount") - SUM(le."CreditAmount")) + 20000) < 1
    ORDER BY lt."TransactionNumber"
    LIMIT 20
    `,
  );

  await section(
    pool,
    'CASH PROOF: balance per cash account (1010/1020/1030) — GL vs accounts.CurrentBalance',
    `
    SELECT a."AccountCode", a."AccountName",
           a."CurrentBalance" AS stored_balance,
           COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0) AS gl_balance,
           a."CurrentBalance" - COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0) AS stored_minus_gl
    FROM accounts a
    LEFT JOIN ledger_entries le ON le."AccountId" = a."Id"
    LEFT JOIN ledger_transactions lt ON lt."Id" = le."TransactionId" AND ${NET_ACTIVE}
    WHERE a."AccountCode" IN ('1010','1020','1030')
    GROUP BY a."Id", a."AccountCode", a."AccountName", a."CurrentBalance"
    ORDER BY a."AccountCode"
    `,
  );

  await section(
    pool,
    'CASH PROOF: largest net credits to cash (drive negative balance)',
    `
    SELECT lt."ReferenceType", lt."ReferenceNumber", lt."TransactionDate"::date AS dt,
           SUM(le."CreditAmount") - SUM(le."DebitAmount") AS net_credit_to_cash
    FROM ledger_entries le
    JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
    JOIN accounts a ON a."Id" = le."AccountId"
    WHERE a."AccountCode" IN ('1010','1020','1030') AND ${NET_ACTIVE}
    GROUP BY lt."Id", lt."ReferenceType", lt."ReferenceNumber", lt."TransactionDate"
    ORDER BY net_credit_to_cash DESC
    LIMIT 20
    `,
  );

  await section(
    pool,
    'CASH PROOF: sales completed — sum payments by method vs GL cash debits (classification check)',
    `
    SELECT s.payment_method,
           COUNT(*)::int AS sale_count,
           COALESCE(SUM(s.total_amount), 0) AS sales_total
    FROM sales s
    WHERE s.status = 'COMPLETED'
    GROUP BY s.payment_method
    ORDER BY sales_total DESC
    `,
  );

  await section(
    pool,
    'AP PROOF: GL 2100 net by ReferenceType (excl EXPENSE — matches integrity check)',
    `
    SELECT lt."ReferenceType",
           COUNT(DISTINCT lt."Id")::int AS txns,
           COALESCE(SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0) AS net_ap
    FROM ledger_entries le
    JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
    JOIN accounts a ON a."Id" = le."AccountId"
    WHERE a."AccountCode" = '2100'
      AND lt."ReferenceType" NOT IN ('EXPENSE', 'EXPENSE_PAYMENT')
      AND ${NET_ACTIVE}
    GROUP BY lt."ReferenceType"
    ORDER BY ABS(COALESCE(SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0)) DESC
    `,
  );

  await section(
    pool,
    'AP PROOF: completed GRs without posted supplier bill (3-way match gap)',
    `
    SELECT COUNT(*)::int AS gr_without_posted_bill,
           COALESCE(SUM(gr_value), 0) AS est_gr_value
    FROM (
      SELECT gr.id,
             COALESCE(SUM(gri.received_quantity * gri.cost_price)
               FILTER (WHERE NOT COALESCE(gri.is_bonus, false)), 0) AS gr_value
      FROM goods_receipts gr
      JOIN goods_receipt_items gri ON gri.goods_receipt_id = gr.id
      WHERE gr.status = 'COMPLETED'
        AND NOT EXISTS (
          SELECT 1 FROM supplier_invoice_grn_links sigl
          JOIN supplier_invoices si ON si."Id" = sigl.invoice_id
          WHERE sigl.grn_id = gr.id
            AND si.is_posted_to_gl = TRUE
            AND si.deleted_at IS NULL
        )
      GROUP BY gr.id
      HAVING COALESCE(SUM(gri.received_quantity * gri.cost_price)
        FILTER (WHERE NOT COALESCE(gri.is_bonus, false)), 0) > 0
    ) t
    `,
  );

  await section(
    pool,
    'AP PROOF: supplier OPENING_BALANCE invoices vs GL SUPPLIER_OPENING_BALANCE',
    `
    SELECT
      (SELECT COALESCE(SUM(si."OutstandingBalance"), 0)
       FROM supplier_invoices si
       WHERE si.document_type = 'OPENING_BALANCE'
         AND si.deleted_at IS NULL
         AND UPPER(si."Status") NOT IN ('CANCELLED', 'DELETED')) AS ob_invoice_outstanding,
      (SELECT COALESCE(SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0)
       FROM ledger_entries le
       JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
       JOIN accounts a ON a."Id" = le."AccountId"
       WHERE a."AccountCode" = '2100'
         AND lt."ReferenceType" = 'SUPPLIER_OPENING_BALANCE'
         AND ${NET_ACTIVE}) AS ob_gl_net
    `,
  );

  await section(
    pool,
    'AP PROOF: top 15 suppliers GL(entity) minus invoice outstanding (|drift| > 10k)',
    `
    WITH gl_by_supplier AS (
      SELECT le."EntityId"::uuid AS supplier_id,
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
        AND UPPER(si."Status") NOT IN ('PAID', 'CANCELLED', 'DELETED')
      GROUP BY si."SupplierId"
    )
    SELECT s."CompanyName", g.gl_bal, COALESCE(i.inv_bal, 0) AS invoice_bal,
           g.gl_bal - COALESCE(i.inv_bal, 0) AS drift
    FROM gl_by_supplier g
    JOIN suppliers s ON s."Id" = g.supplier_id
    LEFT JOIN inv i ON i.supplier_id = g.supplier_id
    WHERE ABS(g.gl_bal - COALESCE(i.inv_bal, 0)) > 10000
    ORDER BY ABS(g.gl_bal - COALESCE(i.inv_bal, 0)) DESC
    LIMIT 15
    `,
  );

  await section(
    pool,
    'AP PROOF: GL entries near +710,000 net on 2100 (single-txn smoking gun)',
    `
    SELECT lt."TransactionNumber", lt."ReferenceType", lt."ReferenceNumber",
           SUM(le."CreditAmount") - SUM(le."DebitAmount") AS net_ap
    FROM ledger_entries le
    JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
    JOIN accounts a ON a."Id" = le."AccountId"
    WHERE a."AccountCode" = '2100'
      AND lt."ReferenceType" NOT IN ('EXPENSE', 'EXPENSE_PAYMENT')
      AND ${NET_ACTIVE}
    GROUP BY lt."Id", lt."TransactionNumber", lt."ReferenceType", lt."ReferenceNumber"
    HAVING ABS((SUM(le."CreditAmount") - SUM(le."DebitAmount")) - 710000) < 1000
        OR ABS(SUM(le."CreditAmount") - SUM(le."DebitAmount")) BETWEEN 700000 AND 720000
    ORDER BY ABS(SUM(le."CreditAmount") - SUM(le."DebitAmount")) DESC
    LIMIT 15
    `,
  );

  console.log('\n--- INTERPRETATION ---');
  console.log(
    'Inventory Δ>0: GL 1300 > batch subledger → GL posted without batch qty (e.g. CN return before heal).',
  );
  console.log(
    'Cash negative: real GL credits exceed debits on 1010/1020/1030 — list largest net_credit_to_cash rows.',
  );
  console.log(
    'AP Δ>0: GL 2100 > invoices → GR/OB on GL without matching supplier_invoices, or legacy GR→AP postings.',
  );
  await section(
    pool,
    'GPB vs LEDGER (Balance sheet totals check — can show 20k on 1300 if GPB stale)',
    `
    WITH gpb AS (
      SELECT a."AccountCode",
             COALESCE(SUM(gpb.credit_total) - SUM(gpb.debit_total), 0) AS bal
      FROM accounts a
      LEFT JOIN gl_period_balances gpb ON gpb.account_id = a."Id"
      WHERE a."AccountCode" IN ('1200', '2100', '1300')
      GROUP BY a."AccountCode"
    ),
    le AS (
      SELECT a."AccountCode",
             COALESCE(SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0) AS bal
      FROM accounts a
      JOIN ledger_entries le ON le."AccountId" = a."Id"
      JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
      WHERE a."AccountCode" IN ('1200', '2100', '1300')
        AND ${NET_ACTIVE}
      GROUP BY a."AccountCode"
    )
    SELECT COALESCE(gpb."AccountCode", le."AccountCode") AS code,
           COALESCE(gpb.bal, 0) AS gpb_balance,
           COALESCE(le.bal, 0) AS ledger_balance,
           COALESCE(gpb.bal, 0) - COALESCE(le.bal, 0) AS gpb_minus_ledger
    FROM gpb
    FULL OUTER JOIN le ON le."AccountCode" = gpb."AccountCode"
    ORDER BY 1
    `,
  );

  console.log('\nDone.');
} catch (e) {
  console.error(e?.message || e);
  process.exit(1);
} finally {
  await pool.end();
}
