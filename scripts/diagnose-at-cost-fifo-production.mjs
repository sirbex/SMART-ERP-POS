#!/usr/bin/env node
/**
 * Production diagnostic: why AT_COST FIFO cart split may not show 2 lines.
 *
 * Usage:
 *   BASE_URL=https://henber.wizarddigital-inv.com \
 *   TEST_EMAIL=... TEST_PASSWORD=... \
 *   node scripts/diagnose-at-cost-fifo-production.mjs
 *
 * Optional: PRODUCT_ID=uuid or PRODUCT_SKU=ABC to test one product.
 */
const BASE = process.env.BASE_URL || 'https://henber.wizarddigital-inv.com';
const EMAIL = process.env.TEST_EMAIL || '';
const PASSWORD = process.env.TEST_PASSWORD || '';
const PRODUCT_ID = process.env.PRODUCT_ID || '';
const PRODUCT_SKU = process.env.PRODUCT_SKU || '';
const TEST_QTY = Number(process.env.TEST_QTY || 2);

async function req(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function layerBaseToSellingQuantity(baseQty, factor) {
  if (factor <= 0 || baseQty <= 0) return null;
  const selling = baseQty / factor;
  const rounded = Math.round(selling * 10000) / 10000;
  if (Math.abs(rounded * factor - baseQty) > 0.0001) return null;
  return rounded;
}

function shouldSplit(layers) {
  if (!layers || layers.length <= 1) return false;
  const costs = new Set(layers.map((l) => round2(l.unitCostPerBase)));
  return costs.size > 1;
}

function canSplitUom(layers, factor) {
  return layers.every((l) => layerBaseToSellingQuantity(l.baseQuantity, factor) != null);
}

function simulateFefo(batches, baseQty) {
  const layers = [];
  let remaining = baseQty;
  for (const b of batches) {
    if (remaining <= 0) break;
    const avail = Number(b.remaining_quantity ?? b.remainingQuantity ?? 0);
    const cost = Number(b.cost_price ?? b.costPrice ?? 0);
    if (avail <= 0) continue;
    const take = Math.min(remaining, avail);
    layers.push({ baseQuantity: take, unitCostPerBase: cost, batch: b.batch_number ?? b.batchNumber });
    remaining -= take;
  }
  return { layers, shortfall: remaining };
}

async function main() {
  console.log('\n=== AT_COST FIFO production diagnostic ===\n');
  console.log(`API: ${BASE}`);
  console.log(`Test qty (selling): ${TEST_QTY}\n`);

  if (!EMAIL || !PASSWORD) {
    console.error('Set TEST_EMAIL and TEST_PASSWORD for tenant login.\n');
    process.exit(1);
  }

  const login = await req('POST', '/api/auth/login', { body: { email: EMAIL, password: PASSWORD } });
  const token = login.data?.data?.token;
  if (login.status !== 200 || !token) {
    console.error('Login failed:', login.status, login.data?.message || login.data);
    process.exit(1);
  }
  console.log('  OK  Login\n');

  const pgList = await req('GET', '/api/pricing/price-groups?isActive=true', { token });
  const atCostPg = (pgList.data?.data || []).find((p) => p.pricingMode === 'AT_COST');
  if (!atCostPg?.id) {
    console.error('  FAIL  No AT_COST price group on tenant');
    process.exit(1);
  }

  const cust = await req('POST', '/api/customers', {
    token,
    body: { name: `DIAG-FIFO-${Date.now()}`, priceGroupId: atCostPg.id, creditLimit: 0 },
  });
  const customerId = cust.data?.data?.id;
  if (cust.status !== 201 || !customerId) {
    console.error('  FAIL  Could not create AT_COST test customer');
    process.exit(1);
  }

  const stock = await req('GET', '/api/inventory/stock-levels', { token });
  const levels = stock.data?.data || [];

  let candidates = levels.filter((r) => {
    const q = Number(r.total_stock ?? 0);
    if (q < TEST_QTY || r.product_type === 'service') return false;
    if (PRODUCT_ID && r.product_id !== PRODUCT_ID) return false;
    if (PRODUCT_SKU && !(r.sku || '').includes(PRODUCT_SKU)) return false;
    return true;
  });

  if (candidates.length === 0) {
    console.log('  WARN  No matching products with enough stock.\n');
    process.exit(0);
  }

  console.log(`Scanning ${candidates.length} product(s)...\n`);

  let splitReady = 0;
  let tested = 0;

  for (const row of candidates.slice(0, 25)) {
    const batchesRes = await req('GET', `/api/inventory/batches?productId=${row.product_id}`, { token });
    const batchRows = (batchesRes.data?.data || batchesRes.data || []).filter(Boolean);
    const active = batchRows.filter((b) => Number(b.remaining_quantity ?? b.remainingQuantity ?? 0) > 0);
    const distinctCosts = new Set(active.map((b) => round2(b.cost_price ?? b.costPrice ?? 0)));

    const productRes = await req('GET', `/api/products/${row.product_id}`, { token });
    const product = productRes.data?.data || {};
    const uoms = product.uoms || product.availableUoms || [];
    const defaultUom = uoms.find((u) => u.isDefault) || uoms[0];
    const factor = Number(defaultUom?.conversionFactor ?? 1) || 1;
    const baseQty = TEST_QTY * factor;

    const sim = simulateFefo(active, baseQty);

    const bulk = await req('POST', '/api/pricing/price/bulk', {
      token,
      body: {
        customerId,
        items: [{ productId: row.product_id, quantity: TEST_QTY, baseQuantity: baseQty }],
      },
    });
    const priced = bulk.data?.data?.[0];
    const layers = priced?.atCostLayers || [];
    const scope = priced?.appliedRule?.scope;
    tested++;

    const split = shouldSplit(layers) && canSplitUom(layers, factor);
    if (split) splitReady++;

    const header = `${row.product_name || row.name} (${row.sku || 'no-sku'})`;
    console.log('─'.repeat(60));
    console.log(header);
    console.log(`  stock=${row.total_stock}  costing=${product.costingMethod ?? product.costing_method ?? '?'}`);
    console.log(`  UoM factor=${factor}  baseQty for qty ${TEST_QTY} = ${baseQty}`);
    console.log(`  batches(active)=${active.length}  distinct costs in warehouse=${distinctCosts.size}`);
    console.log(`  FEFO sim layers=${sim.layers.length}  shortfall=${sim.shortfall}`);
    if (sim.layers.length) {
      console.log(
        `  sim: ${sim.layers.map((l) => `${l.baseQuantity}@${l.unitCostPerBase}(${l.batch || '?'})`).join(' + ')}`,
      );
    }
    console.log(`  API scope=${scope}  atCostLayers=${layers.length}`);
    if (layers.length) {
      console.log(
        `  API: ${layers.map((l) => `${l.baseQuantity}@${l.unitCostPerBase}`).join(' + ')}`,
      );
    }
    console.log(`  shouldSplit=${shouldSplit(layers)}  canSplitUom=${canSplitUom(layers, factor)}`);
    console.log(`  → POS cart split: ${split ? 'YES (2+ lines expected)' : 'NO'}`);

    if (!split && distinctCosts.size >= 2) {
      if (sim.layers.length <= 1) {
        console.log(
          '  WHY: First FEFO batch covers full qty — split needs batch boundary within purchase qty.',
        );
        console.log(
          `       (e.g. batch1 remaining=1 @20k + batch2 @18k, then qty 2 splits)`,
        );
      } else if (!shouldSplit(layers)) {
        console.log('  WHY: Layers exist but same unit cost (after rounding) — blended line.');
      } else if (!canSplitUom(layers, factor)) {
        console.log('  WHY: UoM conversion cannot split layers cleanly — blended + FIFO hint.');
      } else if (scope !== 'at_cost') {
        console.log('  WHY: Customer/product not AT_COST scope on API.');
      } else if (layers.length <= 1) {
        console.log('  WHY: API returned 1 layer — check costing_method AVCO/STANDARD or FEFO data.');
      }
    }
    console.log('');
  }

  console.log('═'.repeat(60));
  console.log(`Tested: ${tested}  Split-ready: ${splitReady}`);
  console.log('');
  console.log('Deploy check: POS bundle should contain "atCostLayers" and "FIFO batch".');
  console.log('If API shows split-ready YES but POS shows 1 line → hard refresh (Ctrl+Shift+R).');
  console.log('');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
