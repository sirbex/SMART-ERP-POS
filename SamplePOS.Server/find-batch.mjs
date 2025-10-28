#!/usr/bin/env node
/**
 * Find the product with batch "b-365"
 */

const BASE_URL = 'http://localhost:3001';

async function findBatchProduct() {
  console.log('\n🔍 Finding Product with Batch "b-365"\n');
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

    // Get all products
    const productsResponse = await fetch(`${BASE_URL}/api/products?page=1&limit=100`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const productsData = await productsResponse.json();
    const products = productsData.data || [];
    
    console.log(`\n📦 Checking ${products.length} products...\n`);

    // Check each product's history
    for (const product of products) {
      const historyResponse = await fetch(`${BASE_URL}/api/products/${product.id}/history`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const historyData = await historyResponse.json();
      
      // Check batchReceipts
      const hasBatch = historyData.batchReceipts?.some(b => b.batchNumber === 'b-365');
      
      // Check costHistory
      const inCostHistory = historyData.costHistory?.some(c => c.batchNumber === 'b-365');
      
      if (hasBatch || inCostHistory) {
        console.log(`✅ Found in product: ${product.name} (${product.id})`);
        console.log(`   In batchReceipts: ${hasBatch ? 'YES' : 'NO'}`);
        console.log(`   In costHistory: ${inCostHistory ? 'YES' : 'NO'}`);
        
        if (inCostHistory) {
          const entry = historyData.costHistory.find(c => c.batchNumber === 'b-365');
          console.log(`\n   Cost History Entry:`);
          console.log(`     Date: ${new Date(entry.date).toLocaleDateString()}`);
          console.log(`     Cost: ₱${entry.cost.toFixed(2)}`);
          console.log(`     Qty: ${entry.quantity}`);
          console.log(`     Expiry: ${entry.expiryDate ? new Date(entry.expiryDate).toLocaleDateString() : 'N/A'}`);
          console.log(`     Supplier: ${entry.supplier || 'NOT SET ❌'}`);
          console.log(`     Source: ${entry.source}`);
        }
        
        if (hasBatch) {
          const batch = historyData.batchReceipts.find(b => b.batchNumber === 'b-365');
          console.log(`\n   Batch Receipt:`);
          console.log(`     Received: ${new Date(batch.receivedDate).toLocaleDateString()}`);
          console.log(`     Qty: ${batch.quantityReceived}`);
          console.log(`     Cost: ₱${batch.unitCost.toFixed(2)}`);
          console.log(`     Expiry: ${batch.expiryDate ? new Date(batch.expiryDate).toLocaleDateString() : 'N/A'}`);
        }
        
        break;
      }
    }

    console.log('\n━'.repeat(60));
    console.log('');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

findBatchProduct();
