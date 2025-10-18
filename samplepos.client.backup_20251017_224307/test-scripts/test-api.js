import http from 'http';

function makeRequest(path, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      }
    };

    const req = http.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        console.log(`${method} ${path} - Status: ${res.statusCode}`);
        if (responseData) {
          try {
            const parsed = JSON.parse(responseData);
            console.log('Response:', parsed);
          } catch (e) {
            console.log('Response:', responseData);
          }
        }
        resolve({ statusCode: res.statusCode, data: responseData });
      });
    });

    req.on('error', (error) => {
      console.error('Error:', error.message);
      reject(error);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

async function testAPI() {
  console.log('Testing API endpoints...\n');

  // Test the new /products endpoint
  try {
    await makeRequest('/api/inventory/products');
  } catch (error) {
    console.error('Failed to test /api/inventory/products:', error.message);
  }

  // Test the original / endpoint  
  try {
    await makeRequest('/api/inventory');
  } catch (error) {
    console.error('Failed to test /api/inventory:', error.message);
  }

  // Test POST to /products (this was failing before)
  try {
    const testProduct = {
      sku: 'TEST-001',
      name: 'Test Product',
      description: 'A test product',
      category: 'Test',
      price: 10.99,
      taxRate: 0.08,
      reorderLevel: 5,
      isActive: true,
      batch: 'BATCH-001',
      hasExpiry: false,
      unit: 'piece'
    };
    
    await makeRequest('/api/inventory/products', 'POST', testProduct);
  } catch (error) {
    console.error('Failed to test POST /api/inventory/products:', error.message);
  }

  console.log('\nAPI tests completed!');
}

testAPI();