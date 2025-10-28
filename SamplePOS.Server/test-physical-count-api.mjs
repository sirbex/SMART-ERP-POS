#!/usr/bin/env node
/**
 * E2E smoke test for Physical Count API flow
 * Tests: Login → Get Products → Create Adjustment → Verify Stock Updated
 */

const BASE_URL = 'http://localhost:3001';

async function testPhysicalCountAPI() {
  console.log('\n🧪 Physical Count API E2E Smoke Test\n');
  console.log('━'.repeat(60));

  try {
    // Step 1: Login
    console.log('\n[1/4] 🔐 Logging in as admin...');
    const loginResponse = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'Admin123!' })
    });

    if (!loginResponse.ok) {
      throw new Error(`Login failed: ${loginResponse.status} ${await loginResponse.text()}`);
    }

    const loginData = await loginResponse.json();
    const token = loginData.token;
    console.log('      ✅ Login successful');

    // Step 2: Get a product
    console.log('\n[2/4] 📦 Fetching products...');
    const productsResponse = await fetch(`${BASE_URL}/api/products?page=1&limit=1`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!productsResponse.ok) {
      throw new Error(`Products fetch failed: ${productsResponse.status}`);
    }

    const productsData = await productsResponse.json();
    if (!productsData.data || productsData.data.length === 0) {
      throw new Error('No products found in database');
    }

    const product = productsData.data[0];
    const productId = product.id;
    const productName = product.name;
    const stockBefore = product.currentStock;

    console.log(`      ✅ Product: ${productName}`);
    console.log(`      📊 Current stock: ${stockBefore}`);

    // Step 3: Create adjustment (+1)
    console.log('\n[3/4] 🔧 Creating stock adjustment (+1)...');
    const adjustmentBody = {
      productId: productId,
      adjustmentQuantity: 1,
      reason: 'E2E smoke test - UI modal refactor verification',
      reference: 'SMOKE-TEST-ADJ'
    };

    const adjustmentResponse = await fetch(`${BASE_URL}/api/stock-movements/adjustment`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(adjustmentBody)
    });

    if (!adjustmentResponse.ok) {
      const errorText = await adjustmentResponse.text();
      throw new Error(`Adjustment failed: ${adjustmentResponse.status} - ${errorText}`);
    }

    const adjustmentData = await adjustmentResponse.json();
    const movementNumber = adjustmentData.data.movementNumber;
    const afterQuantity = adjustmentData.data.afterQuantity;

    console.log(`      ✅ Adjustment created: ${movementNumber}`);
    console.log(`      📊 New stock (from movement): ${afterQuantity}`);

    // Step 4: Verify stock updated correctly by fetching product again
    console.log('\n[4/4] ✔️  Verifying stock update...');
    const verifyResponse = await fetch(`${BASE_URL}/api/products/${productId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (!verifyResponse.ok) {
      throw new Error(`Product verification failed: ${verifyResponse.status}`);
    }
    
    const verifyData = await verifyResponse.json();
    const newStock = verifyData.currentStock; // Product endpoint returns product directly, not wrapped
    const expectedStock = parseFloat(stockBefore) + 1;

    if (Math.abs(parseFloat(newStock) - expectedStock) < 0.001) {
      console.log(`      ✅ Stock updated correctly: ${stockBefore} → ${newStock} (+1)`);
    } else {
      throw new Error(`Stock mismatch! Expected ${expectedStock}, got ${newStock}`);
    }

    // Success summary
    console.log('\n' + '━'.repeat(60));
    console.log('✅ ALL TESTS PASSED');
    console.log('━'.repeat(60));
    console.log('\n📋 Summary:');
    console.log(`   Product: ${productName} (${productId})`);
    console.log(`   Movement: ${movementNumber}`);
    console.log(`   Stock: ${stockBefore} → ${newStock}`);
    console.log(`   API: ✅ Working correctly`);
    console.log(`   Auth: ✅ Token-based authentication OK`);
    console.log(`   Adjustment: ✅ Stock updates persisted`);
    console.log('\n✨ Backend ready for UI modal testing!\n');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ TEST FAILED');
    console.error('━'.repeat(60));
    console.error(`Error: ${error.message}`);
    console.error('\nTroubleshooting:');
    console.error('  • Ensure backend is running: npm run dev (in SamplePOS.Server)');
    console.error('  • Verify database is seeded with admin user and products');
    console.error('  • Check terminal logs for detailed error messages\n');
    process.exit(1);
  }
}

testPhysicalCountAPI();
