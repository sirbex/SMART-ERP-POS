import http from 'http';

console.log('\n🧪 PHASE 1 TESTING: Caching + Rate Limiting + Logging\n');
console.log('='.repeat(60));

// Helper to make HTTP request
function makeRequest(path, description) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: path,
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
        const rateLimitRemaining = res.headers['ratelimit-remaining'];
        
        console.log(`\n${description}:`);
        console.log(`  Status: ${res.statusCode}`);
        console.log(`  Duration: ${duration}ms`);
        console.log(`  Cache: ${cached ? '✅ HIT (from cache)' : '🗄️  MISS (from database)'}`);
        console.log(`  Rate Limit Remaining: ${rateLimitRemaining || 'N/A'}`);
        
        resolve({ duration, cached, status: res.statusCode, rateLimitRemaining });
      });
    });

    req.on('error', (error) => {
      console.error(`❌ ${description} failed:`, error.message);
      resolve({ error: error.message });
    });
    
    req.end();
  });
}

async function runTests() {
  console.log('\n📋 TEST 1: CACHING');
  console.log('-'.repeat(60));
  
  // Test caching with products endpoint
  const test1 = await makeRequest('/api/products?page=1&limit=10', 'Request 1 - Products (No cache)');
  await new Promise(r => setTimeout(r, 200));
  
  const test2 = await makeRequest('/api/products?page=1&limit=10', 'Request 2 - Products (Should be cached)');
  await new Promise(r => setTimeout(r, 200));
  
  const test3 = await makeRequest('/api/products?page=1&limit=10', 'Request 3 - Products (Should be cached)');
  
  // Verify caching worked
  if (test2.cached && test3.cached) {
    console.log('\n✅ CACHING: Working! Requests 2 & 3 served from cache');
    if (test2.duration < test1.duration) {
      console.log(`   Performance: ${Math.round((test1.duration / test2.duration) * 10) / 10}x faster`);
    }
  } else {
    console.log('\n⚠️  CACHING: May not be working correctly');
  }
  
  console.log('\n📋 TEST 2: RATE LIMITING');
  console.log('-'.repeat(60));
  
  // Test rate limiting
  const test4 = await makeRequest('/api/health', 'Request to /api/health');
  console.log(`\nℹ️  Rate limit allows ${parseInt(test4.rateLimitRemaining) + 1} requests in 15min window`);
  console.log('   After 3 product requests, remaining:', test4.rateLimitRemaining);
  
  if (test4.rateLimitRemaining) {
    console.log('✅ RATE LIMITING: Working! Headers present');
  } else {
    console.log('⚠️  RATE LIMITING: Headers not found');
  }
  
  console.log('\n📋 TEST 3: REQUEST LOGGING');
  console.log('-'.repeat(60));
  console.log('✅ Check server logs above - should show:');
  console.log('   → GET /api/products (request start)');
  console.log('   ← GET /api/products 200 XXms (response with timing)');
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ PHASE 1 TESTING COMPLETE');
  console.log('='.repeat(60));
  console.log('\nSummary:');
  console.log('- Caching:', test2.cached && test3.cached ? '✅ Working' : '⚠️  Check logs');
  console.log('- Rate Limiting:', test4.rateLimitRemaining ? '✅ Working' : '⚠️  Check logs');
  console.log('- Request Logging: ✅ Check server terminal for timing logs');
  console.log('\nNext: Phase 2 - Database index optimization\n');
}

runTests().catch(console.error);
