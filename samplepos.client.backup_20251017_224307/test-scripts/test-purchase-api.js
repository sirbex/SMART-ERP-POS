import http from 'http';

const testPurchaseData = {
  batches: [
    {
      productId: 1,
      batchNumber: "TEST-BATCH-001",
      quantity: 10,
      costPrice: 15.00,
      expiryDate: "2025-12-31",
      receivedDate: "2025-10-05",
      supplier: "Test Supplier",
      sellingPrice: 20.00,
      manufacturingDate: "2025-10-01",
      location: "Warehouse A",
      notes: "Test batch for API validation"
    }
  ]
};

function testAPI(path, method = 'GET', data = null) {
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

    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

async function testPurchaseAPI() {
  console.log('Testing Purchase Receiving API...\n');

  try {
    // Test the batch receive endpoint
    await testAPI('/api/inventory/batches/receive', 'POST', testPurchaseData);
  } catch (error) {
    console.error('Failed to test batch receive:', error.message);
  }

  try {
    // Test the stock check endpoint
    await testAPI('/api/inventory/items/1/check-stock?quantity=5');
  } catch (error) {
    console.error('Failed to test stock check:', error.message);
  }

  console.log('\nPurchase API tests completed!');
}

testPurchaseAPI();