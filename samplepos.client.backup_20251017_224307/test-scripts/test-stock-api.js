import http from 'http';

function testStockEndpoint(productId) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: `/api/inventory/products/${productId}/stock`,
      method: 'GET',
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
        console.log(`GET /api/inventory/products/${productId}/stock - Status: ${res.statusCode}`);
        if (responseData) {
          try {
            const parsed = JSON.parse(responseData);
            console.log('Response:', JSON.stringify(parsed, null, 2));
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
    
    req.end();
  });
}

async function testAPI() {
  console.log('Testing new stock endpoint...\n');

  try {
    await testStockEndpoint(1);
  } catch (error) {
    console.error('Failed to test stock endpoint:', error.message);
  }

  console.log('\nStock API test completed!');
}

testAPI();