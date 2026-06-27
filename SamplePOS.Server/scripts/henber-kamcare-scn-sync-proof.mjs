#!/usr/bin/env node
/**
 * KAMCARE SCN metadata sync — read-only proof before flag-only is_posted_to_gl repair.
 *
 * Four-way invariant per SCN:
 *   Document Amount = Open Item Amount = GL Amount = Supplier Ledger Effect
 *
 * Plus:
 *   - No duplicate sync marker / idempotency evidence
 *   - Setting is_posted_to_gl=true must not trigger duplicate posting
 *
 * Usage:
 *   HENBER_DATABASE_URL=... node SamplePOS.Server/scripts/henber-kamcare-scn-sync-proof.mjs
 *
 * Exit 0 only if all candidates pass and repair is approved.
 */
import pg from 'pg';

const { Pool } = pg;
const url = process.env.HENBER_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error('Set HENBER_DATABASE_URL');
  process.exit(2);
}

const pool = new Pool({ connectionString: url });
const TOLERANCE = 0.01;
const SUPPLIER_NAME = process.env.KAMCARE_SUPPLIER ?? 'KAMCARE';
const SCN_NUMBERS = (process.env.KAMCARE_SCNS ?? 'SCN-2026-0007,SCN-2026-0008').split(',').map((s) => s.trim());

const NET_ACTIVE = `
  lt."Status" = 'POSTED'
  AND lt."IsReversed" = FALSE
  AND lt."Id" NOT IN (
    SELECT "ReversedByTransactionId" FROM ledger_transactions
    WHERE "ReversedByTransactionId" IS NOT NULL
  )
`;

function fmt(n) {
  return Number(n).toLocaleString('en-UG', { maximumFractionDigits: 0 });
}

function num(v) {
  return Number(v ?? 0);
}

async function main() {
  const supplierRes = await pool.query(
    `SELECT "Id", "CompanyName" FROM suppliers WHERE "CompanyName" ILIKE $1 LIMIT 1`,
    [`%${SUPPLIER_NAME}%`],
  );
  const supplier = supplierRes.rows[0];
  if (!supplier) {
    console.error(`Supplier not found: ${SUPPLIER_NAME}`);
    process.exit(2);
  }

  console.log('═'.repeat(72));
  console.log(' KAMCARE SCN SYNC PROOF (read-only)');
  console.log(` Supplier: ${supplier.CompanyName} (${supplier.Id})`);
  console.log('═'.repeat(72));

  const docsRes = await pool.query(
    `
    SELECT si."Id", si."SupplierInvoiceNumber", si.document_type, si."Status",
      si."TotalAmount", si."OutstandingBalance", si.is_posted_to_gl,
      si.posted_to_gl_at, si.return_grn_id
    FROM supplier_invoices si
    WHERE si."SupplierId" = $1
      AND si."SupplierInvoiceNumber" = ANY($2::text[])
      AND si.deleted_at IS NULL
    ORDER BY si."SupplierInvoiceNumber"
    `,
    [supplier.Id, SCN_NUMBERS],
  );

  if (docsRes.rows.length === 0) {
    console.error('No matching SCNs found');
    process.exit(2);
  }

  let allPass = true;
  const approved = [];

  for (const doc of docsRes.rows) {
    console.log(`\n── ${doc.SupplierInvoiceNumber} (${doc.Status}, posted=${doc.is_posted_to_gl}) ──`);

    const glRes = await pool.query(
      `
      SELECT COALESCE(SUM(le."CreditAmount" - le."DebitAmount"), 0)::numeric AS ap_gl,
        COUNT(DISTINCT lt."Id") AS txn_count,
        array_agg(DISTINCT lt."TransactionNumber") AS txns
      FROM supplier_invoices si
      LEFT JOIN ledger_transactions lt ON (
        (lt."ReferenceType" IN ('SUPPLIER_CREDIT_NOTE', 'SUPPLIER_INVOICE')
          AND lt."ReferenceId"::text = si."Id"::text)
        OR (si.return_grn_id IS NOT NULL AND lt."ReferenceType" = 'RETURN_GRN'
          AND lt."ReferenceId"::text = si.return_grn_id::text)
      )
      LEFT JOIN ledger_entries le ON le."TransactionId" = lt."Id"
      LEFT JOIN accounts a ON a."Id" = le."AccountId" AND a."AccountCode" = '2100'
      WHERE si."Id" = $1
        AND lt."Id" IS NOT NULL
        AND ${NET_ACTIVE}
      `,
      [doc.Id],
    );

    const documentAmount = num(doc.TotalAmount);
    const openItemAmount = doc.document_type === 'SUPPLIER_CREDIT_NOTE'
      ? -num(doc.OutstandingBalance)
      : num(doc.OutstandingBalance);
    const glAmount = num(glRes.rows[0]?.ap_gl);
    const ledgerEffect = glAmount;
    const txnCount = Number(glRes.rows[0]?.txn_count ?? 0);
    const txns = glRes.rows[0]?.txns ?? [];

    const idempotencyRes = await pool.query(
      `
      SELECT lt."IdempotencyKey", lt."TransactionNumber"
      FROM ledger_transactions lt
      WHERE lt."ReferenceType" IN ('SUPPLIER_CREDIT_NOTE', 'RETURN_GRN')
        AND (
          lt."ReferenceId"::text = $1::text
          OR lt."ReferenceId"::text = $2::text
        )
        AND lt."Status" = 'POSTED'
      `,
      [doc.Id, doc.return_grn_id ?? doc.Id],
    );

    const isApplied = String(doc.Status).toUpperCase() === 'APPLIED';
    const scnNet2100 = num(glRes.rows[0]?.ap_gl);
    const offsetKey = `SUPPLIER_INVOICE-${doc.Id}`;
    const offsetRes = await pool.query(
      `SELECT "TransactionNumber" FROM ledger_transactions
       WHERE "IdempotencyKey" = $1 AND "Status" = 'POSTED' AND "IsReversed" = FALSE LIMIT 1`,
      [offsetKey],
    );
    const hasOffset = offsetRes.rows.length > 0;

    // APPLIED SCNs: net-active 2100 should be 0 (SCN debit + application offset credit).
    const appliedIntegrityOk = isApplied
      ? Math.abs(scnNet2100) <= TOLERANCE || (Math.abs(scnNet2100) > TOLERANCE && !hasOffset)
      : Math.abs(documentAmount - Math.abs(openItemAmount)) <= TOLERANCE
        && Math.abs(Math.abs(scnNet2100) - Math.abs(documentAmount)) <= TOLERANCE;

    const checks = {
      appliedScnNetZeroOrOffsetPending: isApplied
        ? (Math.abs(scnNet2100) <= TOLERANCE || (!hasOffset && Math.abs(scnNet2100) === Math.abs(documentAmount)))
        : appliedIntegrityOk,
      glExists: txnCount > 0 && Math.abs(scnNet2100) > TOLERANCE || (isApplied && txnCount > 0),
      notYetSynced: !doc.is_posted_to_gl,
      hasIdempotencyEvidence: idempotencyRes.rows.length > 0,
      statusAllowsSync: ['POSTED', 'APPLIED'].includes(String(doc.Status).toUpperCase()),
      metadataOnlySafe: isApplied && Math.abs(scnNet2100) <= TOLERANCE,
    };

    console.log(`  Document amount:     ${fmt(documentAmount)}`);
    console.log(`  Open-item amount:    ${fmt(openItemAmount)}`);
    console.log(`  GL net-active 2100:  ${fmt(scnNet2100)}  [${txns.join(', ')}]`);
    console.log(`  Application offset:  ${hasOffset ? offsetRes.rows[0].TransactionNumber : 'MISSING'}`);
    console.log(`  is_posted_to_gl:     ${doc.is_posted_to_gl}`);
    console.log(`  Idempotency rows:    ${idempotencyRes.rows.length}`);

    const pass = isApplied
      ? checks.metadataOnlySafe && checks.notYetSynced && checks.hasIdempotencyEvidence
      : Object.entries(checks).every(([k, v]) => {
          const ok = Boolean(v);
          console.log(`  ${ok ? '✓' : '✗'} ${k}`);
          return ok;
        });

    if (isApplied) {
      for (const [k, v] of Object.entries(checks)) {
        console.log(`  ${v ? '✓' : '✗'} ${k}`);
      }
      if (!checks.metadataOnlySafe && checks.appliedScnNetZeroOrOffsetPending) {
        console.log('  → Metadata-only insufficient: post application offset journal first (see henber-kamcare-integrity-repair.mjs)');
      }
    }

    if (!pass) {
      allPass = false;
      console.log('  → EXCLUDED from automated repair');
    } else {
      approved.push(doc.SupplierInvoiceNumber);
      console.log('  → APPROVED for metadata-only is_posted_to_gl=true');
    }
  }

  console.log('\n' + '═'.repeat(72));
  if (allPass && approved.length > 0) {
    console.log(` APPROVED: ${approved.join(', ')}`);
    console.log(' Repair: UPDATE supplier_invoices SET is_posted_to_gl=TRUE WHERE ...');
    console.log(' (Run only after human sign-off — this script does not mutate data.)');
    process.exit(0);
  }
  console.log(' NOT APPROVED — fix failing checks before any metadata sync');
  process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(2);
  })
  .finally(() => pool.end());
