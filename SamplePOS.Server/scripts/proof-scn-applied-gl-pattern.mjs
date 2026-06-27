#!/usr/bin/env node
/**
 * Read-only proof: compare APPLIED supplier credit note GL patterns.
 *
 * Verifies that offset journals (SUPPLIER_INVOICE idempotency on SCN id)
 * match the expected posting template for applied credits.
 *
 * Usage:
 *   DATABASE_URL=... node scripts/proof-scn-applied-gl-pattern.mjs
 *   SCN_NUMBERS=SCN-2026-0007,SCN-2026-0008 node scripts/...
 *
 * Exit 0 when all SCNs share the same net-active 2100 pattern class.
 */
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || process.env.HENBER_DATABASE_URL,
});
const SCNS = (process.env.SCN_NUMBERS ?? 'SCN-2026-0007,SCN-2026-0008')
  .split(',')
  .map((s) => s.trim());

const NET_ACTIVE = `
  lt."Status" = 'POSTED'
  AND lt."IsReversed" = FALSE
  AND lt."Id" NOT IN (
    SELECT "ReversedByTransactionId" FROM ledger_transactions
    WHERE "ReversedByTransactionId" IS NOT NULL
  )
`;

async function scnProfile(client, scnNo) {
  const doc = await client.query(
    `
    SELECT si."Id", si."SupplierInvoiceNumber", si."Status", si."TotalAmount",
      si.is_posted_to_gl, si.reference_invoice_id, ref."SupplierInvoiceNumber" AS ref_bill
    FROM supplier_invoices si
    LEFT JOIN supplier_invoices ref ON ref."Id" = si.reference_invoice_id
    WHERE si."SupplierInvoiceNumber" = $1 AND si.deleted_at IS NULL`,
    [scnNo],
  );
  if (!doc.rows[0]) return null;

  const txns = await client.query(
    `
    SELECT lt."TransactionNumber", lt."ReferenceType", lt."PostingSource",
      lt."IdempotencyKey", lt."IsReversed",
      a."AccountCode",
      SUM(le."DebitAmount")::numeric AS dr,
      SUM(le."CreditAmount")::numeric AS cr
    FROM ledger_transactions lt
    JOIN ledger_entries le ON le."TransactionId" = lt."Id"
    JOIN accounts a ON a."Id" = le."AccountId"
    WHERE (
      lt."ReferenceId"::text = $1
      OR lt."IdempotencyKey" IN ($2, $3)
    )
    AND ${NET_ACTIVE}
    GROUP BY lt."Id", lt."TransactionNumber", lt."ReferenceType", lt."PostingSource",
      lt."IdempotencyKey", lt."IsReversed", a."AccountCode"
    ORDER BY lt."TransactionNumber", a."AccountCode"`,
    [
      doc.rows[0].Id,
      `SUPPLIER_CREDIT_NOTE-${doc.rows[0].Id}`,
      `SUPPLIER_INVOICE-${doc.rows[0].Id}`,
    ],
  );

  const net2100 = await client.query(
    `
    SELECT COALESCE(SUM(le."CreditAmount" - le."DebitAmount"), 0)::numeric AS net
    FROM ledger_transactions lt
    JOIN ledger_entries le ON le."TransactionId" = lt."Id"
    JOIN accounts a ON a."Id" = le."AccountId"
    WHERE a."AccountCode" = '2100'
      AND (
        lt."ReferenceId"::text = $1
        OR lt."IdempotencyKey" IN ($2, $3)
      )
      AND ${NET_ACTIVE}`,
    [
      doc.rows[0].Id,
      `SUPPLIER_CREDIT_NOTE-${doc.rows[0].Id}`,
      `SUPPLIER_INVOICE-${doc.rows[0].Id}`,
    ],
  );

  const legs = txns.rows.map((r) => ({
    txn: r.TransactionNumber,
    refType: r.ReferenceType,
    source: r.PostingSource,
    account: r.AccountCode,
    dr: Number(r.dr),
    cr: Number(r.cr),
    idempotency: r.IdempotencyKey,
  }));

  const hasScnPost = legs.some(
    (l) => l.refType === 'SUPPLIER_CREDIT_NOTE' && l.account === '2100' && l.dr > 0,
  );
  const hasOffset = legs.some(
    (l) => l.refType === 'SUPPLIER_INVOICE' && l.account === '2100' && l.cr > 0,
  );

  return {
    scnNo,
    status: doc.rows[0].Status,
    amount: Number(doc.rows[0].TotalAmount),
    refBill: doc.rows[0].ref_bill,
    isPostedToGl: doc.rows[0].is_posted_to_gl,
    netActive2100: Number(net2100.rows[0].net),
    hasScnPost,
    hasOffset,
    patternClass: hasScnPost && hasOffset
      ? 'SCN_DEBIT_2100_PLUS_INVOICE_OFFSET'
      : hasScnPost
        ? 'SCN_DEBIT_2100_ONLY'
        : 'NO_SCN_GL',
    legs,
  };
}

function printProfile(p) {
  console.log(`\n── ${p.scnNo} (${p.status}, UGX ${p.amount.toLocaleString()}) ──`);
  console.log(`  Reference bill:     ${p.refBill ?? '—'}`);
  console.log(`  is_posted_to_gl:    ${p.isPostedToGl}`);
  console.log(`  Net-active 2100:    ${p.netActive2100.toLocaleString()}`);
  console.log(`  Pattern class:      ${p.patternClass}`);
  console.log('  Journal legs:');
  for (const l of p.legs) {
    console.log(
      `    ${l.txn} | ${l.refType} | ${l.source ?? '—'} | ${l.account} Dr ${l.dr} Cr ${l.cr} | ${l.idempotency}`,
    );
  }
}

const client = await pool.connect();
try {
  console.log('SCN APPLIED GL PATTERN PROOF (read-only)');
  const profiles = [];
  for (const scn of SCNS) {
    const p = await scnProfile(client, scn);
    if (!p) {
      console.error(`SCN not found: ${scn}`);
      process.exit(2);
    }
    profiles.push(p);
    printProfile(p);
  }

  const classes = [...new Set(profiles.map((p) => p.patternClass))];
  const allNetZero = profiles.every((p) => Math.abs(p.netActive2100) < 0.01);
  const sameClass = classes.length === 1;

  console.log('\n' + '═'.repeat(60));
  console.log(`Pattern classes found: ${classes.join(', ')}`);
  console.log(`All net-active 2100 ≈ 0: ${allNetZero ? 'YES' : 'NO'}`);
  console.log(`Identical pattern class: ${sameClass ? 'YES' : 'NO'}`);

  if (!allNetZero) {
    console.log('\nSCNs with non-zero net-active 2100 need offset journal or investigation.');
  }
  process.exit(allNetZero && sameClass ? 0 : 1);
} finally {
  client.release();
  await pool.end();
}
