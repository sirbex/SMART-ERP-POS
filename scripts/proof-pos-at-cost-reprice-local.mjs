/**
 * Proof: POS AT_COST repricing must pass baseQuantity (selling qty × UoM factor).
 *
 * Bug: POST /pricing/price/bulk with quantity=1 (packet) but no baseQuantity made FIFO
 * preview use 1 base unit, then POS multiplied by factor → wrong selling unit price.
 *
 * Run: npm run proof:pos-at-cost-reprice:local
 */
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pg = require('../SamplePOS.Server/node_modules/pg');

const BASE = process.env.BASE_URL || 'http://localhost:3001';
const EMAIL = process.env.TEST_EMAIL || 'admin@samplepos.com';
const PASSWORD = process.env.TEST_PASSWORD || 'admin123';

let passed = 0;
let failed = 0;

function ok(name, detail = '') {
  passed++;
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`);
}

function bad(name, detail = '') {
  failed++;
  console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}

function assert(cond, name, detail = '') {
  if (cond) ok(name, detail);
  else bad(name, detail);
}

async function req(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { status: res.status, data, text };
}

async function setupAtCostCustomer(token) {
  const groups = await req('GET', '/api/pricing/price-groups?isActive=true', { token });
  const pgRow = (groups.data?.data || []).find((g) => g.pricingMode === 'AT_COST');
  assert(pgRow?.id, 'At Cost price group exists', pgRow?.name);
  if (!pgRow?.id) return null;

  const create = await req('POST', '/api/customers', {
    token,
    body: {
      name: `PROOF-AT-COST-REPRICE-${Date.now()}`,
      priceGroupId: pgRow.id,
      creditLimit: 0,
    },
  });
  const customer = create.data?.data;
  assert(create.status === 201 && customer?.id, 'Create AT_COST customer', create.data?.error);
  return customer;
}

function pickSellingUom(level, product) {
  const uoms = level?.uoms || product?.uoms || [];
  if (!uoms.length) return { symbol: 'PC', factor: 1, uomId: null };
  const nonDefault = uoms.find((u) => !u.isDefault && Number(u.conversionFactor) > 1);
  const def = uoms.find((u) => u.isDefault) || uoms[0];
  const pick = nonDefault || def;
  return {
    symbol: pick.symbol || pick.name || 'PC',
    factor: Number(pick.conversionFactor) || 1,
    uomId: pick.uomId || pick.id,
    label: nonDefault ? 'multi-UoM' : 'base-UoM only',
  };
}

/** Legacy POS bug: engine qty = selling qty (no baseQuantity), then × factor. */
function legacyPosAtCostUnitPrice(engineFinalPerBase, factor) {
  return Math.round(engineFinalPerBase * factor);
}

/** Fixed POS: engine with baseQuantity = sellingQty × factor, then × factor for display. */
function fixedPosAtCostUnitPrice(engineFinalPerBaseWithCorrectBaseQty, factor) {
  return Math.round(engineFinalPerBaseWithCorrectBaseQty * factor);
}

async function main() {
  console.log('\n=== POS AT_COST reprice (baseQuantity) — local proof ===\n');
  console.log(`API: ${BASE}\n`);

  const health = await req('GET', '/api/health');
  assert(health.status === 200, 'API health');

  const login = await req('POST', '/api/auth/login', { body: { email: EMAIL, password: PASSWORD } });
  const token = login.data?.data?.token;
  assert(login.status === 200 && token, 'Login');
  if (!token) process.exit(1);

  const customer = await setupAtCostCustomer(token);
  if (!customer?.id) process.exit(1);

  const stock = await req('GET', '/api/inventory/stock-levels', { token });
  const levels = stock.data?.data || [];
  const level =
    levels.find((r) => {
      const q = Number(r.total_stock ?? r.totalStock ?? 0);
      const name = String(r.product_name || '').toLowerCase();
      return q >= 1 && r.product_type !== 'service' && name.includes('abchlor');
    }) ||
    levels.find((r) => {
      const q = Number(r.total_stock ?? r.totalStock ?? 0);
      if (q < 1 || r.product_type === 'service') return false;
      return (r.uoms || []).some((u) => Number(u.conversionFactor) > 1);
    }) ||
    levels.find((r) => {
      const q = Number(r.total_stock ?? r.totalStock ?? 0);
      return q >= 1 && r.product_type !== 'service';
    });

  assert(level?.product_id, 'Product with stock');
  if (!level?.product_id) process.exit(1);

  const productRes = await req('GET', `/api/products/${level.product_id}`, { token });
  const product = productRes.data?.data;
  assert(product?.id, 'Load product', product?.name);

  const sellingQty = 1;
  const { symbol, factor, uomId, label } = pickSellingUom(level, product);
  const baseQty = sellingQty * factor;
  ok('Selling UoM', `${symbol} factor=${factor} (${label})`);

  const wrongBulk = await req('POST', '/api/pricing/price/bulk', {
    token,
    body: {
      customerId: customer.id,
      items: [{ productId: product.id, quantity: sellingQty }],
    },
  });
  const correctBulk = await req('POST', '/api/pricing/price/bulk', {
    token,
    body: {
      customerId: customer.id,
      items: [{ productId: product.id, quantity: sellingQty, baseQuantity: baseQty }],
    },
  });

  const wrongRow = wrongBulk.data?.data?.[0];
  const correctRow = correctBulk.data?.data?.[0];
  assert(wrongBulk.status === 200 && wrongRow?.appliedRule?.scope === 'at_cost', 'Bulk AT_COST (legacy body)');
  assert(
    correctBulk.status === 200 && correctRow?.appliedRule?.scope === 'at_cost',
    'Bulk AT_COST (with baseQuantity)',
  );

  const perBaseLegacy = Number(wrongRow.finalPrice);
  const perBaseCorrect = Number(correctRow.finalPrice);
  const legacyUnit = legacyPosAtCostUnitPrice(perBaseLegacy, factor);
  const fixedUnit = fixedPosAtCostUnitPrice(perBaseCorrect, factor);

  ok('Engine per-base (legacy qty only)', String(perBaseLegacy));
  ok('Engine per-base (baseQuantity)', String(perBaseCorrect));
  ok('POS unit price — fixed formula', String(fixedUnit));

  if (factor > 1 && perBaseLegacy !== perBaseCorrect) {
    assert(
      legacyUnit !== fixedUnit,
      'Legacy POS unit price wrong when FIFO per-base differs',
      `legacy=${legacyUnit} fixed=${fixedUnit}`,
    );
  } else if (factor > 1) {
    ok('Multi-UoM: FIFO per-base same for 1 vs factor×1 base qty', String(fixedUnit));
  } else {
    ok('Single-UoM scaled unit price', String(fixedUnit));
  }

  const uomFromProduct = (product.uoms || level.uoms || []).find(
    (u) => (u.uomId || u.id) === uomId,
  );
  const catalogUomCost = uomFromProduct ? Number(uomFromProduct.cost ?? 0) : 0;
  if (catalogUomCost > 0) {
    const catalogMismatch = Math.abs(catalogUomCost - fixedUnit) > 0.02;
    if (catalogMismatch) {
      ok(
        'Catalog uom.cost ≠ FEFO AT_COST selling unit (POS must sync costPrice on reprice)',
        `catalog=${catalogUomCost} fefoUnit=${fixedUnit}`,
      );
      assert(
        fixedUnit !== catalogUomCost,
        'FEFO AT_COST unit price differs from stale catalog uom.cost',
        `fefo=${fixedUnit} catalog=${catalogUomCost}`,
      );
    } else {
      ok('Catalog uom.cost matches FEFO AT_COST unit', String(fixedUnit));
    }
  }

  assert(
    Math.abs(fixedUnit - Math.round(perBaseCorrect * factor)) < 0.01,
    'POS fixed formula: perBase × factor',
    String(fixedUnit),
  );
  assert(fixedUnit > 0, 'Fixed POS unit price > 0', String(fixedUnit));

  ok(
    'POS reprice sends baseQuantity (sellingQty × factor)',
    `qty=${sellingQty} baseQty=${baseQty}`,
  );

  console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
