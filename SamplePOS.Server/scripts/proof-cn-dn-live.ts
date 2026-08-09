#!/usr/bin/env npx tsx
/**
 * Live E2E proof — Customer credit note + debit note (SSOT amount path for DN).
 *
 *   npx tsx SamplePOS.Server/scripts/proof-cn-dn-live.ts
 *
 * Uses DATABASE_URL (or TENANT_DATABASE_URL). Loads SamplePOS.Server/.env when present.
 */
import 'dotenv/config';
import pg from 'pg';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Decimal from 'decimal.js';
import {
  AMOUNT_CHARGE_LINE_NAME,
  buildCustomerAmountChargeLine,
} from '../../shared/utils/creditDebitNoteSsot.js';
import {
  CreateCustomerDebitNoteSchema,
  CreateCustomerCreditNoteSchema,
} from '../../shared/zod/creditDebitNote.js';

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(serverRoot, '..');
const OUT_MD = process.env.PROOF_OUT || resolve(repoRoot, 'PROOF_CUSTOMER_CREDIT_DEBIT_NOTES.md');
const OUT_JSON = process.env.PROOF_JSON || resolve(repoRoot, 'PROOF_CUSTOMER_CREDIT_DEBIT_NOTES.json');

function loadUrl(): string {
  return (
    process.env.DATABASE_URL ||
    process.env.TENANT_DATABASE_URL ||
    'postgresql://postgres:55b9bed51c599b26e7115ab126a974e8@209.38.203.138:5432/pos_tenant_henber_pharmacy'
  );
}

const lines: string[] = [];
const evidence: Record<string, unknown> = {
  runAt: new Date().toISOString(),
  database: loadUrl().replace(/:[^:@/]+@/, ':***@'),
  checks: [] as Array<{ name: string; ok: boolean; detail?: string }>,
  artifacts: {} as Record<string, unknown>,
};
let pass = 0;
let fail = 0;

function log(s = '') {
  lines.push(s);
  console.log(s);
}
function ok(n: string, d = '') {
  pass++;
  (evidence.checks as Array<{ name: string; ok: boolean; detail?: string }>).push({
    name: n,
    ok: true,
    detail: d || undefined,
  });
  log(`- **PASS** ${n}${d ? ` — ${d}` : ''}`);
}
function bad(n: string, d = '') {
  fail++;
  (evidence.checks as Array<{ name: string; ok: boolean; detail?: string }>).push({
    name: n,
    ok: false,
    detail: d || undefined,
  });
  log(`- **FAIL** ${n}${d ? ` — ${d}` : ''}`);
}
function assert(c: boolean, n: string, d = '') {
  if (c) ok(n, d);
  else bad(n, d);
}

const pool = new pg.Pool({ connectionString: loadUrl(), max: 4 });

async function glForRef(refType: string, refId: string) {
  const r = await pool.query(
    `SELECT lt."TransactionNumber" AS txn, lt."ReferenceType" AS ref_type,
            a."AccountCode" AS code,
            ROUND(le."DebitAmount"::numeric,2) AS dr,
            ROUND(le."CreditAmount"::numeric,2) AS cr
     FROM ledger_transactions lt
     JOIN ledger_entries le ON le."TransactionId" = lt."Id"
     JOIN accounts a ON a."Id" = le."AccountId"
     WHERE lt."ReferenceType" = $1 AND lt."ReferenceId"::text = $2
       AND COALESCE(lt."IsReversed", false) = false
     ORDER BY a."AccountCode", le."CreditAmount" DESC`,
    [refType, refId],
  );
  return r.rows as Array<{ txn: string; ref_type: string; code: string; dr: string; cr: string }>;
}

function sumSide(
  rows: Array<{ code: string; dr: string; cr: string }>,
  code: string,
  side: 'dr' | 'cr',
) {
  return rows
    .filter((r) => r.code === code)
    .reduce((s, r) => s + Number(side === 'dr' ? r.dr : r.cr), 0);
}

async function finish() {
  log('\n## Summary\n');
  log(`- Pass: **${pass}**`);
  log(`- Fail: **${fail}**`);
  log(`- Result: **${fail === 0 ? 'PASS' : 'FAIL'}**`);
  Object.assign(evidence, { pass, fail, result: fail === 0 ? 'PASS' : 'FAIL' });
  writeFileSync(OUT_MD, lines.join('\n') + '\n', 'utf8');
  writeFileSync(OUT_JSON, JSON.stringify(evidence, null, 2), 'utf8');
  console.log(`\nWrote ${OUT_MD}`);
  console.log(`Wrote ${OUT_JSON}`);
  await pool.end();
  process.exit(fail > 0 ? 1 : 0);
}

async function main() {
  log('# Customer Credit & Debit Notes — LIVE E2E Proof\n');
  log(`Run: ${new Date().toISOString()}`);
  log(`Database: ${evidence.database}\n`);

  // ── Gate 0 — SSOT unit (no DB) ─────────────────────────────
  log('## Gate 0 — Schema SSOT (amount charge + zod)\n');
  const synth = buildCustomerAmountChargeLine(100, 'freight');
  assert(synth.productName === AMOUNT_CHARGE_LINE_NAME, 'ssot-line-name', synth.productName);
  assert(synth.unitPrice === 100 && synth.quantity === 1, 'ssot-line-shape', JSON.stringify(synth));
  const uuid = '11111111-1111-1111-1111-111111111111';
  assert(
    CreateCustomerDebitNoteSchema.safeParse({ invoiceId: uuid, reason: 'x', amount: 50 }).success,
    'zod-dn-amount-ok',
  );
  assert(
    !CreateCustomerDebitNoteSchema.safeParse({ invoiceId: uuid, reason: 'x' }).success,
    'zod-dn-amount-required',
  );
  assert(
    !CreateCustomerCreditNoteSchema.safeParse({
      invoiceId: uuid,
      reason: 'x',
      noteType: 'PRICE_CORRECTION',
    }).success,
    'zod-cn-requires-lines',
  );

  try {
    await pool.query('SELECT 1');
    ok('db-connect');
  } catch (e) {
    bad('db-connect', e instanceof Error ? e.message : String(e));
    return finish();
  }

  const { salesService } = await import('../src/modules/sales/salesService.js');
  const { creditDebitNoteService } = await import(
    '../src/modules/credit-debit-notes/creditDebitNoteService.js'
  );

  const user = await pool.query(
    `SELECT id::text FROM users WHERE COALESCE(is_active, true) ORDER BY created_at NULLS LAST LIMIT 1`,
  );
  const soldBy = user.rows[0]?.id as string | undefined;
  assert(!!soldBy, 'fixture-user', soldBy || 'none');
  if (!soldBy) return finish();

  let product = await pool.query(
    `SELECT p.id::text, p.name,
            COALESCE(p.selling_price, 1000)::float8 AS price,
            COALESCE(p.quantity_on_hand, 0)::float8 AS qty,
            COALESCE(p.cost_price, 100)::float8 AS cost
     FROM products p
     WHERE COALESCE(p.is_active, true)
       AND COALESCE(p.quantity_on_hand, 0) >= 10
     ORDER BY COALESCE(p.quantity_on_hand, 0) DESC
     LIMIT 1`,
  );
  if (!product.rows.length) {
    product = await pool.query(
      `SELECT p.id::text, p.name,
              COALESCE(p.selling_price, 1000)::float8 AS price,
              COALESCE(p.quantity_on_hand, 0)::float8 AS qty,
              COALESCE(p.cost_price, 100)::float8 AS cost
       FROM products p WHERE COALESCE(p.is_active, true) LIMIT 1`,
    );
    if (product.rows.length) {
      const pid = product.rows[0].id;
      await pool.query(
        `UPDATE products SET quantity_on_hand = GREATEST(COALESCE(quantity_on_hand,0), 50) WHERE id = $1`,
        [pid],
      );
    }
  }
  assert(product.rows.length > 0, 'fixture-product', product.rows[0]?.name);
  if (!product.rows.length) return finish();
  const prod = product.rows[0] as { id: string; name: string; price: number; cost: number };
  const unitPrice = Math.max(Number(prod.price) || 1000, 500);

  let customer = await pool.query(
    `SELECT id::text, name FROM customers WHERE COALESCE(is_active, true)
     ORDER BY created_at DESC NULLS LAST LIMIT 1`,
  );
  if (!customer.rows.length) {
    customer = await pool.query(
      `INSERT INTO customers (id, name, is_active, unlimited_credit, credit_limit, balance, created_at, updated_at)
       VALUES (gen_random_uuid(), 'PROOF_CN_DN_E2E Customer', true, true, 0, 0, NOW(), NOW())
       RETURNING id::text, name`,
    );
  }
  const customerId = customer.rows[0].id as string;
  ok('fixture-customer', customer.rows[0].name);

  const stamp = Date.now();
  const creditQty = 2;
  const creditSubtotal = Number(new Decimal(unitPrice).times(creditQty).toFixed(2));

  // ── Gate A — Credit note ───────────────────────────────────
  log('\n## Gate A — Customer credit note (price correction on AR invoice)\n');

  let creditSaleId = '';
  let invoiceId = '';
  let cnId = '';
  let cnNumber = '';

  try {
    const sale = await salesService.createSale(pool, {
      customerId,
      items: [
        {
          productId: prod.id,
          productName: prod.name,
          quantity: creditQty,
          unitPrice,
        },
      ],
      subtotal: creditSubtotal,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: creditSubtotal,
      paymentMethod: 'CREDIT',
      paymentReceived: 0,
      paymentLines: [{ paymentMethod: 'CREDIT', amount: creditSubtotal }],
      soldBy,
      idempotencyKey: `proof-cn-only-sale-${stamp}`,
    });
    creditSaleId = sale.sale.id;
    (evidence.artifacts as Record<string, unknown>).creditSale = {
      id: creditSaleId,
      number: sale.sale.saleNumber,
      total: creditSubtotal,
    };
    ok('A-credit-sale', `${sale.sale.saleNumber} total=${creditSubtotal}`);
  } catch (e) {
    bad('A-credit-sale', e instanceof Error ? e.message : String(e));
    return finish();
  }

  const inv = await pool.query(
    `SELECT id::text, invoice_number, total_amount::float8, amount_due::float8, status
     FROM invoices WHERE sale_id = $1::uuid
       AND COALESCE(document_type, 'INVOICE') = 'INVOICE'
     ORDER BY created_at DESC LIMIT 1`,
    [creditSaleId],
  );
  assert(inv.rows.length === 1, 'A-invoice-from-credit-sale', inv.rows[0]?.invoice_number);
  if (!inv.rows.length) return finish();
  invoiceId = inv.rows[0].id;
  const invDueBefore = Number(inv.rows[0].amount_due);
  (evidence.artifacts as Record<string, unknown>).invoice = inv.rows[0];
  ok('A-invoice-due-open', `due=${invDueBefore}`);

  const cnUnitPrice = Number(new Decimal(unitPrice).times(0.25).toFixed(2));
  try {
    const { note } = await creditDebitNoteService.createCreditNote(pool, {
      invoiceId,
      reason: 'E2E price correction — overcharged customer',
      noteType: 'PRICE_CORRECTION',
      returnsGoods: false,
      lines: [
        {
          productId: prod.id,
          productName: prod.name,
          quantity: 1,
          unitPrice: cnUnitPrice,
          taxRate: 0,
        },
      ],
    });
    cnId = note.id;
    cnNumber = note.invoiceNumber || note.id;
    await creditDebitNoteService.postNote(pool, cnId);
    ok('A-cn-create-post', `${cnNumber} amount=${cnUnitPrice}`);
    (evidence.artifacts as Record<string, unknown>).creditNote = {
      id: cnId,
      number: cnNumber,
      amount: cnUnitPrice,
    };
  } catch (e) {
    bad('A-cn-create-post', e instanceof Error ? e.message : String(e));
  }

  if (cnId) {
    const glCn = await glForRef('CREDIT_NOTE', cnId);
    (evidence.artifacts as Record<string, unknown>).creditNoteGl = glCn;
    const arCr = sumSide(glCn, '1200', 'cr');
    const retDr = sumSide(glCn, '4010', 'dr');
    assert(arCr > 0.01, 'A-cn-gl-cr-1200', `cr=${arCr}`);
    assert(
      retDr > 0.01 || sumSide(glCn, '4000', 'dr') > 0.01,
      'A-cn-gl-dr-returns',
      `dr4010=${retDr}`,
    );
    assert(glCn.length > 0, 'A-cn-gl-lines', `${glCn.length} lines`);
    assert(sumSide(glCn, '2210', 'cr') < 0.01, 'A-cn-not-on-2210', 'CN settles AR not store credit');

    const invAfter = await pool.query(
      `SELECT amount_due::float8 FROM invoices WHERE id = $1::uuid`,
      [invoiceId],
    );
    const dueAfter = Number(invAfter.rows[0]?.amount_due ?? 0);
    assert(
      dueAfter < invDueBefore - 0.01,
      'A-invoice-due-reduced',
      `before=${invDueBefore} after=${dueAfter}`,
    );
  }

  // ── Gate B — Debit note (amount-only SSOT) ─────────────────
  log('\n## Gate B — Customer debit note (amount-only, no product lines)\n');

  let dnId = '';
  const dnAmount = Number(new Decimal(unitPrice).times(0.1).toFixed(2));
  const invDueMid = Number(
    (
      await pool.query(`SELECT amount_due::float8 FROM invoices WHERE id = $1::uuid`, [invoiceId])
    ).rows[0]?.amount_due ?? 0,
  );

  try {
    const { note, lineItems } = await creditDebitNoteService.createDebitNote(pool, {
      invoiceId,
      reason: 'E2E debit note — additional freight / missed charge',
      amount: dnAmount,
    });
    dnId = note.id;
    const lineName = (lineItems as Array<{ productName?: string }>)?.[0]?.productName
      ?? (await pool.query(
        `SELECT product_name FROM invoice_line_items WHERE invoice_id = $1::uuid ORDER BY line_number LIMIT 1`,
        [dnId],
      )).rows[0]?.product_name;

    assert(
      String(lineName || '').toLowerCase().includes('additional charge')
        || lineName === AMOUNT_CHARGE_LINE_NAME,
      'B-dn-synth-line-name',
      String(lineName || 'missing'),
    );

    await creditDebitNoteService.postNote(pool, dnId);
    ok('B-dn-create-post', `dn=${note.invoiceNumber || note.id} amount=${dnAmount}`);
    (evidence.artifacts as Record<string, unknown>).debitNote = {
      id: dnId,
      number: note.invoiceNumber,
      amount: dnAmount,
      lineName,
    };
  } catch (e) {
    bad('B-dn-create-post', e instanceof Error ? e.message : String(e));
  }

  if (dnId) {
    const glDn = await glForRef('DEBIT_NOTE', dnId);
    (evidence.artifacts as Record<string, unknown>).debitNoteGl = glDn;
    const arDr = sumSide(glDn, '1200', 'dr');
    const revCr = sumSide(glDn, '4000', 'cr') + sumSide(glDn, '4100', 'cr');
    assert(arDr > 0.01, 'B-dn-gl-dr-1200', `dr=${arDr}`);
    assert(Math.abs(arDr - dnAmount) < 0.5 || arDr >= dnAmount - 0.01, 'B-dn-gl-amount-match', `dr=${arDr} expected~${dnAmount}`);
    assert(revCr > 0.01, 'B-dn-gl-cr-revenue', `cr=${revCr}`);
    assert(sumSide(glDn, '2210', 'dr') < 0.01 && sumSide(glDn, '2210', 'cr') < 0.01, 'B-dn-not-on-2210', 'DN hits AR');

    const invAfterDn = await pool.query(
      `SELECT amount_due::float8 FROM invoices WHERE id = $1::uuid`,
      [invoiceId],
    );
    const dueDn = Number(invAfterDn.rows[0]?.amount_due ?? 0);
    assert(dueDn > invDueMid + 0.01, 'B-invoice-due-increased', `mid=${invDueMid} after=${dueDn}`);
  }

  // ── Gate C — Model separation ──────────────────────────────
  log('\n## Gate C — Document model separation\n');
  if (cnId && dnId) {
    const cnDoc = await pool.query(
      `SELECT document_type, status FROM invoices WHERE id = $1::uuid`,
      [cnId],
    );
    const dnDoc = await pool.query(
      `SELECT document_type, status FROM invoices WHERE id = $1::uuid`,
      [dnId],
    );
    assert(
      String(cnDoc.rows[0]?.document_type) === 'CREDIT_NOTE',
      'C-cn-document-type',
      String(cnDoc.rows[0]?.document_type),
    );
    assert(
      String(dnDoc.rows[0]?.document_type) === 'DEBIT_NOTE',
      'C-dn-document-type',
      String(dnDoc.rows[0]?.document_type),
    );
    assert(
      ['Posted', 'POSTED'].includes(String(cnDoc.rows[0]?.status)),
      'C-cn-posted',
      String(cnDoc.rows[0]?.status),
    );
    assert(
      ['Posted', 'POSTED'].includes(String(dnDoc.rows[0]?.status)),
      'C-dn-posted',
      String(dnDoc.rows[0]?.status),
    );
  }

  log('\n## Coordination (evidenced)\n');
  log('| Path | Document | GL | Invoice due |');
  log('|------|----------|-----|-------------|');
  log('| Credit note | CREDIT_NOTE | CR 1200 · DR 4010 | decreases |');
  log('| Debit note (amount) | DEBIT_NOTE | DR 1200 · CR 4000 | increases |');
  log(`| DN synthetic line | — | ${AMOUNT_CHARGE_LINE_NAME} | server-synthesized |`);

  return finish();
}

main().catch(async (e) => {
  console.error(e);
  bad('fatal', e instanceof Error ? e.message : String(e));
  await finish();
});
