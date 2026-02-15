/**
 * Simple health test to verify basic server functionality
 */

import http from 'http';

function testHealth() {
  return new Promise((resolve, reject) => {
    const req = http.get('http://localhost:3001/health', (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve({ status: res.statusCode, data: result });
        } catch (error) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

async function runTest() {
  console.log('🧪 Testing Node.js Server Health Endpoint...\n');

  try {
    const result = await testHealth();
    console.log('✅ Health endpoint responded successfully!');
    console.log('📊 Status Code:', result.status);
    console.log('📄 Response:', JSON.stringify(result.data, null, 2));

    if (result.data && result.data.services) {
      console.log('\n🔍 Service Status Analysis:');
      console.log('   Database:', result.data.services.database);
      console.log('   Accounting:', result.data.services.accounting);
      if (result.data.services.accountingError) {
        console.log('   Accounting Error:', result.data.services.accountingError);
      }
    }
  } catch (error) {
    console.log('❌ Health endpoint test failed:', error.message);
    console.log('   This indicates the server is not responding on port 3001');
    console.log('   Even though startup logs show "Server started on port 3001"');
    console.log('   Possible causes:');
    console.log('   - Server crashed after startup message');
    console.log('   - Port binding issue');
    console.log('   - TypeScript/import error causing silent failure');
  }
}

runTest();