#!/usr/bin/env node
/**
 * Live integration test — pricing phases 1–3
 * Requires: local API on BASE_URL, postgres with migrations through 071
 *
 * Usage:
 *   node scripts/test-pricing-phases-live.mjs
 *   BASE_URL=http://localhost:3001 node scripts/test-pricing-phases-live.mjs
 */
const BASE = process.env.BASE_URL || 'http://localhost:3001';
const EMAIL = process.env.TEST_EMAIL || 'admin@samplepos.com';
const PASSWORD = process.env.TEST_PASSWORD || 'admin123';

let passed = 0;
let failed = 0;
const failures = [];

function ok(name, detail = '') {
  passed++;
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail = '') {
  failed++;
  failures.push({ name, detail });
  console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}

function assert(cond, name, detail = '') {
  if (cond) ok(name, detail);
  else fail(name, detail);
}

async function request(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { status: res.status, data };
}

async function main() {
  console.log(`\nPricing phases live test → ${BASE}\n`);

  const health = await request('GET', '/health');
  assert(health.status === 200, 'Health endpoint', `status ${health.status}`);
  if (health.status !== 200) {
    console.error('\nStart server: cd SamplePOS.Server && npm run dev\n');
    process.exit(1);
  }

  const login = await request('POST', '/api/auth/login', {
    body: { email: EMAIL, password: PASSWORD },
  });
  const token =
    login.data?.data?.token ??
    login.data?.data?.accessToken ??
    login.data?.token;
  assert(login.status === 200 && token, 'Login', login.data?.error || `status ${login.status}`);
  if (!token) process.exit(1);

  const pgList = await request('GET', '/api/pricing/price-groups?isActive=true', { token });
  const priceGroups = pgList.data?.data || [];
  const atCostPg = priceGroups.find((p) => p.pricingMode === 'AT_COST');
  const standardPg = priceGroups.find((p) => p.pricingMode === 'STANDARD');
  assert(atCostPg?.id, 'Price groups include At Cost', atCostPg?.name);
  assert(standardPg?.id, 'Price groups include Standard', standardPg?.name);

  const groupName = `LiveTest-Pricing-${Date.now()}`;
  const createGroup = await request('POST', '/api/customers/groups', {
    token,
    body: {
      name: groupName,
      description: 'Live integration test group',
      discountPercentage: 5,
      defaultPriceGroupId: atCostPg.id,
    },
  });
  const groupId = createGroup.data?.data?.id;
  assert(
    createGroup.status === 201 && groupId,
    'Create customer group with default price group',
    createGroup.data?.error || JSON.stringify(createGroup.data?.data?.defaultPriceGroupId),
  );
  assert(
    createGroup.data?.data?.defaultPriceGroupId === atCostPg.id,
    'Group returns defaultPriceGroupId',
  );

  const custName = `LiveTest Customer ${Date.now()}`;
  const createCust = await request('POST', '/api/customers', {
    token,
    body: { name: custName, creditLimit: 0 },
  });
  const customerId = createCust.data?.data?.id;
  assert(createCust.status === 201 && customerId, 'Create customer', createCust.data?.error);
  assert(
    createCust.data?.data?.pricingMode == null || createCust.data?.data?.priceGroupId == null,
    'New customer has no price group initially',
    `pricingMode=${createCust.data?.data?.pricingMode}`,
  );

  const assign = await request('POST', `/api/customers/groups/${groupId}/assign`, {
    token,
    body: { customerId },
  });
  assert(assign.status === 200, 'Assign customer to group');

  const afterAssign = await request('GET', `/api/customers/${customerId}`, { token });
  assert(
    afterAssign.data?.data?.pricingMode === 'AT_COST',
    'After assign: pricingMode is AT_COST (COALESCE default)',
    `got ${afterAssign.data?.data?.pricingMode}`,
  );
  assert(
    afterAssign.data?.data?.priceGroupId === atCostPg.id,
    'After assign: priceGroupId set to At Cost',
  );

  const patchName = await request('PUT', `/api/customers/${customerId}`, {
    token,
    body: { name: `${custName} (renamed)` },
  });
  assert(
    patchName.data?.data?.pricingMode === 'AT_COST',
    'After name-only update: pricingMode still AT_COST',
    patchName.data?.error,
  );
  assert(
    patchName.data?.data?.priceGroupId === atCostPg.id,
    'After name-only update: priceGroupId unchanged',
  );

  const search = await request('GET', `/api/customers/search?q=${encodeURIComponent('LiveTest')}`, {
    token,
  });
  const found = (search.data?.data || []).find((c) => c.id === customerId);
  assert(found?.pricingMode === 'AT_COST', 'Customer search returns pricingMode');

  const products = await request('GET', '/api/products?limit=20&isActive=true', { token });
  const productWithCost = (products.data?.data || []).find(
    (p) => Number(p.costPrice) > 0 && Number(p.sellingPrice) > 0,
  );
  const productId = productWithCost?.id;
  let cost = 0;
  let sell = 0;
  if (productId) {
    cost = Number(productWithCost.costPrice);
    sell = Number(productWithCost.sellingPrice);
    const price = await request(
      'GET',
      `/api/pricing/price?productId=${productId}&customerId=${customerId}&quantity=1`,
      { token },
    );
    assert(
      price.data?.data?.appliedRule?.scope === 'at_cost',
      'Pricing engine single price uses at_cost',
      `scope=${price.data?.data?.appliedRule?.scope} final=${price.data?.data?.finalPrice}`,
    );
    assert(
      Number(price.data?.data?.finalPrice) === cost,
      'AT_COST finalPrice equals product cost',
      `final=${price.data?.data?.finalPrice} cost=${cost}`,
    );
    assert(
      Number(price.data?.data?.finalPrice) < sell,
      'AT_COST finalPrice below selling price',
    );

    const bulk = await request('POST', '/api/pricing/price/bulk', {
      token,
      body: {
        customerId,
        items: [{ productId, quantity: 1 }],
      },
    });
    assert(
      bulk.data?.data?.[0]?.appliedRule?.scope === 'at_cost',
      'Pricing engine bulk uses at_cost',
    );
    assert(
      Number(bulk.data?.data?.[0]?.finalPrice) === cost,
      'Bulk AT_COST finalPrice equals cost',
    );
  } else {
    fail('Need product with cost and selling price', 'products list empty');
  }

  const cust2Name = `LiveTest-Standard-Keep ${Date.now()}`;
  const createCust2 = await request('POST', '/api/customers', {
    token,
    body: {
      name: cust2Name,
      priceGroupId: standardPg.id,
      creditLimit: 0,
    },
  });
  const customer2Id = createCust2.data?.data?.id;
  assert(createCust2.status === 201 && customer2Id, 'Create Standard price group customer');
  assert(
    createCust2.data?.data?.pricingMode === 'STANDARD',
    'Customer with Standard price group',
  );
  const assign2 = await request('POST', `/api/customers/groups/${groupId}/assign`, {
    token,
    body: { customerId: customer2Id },
  });
  assert(assign2.status === 200, 'Assign Standard customer to at-cost group');
  const after2 = await request('GET', `/api/customers/${customer2Id}`, { token });
  assert(
    after2.data?.data?.priceGroupId === standardPg.id,
    'COALESCE: existing Standard price group not overwritten on assign',
    `got ${after2.data?.data?.priceGroupId}`,
  );
  assert(
    after2.data?.data?.pricingMode === 'STANDARD',
    'COALESCE: pricingMode stays STANDARD',
  );

  const applyAll = await request(
    'POST',
    `/api/customers/groups/${groupId}/apply-default-price-group`,
    { token },
  );
  assert(applyAll.status === 200, 'Apply default price group to all members');
  assert(
    (applyAll.data?.data?.updatedCount ?? 0) >= 1,
    'Apply-to-all updated count',
    String(applyAll.data?.data?.updatedCount),
  );

  const afterApply1 = await request('GET', `/api/customers/${customerId}`, { token });
  assert(
    afterApply1.data?.data?.pricingMode === 'AT_COST',
    'Phase 3 apply-all: first member is AT_COST',
  );
  const afterApply2 = await request('GET', `/api/customers/${customer2Id}`, { token });
  assert(
    afterApply2.data?.data?.pricingMode === 'AT_COST',
    'Phase 3 apply-all: Standard member overwritten to AT_COST',
    `got ${afterApply2.data?.data?.pricingMode}`,
  );

  if (productId) {
    const idemKey = `live-phases-sale-${Date.now()}`;
    const sale = await request('POST', '/api/sales', {
      token,
      body: {
        customerId,
        lineItems: [
          {
            productId,
            productName: productWithCost.name || 'Test product',
            sku: '',
            uom: 'Item',
            quantity: 1,
            unitPrice: sell * 2,
            costPrice: cost,
            subtotal: sell * 2,
          },
        ],
        subtotal: sell * 2,
        taxAmount: 0,
        totalAmount: sell * 2,
        paymentMethod: 'CASH',
        amountTendered: sell * 2,
        idempotencyKey: idemKey,
      },
    });
    assert(sale.status === 200 || sale.status === 201, 'Phase 3 AT_COST sale completes', sale.data?.error);
    const line = sale.data?.data?.items?.[0];
    assert(
      Number(line?.unitPrice) === cost,
      'Phase 3 sale enforces engine cost on line',
      `unitPrice=${line?.unitPrice} expected=${cost}`,
    );
  }

  console.log(`\n--- Summary: ${passed} passed, ${failed} failed ---\n`);
  if (failures.length) {
    for (const f of failures) console.error(`  - ${f.name}: ${f.detail}`);
    process.exit(1);
  }
  console.log('All live checks passed.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
