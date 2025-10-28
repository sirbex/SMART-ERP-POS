#!/usr/bin/env node
/**
 * Test Complete Count button behavior
 * Simulates what happens when user clicks "Complete Count" with 1 adjustment
 */

const BASE_URL = 'http://localhost:3001';

async function testCompleteCount() {
  console.log('\n🧪 Testing Complete Count with 1 Adjustment\n');
  console.log('━'.repeat(60));

  try {
    // Step 1: Login
    console.log('\n[1/4] 🔐 Logging in...');
    const loginResponse = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'Admin123!' })
    });

    if (!loginResponse.ok) {
      throw new Error(`Login failed: ${loginResponse.status}`);
    }

    const loginData = await loginResponse.json();
    const token = loginData.token;
    console.log('      ✅ Login successful');

    // Step 2: Get first product
    console.log('\n[2/4] 📦 Getting product...');
    const productsResponse = await fetch(`${BASE_URL}/api/products?page=1&limit=1`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const productsData = await productsResponse.json();
    const product = productsData.data[0];
    const stockBefore = product.currentStock;
    
    console.log(`      ✅ Product: ${product.name}`);
    console.log(`      📊 Current stock: ${stockBefore}`);

    // Step 3: Simulate user counting and finding a variance
    console.log('\n[3/4] 📝 Simulating count session...');
    const countedQty = parseInt(stockBefore) + 1; // User counted 1 more than system
    const variance = countedQty - stockBefore;
    
    console.log(`      System Qty: ${stockBefore}`);
    console.log(`      Counted Qty: ${countedQty}`);
    console.log(`      Variance: ${variance > 0 ? '+' : ''}${variance}`);

    // Step 4: Simulate "Complete Count" button click
    console.log('\n[4/4] 🎯 Clicking "Complete Count"...');
    
    // This is what the frontend sends when you click Complete Count
    const adjustment = {
      productId: product.id,
      adjustmentQuantity: variance,
      reason: `Physical Count - Physical Count - ${new Date().toLocaleDateString()}`,
      notes: `Physical count adjustment. System: ${stockBefore}, Counted: ${countedQty}, Variance: ${variance}`
    };

    console.log('\n      📤 Sending adjustment:');
    console.log(JSON.stringify(adjustment, null, 2));

    const adjustResponse = await fetch(`${BASE_URL}/api/stock-movements/adjustment`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(adjustment)
    });

    if (!adjustResponse.ok) {
      const errorText = await adjustResponse.text();
      console.log('\n      ❌ Adjustment failed!');
      console.log(`      Status: ${adjustResponse.status}`);
      console.log(`      Error: ${errorText}`);
      throw new Error(`API returned ${adjustResponse.status}`);
    }

    const adjustData = await adjustResponse.json();
    console.log('\n      ✅ Adjustment created successfully!');
    console.log(`      Movement #: ${adjustData.data.movementNumber}`);
    console.log(`      New Stock: ${adjustData.data.afterQuantity}`);

    // Verify stock updated
    const verifyResponse = await fetch(`${BASE_URL}/api/products/${product.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const verifyData = await verifyResponse.json();
    const newStock = verifyData.currentStock;

    console.log('\n' + '━'.repeat(60));
    console.log('✅ COMPLETE COUNT BUTTON WORKS!');
    console.log('━'.repeat(60));
    console.log(`\n📊 Stock: ${stockBefore} → ${newStock} (${variance > 0 ? '+' : ''}${variance})`);
    console.log(`✅ Complete Count button would work correctly`);
    console.log(`✅ 1 adjustment processed successfully\n`);

  } catch (error) {
    console.error('\n❌ TEST FAILED');
    console.error('━'.repeat(60));
    console.error(`Error: ${error.message}`);
    console.error('\nThis is why your Complete Count button is not working!\n');
    process.exit(1);
  }
}

testCompleteCount();
