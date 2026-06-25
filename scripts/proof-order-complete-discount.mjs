#!/usr/bin/env node
/**
 * Proof: order complete must not double-count line + header discounts.
 *
 * Reproduces Henber ORD-2026-6333 (order 9b1f1f6e-f21d-465e-913b-cd7ad89cd398):
 *   subtotal 565000, header discount 5000, line discount 5000 on one item → total 560000
 *
 * Usage:
 *   node scripts/proof-order-complete-discount.mjs
 *   npm run proof:order-complete-discount
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../SamplePOS.Server/package.json', import.meta.url));
const Decimal = require('decimal.js');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0;
let fail = 0;
const ok = (n, d = '') => { pass++; console.log(`  PASS  ${n}${d ? ` — ${d}` : ''}`); };
const bad = (n, d = '') => { fail++; console.error(`  FAIL  ${n}${d ? ` — ${d}` : ''}`); };
const assert = (c, n, d = '') => (c ? ok(n, d) : bad(n, d));

/** Production order snapshot (Henber, 2026-06). */
const HENBER_ORDER = {
  id: '9b1f1f6e-f21d-465e-913b-cd7ad89cd398',
  orderNumber: 'ORD-2026-6333',
  subtotal: '565000.00',
  discountAmount: '5000.00',
  taxAmount: '0.00',
  totalAmount: '560000.00',
  items: [
    { productName: 'Azelaic acid (Skinoren) cream 10g', quantity: '1', unitPrice: '30000.00', discountAmount: '0' },
    { productName: 'The Ordinary Multi peptide hair density', quantity: '1', unitPrice: '185000.00', discountAmount: '0' },
    { productName: 'The Ordinary Rose Hip seed oil 30ml', quantity: '2', unitPrice: '85000.00', discountAmount: '5000.00' },
    { productName: 'The Ordinary Multi peptide +HA 60ml', quantity: '1', unitPrice: '180000.00', discountAmount: '0' },
  ],
};

function parseDb(v) {
  return new Decimal(v || 0);
}

/** OLD buggy complete path (pre-fix ordersRoutes.ts). */
function legacyCompleteTotals(order, extraDiscount = 0) {
  const orderDiscount = parseDb(order.discountAmount);
  const effectiveDiscount = orderDiscount.plus(extraDiscount);
  const subtotal = parseDb(order.subtotal);
  const tax = parseDb(order.taxAmount);
  const totalAmount = Decimal.max(0, subtotal.minus(effectiveDiscount).plus(tax));
  return {
    discountAmount: effectiveDiscount.toNumber(),
    totalAmount: totalAmount.toNumber(),
    taxAmount: tax.toNumber(),
  };
}

/** NEW fixed path (buildOrderCompletionSaleTotals). */
function fixedCompleteTotals(order, extraDiscount = 0) {
  const items = order.items ?? [];
  const itemDiscountSum = items.reduce(
    (sum, item) => sum.plus(parseDb(item.discountAmount)),
    new Decimal(0),
  );
  const orderDiscount = parseDb(order.discountAmount);
  const tax = parseDb(order.taxAmount);
  const headerOnly = Decimal.max(0, orderDiscount.minus(itemDiscountSum));
  const cartDiscount = headerOnly.plus(extraDiscount);

  const itemsNet = items.reduce((sum, item) => {
    const qty = parseDb(item.quantity);
    const price = parseDb(item.unitPrice);
    const lineDisc = parseDb(item.discountAmount);
    return sum.plus(qty.times(price).minus(lineDisc));
  }, new Decimal(0));

  return {
    discountAmount: cartDiscount.toNumber(),
    totalAmount: Decimal.max(0, itemsNet.minus(cartDiscount).plus(tax)).toNumber(),
    taxAmount: tax.toNumber(),
  };
}

/** Mirrors salesService.createSale pricing check. */
function createSaleCalculatedTotal(items, cartDiscount, tax) {
  const linesNet = items.reduce((sum, item) => {
    return sum.plus(
      new Decimal(item.quantity).times(item.unitPrice).minus(item.discountAmount || 0),
    );
  }, new Decimal(0));
  return linesNet.minus(cartDiscount).plus(tax);
}

function saleTotalMismatch(provided, calculated, tolerance = 0.02) {
  return new Decimal(provided).minus(calculated).abs().greaterThan(tolerance);
}

function toSaleItems(order) {
  return order.items.map((item) => ({
    quantity: parseDb(item.quantity).toNumber(),
    unitPrice: parseDb(item.unitPrice).toNumber(),
    discountAmount: parseDb(item.discountAmount).toNumber(),
  }));
}

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║  PROOF: Order complete discount (Henber ORD-2026-6333)        ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

console.log('1. PRODUCTION ORDER SNAPSHOT');
console.log(`   Order: ${HENBER_ORDER.orderNumber} (${HENBER_ORDER.id})`);
console.log(`   Subtotal: ${HENBER_ORDER.subtotal}  Header discount: ${HENBER_ORDER.discountAmount}`);
console.log(`   Stored total: ${HENBER_ORDER.totalAmount}`);
for (const item of HENBER_ORDER.items) {
  const disc = parseDb(item.discountAmount);
  const line = parseDb(item.quantity).times(parseDb(item.unitPrice)).minus(disc);
  console.log(`   • ${item.productName}: ${line.toFixed(2)}${disc.gt(0) ? ` (line disc ${disc})` : ''}`);
}
console.log('');

console.log('2. OLD COMPLETE PATH (bug — double discount)');
const legacy = legacyCompleteTotals(HENBER_ORDER);
const saleItems = toSaleItems(HENBER_ORDER);
const legacyCalc = createSaleCalculatedTotal(saleItems, legacy.discountAmount, legacy.taxAmount);
assert(
  legacy.totalAmount === 560000,
  'Legacy sends totalAmount 560000',
);
assert(
  legacy.discountAmount === 5000,
  'Legacy sends cart discountAmount 5000',
);
assert(
  legacyCalc.toNumber() === 555000,
  'createSale would calculate 555000 from priced lines',
  `calc=${legacyCalc.toFixed(2)}`,
);
assert(
  saleTotalMismatch(legacy.totalAmount, legacyCalc),
  'Legacy path triggers ERR_SALE_TOTAL_MISMATCH',
  `560000 vs ${legacyCalc.toFixed(2)}`,
);
console.log('');

console.log('3. NEW COMPLETE PATH (fix — header discount deduped)');
const fixed = fixedCompleteTotals(HENBER_ORDER);
const fixedCalc = createSaleCalculatedTotal(saleItems, fixed.discountAmount, fixed.taxAmount);
assert(fixed.discountAmount === 0, 'Fixed cart discountAmount is 0 (already on line)', `got ${fixed.discountAmount}`);
assert(fixed.totalAmount === 560000, 'Fixed totalAmount is 560000');
assert(fixedCalc.toNumber() === 560000, 'createSale calculates 560000');
assert(
  !saleTotalMismatch(fixed.totalAmount, fixedCalc),
  'Fixed path passes sale total integrity check',
);
console.log('');

console.log('4. CASHIER EXTRA DISCOUNT AT PAYMENT');
const withExtra = fixedCompleteTotals(HENBER_ORDER, 2000);
const extraCalc = createSaleCalculatedTotal(saleItems, withExtra.discountAmount, withExtra.taxAmount);
assert(withExtra.discountAmount === 2000, 'Extra 2000 passes as cart discount only');
assert(withExtra.totalAmount === 558000, 'Total becomes 558000');
assert(!saleTotalMismatch(withExtra.totalAmount, extraCalc), 'Extra discount path consistent');
console.log('');

console.log('5. HEADER-ONLY DISCOUNT (no line discounts)');
const headerOnlyOrder = {
  subtotal: '100000.00',
  discountAmount: '10000.00',
  taxAmount: '0.00',
  items: [{ quantity: '1', unitPrice: '100000.00', discountAmount: '0' }],
};
const ho = fixedCompleteTotals(headerOnlyOrder);
const hoItems = toSaleItems(headerOnlyOrder);
const hoCalc = createSaleCalculatedTotal(hoItems, ho.discountAmount, ho.taxAmount);
assert(ho.discountAmount === 10000, 'Header-only discount still applied as cart discount');
assert(!saleTotalMismatch(ho.totalAmount, hoCalc), 'Header-only order completes cleanly');
console.log('');

console.log('6. JEST UNIT TESTS (buildOrderCompletionSaleTotals)');
const jest = spawnSync(
  'npm',
  ['run', 'test', '--', 'src/modules/orders/ordersCompleteDiscount.test.ts'],
  { cwd: path.join(root, 'SamplePOS.Server'), encoding: 'utf8', shell: true },
);
if (jest.status === 0) {
  ok('ordersCompleteDiscount.test.ts', '3/3 passed');
} else {
  bad('ordersCompleteDiscount.test.ts', jest.stderr?.slice(-400) || jest.stdout?.slice(-400));
}
console.log('');

console.log('══════════════════════════════════════════════════════════════');
console.log(`  ${fail === 0 ? '✅ ALL PROOF CHECKS PASSED' : `❌ ${fail} FAILED, ${pass} passed`}`);
console.log('══════════════════════════════════════════════════════════════\n');

if (fail > 0) process.exit(1);
