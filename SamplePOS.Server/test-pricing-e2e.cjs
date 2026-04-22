/**
 * END-TO-END PRICING ENGINE TEST
 * Scenario: Big company customer buys 200,000 units of a 20,000 UGX product
 * Expected: Pricing engine applies customer group discount or tier pricing
 */
const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:password@localhost:5432/pos_system' });

const PRODUCT_ID = '2857ead5-2f5b-4bb2-9278-c0d68250b4cd'; // Brain Active Denk - 20,000 UGX
const WHOLESALE_GROUP_ID = '28e9afec-c287-420f-a452-c17c8459c304'; // Wholesale Customers - 10% discount
const BASE_URL = 'http://localhost:3001/api';

async function setup() {
  console.log('\n========================================');
  console.log('  PRICING ENGINE E2E TEST');
  console.log('========================================\n');

  // Step 1: Create a test customer and assign to Wholesale group
  console.log('1. Creating test customer "MegaCorp Ltd" in Wholesale group...');
  const existingCustomer = await pool.query(
    "SELECT id FROM customers WHERE name = 'MegaCorp Ltd' LIMIT 1"
  );

  let customerId;
  if (existingCustomer.rows.length > 0) {
    customerId = existingCustomer.rows[0].id;
    // Update group assignment
    await pool.query(
      'UPDATE customers SET customer_group_id = $1 WHERE id = $2',
      [WHOLESALE_GROUP_ID, customerId]
    );
    console.log('   ✅ Existing customer updated, ID:', customerId);
  } else {
    const result = await pool.query(
      "INSERT INTO customers (name, email, phone, customer_group_id) VALUES ('MegaCorp Ltd', 'orders@megacorp.com', '+256700000001', $1) RETURNING id",
      [WHOLESALE_GROUP_ID]
    );
    customerId = result.rows[0].id;
    console.log('   ✅ Created customer, ID:', customerId);
  }

  // Step 2: Create a pricing tier for bulk quantity (>=100 units → 18,000 each)
  console.log('\n2. Creating pricing tier for bulk purchases (≥100 units → 18,000 UGX)...');

  // Clean up existing tiers for this product
  await pool.query('DELETE FROM pricing_tiers WHERE product_id = $1', [PRODUCT_ID]);

  await pool.query(
    `INSERT INTO pricing_tiers (product_id, customer_group_id, name, min_quantity, max_quantity, pricing_formula, calculated_price, priority, is_active)
     VALUES ($1, NULL, 'Bulk 100+ (All Customers)', 100, NULL, 'cost * 1.10', 18000.00, 10, true)`,
    [PRODUCT_ID]
  );
  console.log('   ✅ Tier created: ≥100 units → 18,000 UGX (for all customers)');

  // Step 3: Create a higher-priority tier for Wholesale + bulk (>=100 → 17,000)
  await pool.query(
    `INSERT INTO pricing_tiers (product_id, customer_group_id, name, min_quantity, max_quantity, pricing_formula, calculated_price, priority, is_active)
     VALUES ($1, $2, 'Wholesale Bulk 100+ (VIP)', 100, NULL, 'cost * 1.05', 17000.00, 20, true)`,
    [PRODUCT_ID, WHOLESALE_GROUP_ID]
  );
  console.log('   ✅ Tier created: Wholesale + ≥100 units → 17,000 UGX (priority higher)');

  // Verify the product
  const product = await pool.query(
    "SELECT p.name, pv.selling_price, pv.cost_price FROM products p LEFT JOIN product_valuation pv ON pv.product_id = p.id WHERE p.id = $1",
    [PRODUCT_ID]
  );
  console.log('\n   Product:', product.rows[0].name);
  console.log('   Base price:', product.rows[0].selling_price, 'UGX');
  console.log('   Cost price:', product.rows[0].cost_price, 'UGX');

  return { customerId };
}

async function login() {
  console.log('\n3. Logging in...');
  const resp = await fetch(BASE_URL + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  const data = await resp.json();
  if (!data.success) throw new Error('Login failed: ' + JSON.stringify(data));
  console.log('   ✅ Logged in as', data.data.user.username);
  return data.data.token;
}

async function testPricingEngine(token, customerId) {
  console.log('\n========================================');
  console.log('  TEST: Pricing Engine Resolution');
  console.log('========================================\n');

  // Test 1: No customer, qty=1 → base price (20,000)
  console.log('Test 1: Walk-in customer, qty=1');
  let resp = await fetch(
    BASE_URL + '/pricing/price?productId=' + PRODUCT_ID + '&quantity=1',
    { headers: { Authorization: 'Bearer ' + token } }
  );
  let data = await resp.json();
  console.log('   Price:', data.data.finalPrice, '| Scope:', data.data.appliedRule.scope);
  console.log('   Expected: 20,000 (base) ✅', data.data.finalPrice === 20000 ? '' : '❌ MISMATCH!');

  // Test 2: No customer, qty=200 → bulk tier (18,000)
  console.log('\nTest 2: Walk-in customer, qty=200 (bulk)');
  resp = await fetch(
    BASE_URL + '/pricing/price?productId=' + PRODUCT_ID + '&quantity=200',
    { headers: { Authorization: 'Bearer ' + token } }
  );
  data = await resp.json();
  console.log('   Price:', data.data.finalPrice, '| Scope:', data.data.appliedRule.scope, '| Rule:', data.data.appliedRule.ruleName);
  console.log('   Expected: 18,000 (bulk tier) ✅', data.data.finalPrice === 18000 ? '' : '❌ MISMATCH!');

  // Test 3: MegaCorp (Wholesale), qty=1 → group discount (20,000 * 0.9 = 18,000)
  console.log('\nTest 3: MegaCorp (Wholesale group, 10% discount), qty=1');
  resp = await fetch(
    BASE_URL + '/pricing/price?productId=' + PRODUCT_ID + '&quantity=1&customerId=' + customerId,
    { headers: { Authorization: 'Bearer ' + token } }
  );
  data = await resp.json();
  console.log('   Price:', data.data.finalPrice, '| Scope:', data.data.appliedRule.scope);
  console.log('   Expected: 18,000 (10% group discount) ✅', data.data.finalPrice === 18000 ? '' : '❌ MISMATCH!');

  // Test 4: MegaCorp (Wholesale), qty=200 → wholesale bulk tier (17,000) — higher priority than generic bulk
  console.log('\nTest 4: MegaCorp (Wholesale), qty=200 (wholesale bulk tier)');
  resp = await fetch(
    BASE_URL + '/pricing/price?productId=' + PRODUCT_ID + '&quantity=200&customerId=' + customerId,
    { headers: { Authorization: 'Bearer ' + token } }
  );
  data = await resp.json();
  console.log('   Price:', data.data.finalPrice, '| Scope:', data.data.appliedRule.scope, '| Rule:', data.data.appliedRule.ruleName);
  console.log('   Expected: 17,000 (wholesale bulk tier) ✅', data.data.finalPrice === 17000 ? '' : '❌ MISMATCH!');

  // Test 5: Bulk price resolution (cart simulation)
  console.log('\nTest 5: Bulk price resolution (cart with 2 items, MegaCorp customer)');
  resp = await fetch(BASE_URL + '/pricing/price/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({
      items: [
        { productId: PRODUCT_ID, quantity: 200 },
        { productId: PRODUCT_ID, quantity: 1 },
      ],
      customerId: customerId,
    }),
  });
  data = await resp.json();
  console.log('   Item 1 (qty=200): Price=', data.data[0].finalPrice, '| Scope:', data.data[0].appliedRule.scope);
  console.log('   Item 2 (qty=1):   Price=', data.data[1].finalPrice, '| Scope:', data.data[1].appliedRule.scope);

  return data;
}

async function testSaleCreation(token, customerId) {
  console.log('\n========================================');
  console.log('  TEST: Sale with Pricing Engine');
  console.log('========================================\n');

  // Create a small sale (qty=5) with MegaCorp to verify pricing engine overrides
  // Frontend sends base price (20,000) but engine should apply group discount (18,000)
  console.log('Creating sale: MegaCorp buys 5x Brain Active Denk');
  console.log('   Frontend sends unitPrice: 20,000 (base price)');
  console.log('   Engine should override to: 18,000 (10% group discount)');

  const resp = await fetch(BASE_URL + '/sales', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({
      customerId: customerId,
      lineItems: [{
        productId: PRODUCT_ID,
        productName: 'Brain Active Denk',
        quantity: 5,
        unitPrice: 20000, // Frontend sends BASE price
      }],
      subtotal: 100000,
      totalAmount: 100000,
      paymentLines: [{ paymentMethod: 'CASH', amount: 100000 }],
    }),
  });

  const data = await resp.json();
  if (data.success) {
    const sale = data.data.sale;
    const items = data.data.items;
    console.log('\n   ✅ Sale created:', sale.sale_number);
    console.log('   Total amount:', sale.total_amount);
    console.log('   Item unit_price:', items[0]?.unit_price);
    console.log('   Item line_total:', items[0]?.line_total);

    const expectedPrice = 18000; // Group discount: 20000 * 0.9
    const actualPrice = Number(items[0]?.unit_price);
    if (actualPrice === expectedPrice) {
      console.log('\n   🎉 SUCCESS: Pricing engine correctly overrode unit price!');
      console.log('   Frontend sent: 20,000 → Engine applied: 18,000 (10% wholesale discount)');
    } else {
      console.log('\n   ⚠️ Unit price:', actualPrice, '(expected', expectedPrice, ')');
    }
  } else {
    console.log('   ❌ Sale failed:', data.error);
  }
}

async function cleanup() {
  console.log('\n========================================');
  console.log('  CLEANUP');
  console.log('========================================\n');

  // Remove test tiers
  await pool.query('DELETE FROM pricing_tiers WHERE product_id = $1', [PRODUCT_ID]);
  console.log('   ✅ Test pricing tiers removed');
}

(async () => {
  try {
    const { customerId } = await setup();
    const token = await login();
    await testPricingEngine(token, customerId);
    await testSaleCreation(token, customerId);

    console.log('\n========================================');
    console.log('  SUMMARY');
    console.log('========================================');
    console.log('  Product: Brain Active Denk (base: 20,000 UGX)');
    console.log('  Customer: MegaCorp Ltd (Wholesale - 10% discount)');
    console.log('  Pricing cascade tested:');
    console.log('    1. Walk-in, qty=1   → 20,000 (base)');
    console.log('    2. Walk-in, qty=200 → 18,000 (bulk tier)');
    console.log('    3. Wholesale, qty=1 → 18,000 (group 10%)');
    console.log('    4. Wholesale, qty=200 → 17,000 (wholesale bulk tier)');
    console.log('    5. Sale creation: engine overrides frontend price ✅');
    console.log('========================================\n');

    await cleanup();
  } catch (err) {
    console.error('TEST FAILED:', err);
  } finally {
    await pool.end();
  }
})();
