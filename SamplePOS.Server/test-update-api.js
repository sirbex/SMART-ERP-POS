// Test the product update API endpoint
import fetch from 'node-fetch';

async function testProductUpdateAPI() {
  try {
    console.log('🔍 Testing product update API...');
    
    // First, get a product ID
    const productsResponse = await fetch('http://localhost:3001/api/products', {
      headers: {
        'Authorization': 'Bearer valid-token', // Using test token
        'Content-Type': 'application/json'
      }
    });
    
    if (!productsResponse.ok) {
      throw new Error(`Failed to fetch products: ${productsResponse.status}`);
    }
    
    const productsData = await productsResponse.json();
    const product = productsData.data[0]; // Get first product
    
    if (!product) {
      console.log('❌ No products found');
      return;
    }
    
    console.log(`✅ Testing update for product: ${product.name} (${product.id})`);
    
    // Try to update the product
    const updateData = {
      reorderPoint: 75, // This should now work with our fix
      notes: 'Updated via API test'
    };
    
    console.log('🔄 Attempting update with data:', updateData);
    
    const updateResponse = await fetch(`http://localhost:3001/api/products/${product.id}`, {
      method: 'PUT',
      headers: {
        'Authorization': 'Bearer valid-token',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updateData)
    });
    
    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      console.log(`❌ Update failed with status ${updateResponse.status}:`);
      console.log(errorText);
      return;
    }
    
    const updatedProduct = await updateResponse.json();
    console.log('✅ Update successful!');
    console.log('Updated product:', updatedProduct);
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
  }
}

testProductUpdateAPI();