import http from 'http';

// Helper to make HTTP request and measure time
function testRequest(description) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: '/api/products?page=1&limit=20',
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        const duration = Date.now() - start;
        const cached = res.headers['x-cache-hit'] === 'true';
        console.log(`${description}: ${duration}ms ${cached ? '(CACHED ✅)' : '(Database 🗄️)'}`);
        resolve({ duration, cached });
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function runTests() {
  console.log('\n🧪 Testing Cache Performance\n');
  console.log('='.repeat(50));
  
  try {
    // Test 1: First request (hits database)
    await testRequest('Request 1 - No cache');
    
    // Small delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Test 2: Second request (should hit cache)
    await testRequest('Request 2 - Should be cached');
    
    // Test 3: Third request (should hit cache)
    await testRequest('Request 3 - Should be cached');
    
    console.log('='.repeat(50));
    console.log('\n✅ Cache test complete!\n');
    console.log('Expected: Request 1 slower (database query)');
    console.log('Expected: Request 2 & 3 faster (from cache)\n');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

runTests();
