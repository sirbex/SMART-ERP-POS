#!/usr/bin/env node
/**
 * Read-only root-cause trace — GL vs AR open-item posting integrity.
 * No remediation. Writes findings to stdout.
 */
import pg from 'pg';
import { resolveVerificationEnvironment } from '../../scripts/lib/production-verification-guard.mjs';

const { henberDatabaseUrl } = resolveVerificationEnvironment({
  scriptName: 'Henber AR root-cause trace',
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

try {
  const caseId = '43eecb7b-e537-45b9-9119-641c4d1bb525';

  console.log('=== Case Hospital — chronological document → GL → open-item ===\n');

  const sales = await pool.query(
    `
    SELECT s.id, s.sale_number, s.sale_date, s.payment_method, s.total_amount, s.amount_paid,
           s.customer_id, s.status, s.created_at,
           i.id AS invoice_id, i.invoice_number, i.amount_due, i.status AS inv_status
    FROM sales s
    LEFT JOIN invoices i ON i.sale_id = s.id
    WHERE s.customer_id = $1
    ORDER BY s.created_at ASC
    `,
    [caseId],
  );

  let runningGlScoped = 0;
  let runningGlTotal = 0;
  let runningOi = 0;

  for (const s of sales.rows) {
    const gl = await pool.query(
      `
      SELECT lt."Id" AS txn_id, lt."TransactionNumber", lt."ReferenceType",
             lt."TransactionDate", lt."Status", lt."IsReversed",
             le."EntityType", le."EntityId",
             SUM(le."DebitAmount" - le."CreditAmount")::numeric AS net_1200
      FROM ledger_transactions lt
      JOIN ledger_entries le ON le."TransactionId" = lt."Id"
      JOIN accounts a ON a."Id" = le."AccountId"
      WHERE a."AccountCode" = '1200'
        AND lt."ReferenceId"::text = $1::text
        AND ${NET_ACTIVE}
      GROUP BY lt."Id", lt."TransactionNumber", lt."ReferenceType", lt."TransactionDate",
               lt."Status", lt."IsReversed", le."EntityType", le."EntityId"
      `,
      [s.id],
    );

    const glNet = gl.rows.reduce((a, r) => a + Number(r.net_1200), 0);
    const glScoped = gl.rows
      .filter((r) => r.EntityType && String(r.EntityType).toUpperCase() === 'CUSTOMER')
      .reduce((a, r) => a + Number(r.net_1200), 0);

    runningGlTotal += glNet;
    runningGlScoped += glScoped;

    console.log(`--- ${s.sale_number} (${s.sale_date?.toISOString?.()?.slice(0, 10) ?? s.sale_date}) ---`);
    console.log(`  payment_method=${s.payment_method} total=${fmt(s.total_amount)} customer_id=${s.customer_id}`);
    console.log(`  invoice=${s.invoice_number ?? '—'} status=${s.inv_status ?? '—'} amount_due=${fmt(s.amount_due)}`);
    if (gl.rows.length === 0) {
      console.log('  GL 1200: **NONE** (first divergence candidate if invoice has amount_due)');
    } else {
      for (const r of gl.rows) {
        console.log(
          `  GL ${r.TransactionNumber} ref=${r.ReferenceType} net_1200=${fmt(r.net_1200)} entity=${r.EntityType ?? 'NULL'}/${(r.EntityId || '—').slice(0, 8)}`,
        );
      }
    }
    console.log(`  cumulative GL(total)=${fmt(runningGlTotal)} GL(customer-scoped)=${fmt(runningGlScoped)}`);
    console.log('');
  }

  const oiNow = await pool.query(
    `
    SELECT COALESCE(SUM(amount_due), 0)::numeric AS v
    FROM invoices
    WHERE customer_id = $1
      AND COALESCE(document_type, 'INVOICE') IN ('INVOICE', 'OPENING_BALANCE')
      AND status NOT IN ('CANCELLED', 'VOIDED', 'DRAFT')
    `,
    [caseId],
  );
  console.log(`Open-item subledger today: UGX ${fmt(oiNow.rows[0].v)}`);
  console.log(`Customer-scoped GL today:   UGX ${fmt(runningGlScoped)} (should match open-item if tagging correct)`);
  console.log(`Total GL on 1200 (sales):   UGX ${fmt(runningGlTotal)}`);
  console.log('');

  console.log('=== Drift classification — scoped vs total GL per customer ===\n');
  const classify = await pool.query(`
    WITH gl_cust AS (
      SELECT NULLIF(TRIM(le."EntityId"), '')::uuid AS cid,
        COALESCE(SUM(le."DebitAmount" - le."CreditAmount"), 0) AS gl
      FROM ledger_entries le
      JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
      JOIN accounts a ON a."Id" = le."AccountId"
      WHERE a."AccountCode" = '1200' AND UPPER(le."EntityType") = 'CUSTOMER'
        AND le."EntityId" IS NOT NULL AND ${NET_ACTIVE}
      GROUP BY le."EntityId"
    ),
    gl_untagged_sale AS (
      SELECT s.customer_id::uuid AS cid,
        COALESCE(SUM(le."DebitAmount" - le."CreditAmount"), 0) AS untagged
      FROM ledger_entries le
      JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
      JOIN accounts a ON a."Id" = le."AccountId"
      JOIN sales s ON s.id::text = lt."ReferenceId"::text
      WHERE a."AccountCode" = '1200' AND lt."ReferenceType" = 'SALE'
        AND (le."EntityId" IS NULL OR UPPER(COALESCE(le."EntityType", '')) != 'CUSTOMER')
        AND ${NET_ACTIVE}
      GROUP BY s.customer_id
    ),
    open_item AS (
      SELECT c.id, c.name,
        GREATEST(0,
          COALESCE((SELECT SUM(i.amount_due) FROM invoices i
            WHERE i.customer_id = c.id
              AND COALESCE(i.document_type, 'INVOICE') IN ('INVOICE', 'OPENING_BALANCE')
              AND i.status NOT IN ('CANCELLED', 'VOIDED', 'DRAFT')), 0)
          - COALESCE((SELECT SUM(p.unallocated_amount) FROM ar_customer_payments p
            WHERE p.customer_id = c.id
              AND p.status IN ('POSTED', 'PARTIALLY_ALLOCATED', 'FULLY_ALLOCATED')), 0)
        ) AS oi
      FROM customers c WHERE c.is_active = true
    )
    SELECT oi.name,
      COALESCE(gc.gl, 0) AS gl_scoped,
      COALESCE(gu.untagged, 0) AS untagged_sale_gl,
      oi.oi AS open_item,
      (COALESCE(gc.gl, 0) - oi.oi) AS scoped_drift,
      (COALESCE(gc.gl, 0) + COALESCE(gu.untagged, 0) - oi.oi) AS total_customer_gl_vs_oi
    FROM open_item oi
    LEFT JOIN gl_cust gc ON gc.cid = oi.id
    LEFT JOIN gl_untagged_sale gu ON gu.cid = oi.id
    WHERE ABS(COALESCE(gc.gl, 0) - oi.oi) > 0.01
       OR ABS(COALESCE(gc.gl, 0) + COALESCE(gu.untagged, 0) - oi.oi) > 0.01
    ORDER BY ABS(COALESCE(gc.gl, 0) - oi.oi) DESC
    LIMIT 12
  `);
  console.table(
    classify.rows.map((r) => ({
      customer: r.name,
      gl_scoped: fmt(r.gl_scoped),
      untagged_sale_gl: fmt(r.untagged_sale_gl),
      open_item: fmt(r.open_item),
      scoped_drift: fmt(r.scoped_drift),
      total_gl_vs_oi: fmt(r.total_customer_gl_vs_oi),
      root_cause:
        Number(r.untagged_sale_gl) !== 0 && Math.abs(Number(r.total_customer_gl_vs_oi)) < 1
          ? 'UNTAGGED_GL (metadata)'
          : Math.abs(Number(r.total_customer_gl_vs_oi)) > 0.01
            ? 'TRUE_GL_SUBLEDGER_GAP'
            : 'OTHER',
    })),
  );

  console.log('\n=== Root cause buckets — financial impact ===\n');
  const buckets = await pool.query(`
    WITH     untagged AS (
      SELECT COALESCE(SUM(le."DebitAmount" - le."CreditAmount"), 0) AS sale_v
      FROM ledger_entries le
      JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
      JOIN accounts a ON a."Id" = le."AccountId"
      JOIN sales s ON s.id::text = lt."ReferenceId"::text
      WHERE a."AccountCode" = '1200' AND lt."ReferenceType" = 'SALE'
        AND s.customer_id IS NOT NULL
        AND (le."EntityId" IS NULL OR UPPER(COALESCE(le."EntityType", '')) != 'CUSTOMER')
        AND ${NET_ACTIVE}
    ),
    untagged_payments AS (
      SELECT COALESCE(SUM(le."DebitAmount" - le."CreditAmount"), 0) AS pay_v
      FROM ledger_entries le
      JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
      JOIN accounts a ON a."Id" = le."AccountId"
      WHERE a."AccountCode" = '1200' AND lt."ReferenceType" = 'INVOICE_PAYMENT'
        AND (le."EntityId" IS NULL OR UPPER(COALESCE(le."EntityType", '')) != 'CUSTOMER')
        AND ${NET_ACTIVE}
    ),
    untagged_refunds AS (
      SELECT COALESCE(SUM(le."DebitAmount" - le."CreditAmount"), 0) AS refund_v
      FROM ledger_entries le
      JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
      JOIN accounts a ON a."Id" = le."AccountId"
      WHERE a."AccountCode" = '1200' AND lt."ReferenceType" IN ('SALE_REFUND', 'SALE_REFUND_CORRECTION')
        AND (le."EntityId" IS NULL OR UPPER(COALESCE(le."EntityType", '')) != 'CUSTOMER')
        AND ${NET_ACTIVE}
    )
    SELECT sale_v, pay_v, refund_v FROM untagged, untagged_payments, untagged_refunds
  `);
  const b = buckets.rows[0];
  console.log(`Untagged CREDIT SALE GL on 1200:     UGX ${fmt(b.sale_v)}`);
  console.log(`Untagged INVOICE_PAYMENT on 1200:    UGX ${fmt(b.pay_v)}`);
  console.log(`Untagged SALE_REFUND* on 1200:       UGX ${fmt(b.refund_v)}`);
  console.log(`  → These explain customerScopeDrift without changing integrityGlDrift (total GL still matches).`);
} finally {
  await pool.end();
}
