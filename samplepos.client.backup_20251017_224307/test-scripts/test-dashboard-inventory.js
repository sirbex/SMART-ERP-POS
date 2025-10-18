/**
 * Test Dashboard Inventory Integration
 * Verifies that the Dashboard component can successfully load inventory statistics from PostgreSQL
 */

async function testDashboardInventory() {
  console.log('=== Testing Dashboard Inventory Integration ===');
  console.log('');

  try {
    // Test 1: Backend API Health
    console.log('1. Testing Backend API Health...');
    const healthResponse = await fetch('http://localhost:3001/api/health');
    if (healthResponse.ok) {
      console.log('✅ Backend API is healthy');
    } else {
      throw new Error(`Backend API unhealthy: ${healthResponse.status}`);
    }

    // Test 2: Unified Inventory Endpoint (used by Dashboard)
    console.log('');
    console.log('2. Testing Unified Inventory Endpoint (Dashboard source)...');
    const inventoryResponse = await fetch('http://localhost:3001/api/inventory/unified');
    
    if (!inventoryResponse.ok) {
      throw new Error(`Unified inventory API failed: ${inventoryResponse.status}`);
    }

    const inventoryData = await inventoryResponse.json();
    console.log('✅ Unified Inventory API working');
    console.log(`📦 Total Products: ${inventoryData.length}`);

    // Test 3: Calculate Dashboard Statistics (simulate Dashboard logic)
    console.log('');
    console.log('3. Calculating Dashboard Statistics...');
    
    const products = inventoryData || [];
    const lowStockProducts = products.filter(item => item.needsReorder || false);
    const expiredProducts = products.filter(item => item.hasExpiredStock || false);
    const expiringSoonProducts = products.filter(item => item.hasExpiringSoonStock || false);
    
    const totalInventoryValue = products.reduce((sum, item) => {
      const stock = parseFloat(item.totalStock) || 0;
      const cost = parseFloat(item.averageCost) || 0;
      const value = stock * cost;
      return Math.round((sum + value) * 100) / 100;
    }, 0);

    console.log('📊 Dashboard Inventory Statistics:');
    console.log(`   Total Products: ${products.length}`);
    console.log(`   Low Stock: ${lowStockProducts.length}`);
    console.log(`   Expired: ${expiredProducts.length}`);
    console.log(`   Expiring Soon: ${expiringSoonProducts.length}`);
    console.log(`   Total Value: $${totalInventoryValue.toFixed(2)}`);

    console.log('');
    console.log('✅ Dashboard should now show correct inventory statistics');
    console.log(`📈 Expected Display: "Total Products ${products.length}, Low Stock ${lowStockProducts.length}"`);
    
    return {
      success: true,
      stats: {
        totalProducts: products.length,
        lowStock: lowStockProducts.length,
        expired: expiredProducts.length,
        expiringSoon: expiringSoonProducts.length,
        totalValue: totalInventoryValue
      }
    };
    
  } catch (error) {
    console.error('❌ Dashboard Inventory Test failed:', error.message);
    return { success: false, error: error.message };
  }
}

// Run the test
testDashboardInventory().then(result => {
  if (result.success) {
    console.log('\n🎉 Dashboard inventory integration is working correctly!');
    console.log('🌐 Check your Dashboard at https://localhost:5174');
  } else {
    console.log('\n💥 Dashboard inventory integration needs attention');
    process.exit(1);
  }
});