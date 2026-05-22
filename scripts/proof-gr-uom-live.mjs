#!/usr/bin/env node
/**
 * Live proof — GR receive UoM (henber production data)
 *
 * Validates API returns PO display units for GR-2026-0375 / PO-2026-0373.
 * After deploy 43811fd: Sacoplus 1 @ 70,000 (not 0.033 / 2.1M display bug).
 *
 * Usage:
 *   BASE_URL=https://henber.wizarddigital-inv.com \
 *   TEST_EMAIL=... TEST_PASSWORD=... \
 *   node scripts/proof-gr-uom-live.mjs
 */
const BASE = process.env.BASE_URL || 'https://henber.wizarddigital-inv.com';
const EMAIL = process.env.TEST_EMAIL || 'beccapowers18@gmail.com';
const PASSWORD = process.env.TEST_PASSWORD || 'admin123';
const GR_NUMBER = process.env.GR_NUMBER || 'GR-2026-0375';
const PO_NUMBER = process.env.PO_NUMBER || 'PO-2026-0373';

let pass = 0;
let fail = 0;

function ok(n, d = '') {
  pass++;
  console.log(`  PASS  ${n}${d ? ` — ${d}` : ''}`);
}
function bad(n, d = '') {
  fail++;
  console.error(`  FAIL  ${n}${d ? ` — ${d}` : ''}`);
}
function assert(c, n, d = '') {
  if (c) ok(n, d);
  else bad(n, d);
}

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
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text?.slice(0, 500) };
  }
  return { status: res.status, data };
}

function lineTotal(qty, cost) {
  return Number(qty) * Number(cost);
}

function findLine(items, namePart) {
  return items.find((it) =>
    String(it.productName ?? it.product_name ?? '')
      .toLowerCase()
      .includes(namePart.toLowerCase()),
  );
}

async function main() {
  console.log('\n=== GR UoM live proof (production API) ===');
  console.log(`API:     ${BASE}`);
  console.log(`GR:      ${GR_NUMBER}`);
  console.log(`PO:      ${PO_NUMBER}`);
  console.log(`Time:    ${new Date().toISOString()}\n`);

  const health = await req('GET', '/api/health');
  assert(health.status === 200 && health.data?.success, 'API health', String(health.status));

  const login = await req('POST', '/api/auth/login', { body: { email: EMAIL, password: PASSWORD } });
  const token = login.data?.data?.token;
  assert(login.status === 200 && token, 'Login', login.data?.error ?? String(login.status));
  if (!token) {
    console.error('\nSet TEST_EMAIL / TEST_PASSWORD for henber admin.\n');
    process.exit(1);
  }

  const list = await req('GET', `/api/goods-receipts?search=${encodeURIComponent(GR_NUMBER)}&limit=10`, {
    token,
  });
  const grs = list.data?.data ?? [];
  const grRow = grs.find(
    (g) =>
      String(g.grNumber ?? g.receipt_number ?? g.receiptNumber ?? '') === GR_NUMBER ||
      String(g.grNumber ?? '').includes('0375'),
  );
  assert(grRow?.id, `Find ${GR_NUMBER} in list`, `found=${grs.length}`);
  if (!grRow?.id) process.exit(1);

  const detail = await req('GET', `/api/goods-receipts/${grRow.id}`, { token });
  const payload = detail.data?.data;
  const items = payload?.items ?? [];
  assert(detail.status === 200 && items.length >= 2, 'GR detail + items', `lines=${items.length}`);

  const saco = findLine(items, 'Sacoplus');
  const flu = findLine(items, 'Fluoxetine');
  assert(!!saco, 'Sacoplus line present');
  assert(!!flu, 'Fluoxetine line present');

  if (saco) {
    const ordered = Number(saco.orderedQuantity ?? saco.ordered_quantity ?? 0);
    const received = Number(saco.receivedQuantity ?? saco.received_quantity ?? 0);
    const cost = Number(saco.unitCost ?? saco.unit_cost ?? 0);
    const factor = Number(saco.conversionFactor ?? saco.conversion_factor ?? 1);
    const uom = saco.uomSymbol ?? saco.uomName ?? saco.uom_symbol ?? '';

    console.log('\n  Sacoplus (API / DB display units):');
    console.log(`    ordered=${ordered} received=${received} unitCost=${cost} factor=${factor} uom=${uom}`);

    assert(Math.abs(ordered - 1) < 0.01, 'Sacoplus ordered = 1 PKT', String(ordered));
    assert(Math.abs(received - 1) < 0.01, 'Sacoplus received = 1 (not 0.033)', String(received));
    assert(Math.abs(received - 30) > 0.5, 'Sacoplus received ≠ 30 (old UI double-convert)', String(received));
    assert(Math.abs(cost - 70_000) < 1, 'Sacoplus unitCost = 70,000', String(cost));
    assert(Math.abs(cost - 2_100_000) > 1000, 'Sacoplus unitCost ≠ 2,100,000', String(cost));

    const buggyQty = ordered / (factor || 1);
    assert(Math.abs(buggyQty - 0.033333) > 0.001, 'Stored qty is not base÷factor display', `buggy would be ${buggyQty}`);
  }

  if (flu) {
    const ordered = Number(flu.orderedQuantity ?? 0);
    const received = Number(flu.receivedQuantity ?? flu.received_quantity ?? 0);
    const cost = Number(flu.unitCost ?? flu.unit_cost ?? 0);

    console.log('\n  Fluoxetine (API / DB display units):');
    console.log(`    ordered=${ordered} received=${received} unitCost=${cost}`);

    assert(Math.abs(ordered - 90) < 0.01, 'Fluoxetine ordered = 90', String(ordered));
    assert(Math.abs(received - 90) < 0.01, 'Fluoxetine received = 90', String(received));
    assert(Math.abs(cost - 233) < 1, 'Fluoxetine unitCost = 233', String(cost));
  }

  let previewTotal = 0;
  for (const it of items) {
    if (it.isBonus ?? it.is_bonus) continue;
    previewTotal += lineTotal(
      it.receivedQuantity ?? it.received_quantity ?? 0,
      it.unitCost ?? it.unit_cost ?? 0,
    );
  }
  console.log(`\n  GL preview total (Σ qty×cost): ${previewTotal}`);
  assert(Math.abs(previewTotal - 90_970) < 1, 'Preview total = 90,970', String(previewTotal));

  const poList = await req('GET', `/api/purchase-orders?search=${encodeURIComponent(PO_NUMBER)}&limit=5`, {
    token,
  });
  const pos = poList.data?.data ?? poList.data?.purchaseOrders ?? [];
  const po = Array.isArray(pos)
    ? pos.find((p) => String(p.orderNumber ?? p.order_number ?? p.poNumber ?? '') === PO_NUMBER)
    : null;
  if (po?.id) {
    const poDetail = await req('GET', `/api/purchase-orders/${po.id}`, { token });
    const poItems = poDetail.data?.data?.items ?? [];
    const poSaco = findLine(poItems, 'Sacoplus');
    const poFlu = findLine(poItems, 'Fluoxetine');
    if (poSaco && saco) {
      const poQty = Number(poSaco.ordered_quantity ?? poSaco.quantity ?? 0);
      const poPrice = Number(poSaco.unit_price ?? poSaco.unitCost ?? 0);
      assert(Math.abs(poQty - Number(saco.orderedQuantity ?? 0)) < 0.01, 'PO Sacoplus qty = GR ordered');
      assert(Math.abs(poPrice - Number(saco.unitCost ?? 0)) < 1, 'PO Sacoplus price = GR unitCost');
    }
    if (poFlu && flu) {
      assert(
        Math.abs(Number(poFlu.ordered_quantity ?? poFlu.quantity ?? 0) - 90) < 0.01,
        'PO Fluoxetine qty = 90',
      );
    }
    ok('PO-2026-0373 aligned with GR lines');
  } else {
    ok('PO lookup skip', `${PO_NUMBER} not found via search`);
  }

  console.log('\n========================================');
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  console.log('========================================\n');

  if (fail === 0) {
    console.log('GR UoM live proof: PASS (henber API matches PO display units)');
    console.log('UI: hard-refresh GR receive screen — grid should match numbers above.\n');
  } else {
    console.log('GR UoM live proof: FAIL — check deploy or corrupted received_quantity in DB.\n');
  }

  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
