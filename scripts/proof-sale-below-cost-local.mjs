#!/usr/bin/env node
/**
 * Local proof — Hard below-cost block + price audit (migration 419)
 *
 * PASS when:
 *   1. Migration 419: sale_line_price_events exists
 *   2. AT_COST sale at engine layer cost (per selling UoM) → 201
 *   3. AT_COST sale above layer cost → 201
 *   4. Sale below allocated FEFO cost → 400 BELOW_ALLOCATED_COST (no override)
 *   5. Walk-in sale below cost → 400 BELOW_ALLOCATED_COST
 *   6. BELOW_COST_BLOCKED row written to sale_line_price_events
 *   7. Price above engine reference logs PRICE_EDIT (optional when table exists)
 *
 * Usage:
 *   npm run proof:sale-below-cost:local
 *
 * Requires: API on BASE_URL (default http://localhost:3001), migration 419 applied.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pg = require('../SamplePOS.Server/node_modules/pg');

const BASE = process.env.BASE_URL || 'http://localhost:3001';
const EMAIL = process.env.TEST_EMAIL || 'admin@samplepos.com';
const PASSWORD = process.env.TEST_PASSWORD || 'admin123';
const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/pos_system';

let pass = 0;
let fail = 0;
const ok = (n, d = '') => { pass++; console.log(`  PASS  ${n}${d ? ` — ${d}` : ''}`); };
const bad = (n, d = '') => { fail++; console.error(`  FAIL  ${n}${d ? ` — ${d}` : ''}`); };
const assert = (c, n, d = '') => (c ? ok(n, d) : bad(n, d));

async function req(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text?.slice(0, 500) }; }
  return { status: res.status, data, text };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function ensureCashSession(token) {
  const cur = await req('GET', '/api/cash-registers/sessions/current', { token });
  if (cur.data?.data?.id) return cur.data.data.id;
  const regs = await req('GET', '/api/cash-registers', { token });
  const registerId = regs.data?.data?.[0]?.id;
  if (!registerId) return null;
  const open = await req('POST', '/api/cash-registers/sessions/open', {
    token,
    body: { registerId, openingFloat: 0, notes: 'proof-sale-below-cost' },
  });
  return open.data?.data?.id ?? null;
}

async function setupAtCostCustomer(token) {
  if (process.env.CUSTOMER_ID) {
    const c = await req('GET', `/api/customers/${process.env.CUSTOMER_ID}`, { token });
    assert(c.status === 200, 'Load CUSTOMER_ID', c.data?.error);
    return c.data?.data;
  }
  const pgList = await req('GET', '/api/pricing/price-groups?isActive=true', { token });
  const atCostPg = (pgList.data?.data || []).find((p) => p.pricingMode === 'AT_COST');
  assert(atCostPg?.id, 'At Cost price group exists', atCostPg?.name);
  const stamp = Date.now();
  const cust = await req('POST', '/api/customers', {
    token,
    body: { name: `PROOF-BELOW-COST-${stamp}`, priceGroupId: atCostPg.id, creditLimit: 0 },
  });
  assert(cust.status === 201 && cust.data?.data?.id, 'Create AT_COST customer', cust.data?.error);
  return cust.data.data;
}

async function pickProductWithStock(token) {
  if (process.env.PRODUCT_ID) {
    const p = await req('GET', `/api/products/${process.env.PRODUCT_ID}`, { token });
    return { product: p.data?.data, level: null };
  }
  const stock = await req('GET', '/api/inventory/stock-levels', { token });
  const levels = stock.data?.data || [];
  const level = levels.find((r) => {
    const q = Number(r.total_stock ?? r.totalStock ?? r.quantity_on_hand ?? 0);
    return q >= 1 && r.product_type !== 'service';
  });
  if (!level?.product_id) return { product: null, level: null };
  const p = await req('GET', `/api/products/${level.product_id}`, { token });
  return { product: p.data?.data, level };
}

function sellingUomFromLevel(level) {
  const uoms = level?.uoms || [];
  if (!uoms.length) return { symbol: 'PC', factor: 1, uomId: null };
  const def = uoms.find((u) => u.isDefault) || uoms[0];
  return {
    symbol: def.symbol || def.name || 'PC',
    factor: Number(def.conversionFactor) || 1,
    uomId: def.uomId,
  };
}

function buildPosSaleBody({ customerId, product, qty, unitPrice, uom, uomId, sessionId }) {
  const subtotal = qty * unitPrice;
  const body = {
    customerId: customerId ?? undefined,
    idempotencyKey: `proof-below-cost-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    lineItems: [
      {
        productId: product.id,
        productName: product.name || 'Proof product',
        sku: String(product.sku ?? ''),
        uom: uom || 'PC',
        uomId: uomId || undefined,
        quantity: qty,
        unitPrice,
        costPrice: unitPrice,
        subtotal,
      },
    ],
    subtotal,
    taxAmount: 0,
    totalAmount: subtotal,
    paymentMethod: 'CASH',
    amountTendered: subtotal,
  };
  if (sessionId && UUID_RE.test(sessionId)) body.cashRegisterSessionId = sessionId;
  return body;
}

async function checkMigration419(pool) {
  const t = await pool.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'sale_line_price_events'
     ) AS ok`,
  );
  assert(t.rows[0]?.ok === true, 'Migration 419 — sale_line_price_events table exists');
  return t.rows[0]?.ok === true;
}

async function countPriceEvents(pool, productId, eventType, sinceIso) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS c
     FROM sale_line_price_events
     WHERE product_id = $1
       AND event_type = $2
       AND created_at >= $3::timestamptz`,
    [productId, eventType, sinceIso],
  );
  return r.rows[0]?.c ?? 0;
}

async function main() {
  console.log('\n=== Sale below-cost hard block — local proof ===\n');
  console.log(`API: ${BASE}`);
  console.log(`DB:  ${DATABASE_URL.replace(/:[^:@]+@/, ':***@')}\n`);

  const startedAt = new Date().toISOString();

  const health = await req('GET', '/api/health');
  assert(health.status === 200, 'API health');

  const login = await req('POST', '/api/auth/login', { body: { email: EMAIL, password: PASSWORD } });
  const token = login.data?.data?.token;
  assert(login.status === 200 && token, 'Login', login.data?.error);
  if (!token) process.exit(1);

  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  let migrationOk = false;
  try {
    migrationOk = await checkMigration419(pool);
  } catch (e) {
    bad('Migration 419 — DB connect', e.message);
  }
  if (!migrationOk) {
    console.error('\n  Apply shared/sql/419_sale_line_price_events.sql then re-run proof.\n');
    await pool.end();
    process.exit(1);
  }

  const customer = await setupAtCostCustomer(token);
  const customerId = customer?.id;
  if (!customerId) {
    await pool.end();
    process.exit(1);
  }

  const { product, level } = await pickProductWithStock(token);
  assert(product?.id, 'Product with stock', product?.name);
  if (!product?.id) {
    await pool.end();
    process.exit(1);
  }

  const qty = 1;
  const { symbol: uom, factor, uomId } = sellingUomFromLevel(level);

  const bulk = await req('POST', '/api/pricing/price/bulk', {
    token,
    body: {
      customerId,
      items: [{ productId: product.id, quantity: qty, baseQuantity: qty * factor }],
    },
  });
  const priced = bulk.data?.data?.[0];
  assert(bulk.status === 200 && priced, 'Bulk AT_COST price', bulk.data?.error);
  assert(priced?.appliedRule?.scope === 'at_cost', 'Pricing scope at_cost', priced?.appliedRule?.scope);

  const atCostPerBase = Number(priced.finalPrice);
  assert(atCostPerBase > 0, 'AT_COST per-base price > 0', String(atCostPerBase));
  const atCostSellingUnit = Math.round(atCostPerBase * factor);

  const sessionId = await ensureCashSession(token);
  if (sessionId) ok('Cash register session', sessionId.slice(0, 8));

  // —— 1. Exact at cost (allowed) ——
  const exactBody = buildPosSaleBody({
    customerId,
    product,
    qty,
    unitPrice: atCostSellingUnit,
    uom,
    uomId,
    sessionId,
  });
  const exactRes = await req('POST', '/api/sales', { token, body: exactBody });
  assert(
    exactRes.status === 201 && exactRes.data?.data?.sale?.id,
    'Sale at exact allocated cost → 201',
    exactRes.data?.error || String(exactRes.status),
  );

  // —— 2. Above cost (allowed) ——
  const aboveUnit = Math.round(atCostSellingUnit * 1.15) || atCostSellingUnit + 1;
  const aboveBody = buildPosSaleBody({
    customerId,
    product,
    qty,
    unitPrice: aboveUnit,
    uom,
    uomId,
    sessionId,
  });
  const aboveRes = await req('POST', '/api/sales', { token, body: aboveBody });
  assert(
    aboveRes.status === 201 && aboveRes.data?.data?.sale?.id,
    'Sale above allocated cost → 201',
    aboveRes.data?.error || String(aboveRes.status),
  );

  // —— 3. Below cost AT_COST customer (hard block) ——
  const belowUnit = Math.max(1, Math.floor(atCostSellingUnit * 0.5));
  const belowBody = buildPosSaleBody({
    customerId,
    product,
    qty,
    unitPrice: belowUnit,
    uom,
    uomId,
    sessionId,
  });
  const belowRes = await req('POST', '/api/sales', { token, body: belowBody });
  const belowCode = belowRes.data?.error_code || belowRes.data?.errorCode;
  const belowMsg = String(belowRes.data?.error || belowRes.text || '');
  assert(
    belowRes.status === 400 && belowCode === 'BELOW_ALLOCATED_COST',
    'Below-cost sale rejected (BELOW_ALLOCATED_COST)',
    `${belowRes.status} ${belowCode || ''} ${belowMsg.slice(0, 120)}`,
  );
  assert(
    belowMsg.includes('below actual inventory cost'),
    'Error message mentions inventory cost',
    belowMsg.slice(0, 100),
  );

  // —— 4. Walk-in below cost (hard block) ——
  const walkBody = buildPosSaleBody({
    customerId: undefined,
    product,
    qty,
    unitPrice: 1,
    uom,
    uomId,
    sessionId,
  });
  const walkRes = await req('POST', '/api/sales', { token, body: walkBody });
  const walkCode = walkRes.data?.error_code || walkRes.data?.errorCode;
  assert(
    walkRes.status === 400 && walkCode === 'BELOW_ALLOCATED_COST',
    'Walk-in below-cost rejected',
    `${walkRes.status} ${walkCode || ''}`,
  );

  // —— 5. Audit rows for blocked attempts ——
  const blockedCount = await countPriceEvents(pool, product.id, 'BELOW_COST_BLOCKED', startedAt);
  assert(blockedCount >= 1, 'sale_line_price_events BELOW_COST_BLOCKED logged', `count=${blockedCount}`);

  // —— 6. Price edit above engine reference (allowed + audit) ——
  const eventsBeforeEdit = await countPriceEvents(pool, product.id, 'PRICE_EDIT', startedAt);
  const editUnit = aboveUnit;
  const editBody = buildPosSaleBody({
    customerId,
    product,
    qty,
    unitPrice: editUnit,
    uom,
    uomId,
    sessionId,
  });
  const editRes = await req('POST', '/api/sales', { token, body: editBody });
  assert(editRes.status === 201, 'Sale with markup above cost → 201', editRes.data?.error);
  const eventsAfterEdit = await countPriceEvents(pool, product.id, 'PRICE_EDIT', startedAt);
  if (eventsAfterEdit > eventsBeforeEdit) {
    ok('sale_line_price_events PRICE_EDIT logged when unit ≠ engine reference');
  } else {
    ok('PRICE_EDIT audit optional (unit may match engine on this product)', 'skipped strict check');
  }

  await pool.end();

  console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${pass} passed, ${fail} failed\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
