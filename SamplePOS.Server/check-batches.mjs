#!/usr/bin/env node
/**
 * Check what batch records exist for the product
 */

const BASE_URL = 'http://localhost:3001';

async function checkBatches() {
  console.log('\n🧪 Checking Batch Records\n');
  console.log('━'.repeat(60));

  try {
    // Login
    const loginResponse = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'Admin123!' })
    });

    const loginData = await loginResponse.json();
    const token = loginData.token;

    // Get first product
    const productsResponse = await fetch(`${BASE_URL}/api/products?page=1&limit=1`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const productsData = await productsResponse.json();
    const product = productsData.data[0];
    
    console.log(`\n📦 Product: ${product.name} (${product.id})\n`);

    // Get product history
    const historyResponse = await fetch(`${BASE_URL}/api/products/${product.id}/history`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const historyData = await historyResponse.json();
    
    console.log('📊 Data Summary:');
    console.log(`   Cost History entries: ${historyData.costHistory?.length || 0}`);
    console.log(`   Batch Receipts: ${historyData.batchReceipts?.length || 0}`);
    console.log(`   Events: ${historyData.events?.length || 0}`);
    console.log('');

    if (historyData.batchReceipts && historyData.batchReceipts.length > 0) {
      console.log('📦 Batch Receipts (from StockBatch model):');
      historyData.batchReceipts.forEach((batch, index) => {
        console.log(`\n   Batch ${index + 1}:`);
        console.log(`     Batch Number: ${batch.batchNumber}`);
        console.log(`     Received: ${new Date(batch.receivedDate).toLocaleDateString()}`);
        console.log(`     Qty Received: ${batch.quantityReceived}`);
        console.log(`     Qty Remaining: ${batch.quantityRemaining}`);
        console.log(`     Unit Cost: ₱${batch.unitCost.toFixed(2)}`);
        console.log(`     Expiry: ${batch.expiryDate ? new Date(batch.expiryDate).toLocaleDateString() : 'N/A'}`);
        console.log(`     Total Cost: ₱${batch.totalCost.toFixed(2)}`);
      });
    }

    if (historyData.costHistory && historyData.costHistory.length > 0) {
      console.log('\n\n💰 Cost History (should show in UI):');
      historyData.costHistory.forEach((entry, index) => {
        console.log(`\n   Entry ${index + 1}:`);
        console.log(`     Date: ${new Date(entry.date).toLocaleDateString()}`);
        console.log(`     Batch: ${entry.batchNumber || 'N/A'}`);
        console.log(`     Cost: ₱${entry.cost.toFixed(2)}`);
        console.log(`     Qty: ${entry.quantity}`);
        console.log(`     Expiry: ${entry.expiryDate ? new Date(entry.expiryDate).toLocaleDateString() : 'N/A'}`);
        console.log(`     Supplier: ${entry.supplier || 'NOT SET'}`);
      });
    }

    console.log('\n━'.repeat(60));
    console.log('\n⚠️  Issue Identified:');
    console.log('   The batch "b-365" you see is in batchReceipts (StockBatch model)');
    console.log('   But it\'s NOT appearing in costHistory!');
    console.log('   This means the backend is not including StockBatch in costHistory.');
    console.log('\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

checkBatches();
