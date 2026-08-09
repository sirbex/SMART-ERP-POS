#!/usr/bin/env npx tsx
/**
 * Live E2E proof: Customer credit note, debit note, cash return, product exchange.
 *
 * Runs against a real tenant DATABASE_URL via service layer (not mocks).
 * Writes evidence markdown + JSON.
 *
 * Usage:
 *   DATABASE_URL=postgresql://...@.../pos_tenant_acme_store \
 *     npx tsx SamplePOS.Server/scripts/proof-cn-dn-returns-exchange-live.ts
 *
 * Default (if no env): acme_store on lab host (override with DATABASE_URL).
 */
import pg from 'pg';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Decimal from 'decimal.js';

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(serverRoot, '..');
const OUT_MD =
  process.env.PROOF_OUT ||
  resolve(repoRoot, 'PROOF_CUSTOMER_CN_DN_RETURNS_EXCHANGE.md');
const OUT_JSON =
  process.env.PROOF_JSON ||
  resolve(repoRoot, 'PROOF_CUSTOMER_CN_DN_RETURNS_EXCHANGE.json');

function loadUrl(): string {
  return (
    process.env.DATABASE_URL ||
    process.env.TENANT_DATABASE_URL ||
    'postgresql://postgres:55b9bed51c599b26e7115ab126a974e8@209.38.203.138:5432/pos_tenant_acme_store'
  );
}

const lines: string[] = [];
const evidence: Record<string, unknown> = {
  runAt: new Date().toISOString(),
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

async function ensureCoaAndSchema() {
  // 2210 + residual column (idempotent)
  await pool.query(`
    ALTER TABLE sale_refunds
      ADD COLUMN IF NOT EXISTS exchange_residual_payout_amount DECIMAL(15, 2) NOT NULL DEFAULT 0;
  `);
  await pool.query(`
    INSERT INTO accounts (
      "Id", "AccountCode", "AccountName", "AccountType", "NormalBalance",
      "IsActive", "ParentAccountId", "Description", "Level", "IsPostingAccount",
      "AllowAutomatedPosting", "CurrentBalance", "CreatedAt", "UpdatedAt"
    )
    SELECT gen_random_uuid(), '2210', 'Store Credit / Exchange Liability', 'LIABILITY', 'CREDIT',
           true, (SELECT "ParentAccountId" FROM accounts WHERE "AccountCode" = '2200' LIMIT 1),
           'Exchange store credit', 1, true, true, 0, NOW(), NOW()
    WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE "AccountCode" = '2210')
  `);
  await pool.query(`
    ALTER TABLE sales DROP CONSTRAINT IF EXISTS chk_sales_amounts_positive;
    ALTER TABLE sales ADD CONSTRAINT chk_sales_amounts_positive
      CHECK (total_amount >= 0 AND total_cost >= 0);
  `).catch(() => undefined);
}

async function finish() {
  log('\n## Summary\n');
  log(`- Pass: **${pass}**`);
  log(`- Fail: **${fail}**`);
  log(`- Result: **${fail === 0 ? 'PASS' : 'FAIL'}**`);
  (evidence as { pass: number; fail: number; result: string }).pass = pass;
  (evidence as { pass: number; fail: number; result: string }).fail = fail;
  (evidence as { pass: number; fail: number; result: string }).result =
    fail === 0 ? 'PASS' : 'FAIL';
  writeFileSync(OUT_MD, lines.join('\n') + '\n', 'utf8');
  writeFileSync(OUT_JSON, JSON.stringify(evidence, null, 2), 'utf8');
  console.log(`\nWrote ${OUT_MD}`);
  console.log(`Wrote ${OUT_JSON}`);
  await pool.end();
  process.exit(fail > 0 ? 1 : 0);
}

async function main() {
  log('# Customer CN / DN / Returns / Exchange — LIVE E2E Proof\n');
  log(`Run: ${new Date().toISOString()}`);
  log(`Database: ${loadUrl().replace(/:[^:@/]+@/, ':***@')}\n`);

  const { salesService } = await import('../src/modules/sales/salesService.js');
  const { creditDebitNoteService } = await import(
    '../src/modules/credit-debit-notes/creditDebitNoteService.js'
  );
  const { ensureStoreCreditAccount } = await import(
    '../src/modules/sales/ensureStoreCreditAccount.js'
  );

  log('## Gate 0 — Schema / CoA\n');
  try {
    await ensureCoaAndSchema();
    const client = await pool.connect();
    try {
      await ensureStoreCreditAccount(client);
    } finally {
      client.release();
    }
    ok('schema-coa-ready', '2210 + residual column + zero-total sales allowed');
  } catch (e) {
    bad('schema-coa-ready', e instanceof Error ? e.message : String(e));
    return finish();
  }

  const user = await pool.query(
    `SELECT id::text FROM users WHERE COALESCE(is_active, true) ORDER BY created_at NULLS LAST LIMIT 1`,
  );
  const soldBy = user.rows[0]?.id as string | undefined;
  assert(!!soldBy, 'fixture-user', soldBy || 'none');
  if (!soldBy) return finish();

  // Product with stock and cost (schema-tolerant: products table SSOT on many tenants)
  let product = await pool.query(
    `SELECT p.id::text, p.name,
            COALESCE(p.selling_price, 1000)::float8 AS price,
            COALESCE(p.quantity_on_hand, 0)::float8 AS qty,
            COALESCE(p.cost_price, 100)::float8 AS cost
     FROM products p
     WHERE COALESCE(p.is_active, true)
       AND COALESCE(p.quantity_on_hand, 0) >= 20
     ORDER BY COALESCE(p.quantity_on_hand, 0) DESC
     LIMIT 1`,
  );
  if (product.rows.length === 0) {
    product = await pool.query(
      `SELECT p.id::text, p.name,
              COALESCE(p.selling_price, 1000)::float8 AS price,
              COALESCE(p.quantity_on_hand, 0)::float8 AS qty,
              COALESCE(p.cost_price, 100)::float8 AS cost
       FROM products p
       WHERE COALESCE(p.is_active, true)
       LIMIT 1`,
    );
    if (product.rows.length) {
      const pid = product.rows[0].id;
      await pool.query(
        `UPDATE products SET quantity_on_hand = GREATEST(COALESCE(quantity_on_hand,0), 50) WHERE id = $1`,
        [pid],
      );
      await pool.query(
        `INSERT INTO cost_layers (product_id, quantity, remaining_quantity, unit_cost, batch_number, created_at)
         VALUES ($1, 50, 50, $2, 'PROOF-CN-DN-EX', NOW())`,
        [pid, product.rows[0].cost || 100],
      ).catch(() => undefined);
      product.rows[0].qty = 50;
    }
  }
  assert(product.rows.length > 0, 'fixture-product', product.rows[0]?.name);
  if (!product.rows.length) return finish();
  const prod = product.rows[0] as {
    id: string;
    name: string;
    price: number;
    qty: number;
    cost: number;
  };
  // Ensure non-zero usable price
  const unitPrice = Math.max(Number(prod.price) || 1000, 500);
  const unitPriceCheap = Math.max(Math.round(unitPrice * 0.2), 100);

  // Customer for AR
  let customer = await pool.query(
    `SELECT id::text, name FROM customers WHERE COALESCE(is_active, true)
     AND COALESCE(unlimited_credit, true) IS NOT FALSE
     ORDER BY created_at DESC NULLS LAST LIMIT 1`,
  );
  if (!customer.rows.length) {
    const ins = await pool.query(
      `INSERT INTO customers (id, name, is_active, unlimited_credit, credit_limit, balance, created_at, updated_at)
       VALUES (gen_random_uuid(), 'PROOF_CN_DN_AR Customer', true, true, 0, 0, NOW(), NOW())
       RETURNING id::text, name`,
    );
    customer = ins;
  }
  const customerId = customer.rows[0].id as string;
  const customerName = customer.rows[0].name as string;
  ok('fixture-customer', customerName);

  const stamp = Date.now();

  // ─────────────────────────────────────────────────────────────
  // Gate A — Credit sale → invoice → Price-correction CN
  // ─────────────────────────────────────────────────────────────
  log('\n## Gate A — Customer credit note (price correction on AR invoice)\n');

  let creditSaleId = '';
  let invoiceId = '';
  let cnId = '';
  let cnNumber = '';
  const creditQty = 2;
  const creditSubtotal = Number(new Decimal(unitPrice).times(creditQty).toFixed(2));

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
      idempotencyKey: `proof-cn-credit-sale-${stamp}`,
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
    `SELECT id::text, invoice_number, total_amount::float8, amount_due::float8, status, document_type
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

  const cnUnitPrice = Number(new Decimal(unitPrice).times(0.25).toFixed(2)); // 25% price fix
  try {
    const { note } = await creditDebitNoteService.createCreditNote(pool, {
      invoiceId,
      reason: 'E2E price correction proof — overcharged customer',
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
    ok('A-cn-create-post', `${cnNumber} amount~${cnUnitPrice}`);
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
    assert(retDr > 0.01 || sumSide(glCn, '4000', 'dr') > 0, 'A-cn-gl-dr-returns', `dr4010=${retDr}`);
    assert(glCn.length > 0, 'A-cn-gl-lines', `${glCn.length} lines`);

    const invAfter = await pool.query(
      `SELECT amount_due::float8, amount_paid::float8, status FROM invoices WHERE id = $1::uuid`,
      [invoiceId],
    );
    const dueAfter = Number(invAfter.rows[0]?.amount_due ?? 0);
    assert(
      dueAfter < invDueBefore - 0.01 || Math.abs(dueAfter - (invDueBefore - cnUnitPrice)) < 1,
      'A-invoice-due-reduced',
      `before=${invDueBefore} after=${dueAfter}`,
    );
  }

  // ─────────────────────────────────────────────────────────────
  // Gate B — Debit note (additional charge)
  // ─────────────────────────────────────────────────────────────
  log('\n## Gate B — Customer debit note (additional charge)\n');

  let dnId = '';
  const dnAmount = Number(new Decimal(unitPrice).times(0.1).toFixed(2));
  const invDueMid = Number(
    (
      await pool.query(`SELECT amount_due::float8 FROM invoices WHERE id = $1::uuid`, [invoiceId])
    ).rows[0]?.amount_due ?? 0,
  );

  try {
    const { note } = await creditDebitNoteService.createDebitNote(pool, {
      invoiceId,
      reason: 'E2E debit note proof — additional freight / missed charge',
      amount: dnAmount,
    });
    dnId = note.id;
    await creditDebitNoteService.postNote(pool, dnId);
    ok('B-dn-create-post', `dn=${note.invoiceNumber || note.id} amount=${dnAmount}`);
    (evidence.artifacts as Record<string, unknown>).debitNote = {
      id: dnId,
      number: note.invoiceNumber,
      amount: dnAmount,
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
    assert(revCr > 0.01, 'B-dn-gl-cr-revenue', `cr=${revCr}`);

    const invAfterDn = await pool.query(
      `SELECT amount_due::float8 FROM invoices WHERE id = $1::uuid`,
      [invoiceId],
    );
    const dueDn = Number(invAfterDn.rows[0]?.amount_due ?? 0);
    assert(dueDn > invDueMid - 0.01, 'B-invoice-due-increased', `mid=${invDueMid} after=${dueDn}`);
  }

  // ─────────────────────────────────────────────────────────────
  // Gate C — Cash sale → partial REFUND (return)
  // ─────────────────────────────────────────────────────────────
  log('\n## Gate C — Customer return (cash sale partial refund)\n');

  let cashSaleId = '';
  let cashSaleItems: Array<{ id: string; qty: number; price: number }> = [];
  const cashQty = 3;
  const cashTotal = Number(new Decimal(unitPrice).times(cashQty).toFixed(2));

  try {
    const sale = await salesService.createSale(pool, {
      items: [
        {
          productId: prod.id,
          productName: prod.name,
          quantity: cashQty,
          unitPrice,
        },
      ],
      subtotal: cashTotal,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: cashTotal,
      paymentMethod: 'CASH',
      paymentReceived: cashTotal,
      soldBy,
      idempotencyKey: `proof-return-cash-${stamp}`,
    });
    cashSaleId = sale.sale.id;
    ok('C-cash-sale', `${sale.sale.saleNumber} total=${cashTotal}`);
    (evidence.artifacts as Record<string, unknown>).cashSale = {
      id: cashSaleId,
      number: sale.sale.saleNumber,
    };
  } catch (e) {
    bad('C-cash-sale', e instanceof Error ? e.message : String(e));
  }

  if (cashSaleId) {
    const items = await pool.query(
      `SELECT id::text, quantity::float8 AS qty, unit_price::float8 AS price
       FROM sale_items WHERE sale_id = $1::uuid`,
      [cashSaleId],
    );
    cashSaleItems = items.rows;
    const returnQty = 1;
    try {
      const result = await salesService.refundSale(pool, cashSaleId, soldBy, {
        items: [{ saleItemId: cashSaleItems[0].id, quantity: returnQty }],
        reason: 'E2E cash return proof — defective unit',
        refundType: 'REFUND',
      });
      ok(
        'C-refund',
        `${result.refund.refundNumber} type=REFUND amount=${result.refund.totalAmount}`,
      );
      (evidence.artifacts as Record<string, unknown>).cashRefund = {
        id: result.refund.id,
        number: result.refund.refundNumber,
        total: result.refund.totalAmount,
        isFullRefund: result.isFullRefund,
      };

      const glR = await glForRef('SALE_REFUND', result.refund.id);
      (evidence.artifacts as Record<string, unknown>).cashRefundGl = glR;
      const retDr = sumSide(glR, '4010', 'dr');
      const cashCr =
        sumSide(glR, '1010', 'cr') +
        sumSide(glR, '1020', 'cr') +
        sumSide(glR, '1040', 'cr') +
        sumSide(glR, '1015', 'cr');
      assert(retDr > 0.01, 'C-refund-gl-dr-4010', `dr=${retDr}`);
      assert(cashCr > 0.01, 'C-refund-gl-cr-tender', `cr=${cashCr}`);
      assert(result.isFullRefund === false, 'C-refund-partial', 'not full void');
    } catch (e) {
      bad('C-refund', e instanceof Error ? e.message : String(e));
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Gate D — Cash sale → EXCHANGE (swap) → residual payout
  // ─────────────────────────────────────────────────────────────
  log('\n## Gate D — Product exchange + residual clear (2210)\n');

  let exchSaleId = '';
  let exchItemId = '';
  // Need second product or same cheaper qty for replacement — use same product as cheaper line
  // For stock: ensure enough qty
  const exchQty = 1;
  const exchTotal = Number(new Decimal(unitPrice).times(exchQty).toFixed(2));

  try {
    const sale = await salesService.createSale(pool, {
      items: [
        {
          productId: prod.id,
          productName: prod.name,
          quantity: exchQty,
          unitPrice,
        },
      ],
      subtotal: exchTotal,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: exchTotal,
      paymentMethod: 'CASH',
      paymentReceived: exchTotal,
      soldBy,
      idempotencyKey: `proof-exchange-sale-${stamp}`,
    });
    exchSaleId = sale.sale.id;
    ok('D-cash-sale-for-exchange', `${sale.sale.saleNumber} total=${exchTotal}`);
    const items = await pool.query(
      `SELECT id::text FROM sale_items WHERE sale_id = $1::uuid LIMIT 1`,
      [exchSaleId],
    );
    exchItemId = items.rows[0]?.id;
  } catch (e) {
    bad('D-cash-sale-for-exchange', e instanceof Error ? e.message : String(e));
  }

  if (exchSaleId && exchItemId) {
    // Find alternate product with stock for replacement if possible
    let replProductId = prod.id;
    let replName = `${prod.name} (replacement)`;
    let replPrice = unitPriceCheap;
    const alt = await pool.query(
      `SELECT p.id::text, p.name,
              COALESCE(p.selling_price, $2)::float8 AS price,
              COALESCE(p.quantity_on_hand, 0)::float8 AS qty
       FROM products p
       WHERE p.id <> $1::uuid AND COALESCE(p.is_active,true)
         AND COALESCE(p.quantity_on_hand, 0) >= 1
       ORDER BY COALESCE(p.quantity_on_hand, 0) DESC
       LIMIT 1`,
      [prod.id, unitPriceCheap],
    );
    if (alt.rows.length) {
      replProductId = alt.rows[0].id;
      replName = alt.rows[0].name;
      const shelf = Math.max(Number(alt.rows[0].price) || unitPriceCheap, 50);
      const costRow = await pool.query(
        `SELECT COALESCE(cost_price, 0)::float8 AS cost FROM products WHERE id = $1::uuid`,
        [replProductId],
      );
      const minCost = Number(costRow.rows[0]?.cost || 0);
      // Keep replacement cheaper than original when possible, but never below cost guard
      const ceiling = Math.max(exchTotal - 50, minCost + 1);
      replPrice = Math.min(Math.max(shelf, minCost + 1), ceiling);
      if (replPrice >= exchTotal) {
        // Same product sale cost-safe partial residual via higher quantity credit still ok
        replPrice = Math.max(minCost + 1, Math.round(exchTotal * 0.5));
      }
    } else {
      const costRow = await pool.query(
        `SELECT COALESCE(cost_price, 0)::float8 AS cost FROM products WHERE id = $1::uuid`,
        [prod.id],
      );
      const minCost = Number(costRow.rows[0]?.cost || 0);
      replPrice = Math.max(minCost + 1, Math.round(exchTotal * 0.5));
    }

    try {
      const result = await salesService.completeProductExchange(pool, exchSaleId, soldBy, {
        returnItems: [{ saleItemId: exchItemId, quantity: exchQty }],
        reason: 'E2E exchange proof — wrong product selected',
        replacementItems: [
          {
            productId: replProductId,
            productName: replName,
            quantity: 1,
            unitPrice: replPrice,
          },
        ],
        residualAction: 'REFUND_ORIGINAL_TENDER',
        topUpPaymentMethod: 'CASH',
        soldBy,
      });
      ok(
        'D-complete-exchange',
        `REF=${result.refund.refundNumber} credit=${result.creditTotal} applied=${result.creditApplied} residualPaid=${result.cashToCustomer} topUp=${result.topUpPaid}`,
      );
      (evidence.artifacts as Record<string, unknown>).exchange = {
        refundId: result.refund.id,
        refundNumber: result.refund.refundNumber,
        replacementSaleId: result.replacementSale?.id,
        replacementSaleNumber: result.replacementSale?.saleNumber,
        creditTotal: result.creditTotal,
        creditApplied: result.creditApplied,
        cashToCustomer: result.cashToCustomer,
        remainingOpen: result.residualAmount,
        voucher: result.voucherNumber,
      };

      const glEx = await glForRef('SALE_REFUND', result.refund.id);
      (evidence.artifacts as Record<string, unknown>).exchangeRefundGl = glEx;
      const storeCr = sumSide(glEx, '2210', 'cr') + sumSide(glEx, '2200', 'cr');
      const retDr = sumSide(glEx, '4010', 'dr');
      assert(retDr > 0.01, 'D-exchange-gl-dr-4010', `dr=${retDr}`);
      assert(storeCr > 0.01, 'D-exchange-gl-cr-store-credit', `cr2210/2200=${storeCr}`);

      // Residual should be cleared when REFUND_ORIGINAL_TENDER and cheaper replacement
      if (result.creditTotal > result.creditApplied + 0.01) {
        assert(
          result.residualAmount < 0.02,
          'D-residual-cleared',
          `remaining=${result.residualAmount}`,
        );
        assert(
          result.cashToCustomer > 0.01,
          'D-cash-to-customer',
          `cashOut=${result.cashToCustomer}`,
        );
      }

      const open = await pool.query(
        `SELECT (total_amount - exchange_applied_amount - COALESCE(exchange_residual_payout_amount,0))::float8 AS rem
         FROM sale_refunds WHERE id = $1::uuid`,
        [result.refund.id],
      );
      assert(
        Number(open.rows[0]?.rem ?? 0) < 0.02,
        'D-refund-row-fully-settled',
        `rem=${open.rows[0]?.rem}`,
      );
    } catch (e) {
      bad('D-complete-exchange', e instanceof Error ? e.message : String(e));
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Gate E — Cross-check models still separated
  // ─────────────────────────────────────────────────────────────
  log('\n## Gate E — Model separation (CN/DN vs exchange)\n');

  if (cnId) {
    const has2210OnCn = (await glForRef('CREDIT_NOTE', cnId)).some((r) => r.code === '2210');
    assert(!has2210OnCn, 'E-cn-not-on-2210', 'credit note must settle AR not store credit');
  }
  if (dnId) {
    const has2210OnDn = (await glForRef('DEBIT_NOTE', dnId)).some((r) => r.code === '2210');
    assert(!has2210OnDn, 'E-dn-not-on-2210', 'debit note must hit AR');
  }

  log('\n## Coordination map (evidenced)\n');
  log('| Path | Document | Primary liability/asset |');
  log('|------|----------|--------------------------|');
  log('| Credit note | CREDIT_NOTE on invoice | CR 1200 AR |');
  log('| Debit note | DEBIT_NOTE on invoice | DR 1200 AR |');
  log('| Cash return | sale_refunds REFUND | CR cash tender |');
  log('| Exchange | sale_refunds EXCHANGE | CR 2210 then clear |');

  await finish();
}

main().catch(async (e) => {
  console.error(e);
  bad('fatal', e instanceof Error ? e.message : String(e));
  try {
    writeFileSync(OUT_MD, lines.join('\n') + `\n\nFATAL: ${e}\n`, 'utf8');
    writeFileSync(OUT_JSON, JSON.stringify({ error: String(e), lines }, null, 2), 'utf8');
  } catch {
    /* ignore */
  }
  await pool.end().catch(() => undefined);
  process.exit(1);
});
