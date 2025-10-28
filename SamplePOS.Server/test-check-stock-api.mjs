// Test check-stock API endpoint
async function testCheckStockAPI() {
  try {
    console.log('Testing check-stock API endpoint...\n');
    
    // Login first
    console.log('1. Logging in...');
    const loginResponse = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'admin',
        password: 'admin123'
      })
    });
    
    if (!loginResponse.ok) {
      throw new Error(`Login failed: ${loginResponse.status}`);
    }
    
    const loginData = await loginResponse.json();
    const token = loginData.accessToken;
    console.log('✅ Login successful\n');
    
    // Get some product IDs
    console.log('2. Getting product list...');
    const productsResponse = await fetch('http://localhost:3001/api/products?limit=5', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!productsResponse.ok) {
      throw new Error(`Products fetch failed: ${productsResponse.status}`);
    }
    
    const productsData = await productsResponse.json();
    const products = productsData.data || productsData;
    console.log(`✅ Found ${products.length} products\n`);
    
    // Test check-stock for each product
    console.log('3. Testing check-stock endpoint...\n');
    for (const product of products.slice(0, 3)) {
      console.log(`Testing: ${product.name} (ID: ${product.id})`);
      
      const checkResponse = await fetch(
        `http://localhost:3001/api/inventory/items/${product.id}/check-stock?quantity=1`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );
      
      if (!checkResponse.ok) {
        console.error(`  ❌ API Error: ${checkResponse.status} ${checkResponse.statusText}`);
        const errorText = await checkResponse.text();
        console.error(`  Error details: ${errorText}\n`);
        continue;
      }
      
      const stockData = await checkResponse.json();
      console.log(`  Success: ${stockData.success}`);
      console.log(`  Available: ${stockData.available}`);
      console.log(`  Message: ${stockData.message}`);
      console.log('');
    }
    
    console.log('✅ All tests completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.cause) {
      console.error('Cause:', error.cause);
    }
  }
}

testCheckStockAPI();
