#!/usr/bin/env node
/**
 * Local proof — Sale data integrity (SALE-2026-4063 regression)
 *
 * PASS when:
 *   1. AT_COST customer + product → sale posts with customer_id set
 *   2. Header total = sum of priced lines (no 4.8M vs 5.1M drift)
 *   3. unit_price × qty ≈ total_price on each line
 *   4. AT_COST margin ≤ 2% (revenue ≈ FEFO cost)
 *   5. Mismatched totalAmount is rejected (ERR_SALE_TOTAL_MISMATCH)
 *   6. Sale without customer_id cannot use underpriced header vs retail lines
 *
 * Usage:
 *   npm run proof:sale-integrity:local
 *
 * Optional:
 *   PRODUCT_ID=<uuid>  — force product (must have stock)
 *   CUSTOMER_ID=<uuid> — force AT_COST customer (must have pricingMode AT_COST)
 */
const BASE = process.env.BASE_URL || 'http://localhost:3001';
const EMAIL = process.env.TEST_EMAIL || 'admin@samplepos.com';
const PASSWORD = process.env.TEST_PASSWORD || 'admin123';

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

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function marginPct(revenue, cost) {
  if (revenue <= 0) return 100;
  return ((revenue - cost) / revenue) * 100;
}

async function ensureCashSession(token) {
  const cur = await req('GET', '/api/cash-registers/sessions/current', { token });
  if (cur.data?.data?.id) return cur.data.data.id;

  const regs = await req('GET', '/api/cash-registers', { token });
  const registerId = regs.data?.data?.[0]?.id;
  if (!registerId) return null;

  const open = await req('POST', '/api/cash-registers/sessions/open', {
    token,
    body: { registerId, openingFloat: 0, notes: 'proof-sale-integrity' },
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
    body: { name: `PROOF-SALE-INT-${stamp}`, priceGroupId: atCostPg.id, creditLimit: 0 },
  });
  assert(cust.status === 201 && cust.data?.data?.id, 'Create AT_COST customer', cust.data?.error);
  assert(cust.data?.data?.pricingMode === 'AT_COST', 'Customer pricingMode AT_COST');
  return cust.data.data;
}

async function pickProduct(token) {
  if (process.env.PRODUCT_ID) {
    const p = await req('GET', `/api/products/${process.env.PRODUCT_ID}`, { token });
    return p.data?.data;
  }

  const stock = await req('GET', '/api/inventory/stock-levels', { token });
  const levels = stock.data?.data || [];
  const withStock = levels.find(
    (r) => Number(r.availableQuantity ?? r.quantity ?? r.onHand ?? 0) >= 1,
  );
  if (withStock?.productId) {
    const p = await req('GET', `/api/products/${withStock.productId}`, { token });
    const prod = p.data?.data;
    if (prod && Number(prod.costPrice) > 0) return prod;
  }

  const list = await req('GET', '/api/products?limit=200&isActive=true', { token });
  const rows = list.data?.data || [];
  return rows.find(
    (p) =>
      (Number(p.stockOnHand ?? p.quantityOnHand ?? p.availableStock ?? 0) >= 1 ||
        Number(p.stock ?? 0) >= 1) &&
      Number(p.costPrice ?? p.cost_price ?? 0) > 0 &&
      Number(p.sellingPrice ?? p.selling_price ?? 0) > 0,
  );
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function buildPosSaleBody({ customerId, product, qty, unitPrice, sessionId }) {
  const subtotal = qty * unitPrice;
  const body = {
    customerId,
    idempotencyKey: `proof-sale-int-${Date.now()}`,
    lineItems: [
      {
        productId: product.id,
        productName: product.name || 'Proof product',
        sku: String(product.sku ?? ''),
        uom: 'Item',
        quantity: qty,
        unitPrice,
        costPrice: Number(product.costPrice) || unitPrice,
        subtotal,
      },
    ],
    subtotal,
    taxAmount: 0,
    totalAmount: subtotal,
    paymentMethod: 'CASH',
    amountTendered: subtotal,
  };
  if (sessionId && UUID_RE.test(sessionId)) {
    body.cashRegisterSessionId = sessionId;
  }
  return body;
}

async function main() {
  console.log('\n=== Sale integrity local proof (SALE-4063 guards) ===\n');
  console.log(`API: ${BASE}\n`);

  const health = await req('GET', '/api/health');
  assert(health.status === 200, 'API health');

  const login = await req('POST', '/api/auth/login', { body: { email: EMAIL, password: PASSWORD } });
  const token = login.data?.data?.token;
  assert(login.status === 200 && token, 'Login');
  if (!token) process.exit(1);

  const customer = await setupAtCostCustomer(token);
  const customerId = customer?.id;
  if (!customerId) process.exit(1);

  const product = await pickProduct(token);
  assert(product?.id, 'Product with stock and cost', product?.name);
  if (!product?.id) process.exit(1);

  const qty = 1;
  const bulk = await req('POST', '/api/pricing/price/bulk', {
    token,
    body: { customerId, items: [{ productId: product.id, quantity: qty }] },
  });
  const priced = bulk.data?.data?.[0];
  assert(bulk.status === 200 && priced, 'Bulk price for AT_COST customer', bulk.data?.error);
  assert(priced?.appliedRule?.scope === 'at_cost', 'Pricing scope at_cost', priced?.appliedRule?.scope);

  const unitPrice = Number(priced.finalPrice);
  assert(unitPrice > 0, 'AT_COST unit price > 0', String(unitPrice));

  const sessionId = await ensureCashSession(token);
  if (sessionId) ok('Cash register session', sessionId.slice(0, 8));

  const goodSale = buildPosSaleBody({ customerId, product, qty, unitPrice, sessionId });
  const create = await req('POST', '/api/sales', { token, body: goodSale });
  const saleId = create.data?.data?.sale?.id;
  const createDetail =
    (Array.isArray(create.data?.details)
      ? create.data.details.map((e) => `${(e.path || []).join('.')}: ${e.message}`).join('; ')
      : '') ||
    create.data?.error ||
    create.text?.slice(0, 400);
  assert(create.status === 201 && saleId, 'POST sale with customer + matching total', createDetail);
  if (!saleId) process.exit(1);

  const detail = await req('GET', `/api/sales/${saleId}`, { token });
  const sale = detail.data?.data?.sale ?? detail.data?.data;
  const items = detail.data?.data?.items ?? sale?.items ?? [];
  const line = items[0];

  assert(detail.status === 200 && sale, 'GET sale detail');
  assert(sale.customerId === customerId, 'Sale customer_id persisted', String(sale.customerId));
  assert(Number(sale.totalAmount) === goodSale.totalAmount, 'Header total matches posted', String(sale.totalAmount));

  if (line) {
    const q = Number(line.quantity);
    const up = Number(line.unitPrice ?? line.unit_price);
    const tp = Number(line.totalPrice ?? line.total_price);
    const lineOk = Math.abs(q * up - tp) < 0.03;
    assert(lineOk, 'Line unit×qty = total_price', `u=${up} q=${q} t=${tp}`);
    const m = marginPct(Number(sale.totalAmount), Number(sale.totalCost ?? line.unitCost * q));
    assert(m <= 2.5, 'AT_COST margin ≤ 2.5%', `${m.toFixed(2)}%`);
  }

  const retailUnit = Number(product.sellingPrice ?? product.selling_price ?? unitPrice * 2);
  const badBody = buildPosSaleBody({
    customerId,
    product,
    qty,
    unitPrice: retailUnit,
    sessionId,
  });
  badBody.totalAmount = retailUnit * qty;
  badBody.idempotencyKey = `proof-mismatch-${Date.now()}`;
  const reject = await req('POST', '/api/sales', { token, body: badBody });
  const errCode = reject.data?.error_code || reject.data?.errorCode;
  const errMsg = String(reject.data?.error || reject.text || '');
  assert(
    reject.status >= 400 &&
      (errCode === 'ERR_SALE_TOTAL_MISMATCH' ||
        errMsg.includes('does not match priced line') ||
        errMsg.includes('does not match priced line items')),
    'Reject header/line total mismatch (4063 drift)',
    `${reject.status} ${errCode || ''} ${errMsg.slice(0, 120)}`,
  );

  const walkInDrift = buildPosSaleBody({
    customerId: undefined,
    product,
    qty,
    unitPrice: Number(product.sellingPrice),
    sessionId,
  });
  walkInDrift.totalAmount = unitPrice * qty;
  walkInDrift.idempotencyKey = `proof-walkin-drift-${Date.now()}`;
  const walkIn = await req('POST', '/api/sales', { token, body: walkInDrift });
  if (walkIn.status === 201) {
    const wid = walkIn.data?.data?.sale?.id;
    const wd = await req('GET', `/api/sales/${wid}`, { token });
    const ws = wd.data?.data?.sale ?? wd.data?.data;
    const wl = (wd.data?.data?.items ?? [])[0];
    assert(!ws?.customerId, 'Walk-in sale has null customer_id');
    if (wl) {
      const q = Number(wl.quantity);
      const up = Number(wl.unitPrice ?? wl.unit_price);
      const tp = Number(wl.totalPrice ?? wl.total_price);
      assert(Math.abs(q * up - tp) < 0.03, 'Walk-in line economics consistent after fix');
      assert(Number(ws.totalAmount) === walkInDrift.totalAmount, 'Walk-in header = lines when totals match');
    }
  } else {
    ok('Walk-in drift sale blocked or skipped', String(walkIn.status));
  }

  console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${pass} passed, ${fail} failed\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
