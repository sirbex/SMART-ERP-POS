#!/usr/bin/env node
/**
 * Test Product History API - Check if supplier is returned in costHistory
 */

const BASE_URL = 'http://localhost:3001';

async function testProductHistory() {
  console.log('\n🧪 Testing Product History API - Cost History\n');
  console.log('━'.repeat(60));

  try {
    // Step 1: Login
    console.log('\n[1/3] 🔐 Logging in...');
    const loginResponse = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'Admin123!' })
    });

    const loginData = await loginResponse.json();
    const token = loginData.token;
    console.log('      ✅ Login successful');

    // Step 2: Get first product
    console.log('\n[2/3] 📦 Getting product...');
    const productsResponse = await fetch(`${BASE_URL}/api/products?page=1&limit=1`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const productsData = await productsResponse.json();
    const product = productsData.data[0];
    
    console.log(`      ✅ Product: ${product.name} (${product.id})`);

    // Step 3: Get product history
    console.log('\n[3/3] 📜 Fetching product history...');
    const historyResponse = await fetch(`${BASE_URL}/api/products/${product.id}/history`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!historyResponse.ok) {
      throw new Error(`History API failed: ${historyResponse.status}`);
    }

    const historyData = await historyResponse.json();
    const costHistory = historyData.costHistory || [];

    console.log(`      ✅ Cost History entries: ${costHistory.length}\n`);

    if (costHistory.length === 0) {
      console.log('      ⚠️  No cost history found for this product');
    } else {
      console.log('      📊 Cost History Details:\n');
      costHistory.forEach((entry, index) => {
        console.log(`      Entry ${index + 1}:`);
        console.log(`        Date: ${new Date(entry.date).toLocaleDateString()}`);
        console.log(`        Batch: ${entry.batchNumber || 'N/A'}`);
        console.log(`        Cost: ₱${entry.cost.toFixed(2)}`);
        console.log(`        Qty: ${entry.quantity}`);
        console.log(`        Expiry: ${entry.expiryDate ? new Date(entry.expiryDate).toLocaleDateString() : 'N/A'}`);
        console.log(`        Supplier: ${entry.supplier || 'NOT SET'} ${!entry.supplier ? '❌' : '✅'}`);
        console.log(`        Source: ${entry.source}`);
        console.log('');
      });
    }

    console.log('━'.repeat(60));
    
    if (costHistory.length > 0) {
      const withSupplier = costHistory.filter(e => e.supplier).length;
      const withoutSupplier = costHistory.filter(e => !e.supplier).length;
      
      console.log('📈 Summary:');
      console.log(`   Total entries: ${costHistory.length}`);
      console.log(`   With supplier: ${withSupplier} ✅`);
      console.log(`   Without supplier: ${withoutSupplier} ${withoutSupplier > 0 ? '❌' : '✅'}`);
      
      if (withoutSupplier > 0) {
        console.log('\n⚠️  Some entries missing supplier information!');
        console.log('   This could be due to:');
        console.log('   - Old StockBatch records (no supplier relation)');
        console.log('   - GoodsReceipt without PurchaseOrder');
        console.log('   - Missing supplier data in PurchaseOrder');
      }
    }

    console.log('');

  } catch (error) {
    console.error('\n❌ TEST FAILED');
    console.error('━'.repeat(60));
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

testProductHistory();
