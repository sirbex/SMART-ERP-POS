#!/usr/bin/env node
/** Complete KAMCARE metadata cleanup after offset journal (TXN-018907). */
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.HENBER_DATABASE_URL,
});
const DRY_RUN = process.env.DRY_RUN !== '0';

const supplier = (await pool.query(
  `SELECT "Id" FROM suppliers WHERE "CompanyName" ILIKE '%KAMCARE%' LIMIT 1`,
)).rows[0];

const client = await pool.connect();
try {
  if (!DRY_RUN) await client.query('BEGIN');

  const scn = await client.query(
    `UPDATE supplier_invoices
     SET is_posted_to_gl = TRUE, posted_to_gl_at = COALESCE(posted_to_gl_at, NOW()), "UpdatedAt" = NOW()
     WHERE "SupplierInvoiceNumber" IN ('SCN-2026-0007', 'SCN-2026-0008')
       AND COALESCE(is_posted_to_gl, FALSE) = FALSE
     RETURNING "SupplierInvoiceNumber"`,
  );

  const bills = await client.query(
    `UPDATE supplier_invoices
     SET "OutstandingBalance" = 0, "UpdatedAt" = NOW()
     WHERE "SupplierInvoiceNumber" IN ('SBILL-2026-0252', 'SBILL-2026-0382')
       AND "OutstandingBalance" < -0.01
     RETURNING "SupplierInvoiceNumber", "OutstandingBalance"`,
  );

  if (!DRY_RUN) {
    await client.query(
      `UPDATE suppliers s SET "OutstandingBalance" = (
        SELECT COALESCE(SUM(
          CASE WHEN si.document_type = 'SUPPLIER_CREDIT_NOTE'
            THEN -GREATEST(COALESCE(si."OutstandingBalance", 0), 0)
            ELSE GREATEST(COALESCE(si."OutstandingBalance", 0), 0) END
        ), 0)
        FROM supplier_invoices si
        WHERE si."SupplierId" = s."Id" AND si.deleted_at IS NULL
          AND UPPER(si."Status") NOT IN ('PAID', 'CANCELLED', 'DELETED', 'DRAFT')
      ), "UpdatedAt" = NOW()
      WHERE s."Id" = $1`,
      [supplier.Id],
    );
    await client.query('COMMIT');
  }

  console.log(DRY_RUN ? 'DRY RUN' : 'LIVE');
  console.log('SCNs synced:', scn.rows);
  console.log('Bills fixed:', bills.rows);
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
} finally {
  client.release();
}

const { captureApReconciliationMetrics } = await import(
  '../dist/SamplePOS.Server/src/modules/supplier-payments/apReconciliationMetrics.js'
);
const m = await captureApReconciliationMetrics(pool);
console.log(`integrityGlDrift: ${m.integrityGlDrift}`);
await pool.end();
