#!/usr/bin/env node
/**
 * Read-only AP forensic report — document-level GL vs open-item analysis.
 * NO mutations. Replicates reconciliation report queries exactly.
 */
import pg from 'pg';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pool = new pg.Pool({
  connectionString:
    process.env.HENBER_DATABASE_URL
    || 'postgresql://postgres:55b9bed51c599b26e7115ab126a974e8@209.38.203.138:5432/pos_tenant_henber_pharmacy',
});

const NET_ACTIVE = `
  lt."Status" = 'POSTED'
  AND lt."IsReversed" = FALSE
  AND lt."Id" NOT IN (
    SELECT "ReversedByTransactionId" FROM ledger_transactions
    WHERE "ReversedByTransactionId" IS NOT NULL
  )
`;

const fmt = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, signDisplay: 'always' });
const num = (v) => Number(v || 0);
const today = new Date().toISOString().slice(0, 10);
const lines = [];
const log = (s = '') => { lines.push(s); console.log(s); };

// ── Replicate reconciliationService.getDiscrepancyDetails('2100') ──────────
// NOTE: uses ALL POSTED txns (includes reversed legs), compares to suppliers.OutstandingBalance CACHE
const uiSupplierDrift = await pool.query(
  `
  WITH supplier_gl AS (
    SELECT le."EntityId" AS entity_id,
      SUM(le."CreditAmount") - SUM(le."DebitAmount") AS gl_balance
    FROM ledger_entries le
    JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
    JOIN accounts a ON le."AccountId" = a."Id"
    WHERE a."AccountCode" = '2100'
      AND UPPER(le."EntityType") = 'SUPPLIER'
      AND lt."TransactionDate"::DATE <= $1
      AND lt."Status" = 'POSTED'
    GROUP BY le."EntityId"
  )
  SELECT s."Id" AS supplier_id, s."CompanyName" AS supplier_name,
    COALESCE(sg.gl_balance, 0)::numeric AS gl_balance,
    COALESCE(s."OutstandingBalance", 0)::numeric AS cache_balance,
    (COALESCE(sg.gl_balance, 0) - COALESCE(s."OutstandingBalance", 0))::numeric AS difference
  FROM suppliers s
  LEFT JOIN supplier_gl sg ON sg.entity_id = s."Id"::text
  WHERE ABS(COALESCE(sg.gl_balance, 0) - COALESCE(s."OutstandingBalance", 0)) > 0.01
  ORDER BY ABS(COALESCE(sg.gl_balance, 0) - COALESCE(s."OutstandingBalance", 0)) DESC
  `,
  [today],
);

// ── Replicate integrityGlDrift per-supplier (SUPPLIER_AP_GL / proof script) ─
const integrityPerSupplier = await pool.query(
  `
  WITH gl_by_supplier AS (
    SELECT NULLIF(TRIM(le."EntityId"), '')::uuid AS supplier_id,
      COALESCE(SUM(le."CreditAmount" - le."DebitAmount"), 0) AS gl_bal
    FROM ledger_entries le JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
    JOIN accounts a ON a."Id" = le."AccountId"
    WHERE a."AccountCode" = '2100' AND UPPER(le."EntityType") = 'SUPPLIER'
      AND le."EntityId" IS NOT NULL
      AND lt."ReferenceType" NOT IN ('EXPENSE', 'EXPENSE_PAYMENT')
      AND ${NET_ACTIVE}
    GROUP BY le."EntityId"
  ),
  open_item AS (
    SELECT si."SupplierId" AS supplier_id,
      COALESCE(SUM(
        CASE WHEN si.document_type = 'SUPPLIER_CREDIT_NOTE'
          THEN -COALESCE(si."OutstandingBalance", 0)
          ELSE COALESCE(si."OutstandingBalance", 0) END
      ), 0) AS inv_bal
    FROM supplier_invoices si
    WHERE si.deleted_at IS NULL
      AND UPPER(si."Status") NOT IN ('PAID', 'CANCELLED', 'DELETED', 'DRAFT')
      AND COALESCE(si.is_posted_to_gl, FALSE) = TRUE
    GROUP BY si."SupplierId"
  )
  SELECT s."Id" AS supplier_id, s."CompanyName" AS supplier_name,
    COALESCE(g.gl_bal, 0)::numeric AS gl_entity,
    COALESCE(i.inv_bal, 0)::numeric AS open_item,
    COALESCE(s."OutstandingBalance", 0)::numeric AS cache_balance,
    (COALESCE(g.gl_bal, 0) - COALESCE(i.inv_bal, 0))::numeric AS integrity_drift,
    (COALESCE(g.gl_bal, 0) - COALESCE(s."OutstandingBalance", 0))::numeric AS gl_vs_cache
  FROM suppliers s
  LEFT JOIN gl_by_supplier g ON g.supplier_id = s."Id"
  LEFT JOIN open_item i ON i.supplier_id = s."Id"
  WHERE ABS(COALESCE(g.gl_bal, 0) - COALESCE(i.inv_bal, 0)) > 0.01
     OR ABS(COALESCE(g.gl_bal, 0) - COALESCE(s."OutstandingBalance", 0)) > 0.01
  ORDER BY ABS(COALESCE(g.gl_bal, 0) - COALESCE(i.inv_bal, 0)) DESC
  `,
);

const { captureApReconciliationMetrics } = await import(
  '../dist/SamplePOS.Server/src/modules/supplier-payments/apReconciliationMetrics.js'
);
const metrics = await captureApReconciliationMetrics(pool);

log('═'.repeat(78));
log(' HENBER AP FORENSIC REPORT (read-only)');
log(` Generated: ${new Date().toISOString()}`);
log('═'.repeat(78));

log('\n## A. Reconciliation report headline (captureApReconciliationMetrics)');
log(`  glSupplierScopeNetActive:  ${fmt(metrics.glSupplierScopeNetActive)}`);
log(`  openItemSubledger:         ${fmt(metrics.openItemSubledger)}`);
log(`  integrityGlDrift (SUPPLIER_AP_GL): ${fmt(metrics.integrityGlDrift)}`);
log(`  suppliersTableSum (cache): ${fmt(metrics.suppliersTableSum)}`);
log(`  supplierCacheDrift:        ${fmt(metrics.supplierCacheDrift)}`);
log(`  storedBalanceDrift:        ${fmt(metrics.storedBalanceDrift)}`);

const uiSum = uiSupplierDrift.rows.reduce((a, r) => a + num(r.difference), 0);
const uiAbsSum = uiSupplierDrift.rows.reduce((a, r) => a + Math.abs(num(r.difference)), 0);
log('\n## B. UI supplier discrepancy drill-down (getDiscrepancyDetails 2100)');
log('  Query: GL entity (ALL posted, incl. reversed legs) − suppliers.OutstandingBalance CACHE');
log(`  Suppliers with |diff| > 0.01: ${uiSupplierDrift.rows.length}`);
log(`  Algebraic sum of differences:  ${fmt(uiSum)}`);
log(`  Sum of |differences|:          ${fmt(uiAbsSum)}`);
log('');
for (const r of uiSupplierDrift.rows) {
  log(`  ${r.supplier_name}: GL ${fmt(r.gl_balance)} − cache ${fmt(r.cache_balance)} = ${fmt(r.difference)}`);
}

const intSum = integrityPerSupplier.rows.reduce((a, r) => a + num(r.integrity_drift), 0);
log('\n## C. Integrity per-supplier (net-active GL − open-item, is_posted_to_gl=true)');
log(`  Algebraic sum: ${fmt(intSum)}  (should equal integrityGlDrift ${fmt(metrics.integrityGlDrift)})`);
log('');
for (const r of integrityPerSupplier.rows) {
  log(`  ${r.supplier_name}: integrity ${fmt(r.integrity_drift)} | GL ${fmt(r.gl_entity)} − openItem ${fmt(r.open_item)} | cache ${fmt(r.cache_balance)}`);
}

const TARGET_NAMES = [
  'GITTOES', 'SALUD', 'HENBER PHARMACY RUBAGA', 'RUBAGA', 'Zedeck', 'KAMCARE', 'PHARMACURE',
];

async function glForDocument(supplierId, refType, refId) {
  const r = await pool.query(
    `
    SELECT lt."Id" AS txn_id, lt."TransactionNumber", lt."Status", lt."IsReversed",
      lt."ReversedByTransactionId",
      COALESCE(SUM(CASE WHEN a."AccountCode"='2100'
        THEN le."CreditAmount" - le."DebitAmount" ELSE 0 END), 0)::numeric AS ap_net_all_posted,
      COALESCE(SUM(CASE WHEN a."AccountCode"='2100' AND ${NET_ACTIVE.replace(/\n/g, ' ')}
        THEN le."CreditAmount" - le."DebitAmount" ELSE 0 END), 0)::numeric AS ap_net_active
    FROM ledger_transactions lt
    LEFT JOIN ledger_entries le ON le."TransactionId" = lt."Id"
    LEFT JOIN accounts a ON a."Id" = le."AccountId"
    WHERE lt."ReferenceType" = $1 AND lt."ReferenceId" = $2
      AND (le."EntityId"::text = $3::text OR le."EntityId" IS NULL)
    GROUP BY lt."Id", lt."TransactionNumber", lt."Status", lt."IsReversed", lt."ReversedByTransactionId"
  `,
    [refType, refId, supplierId],
  );
  return r.rows;
}

async function documentForensics(supplierId, supplierName) {
  log(`\n${'─'.repeat(78)}`);
  log(`## D. Document forensics: ${supplierName}`);
  log('─'.repeat(78));

  const sup = integrityPerSupplier.rows.find((r) => r.supplier_id === supplierId)
    || uiSupplierDrift.rows.find((r) => r.supplier_id === supplierId);
  const intRow = integrityPerSupplier.rows.find((r) => r.supplier_id === supplierId);
  const uiRow = uiSupplierDrift.rows.find((r) => r.supplier_id === supplierId);

  if (intRow) {
    log(`  Integrity drift (GL−openItem): ${fmt(intRow.integrity_drift)}`);
    log(`  GL entity net-active:          ${fmt(intRow.gl_entity)}`);
    log(`  Open-item subledger:           ${fmt(intRow.open_item)}`);
  }
  if (uiRow) {
    log(`  UI drift (GL all-posted−cache): ${fmt(uiRow.difference)}`);
    log(`  GL all-posted:                  ${fmt(uiRow.gl_balance)}`);
    log(`  Supplier cache:                 ${fmt(uiRow.cache_balance)}`);
  }

  const docs = await pool.query(
    `
    SELECT si."Id", si."SupplierInvoiceNumber" AS doc_no,
      si.document_type, si."Status", si.is_posted_to_gl,
      si."TotalAmount"::numeric AS doc_amount,
      si."OutstandingBalance"::numeric AS open_item_amount,
      si.return_grn_id, si.reference_invoice_id
    FROM supplier_invoices si
    WHERE si."SupplierId" = $1::uuid AND si.deleted_at IS NULL
      AND UPPER(si."Status") NOT IN ('CANCELLED', 'DELETED', 'DRAFT')
      AND (
        COALESCE(si.is_posted_to_gl, FALSE) = FALSE
        OR si."OutstandingBalance" > 0.009
        OR EXISTS (
          SELECT 1 FROM ledger_transactions lt
          WHERE lt."ReferenceType" IN ('SUPPLIER_INVOICE','SUPPLIER_CREDIT_NOTE','SUPPLIER_DEBIT_NOTE')
            AND lt."ReferenceId" = si."Id"
            AND lt."Status" = 'POSTED'
            AND (lt."IsReversed" = TRUE OR COALESCE(si.is_posted_to_gl, FALSE) = FALSE)
        )
      )
    ORDER BY si.document_type, si."SupplierInvoiceNumber"
    `,
    [supplierId],
  );

  let docDriftSum = 0;
  const rows = [];
  for (const d of docs.rows) {
    const refType = d.document_type === 'SUPPLIER_CREDIT_NOTE' ? 'SUPPLIER_CREDIT_NOTE'
      : d.document_type === 'SUPPLIER_DEBIT_NOTE' ? 'SUPPLIER_DEBIT_NOTE'
        : 'SUPPLIER_INVOICE';

    const glTxns = await glForDocument(supplierId, refType, d.Id);
    const apNetActive = glTxns.reduce((a, t) => a + num(t.ap_net_active), 0);
    const apAllPosted = glTxns.reduce((a, t) => a + num(t.ap_net_all_posted), 0);

    const oiContrib = d.document_type === 'SUPPLIER_CREDIT_NOTE'
      ? (d.is_posted_to_gl ? -num(d.open_item_amount) : 0)
      : (d.is_posted_to_gl ? num(d.open_item_amount) : 0);

    let origin = [];
    if (!d.is_posted_to_gl && Math.abs(apNetActive) > 0.009) origin.push('GL exists; is_posted_to_gl=false → excluded from open-item');
    if (d.is_posted_to_gl && Math.abs(apNetActive) < 0.009) origin.push('is_posted_to_gl=true but no net-active GL');
    if (glTxns.some((t) => t.IsReversed && num(t.ap_net_all_posted) !== 0)) origin.push('reversed GL leg still in all-posted query');
    if (!d.is_posted_to_gl && Math.abs(num(d.open_item_amount)) > 0.009) origin.push('open-item OB>0 but excluded from integrity subledger');

    const txnInfo = glTxns.map((t) => `${t.TransactionNumber}${t.IsReversed ? '(REV)' : ''}`).join(', ') || '—';

    rows.push({
      doc_type: d.document_type,
      doc_no: d.doc_no,
      doc_amount: num(d.doc_amount),
      open_item: num(d.open_item_amount),
      oi_contrib: oiContrib,
      ap_gl_active: apNetActive,
      ap_gl_all: apAllPosted,
      is_posted_to_gl: d.is_posted_to_gl,
      status: d.Status,
      journals: txnInfo,
      origin: origin.length ? origin.join('; ') : 'aligned',
      flag_gl_mismatch: !d.is_posted_to_gl && Math.abs(apNetActive) > 0.009,
    });
  }

  // Flag mismatches only
  const mismatches = rows.filter((r) => r.flag_gl_mismatch || r.origin !== 'aligned');
  log(`\n  Documents with potential mismatch (${mismatches.length}):`);
  log('  ' + ['doc_type', 'doc_no', 'doc_amt', 'open_item', 'oi_in_subledger', 'GL_2100_net_active', 'is_posted_to_gl', 'status', 'journals', 'origin'].join(' | '));
  for (const r of mismatches) {
    log(`  ${r.doc_type} | ${r.doc_no} | ${fmt(r.doc_amount)} | ${fmt(r.open_item)} | ${fmt(r.oi_contrib)} | ${fmt(r.ap_gl_active)} | ${r.is_posted_to_gl} | ${r.status} | ${r.journals} | ${r.origin}`);
    if (r.flag_gl_mismatch) docDriftSum += r.doc_type === 'SUPPLIER_CREDIT_NOTE' ? r.ap_gl_active : -r.ap_gl_active;
  }

  // Payments unallocated
  const pays = await pool.query(
    `
    SELECT sp."PaymentNumber", sp."Amount"::numeric, sp."Status",
      COALESCE(sp."UnallocatedAmount", sp."Amount" - COALESCE(sp."AllocatedAmount",0))::numeric AS unalloc
    FROM supplier_payments sp
    WHERE sp."SupplierId"=$1::uuid AND sp.deleted_at IS NULL
      AND sp."Status"='COMPLETED'
      AND COALESCE(sp."UnallocatedAmount", sp."Amount" - COALESCE(sp."AllocatedAmount",0)) > 0.009
    `,
    [supplierId],
  );
  if (pays.rows.length) {
    log('\n  Unallocated payments (reduce open-item subledger, not GL entity):');
    for (const p of pays.rows) log(`    ${p.PaymentNumber}: ${fmt(p.unalloc)}`);
  }

  return { supplierName, intRow, uiRow, mismatches };
}

// Resolve target suppliers
const targets = await pool.query(
  `
  SELECT "Id", "CompanyName" FROM suppliers
  WHERE ${TARGET_NAMES.map((_, i) => `"CompanyName" ILIKE $${i + 1}`).join(' OR ')}
  ORDER BY "CompanyName"
  `,
  TARGET_NAMES.map((n) => `%${n}%`),
);

const forensicResults = [];
for (const s of targets.rows) {
  forensicResults.push(await documentForensics(s.Id, s.CompanyName));
}

// Also include any UI discrepancy suppliers not in target list
for (const r of uiSupplierDrift.rows) {
  if (!targets.rows.find((t) => t.Id === r.supplier_id)) {
    forensicResults.push(await documentForensics(r.supplier_id, r.supplier_name));
  }
}

log(`\n${'═'.repeat(78)}`);
log('## E. Why prior repair report claimed success vs current UI');
log('═'.repeat(78));
log(`
1. DIFFERENT METRICS: Prior repair measured integrityGlDrift = net-active GL scope − open-item
   subledger (is_posted_to_gl=true). That reached -17,500 (KAMCARE only).

2. UI SUPPLIER DRILL-DOWN uses getDiscrepancyDetails(2100) which compares:
   • GL: ALL Status=POSTED entries (includes REVERSED transaction legs — not net-active)
   • Subledger: suppliers.OutstandingBalance CACHE (not open-item subledger)

3. CACHE NOT UPDATED: SCN flag-only repair set is_posted_to_gl=true on 10 documents but
   explicitly did NOT recalculate suppliers.OutstandingBalance. Open-item subledger dropped
   671,715; supplier cache remained at pre-repair values → SUPPLIER_BALANCE layer diverged.

4. AUTO-HEAL ON VIEW: reconcileAccountsPayable() calls healApCachesIfDrifted() before
   display, which may mutate caches when the report is opened — creating time-dependent results.

5. SUM 931,285: Likely the algebraic or absolute sum of UI supplier-level GL−cache differences,
   not integrityGlDrift. See section B above for live computed total.
`);

log('\n## F. Reconciliation to totals');
log(`  integrityGlDrift (report headline):     ${fmt(metrics.integrityGlDrift)}`);
log(`  Sum per-supplier integrity drifts:      ${fmt(intSum)}`);
log(`  UI supplier drill-down algebraic sum:   ${fmt(uiSum)}`);
log(`  UI supplier drill-down |sum|:          ${fmt(uiAbsSum)}`);

const outPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'PROOF_AP_FORENSIC_REPORT.md');
writeFileSync(outPath, lines.join('\n'));
log(`\nWrote ${outPath}`);

await pool.end();
