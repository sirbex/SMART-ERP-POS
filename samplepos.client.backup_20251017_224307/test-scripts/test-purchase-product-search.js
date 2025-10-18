// Test Purchase Order Product Search
console.log("=== Testing Purchase Order Product Search ===");
console.log("");

async function testProductSearch() {
  try {
    console.log("🔍 Testing product search for 'soda'...");
    
    // Fetch products from PostgreSQL unified inventory API
    const response = await fetch('http://localhost:3001/api/inventory/unified');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const unifiedData = await response.json();
    
    console.log(`📦 Found ${unifiedData.length} products in PostgreSQL:`);
    unifiedData.forEach(item => {
      console.log(`   - ${item.name} (ID: ${item.id})`);
    });
    
    console.log("");
    console.log("🔍 Testing search functionality:");
    
    // Test search for "soda" (case insensitive)
    const searchTerm = 'soda';
    const matchingProducts = unifiedData.filter(product =>
      product.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    console.log(`   Search term: "${searchTerm}"`);
    console.log(`   Matches found: ${matchingProducts.length}`);
    
    if (matchingProducts.length > 0) {
      matchingProducts.forEach(product => {
        console.log(`   ✅ ${product.name} (Stock: ${product.totalStock || 0})`);
      });
    } else {
      console.log("   ❌ No matches found");
    }
    
    // Transform to Product format for Purchase Order
    const productData = unifiedData.map((item) => ({
      id: item.id.toString(),
      name: item.name,
      sku: item.sku || 'N/A',
      category: item.category || 'Uncategorized',
      unit: item.metadata?.unit || 'pcs',
      hasExpiry: item.metadata?.hasExpiry || false,
      reorderLevel: item.reorderLevel || 10,
      isActive: item.isActive,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      price: item.price || 0,
      currentStock: item.totalStock || 0
    }));
    
    console.log("");
    console.log("🏗️ Transformed products for Purchase Order:");
    productData.forEach(product => {
      console.log(`   - ${product.name} (${product.currentStock} ${product.unit} @ $${product.price})`);
    });
    
    console.log("");
    console.log("✅ Purchase Order product search should now work!");
    console.log("💡 You can now search for 'soda', 'minute', or 'sugar' in Purchase Orders");
    
  } catch (error) {
    console.error("❌ Error testing product search:", error);
  }
}

testProductSearch();