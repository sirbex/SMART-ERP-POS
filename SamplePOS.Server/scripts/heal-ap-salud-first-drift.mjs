#!/usr/bin/env node
/**
 * Heal AP integrity rows:
 *  - SALUD: SCN/SDN with GL posted but is_posted_to_gl=false (excludes from open-item)
 *  - FIRST: SBILL-2026-0758 / TXN dated 2027-07-14 → 2026-07-14
 *
 *   HENBER_DATABASE_URL=... node SamplePOS.Server/scripts/heal-ap-salud-first-drift.mjs
 *   DRY_RUN=1 ...  (default: dry run)
 *   APPLY=1 ...    (mutate)
 */
import pg from 'pg';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
function loadEnv(p) {
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv(resolve(root, 'SamplePOS.Server/.env'));
loadEnv(resolve(root, '.env'));
loadEnv(resolve(root, '.env.proof.production'));
loadEnv(resolve(root, 'SamplePOS.Server/.env.proof.production'));

const APPLY = process.env.APPLY === '1';
const url = process.env.HENBER_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error('HENBER_DATABASE_URL or DATABASE_URL required');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url });
const fmt = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
const SALUD = '4aaa54bf-c802-45d3-8a64-02e73e2172ac';
const FIRST = '23cd29c0-41bc-433e-af98-8fc59ed2666a';
const asOf = new Date().toISOString().slice(0, 10);

async function integrityRow(supplierId) {
  const gl = await pool.query(
    `SELECT COALESCE(SUM(le."CreditAmount" - le."DebitAmount"), 0)::float8 AS gl
     FROM ledger_entries le
     JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
     JOIN accounts a ON a."Id" = le."AccountId"
     WHERE a."AccountCode" = '2100'
       AND UPPER(le."EntityType") = 'SUPPLIER'
       AND NULLIF(TRIM(le."EntityId"), '')::uuid = $1::uuid
       AND lt."ReferenceType" NOT IN ('EXPENSE', 'EXPENSE_PAYMENT')
       AND lt."Status" = 'POSTED' AND lt."IsReversed" = FALSE
       AND lt."Id" NOT IN (SELECT "ReversedByTransactionId" FROM ledger_transactions WHERE "ReversedByTransactionId" IS NOT NULL)
       AND lt."TransactionDate"::DATE <= $2::date`,
    [supplierId, asOf],
  );
  const open = await pool.query(
    `SELECT COALESCE(SUM(
        CASE WHEN si.document_type = 'SUPPLIER_CREDIT_NOTE'
          THEN -COALESCE(si."OutstandingBalance", 0)
          ELSE COALESCE(si."OutstandingBalance", 0) END
      ), 0)::float8 AS inv
     FROM supplier_invoices si
     WHERE si."SupplierId" = $1 AND si.deleted_at IS NULL
       AND COALESCE(si.is_posted_to_gl, FALSE) = TRUE
       AND si."InvoiceDate"::DATE <= $2::date
       AND (
         UPPER(si."Status") NOT IN ('PAID','CANCELLED','DELETED','DRAFT')
         OR (UPPER(si."Status") = 'PAID' AND COALESCE(si."OutstandingBalance",0) < -0.009)
       )`,
    [supplierId, asOf],
  );
  const g = Number(gl.rows[0].gl);
  const o = Number(open.rows[0].inv);
  return { gl: g, open: o, diff: g - o };
}

try {
  console.log('═'.repeat(64));
  console.log(` AP heal SALUD + FIRST  mode=${APPLY ? 'APPLY' : 'DRY_RUN'}  asOf=${asOf}`);
  console.log('═'.repeat(64));

  const beforeS = await integrityRow(SALUD);
  const beforeF = await integrityRow(FIRST);
  console.log('BEFORE SALUD', beforeS);
  console.log('BEFORE FIRST', beforeF);

  const orphans = await pool.query(
    `SELECT si."Id", si."SupplierInvoiceNumber" AS num, si.document_type, si."Status",
            si."OutstandingBalance"::float8 AS ob, s."CompanyName" AS supplier
     FROM supplier_invoices si
     JOIN suppliers s ON s."Id" = si."SupplierId"
     WHERE si.document_type IN ('SUPPLIER_CREDIT_NOTE', 'SUPPLIER_DEBIT_NOTE')
       AND COALESCE(si.is_posted_to_gl, FALSE) = FALSE
       AND UPPER(si."Status") IN ('POSTED', 'APPLIED')
       AND si.deleted_at IS NULL
       AND EXISTS (
         SELECT 1 FROM ledger_transactions lt
         WHERE lt."ReferenceType" = si.document_type
           AND lt."Status" = 'POSTED' AND lt."IsReversed" = FALSE
           AND (lt."ReferenceId" = si."Id" OR lt."ReferenceNumber" = si."SupplierInvoiceNumber")
       )
     ORDER BY s."CompanyName", si."SupplierInvoiceNumber"`,
  );
  console.log(`\nNotes with GL but is_posted_to_gl=false: ${orphans.rows.length}`);
  for (const r of orphans.rows.slice(0, 30)) {
    console.log(`  ${r.supplier}  ${r.num}  ${r.Status}  OB=${fmt(r.ob)}`);
  }

  const futureBill = await pool.query(
    `SELECT si."Id", si."SupplierInvoiceNumber", si."InvoiceDate"::date::text AS inv_date,
            si."Status", si."OutstandingBalance"::float8 AS ob
     FROM supplier_invoices si
     WHERE si."Id" IN (
       SELECT NULLIF(TRIM(le."EntityId"),'')::uuid
       FROM ledger_entries le
       JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
       WHERE lt."ReferenceNumber" = 'SBILL-2026-0758'
       LIMIT 1
     )
     OR si."SupplierInvoiceNumber" = 'SBILL-2026-0758'`,
  );
  console.log('\nFIRST SBILL-2026-0758:', futureBill.rows[0] || '(missing)');

  const futureTxn = await pool.query(
    `SELECT lt."Id", lt."TransactionNumber", lt."TransactionDate"::date::text AS d
     FROM ledger_transactions lt
     WHERE lt."ReferenceNumber" = 'SBILL-2026-0758'
       AND lt."ReferenceType" = 'SUPPLIER_INVOICE'
       AND lt."Status" = 'POSTED'`,
  );
  console.log('GL txns for SBILL-2026-0758:', futureTxn.rows);

  if (!APPLY) {
    console.log('\nDry run only. Re-run with APPLY=1 to mutate.');
    process.exit(0);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const flag = await client.query(
      `UPDATE supplier_invoices si
       SET is_posted_to_gl = TRUE,
           posted_to_gl_at = COALESCE(posted_to_gl_at, NOW()),
           "UpdatedAt" = NOW()
       WHERE si.document_type IN ('SUPPLIER_CREDIT_NOTE', 'SUPPLIER_DEBIT_NOTE')
         AND COALESCE(si.is_posted_to_gl, FALSE) = FALSE
         AND UPPER(si."Status") IN ('POSTED', 'APPLIED')
         AND si.deleted_at IS NULL
         AND EXISTS (
           SELECT 1 FROM ledger_transactions lt
           WHERE lt."ReferenceType" = si.document_type
             AND lt."Status" = 'POSTED' AND lt."IsReversed" = FALSE
             AND (lt."ReferenceId" = si."Id" OR lt."ReferenceNumber" = si."SupplierInvoiceNumber")
         )
       RETURNING si."SupplierInvoiceNumber" AS num, si."SupplierId"`,
    );
    console.log(`\nFlagged is_posted_to_gl=TRUE on ${flag.rowCount} notes`);

    const inv = await client.query(
      `UPDATE supplier_invoices
       SET "InvoiceDate" = '2026-07-14',
           "UpdatedAt" = NOW()
       WHERE "SupplierInvoiceNumber" = 'SBILL-2026-0758'
         AND "InvoiceDate"::date = '2027-07-14'
       RETURNING "Id", "SupplierInvoiceNumber", "InvoiceDate"::date::text`,
    );
    console.log('Fixed invoice dates:', inv.rows);

    const txn = await client.query(
      `UPDATE ledger_transactions
       SET "TransactionDate" = '2026-07-14',
           "UpdatedAt" = NOW()
       WHERE "ReferenceNumber" = 'SBILL-2026-0758'
         AND "ReferenceType" = 'SUPPLIER_INVOICE'
         AND "TransactionDate"::date = '2027-07-14'
         AND "Status" = 'POSTED'
       RETURNING "TransactionNumber", "TransactionDate"::date::text`,
    );
    console.log('Fixed GL txn dates:', txn.rows);

    // Recalc supplier caches for touched suppliers
    const supplierIds = new Set([SALUD, FIRST, ...flag.rows.map((r) => r.SupplierId)]);
    for (const id of supplierIds) {
      if (!id) continue;
      await client.query(
        `UPDATE suppliers s
         SET "OutstandingBalance" = GREATEST(0, COALESCE((
           SELECT SUM(
             CASE WHEN si.document_type = 'SUPPLIER_CREDIT_NOTE'
               THEN -COALESCE(si."OutstandingBalance", 0)
               ELSE COALESCE(si."OutstandingBalance", 0) END
           )
           FROM supplier_invoices si
           WHERE si."SupplierId" = s."Id" AND si.deleted_at IS NULL
             AND COALESCE(si.is_posted_to_gl, FALSE) = TRUE
             AND (
               UPPER(si."Status") NOT IN ('PAID','CANCELLED','DELETED','DRAFT')
               OR (UPPER(si."Status") = 'PAID' AND COALESCE(si."OutstandingBalance",0) < -0.009)
             )
         ), 0)),
         "UpdatedAt" = NOW()
         WHERE s."Id" = $1`,
        [id],
      );
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  const afterS = await integrityRow(SALUD);
  const afterF = await integrityRow(FIRST);
  console.log('\nAFTER SALUD', afterS);
  console.log('AFTER FIRST', afterF);
} finally {
  await pool.end();
}
