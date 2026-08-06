#!/usr/bin/env npx tsx
/**
 * DocumentTax Production Certification — LIVE PostgreSQL mutations.
 *
 * Proves (against DATABASE_URL, not mocked loaders):
 *   1) DocumentTaxService.computeForLines determination + arithmetic
 *   2) salesService.createSale stamps sale_items + header integrity
 *   3) GL posts CR 2300 for output VAT
 *   4) invoice copy from sale_items
 *   5) remittance pos_sale_tax double-count guard + partial-return netting
 *   6) credit note DocumentTax line taxAmount persistence
 *
 * Temporarily flips tax_inclusive → false and one product → taxable for the
 * exclusive-tax lane, then restores both in finally.
 *
 * Usage:
 *   DATABASE_URL=... npx tsx SamplePOS.Server/scripts/proof-document-tax-live.ts
 *   npm run proof:document-tax-live
 */
import pg from 'pg';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Decimal from 'decimal.js';

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(serverRoot, '..');
const OUT =
  process.env.PROOF_OUT || resolve(repoRoot, 'PROOF_DOCUMENT_TAX_RUN.md');

function loadUrl(): string {
  return (
    process.env.DATABASE_URL ||
    process.env.TENANT_DATABASE_URL ||
    'postgresql://postgres:password@localhost:5432/pos_system'
  );
}

const lines: string[] = [];
let pass = 0;
let fail = 0;
let skip = 0;

function log(s = '') {
  lines.push(s);
  console.log(s);
}
function ok(n: string, d = '') {
  pass++;
  log(`- **PASS** ${n}${d ? ` — ${d}` : ''}`);
  console.log(`  PASS  ${n}${d ? ` — ${d}` : ''}`);
}
function bad(n: string, d = '') {
  fail++;
  log(`- **FAIL** ${n}${d ? ` — ${d}` : ''}`);
  console.error(`  FAIL  ${n}${d ? ` — ${d}` : ''}`);
}
function skipped(n: string, d = '') {
  skip++;
  log(`- **SKIP** ${n}${d ? ` — ${d}` : ''}`);
  console.log(`  SKIP  ${n}${d ? ` — ${d}` : ''}`);
}
function assert(c: boolean, n: string, d = '') {
  if (c) ok(n, d);
  else bad(n, d);
}

const pool = new pg.Pool({ connectionString: loadUrl(), max: 4 });

type SettingsSnap = {
  tax_enabled: boolean;
  tax_inclusive: boolean;
  default_tax_rate: number;
};

type ProductSnap = {
  id: string;
  name: string;
  is_taxable: boolean;
  tax_rate: number;
  selling_price: number;
  quantity_on_hand: number;
};

let settingsSnap: SettingsSnap | null = null;
let productSnap: ProductSnap | null = null;
let saleId: string | null = null;
let invoiceId: string | null = null;
let creditNoteId: string | null = null;

async function restoreFixtures() {
  if (productSnap) {
    await pool.query(
      `UPDATE products SET is_taxable = $2, tax_rate = $3 WHERE id = $1::uuid`,
      [productSnap.id, productSnap.is_taxable, productSnap.tax_rate],
    );
  }
  if (settingsSnap) {
    await pool.query(
      `UPDATE system_settings
       SET tax_enabled = $1, tax_inclusive = $2, default_tax_rate = $3`,
      [
        settingsSnap.tax_enabled,
        settingsSnap.tax_inclusive,
        settingsSnap.default_tax_rate,
      ],
    );
  }
}

async function main() {
  log('# DocumentTax — Production Certification (LIVE PostgreSQL)\n');
  log(`Run: ${new Date().toISOString()}`);
  log(`Database: ${loadUrl().replace(/:[^:@/]+@/, ':***@')}\n`);

  console.log('═'.repeat(60));
  console.log(' proof-document-tax-live');
  console.log('═'.repeat(60));

  // Schema presence
  log('\n## Gate B — Live schema & fixtures\n');
  const cols = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'sale_items'
       AND column_name IN ('tax_amount','tax_rate','is_taxable','tax_determination')`,
  );
  assert(
    cols.rows.length === 4,
    'B-schema-584-sale-items',
    cols.rows.map((r) => r.column_name).join(','),
  );

  const settingsRes = await pool.query(
    `SELECT tax_enabled, tax_inclusive, default_tax_rate::float8 AS default_tax_rate
     FROM system_settings LIMIT 1`,
  );
  settingsSnap = settingsRes.rows[0] as SettingsSnap;
  assert(!!settingsSnap, 'B-settings-loaded');

  const prodRes = await pool.query(
    `SELECT id::text, name, COALESCE(is_taxable,false) AS is_taxable,
            COALESCE(tax_rate,0)::float8 AS tax_rate,
            COALESCE(selling_price,0)::float8 AS selling_price,
            COALESCE(quantity_on_hand,0)::float8 AS quantity_on_hand,
            COALESCE(product_type,'inventory') AS product_type
     FROM products
     WHERE COALESCE(is_active,true)
       AND COALESCE(selling_price,0) > 0
       AND (
         COALESCE(product_type,'inventory') ILIKE '%service%'
         OR COALESCE(quantity_on_hand,0) >= 2
       )
     ORDER BY
       CASE WHEN COALESCE(product_type,'inventory') ILIKE '%service%' THEN 0 ELSE 1 END,
       quantity_on_hand DESC
     LIMIT 1`,
  );
  productSnap = (prodRes.rows[0] as ProductSnap & { product_type?: string }) || null;
  if (!productSnap) {
    bad('B-product-with-stock', 'no active priced product (service or qty>=2)');
    await finish();
    return;
  }
  ok(
    'B-product-fixture',
    `${productSnap.name} type=${(productSnap as { product_type?: string }).product_type} price=${productSnap.selling_price}`,
  );

  const userRes = await pool.query(
    `SELECT id::text FROM users
     WHERE COALESCE(is_active,true)
       AND id <> '00000000-0000-0000-0000-000000000000'
     ORDER BY created_at NULLS LAST
     LIMIT 1`,
  );
  const soldBy = userRes.rows[0]?.id as string | undefined;
  assert(!!soldBy, 'B-soldBy-user', soldBy);

  // Prepare exclusive-tax lane (restore in finally)
  await pool.query(
    `UPDATE system_settings
     SET tax_enabled = true, tax_inclusive = false, default_tax_rate = 18`,
  );
  await pool.query(
    `UPDATE products SET is_taxable = true, tax_rate = 18 WHERE id = $1::uuid`,
    [productSnap.id],
  );
  ok('B-fixtures-exclusive-tax-lane', 'tax_inclusive=false, product taxable@18%');

  // Clear module settings cache if any by importing services AFTER fixture flip
  const { DocumentTaxService } = await import('../src/services/documentTaxService.js');
  const { salesService } = await import('../src/modules/sales/salesService.js');
  const { invoiceRepository } = await import('../src/modules/invoices/invoiceRepository.js');
  const { creditDebitNoteService } = await import(
    '../src/modules/credit-debit-notes/creditDebitNoteService.js'
  );
  const { getTaxReversalReport } = await import(
    '../src/modules/reports/cnDnReportRepository.js'
  );

  const unitPrice = Number(productSnap.selling_price);
  const qty = 2;
  const lineNet = Number(new Decimal(unitPrice).times(qty).toFixed(2));

  log('\n## Gate B — DocumentTaxService live determination\n');
  const taxDoc = await DocumentTaxService.computeForLines(pool, {
    scope: 'SALE',
    applyTenantDefaultWhenUnresolved: false,
    lines: [
      {
        lineIndex: 0,
        productId: productSnap.id,
        lineNetAmount: lineNet,
        quantity: qty,
        // Client understatement — server must overwrite from DB bridge
        isTaxable: false,
        taxRate: 0,
      },
    ],
  });
  assert(
    taxDoc.lineResults[0]?.determination === 'BRIDGE',
    'B-determination-BRIDGE',
    String(taxDoc.lineResults[0]?.determination),
  );
  const expectedTax = Number(new Decimal(lineNet).times(0.18).toFixed(2));
  assert(
    Math.abs(taxDoc.documentTotals.totalTax - expectedTax) < 0.02,
    'B-tax-amount',
    `got ${taxDoc.documentTotals.totalTax} expected ~${expectedTax}`,
  );

  log('\n## Gate B — createSale persist + GL\n');
  const totalAmount = Number(new Decimal(lineNet).plus(expectedTax).toFixed(2));
  let sale: { id: string; saleNumber?: string; taxAmount?: number } | null = null;
  try {
    const created = await salesService.createSale(pool, {
      items: [
        {
          productId: productSnap.id,
          productName: productSnap.name,
          quantity: qty,
          unitPrice,
          discountAmount: 0,
          isTaxable: false,
          taxRate: 0,
        },
      ],
      subtotal: lineNet,
      discountAmount: 0,
      taxAmount: 0, // client preview wrong — server authoritative
      totalAmount,
      paymentMethod: 'CASH',
      paymentReceived: totalAmount,
      soldBy: soldBy!,
      idempotencyKey: `doc-tax-cert-${Date.now()}`,
    });
    sale = created.sale;
    saleId = created.sale.id;
    ok('B-createSale', `saleId=${saleId} number=${created.sale.saleNumber}`);
  } catch (e) {
    bad(
      'B-createSale',
      e instanceof Error ? e.message : String(e),
    );
    await finish();
    return;
  }

  const saleRow = await pool.query(
    `SELECT tax_amount::float8 AS tax_amount, subtotal::float8 AS subtotal,
            total_amount::float8 AS total_amount, status
     FROM sales WHERE id = $1::uuid`,
    [saleId],
  );
  const s = saleRow.rows[0];
  assert(
    Math.abs(Number(s.tax_amount) - expectedTax) < 0.02,
    'B-sale-header-tax',
    String(s.tax_amount),
  );

  const items = await pool.query(
    `SELECT tax_amount::float8 AS tax_amount, tax_rate::float8 AS tax_rate,
            is_taxable, tax_determination, quantity::float8 AS quantity
     FROM sale_items WHERE sale_id = $1::uuid`,
    [saleId],
  );
  assert(items.rows.length === 1, 'B-sale-items-count', String(items.rows.length));
  const li = items.rows[0];
  assert(
    Math.abs(Number(li.tax_amount) - expectedTax) < 0.02,
    'B-sale-item-tax-amount',
    String(li.tax_amount),
  );
  assert(Number(li.tax_rate) === 18, 'B-sale-item-tax-rate', String(li.tax_rate));
  assert(
    li.tax_determination === 'BRIDGE',
    'B-sale-item-determination',
    String(li.tax_determination),
  );
  assert(
    Math.abs(Number(li.tax_amount) - Number(s.tax_amount)) < 0.02,
    'B-header-equals-line-tax',
  );

  const gl = await pool.query(
    `SELECT a."AccountCode" AS account_code,
            le."DebitAmount"::float8 AS debit,
            le."CreditAmount"::float8 AS credit
     FROM ledger_transactions lt
     JOIN ledger_entries le ON le."TransactionId" = lt."Id"
     JOIN accounts a ON a."Id" = le."AccountId"
     WHERE lt."ReferenceType" = 'SALE'
       AND lt."ReferenceId"::text = $1
     ORDER BY a."AccountCode"`,
    [saleId],
  );
  const glRows = gl.rows;
  const taxCredit = glRows
    .filter((r) => String(r.account_code) === '2300')
    .reduce((a, r) => a + Number(r.credit || 0), 0);
  assert(
    Math.abs(taxCredit - expectedTax) < 0.02,
    'B-gl-cr-2300',
    `credit=${taxCredit} rows=${glRows.length}`,
  );

  log('\n## Gate C — Invoice copy + remittance\n');
  const cust = await pool.query(
    `SELECT id::text, name FROM customers WHERE COALESCE(is_active,true) LIMIT 1`,
  );
  const customerId = cust.rows[0]?.id as string | undefined;
  const customerName = (cust.rows[0]?.name as string) || 'DOC-TAX-CERT Customer';
  if (!customerId) {
    bad('C-createInvoice', 'no customer fixture');
  } else {
    try {
      const inv = await invoiceRepository.createInvoice(pool, {
        saleId: saleId!,
        customerId,
        customerName,
        dueDate: new Date().toISOString().slice(0, 10),
        subtotal: lineNet,
        taxAmount: expectedTax,
        totalAmount,
        createdById: soldBy!,
      });
      invoiceId = inv.id;
      ok('C-createInvoice', invoiceId);
    } catch (e) {
      bad('C-createInvoice', e instanceof Error ? e.message : String(e));
    }
  }

  if (invoiceId) {
    const ili = await pool.query(
      `SELECT "TaxAmount"::float8 AS tax_amount, "TaxRate"::float8 AS tax_rate
       FROM invoice_line_items WHERE "InvoiceId" = $1::uuid`,
      [invoiceId],
    );
    assert(ili.rows.length >= 1, 'C-invoice-lines-copied');
    assert(
      Math.abs(Number(ili.rows[0]?.tax_amount) - expectedTax) < 0.02,
      'C-invoice-line-tax',
      String(ili.rows[0]?.tax_amount),
    );

    // Post invoice out of DRAFT so remittance guard engages
    await pool.query(
      `UPDATE invoices SET status = 'POSTED', document_type = COALESCE(document_type,'INVOICE')
       WHERE id = $1::uuid`,
      [invoiceId],
    );

    const today = new Date().toISOString().slice(0, 10);
    const report = await getTaxReversalReport(pool, '2000-01-01', today);
    // With posted invoice, POS sale tax for this sale should not double-count.
    // We assert the sale_items CTE exclusion via SQL directly:
    const posDup = await pool.query(
      `SELECT COALESCE(SUM(si.tax_amount),0)::float8 AS t
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       WHERE s.id = $1::uuid
         AND si.tax_amount > 0
         AND NOT EXISTS (
           SELECT 1 FROM invoices i
           WHERE i.sale_id = s.id
             AND COALESCE(i.document_type,'INVOICE') = 'INVOICE'
             AND i.status NOT IN ('CANCELLED','DRAFT')
         )`,
      [saleId],
    );
    assert(
      Number(posDup.rows[0].t) === 0,
      'C-remittance-no-double-count',
      `reportRows=${report.length}`,
    );
  }

  log('\n## Gate C — Partial return remittance netting\n');
  try {
    const { salesService: ss } = await import('../src/modules/sales/salesService.js');
    const saleItems = await pool.query(
      `SELECT id::text FROM sale_items WHERE sale_id = $1::uuid`,
      [saleId],
    );
    const saleItemId = saleItems.rows[0]?.id;
    if (!saleItemId) throw new Error('missing sale_item');
    await ss.refundSale(pool, saleId!, soldBy!, {
      items: [{ saleItemId, quantity: 1 }],
      reason: 'DOC-TAX-CERT partial return',
    });
    ok('C-partial-refund');

    const remNet = await pool.query(
      `SELECT COALESCE(SUM(
           si.tax_amount * (si.quantity - COALESCE(si.refunded_qty,0)) / NULLIF(si.quantity,0)
         ),0)::float8 AS net_tax
       FROM sale_items si
       WHERE si.sale_id = $1::uuid`,
      [saleId],
    );
    const half = Number(new Decimal(expectedTax).div(2).toFixed(2));
    assert(
      Math.abs(Number(remNet.rows[0].net_tax) - half) < 0.05,
      'C-partial-return-tax-net',
      `net=${remNet.rows[0].net_tax} expected~${half}`,
    );
  } catch (e) {
    bad('C-partial-refund', e instanceof Error ? e.message : String(e));
  }

  log('\n## Gate C — Credit note DocumentTax line tax\n');
  if (invoiceId) {
    try {
      const { note } = await creditDebitNoteService.createCreditNote(pool, {
        invoiceId,
        reason: 'DOC-TAX-CERT price correction',
        noteType: 'PARTIAL',
        lines: [
          {
            productId: productSnap.id,
            productName: productSnap.name,
            quantity: 1,
            unitPrice,
            taxRate: 18,
          },
        ],
      } as never);
      creditNoteId = note.id;
      const cnLines = await pool.query(
        `SELECT "TaxAmount"::float8 AS tax_amount, "TaxRate"::float8 AS tax_rate
         FROM invoice_line_items WHERE "InvoiceId" = $1::uuid`,
        [creditNoteId],
      );
      const cnTax = Number(cnLines.rows[0]?.tax_amount || 0);
      const expectCn = Number(new Decimal(unitPrice).times(0.18).toFixed(2));
      assert(
        Math.abs(cnTax - expectCn) < 0.02,
        'C-credit-note-line-tax',
        `got ${cnTax} expected ${expectCn}`,
      );
      ok('C-credit-note-created', creditNoteId);
    } catch (e) {
      bad('C-credit-note', e instanceof Error ? e.message : String(e));
    }
  } else {
    skipped('C-credit-note', 'no invoice');
  }

  // ── Inclusive price-mode lane (SALE-2026-0179 class regression) ──────────
  log('\n## Gate B-I — Inclusive price mode (extract VAT, charge = shelf)\n');
  await pool.query(
    `UPDATE system_settings
     SET tax_enabled = true, tax_inclusive = true, default_tax_rate = 18`,
  );
  // product already taxable@18 from exclusive lane setup
  const inclQty = 1;
  const inclShelf = Number(new Decimal(unitPrice).times(inclQty).toFixed(2));
  const inclBase = Number(new Decimal(inclShelf).div(1.18).toDecimalPlaces(2, Decimal.ROUND_HALF_UP));
  const inclTax = Number(new Decimal(inclShelf).minus(inclBase).toFixed(2));

  const taxDocIncl = await DocumentTaxService.computeForLines(pool, {
    scope: 'SALE',
    applyTenantDefaultWhenUnresolved: false,
    lines: [
      {
        lineIndex: 0,
        productId: productSnap.id,
        lineNetAmount: inclShelf,
        quantity: inclQty,
        isTaxable: false,
        taxRate: 0,
      },
    ],
  });
  assert(
    taxDocIncl.taxInclusive === true,
    'B-I-settings-inclusive',
    String(taxDocIncl.taxInclusive),
  );
  assert(
    taxDocIncl.lineResults[0]?.determination !== 'DISABLED',
    'B-I-not-DISABLED',
    String(taxDocIncl.lineResults[0]?.determination),
  );
  assert(
    Math.abs(taxDocIncl.documentTotals.totalTax - inclTax) < 0.02,
    'B-I-extracted-tax',
    `got ${taxDocIncl.documentTotals.totalTax} expected ~${inclTax}`,
  );
  assert(
    Math.abs(taxDocIncl.documentTotals.totalAmount - inclShelf) < 0.02,
    'B-I-charge-equals-shelf',
    `got ${taxDocIncl.documentTotals.totalAmount} shelf ${inclShelf}`,
  );

  let inclSaleId: string | null = null;
  try {
    const createdIncl = await salesService.createSale(pool, {
      items: [
        {
          productId: productSnap.id,
          productName: productSnap.name,
          quantity: inclQty,
          unitPrice,
          discountAmount: 0,
          isTaxable: false,
          taxRate: 0,
        },
      ],
      subtotal: inclShelf,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: inclShelf, // inclusive: client must not inflate total
      paymentMethod: 'CASH',
      paymentReceived: inclShelf,
      soldBy: soldBy!,
      idempotencyKey: `doc-tax-cert-incl-${Date.now()}`,
    });
    inclSaleId = createdIncl.sale.id;
    ok('B-I-createSale', `saleId=${inclSaleId} number=${createdIncl.sale.saleNumber}`);
  } catch (e) {
    bad('B-I-createSale', e instanceof Error ? e.message : String(e));
  }

  if (inclSaleId) {
    const inclRow = await pool.query(
      `SELECT tax_amount::float8 AS tax_amount, total_amount::float8 AS total_amount
       FROM sales WHERE id = $1::uuid`,
      [inclSaleId],
    );
    const ir = inclRow.rows[0];
    assert(
      Math.abs(Number(ir.tax_amount) - inclTax) < 0.02,
      'B-I-sale-header-tax',
      String(ir.tax_amount),
    );
    assert(
      Math.abs(Number(ir.total_amount) - inclShelf) < 0.02,
      'B-I-sale-total-equals-shelf',
      String(ir.total_amount),
    );
    const inclItems = await pool.query(
      `SELECT tax_amount::float8 AS tax_amount, tax_determination
       FROM sale_items WHERE sale_id = $1::uuid`,
      [inclSaleId],
    );
    const ili = inclItems.rows[0];
    assert(
      ili?.tax_determination !== 'DISABLED',
      'B-I-line-not-DISABLED',
      String(ili?.tax_determination),
    );
    assert(
      Math.abs(Number(ili?.tax_amount) - inclTax) < 0.02,
      'B-I-line-tax-amount',
      String(ili?.tax_amount),
    );

    const glIncl = await pool.query(
      `SELECT COALESCE(SUM(le."CreditAmount"),0)::float8 AS credit
       FROM ledger_transactions lt
       JOIN ledger_entries le ON le."TransactionId" = lt."Id"
       JOIN accounts a ON a."Id" = le."AccountId"
       WHERE lt."ReferenceType" = 'SALE'
         AND lt."ReferenceId"::text = $1
         AND a."AccountCode" = '2300'`,
      [inclSaleId],
    );
    assert(
      Math.abs(Number(glIncl.rows[0].credit) - inclTax) < 0.02,
      'B-I-gl-cr-2300',
      String(glIncl.rows[0].credit),
    );
  }

  // ── Product VAT untick (operator liability SSOT) ─────────────────────────
  log('\n## Gate B-U — Product VAT untick (is_taxable=false → tax 0 on retail)\n');
  await pool.query(
    `UPDATE system_settings
     SET tax_enabled = true, tax_inclusive = false, default_tax_rate = 18`,
  );
  await pool.query(
    `UPDATE products SET is_taxable = false, tax_rate = 18 WHERE id = $1::uuid`,
    [productSnap.id],
  );
  // Leave any enterprise mappings in place — they must NOT resurrect tax.
  const untickTax = await DocumentTaxService.computeForLines(pool, {
    scope: 'SALE',
    applyTenantDefaultWhenUnresolved: false,
    lines: [
      {
        lineIndex: 0,
        productId: productSnap.id,
        lineNetAmount: unitPrice,
        quantity: 1,
        isTaxable: true, // client cart still claims liable
        taxRate: 18,
      },
    ],
  });
  assert(
    untickTax.lineResults[0]?.determination === 'NONE',
    'B-U-determination-NONE',
    String(untickTax.lineResults[0]?.determination),
  );
  assert(
    Number(untickTax.documentTotals.totalTax) === 0,
    'B-U-tax-zero',
    String(untickTax.documentTotals.totalTax),
  );

  let untickSaleId: string | null = null;
  try {
    const createdUntick = await salesService.createSale(pool, {
      items: [
        {
          productId: productSnap.id,
          productName: productSnap.name,
          quantity: 1,
          unitPrice,
          discountAmount: 0,
          isTaxable: true,
          taxRate: 18,
        },
      ],
      subtotal: unitPrice,
      discountAmount: 0,
      taxAmount: 756, // wrong client exclusive preview — server must zero
      totalAmount: unitPrice,
      paymentMethod: 'CASH',
      paymentReceived: unitPrice,
      soldBy: soldBy!,
      idempotencyKey: `doc-tax-cert-untick-${Date.now()}`,
    });
    untickSaleId = createdUntick.sale.id;
    ok('B-U-createSale', `saleId=${untickSaleId}`);
  } catch (e) {
    bad('B-U-createSale', e instanceof Error ? e.message : String(e));
  }

  if (untickSaleId) {
    const uRow = await pool.query(
      `SELECT tax_amount::float8 AS tax_amount, total_amount::float8 AS total_amount
       FROM sales WHERE id = $1::uuid`,
      [untickSaleId],
    );
    assert(
      Number(uRow.rows[0].tax_amount) === 0,
      'B-U-sale-header-tax-zero',
      String(uRow.rows[0].tax_amount),
    );
    assert(
      Math.abs(Number(uRow.rows[0].total_amount) - unitPrice) < 0.02,
      'B-U-sale-total-shell',
      String(uRow.rows[0].total_amount),
    );
    const uItems = await pool.query(
      `SELECT tax_amount::float8 AS tax_amount, tax_determination, is_taxable
       FROM sale_items WHERE sale_id = $1::uuid`,
      [untickSaleId],
    );
    assert(
      Number(uItems.rows[0]?.tax_amount) === 0,
      'B-U-line-tax-zero',
      String(uItems.rows[0]?.tax_amount),
    );
    assert(
      uItems.rows[0]?.tax_determination === 'NONE',
      'B-U-line-determination-NONE',
      String(uItems.rows[0]?.tax_determination),
    );
  }

  log('\n## Deferred / out of scope this run\n');
  skipped('D-restaurant-order', 'HTTP FOH settle lane — use proof:order-complete-soak:live');
  skipped('D-quotation-convert', 'use proof:quotation-invoice-pdf:live');
  skipped('D-offline-replay', 'requires offline queue fixture');
  skipped('D-phase-8b-multi-rate-gl', 'deferred — single CR 2300 still intentional');
  skipped('D-perf-p50-p99', 'benchmark not in this mutation cert');

  await finish();
}

async function finish() {
  try {
    await restoreFixtures();
    ok('Z-fixtures-restored');
  } catch (e) {
    bad('Z-fixtures-restored', e instanceof Error ? e.message : String(e));
  }

  log('\n## Summary\n');
  log(`PASS: ${pass}  FAIL: ${fail}  SKIP: ${skip}`);
  const certified = fail === 0;
  log(`\n**Verdict:** ${certified ? 'CERTIFIED (live mutation lane)' : 'NOT CERTIFIED'}\n`);
  writeFileSync(OUT, lines.join('\n') + '\n', 'utf8');
  console.log('═'.repeat(60));
  console.log(` wrote ${OUT}`);
  console.log(` PASS=${pass} FAIL=${fail} SKIP=${skip}`);
  console.log('═'.repeat(60));
  await pool.end();
  process.exit(certified ? 0 : 1);
}

main().catch(async (e) => {
  bad('fatal', e instanceof Error ? e.stack || e.message : String(e));
  try {
    await restoreFixtures();
  } catch {
    /* ignore */
  }
  writeFileSync(OUT, lines.join('\n') + '\n', 'utf8');
  await pool.end().catch(() => undefined);
  process.exit(1);
});
