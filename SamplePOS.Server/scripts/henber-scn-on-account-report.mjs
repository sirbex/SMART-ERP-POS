#!/usr/bin/env node
/** Henber — report on supplier credit notes stuck POSTED / on-account */
import pg from 'pg';

function henberDatabaseUrl() {
  if (process.env.HENBER_DATABASE_URL) return process.env.HENBER_DATABASE_URL;
  const base = process.env.DATABASE_URL;
  if (base) return base.replace(/\/([^/?]+)(\?.*)?$/, '/pos_tenant_henber_pharmacy$2');
  return 'postgresql://postgres:55b9bed51c599b26e7115ab126a974e8@postgres:5432/pos_tenant_henber_pharmacy';
}

const SCNS = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const DEFAULT_SCNS = [
  'SCN-2026-0002',
  'SCN-2026-0003',
  'SCN-2026-0004',
  'SCN-2026-0005',
  'SCN-2026-0006',
  'SCN-2026-0007',
];
const targets = SCNS.length ? SCNS : DEFAULT_SCNS;

const pool = new pg.Pool({ connectionString: henberDatabaseUrl() });
const fmt = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });

try {
  const rows = await pool.query(
    `SELECT
       scn."Id" AS scn_id,
       scn."SupplierInvoiceNumber" AS scn_num,
       scn."Status" AS scn_status,
       scn."TotalAmount"::numeric AS scn_total,
       COALESCE(scn."AmountPaid", 0)::numeric AS scn_amount_paid,
       COALESCE(scn."OutstandingBalance", 0)::numeric AS scn_ob,
       scn.reference_invoice_id,
       scn.return_grn_id,
       scn.reason,
       scn."InvoiceDate" AS scn_date,
       s."CompanyName" AS supplier,
       ref."SupplierInvoiceNumber" AS ref_bill,
       ref."Status" AS ref_status,
       ref."TotalAmount"::numeric AS ref_total,
       COALESCE(ref."AmountPaid", 0)::numeric AS ref_amount_paid,
       COALESCE(ref."OutstandingBalance", 0)::numeric AS ref_ob,
       GREATEST(ref."TotalAmount" - COALESCE(ref."AmountPaid", 0), 0)::numeric AS ref_open_by_paid,
       rgrn.return_grn_number AS rgrn_num,
       (SELECT COALESCE(SUM(spa."AmountAllocated"), 0)
        FROM supplier_payment_allocations spa
        JOIN supplier_payments sp ON sp."Id" = spa."PaymentId"
        WHERE spa."SupplierInvoiceId" = ref."Id"
          AND spa.deleted_at IS NULL
          AND sp.deleted_at IS NULL
          AND sp."Status" != 'DELETED')::numeric AS ref_spa_paid,
       (SELECT COALESCE(SUM(cn."TotalAmount"), 0)
        FROM supplier_invoices cn
        WHERE cn.reference_invoice_id = ref."Id"
          AND cn.document_type = 'SUPPLIER_CREDIT_NOTE'
          AND cn.deleted_at IS NULL
          AND cn."Status" = 'POSTED')::numeric AS ref_posted_scn_total,
       (SELECT lt."Id"
        FROM ledger_transactions lt
        WHERE lt."ReferenceType" = 'SUPPLIER_CREDIT_NOTE'
          AND lt."ReferenceId" = scn."Id"
          AND lt."IsReversed" = FALSE
        LIMIT 1) AS gl_txn_id
     FROM supplier_invoices scn
     JOIN suppliers s ON s."Id" = scn."SupplierId"
     LEFT JOIN supplier_invoices ref ON ref."Id" = scn.reference_invoice_id
     LEFT JOIN return_grn rgrn ON rgrn.id = scn.return_grn_id
     WHERE scn.document_type = 'SUPPLIER_CREDIT_NOTE'
       AND scn."SupplierInvoiceNumber" = ANY($1::text[])
       AND scn.deleted_at IS NULL
     ORDER BY scn."SupplierInvoiceNumber"`,
    [targets],
  );

  if (!rows.rows.length) {
    console.log('No matching credit notes found for:', targets.join(', '));
    process.exit(1);
  }

  console.log('\n=== Supplier Credit Notes — On-Account Report ===\n');

  let totalOnAccount = 0;
  const report = [];

  for (const r of rows.rows) {
    const scnTotal = Number(r.scn_total);
    const scnOb = Number(r.scn_ob);
    const refOpenByPaid = Number(r.ref_open_by_paid);
    const refSpaPaid = Number(r.ref_spa_paid);
    const refPostedScn = Number(r.ref_posted_scn_total);
    const refLedgerOb =
      Number(r.ref_total) - refSpaPaid - refPostedScn;

    let why = '';
    let action = '';

    if (r.scn_status !== 'POSTED') {
      why = `Status is ${r.scn_status}, not POSTED on-account.`;
      action = 'No action unless OB > 0 unexpectedly.';
    } else if (scnOb <= 0.009) {
      why = 'Outstanding balance is zero; UI should not show on-account badge.';
      action = 'None.';
    } else if (!r.reference_invoice_id) {
      why = 'Standalone credit note (no reference bill). Posted as on-account by design.';
      action = 'Click "Apply to Open Bills" to FIFO-allocate, or cancel if erroneous.';
    } else if (Number(r.scn_amount_paid) > 0.009) {
      why = `Partially applied (${fmt(r.scn_amount_paid)} of ${fmt(scnTotal)}); residual on-account.`;
      action = 'Apply to Open Bills for remaining amount.';
    } else if (refOpenByPaid <= 0.009 && Number(r.ref_ob) <= 0.009) {
      why =
        `Reference bill ${r.ref_bill} is already fully settled ` +
        `(stored OB ${fmt(r.ref_ob)}, paid via cash/allocations). ` +
        `On post, auto-apply targets only this bill (no FIFO) — applied UGX 0. ` +
        `The CN is valid in GL but still POSTED as unallocated on-account credit.`;
      if (refLedgerOb < -0.009) {
        why += ` Ledger net on bill is ${fmt(refLedgerOb)} (over-credited by POSTED SCN).`;
      }
      action =
        'Click "Apply to Open Bills" to FIFO against other open SALUD/KAMCARE bills, ' +
        'or cancel and re-post if the credit was duplicate.';
    } else if (Number(r.ref_ob) <= 0.009 && refOpenByPaid > 0.009) {
      why =
        `Bill ${r.ref_bill} OutstandingBalance is ${fmt(r.ref_ob)} but Total−AmountPaid=${fmt(refOpenByPaid)}. ` +
        'Ledger repair netted the bill for POSTED SCNs without running CN apply — CN AmountPaid still 0.';
      action = 'Run supplier invoice repair, then "Apply to Open Bills" or re-apply to primary bill.';
    } else {
      why =
        `Posted before bill-application ran (or apply returned 0). ` +
        `Bill ${r.ref_bill} still has ${fmt(refOpenByPaid)} open by Total−AmountPaid; ` +
        `CN AmountPaid is 0 so status stayed POSTED. ` +
        `${Number(r.ref_posted_scn_total) > scnTotal ? `Other POSTED SCNs on same bill total ${fmt(refPostedScn)}.` : ''}`;
      action = 'Click "Apply to Open Bills" — will allocate to primary bill first when referenced, then FIFO.';
    }

    totalOnAccount += scnOb;

    report.push({
      scn: r.scn_num,
      supplier: r.supplier,
      date: r.scn_date ? String(r.scn_date).slice(0, 10) : '',
      amount: fmt(scnTotal),
      on_account: fmt(scnOb),
      status: r.scn_status,
      ref_bill: r.ref_bill || '—',
      ref_bill_ob: r.ref_bill ? fmt(r.ref_ob) : '—',
      ref_open_amount_paid: r.ref_bill ? fmt(refOpenByPaid) : '—',
      ref_ledger_ob: r.ref_bill ? fmt(refLedgerOb) : '—',
      rgrn: r.rgrn_num || '—',
      gl_posted: r.gl_txn_id ? 'YES' : 'NO',
      reason: (r.reason || '').slice(0, 60),
      why_still_showing: why,
      recommended_action: action,
    });
  }

  console.table(
    report.map(({ why_still_showing, recommended_action, ...t }) => t),
  );

  console.log('\n--- Detail: why still POSTED / on-account ---\n');
  for (const r of report) {
    console.log(`${r.scn} (${r.supplier}, ${r.amount})`);
    console.log(`  Why: ${r.why_still_showing}`);
    console.log(`  Action: ${r.recommended_action}`);
    console.log('');
  }

  console.log(`Total on-account (these SCNs): UGX ${fmt(totalOnAccount)}`);
  console.log(
    '\nNote: POSTED SCNs with OB>0 reduce supplier open-item AP in the ledger formula. ' +
      'They remain visible until Status=APPLIED (fully allocated) or cancelled.',
  );

  if (process.argv.includes('--bills')) {
    const bills = await pool.query(
      `SELECT ref."SupplierInvoiceNumber" AS bill,
              ref."TotalAmount"::numeric AS bill_total,
              ref."AmountPaid"::numeric AS bill_amount_paid,
              ref."OutstandingBalance"::numeric AS bill_ob,
              ref."Status" AS bill_status,
              COUNT(scn."Id") AS scn_count,
              COALESCE(SUM(scn."TotalAmount"), 0)::numeric AS scn_total,
              COALESCE(SUM(CASE WHEN scn."Status" = 'POSTED' THEN scn."TotalAmount" ELSE 0 END), 0)::numeric AS posted_scn_total
       FROM supplier_invoices scn
       JOIN supplier_invoices ref ON ref."Id" = scn.reference_invoice_id
       WHERE scn."SupplierInvoiceNumber" = ANY($1::text[])
       GROUP BY ref."Id", ref."SupplierInvoiceNumber", ref."TotalAmount", ref."AmountPaid", ref."OutstandingBalance", ref."Status"
       ORDER BY ref."SupplierInvoiceNumber"`,
      [targets],
    );
    console.log('\n--- Reference bills ---\n');
    console.table(
      bills.rows.map((b) => ({
        bill: b.bill,
        total: fmt(b.bill_total),
        amount_paid: fmt(b.bill_amount_paid),
        outstanding: fmt(b.bill_ob),
        status: b.bill_status,
        linked_scns: b.scn_count,
        scn_total: fmt(b.scn_total),
        posted_scn_on_bill: fmt(b.posted_scn_total),
      })),
    );
  }
} finally {
  await pool.end();
}
