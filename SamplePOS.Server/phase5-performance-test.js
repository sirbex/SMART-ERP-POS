/**
 * Phase 5: Performance Benchmarking Test
 * Tests system performance under load conditions
 */

import axios from 'axios';
import { performance } from 'perf_hooks';

const NODE_API = 'http://localhost:3001';
const CSHARP_API = 'http://localhost:5062';
const API_KEY = 'your_shared_secret_key_here';

console.log('⚡ Phase 5: Performance Benchmarking Test');
console.log('=======================================');

const nodeClient = axios.create({
  baseURL: NODE_API,
  timeout: 30000, // Extended timeout for performance testing
  headers: { 'Content-Type': 'application/json' }
});

const csharpClient = axios.create({
  baseURL: CSHARP_API,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': API_KEY
  }
});

let authToken = '';

// Performance metrics collection
const metrics = {
  apiResponseTimes: [],
  concurrentRequestResults: [],
  memoryUsage: [],
  throughputResults: []
};

async function setupAuth() {
  try {
    const loginResponse = await nodeClient.post('/api/auth/login', {
      username: 'admin',
      password: 'admin123'
    });

    if (loginResponse.data.success) {
      authToken = loginResponse.data.token;
      nodeClient.defaults.headers.Authorization = `Bearer ${authToken}`;
      return true;
    }
  } catch (error) {
    console.log('❌ Auth setup failed:', error.message);
    return false;
  }
}

async function measureApiResponse(endpoint, method = 'GET', data = null) {
  const startTime = performance.now();
  try {
    let response;
    if (method === 'POST') {
      response = await nodeClient.post(endpoint, data);
    } else {
      response = await nodeClient.get(endpoint);
    }

    const endTime = performance.now();
    const responseTime = endTime - startTime;

    return {
      success: response.data.success || false,
      responseTime: responseTime,
      status: response.status
    };
  } catch (error) {
    const endTime = performance.now();
    return {
      success: false,
      responseTime: endTime - startTime,
      status: error.response?.status || 0,
      error: error.message
    };
  }
}

async function test1_BasicApiResponseTimes() {
  console.log('\n📋 Test 1: Basic API Response Times...');

  const endpoints = [
    { path: '/api/health', name: 'Health Check' },
    { path: '/api/products', name: 'Products List' },
    { path: '/api/customers', name: 'Customers List' },
    { path: '/api/inventory/summary', name: 'Inventory Summary' },
    { path: '/api/sales', name: 'Sales List' }
  ];

  let totalPassed = 0;
  const targetResponseTime = 500; // 500ms target

  for (const endpoint of endpoints) {
    console.log(`   Testing ${endpoint.name}...`);

    // Run multiple requests to get average
    const attempts = 3;
    const results = [];

    for (let i = 0; i < attempts; i++) {
      const result = await measureApiResponse(endpoint.path);
      results.push(result);
      await new Promise(resolve => setTimeout(resolve, 100)); // Brief pause
    }

    const avgResponseTime = results.reduce((sum, r) => sum + r.responseTime, 0) / attempts;
    const successRate = (results.filter(r => r.success).length / attempts) * 100;

    metrics.apiResponseTimes.push({
      endpoint: endpoint.name,
      averageTime: avgResponseTime,
      successRate: successRate
    });

    console.log(`   ${endpoint.name}: ${avgResponseTime.toFixed(0)}ms avg | ${successRate.toFixed(0)}% success`);

    if (avgResponseTime < targetResponseTime && successRate >= 90) {
      console.log('   ✅ Performance acceptable');
      totalPassed++;
    } else {
      console.log('   ❌ Performance below target');
    }
  }

  console.log(`\n   Overall API Performance: ${totalPassed}/${endpoints.length} endpoints passed`);
  return totalPassed >= Math.ceil(endpoints.length * 0.8); // 80% pass rate
}

async function test2_ConcurrentRequestHandling() {
  console.log('\n📋 Test 2: Concurrent Request Handling...');

  const concurrencyLevels = [5, 10, 20];
  let allTestsPassed = true;

  for (const concurrency of concurrencyLevels) {
    console.log(`   Testing ${concurrency} concurrent requests...`);

    const startTime = performance.now();
    const requests = [];

    // Create concurrent requests
    for (let i = 0; i < concurrency; i++) {
      requests.push(
        nodeClient.get('/api/health').catch(error => ({
          error: error.message,
          status: error.response?.status || 0
        }))
      );
    }

    const results = await Promise.all(requests);
    const endTime = performance.now();

    const successfulRequests = results.filter(r => r.data && r.data.success).length;
    const successRate = (successfulRequests / concurrency) * 100;
    const totalTime = endTime - startTime;
    const avgTimePerRequest = totalTime / concurrency;

    metrics.concurrentRequestResults.push({
      concurrency: concurrency,
      successRate: successRate,
      totalTime: totalTime,
      avgTimePerRequest: avgTimePerRequest
    });

    console.log(`   Concurrency ${concurrency}: ${successRate.toFixed(0)}% success | ${avgTimePerRequest.toFixed(0)}ms avg per request`);

    if (successRate >= 90 && avgTimePerRequest < 1000) {
      console.log('   ✅ Concurrent performance acceptable');
    } else {
      console.log('   ❌ Concurrent performance degraded');
      allTestsPassed = false;
    }
  }

  return allTestsPassed;
}

async function test3_DatabaseQueryPerformance() {
  console.log('\n📋 Test 3: Database Query Performance...');

  const queryTests = [
    {
      name: 'Product Search',
      endpoint: '/api/products',
      params: { search: 'test', limit: 100 }
    },
    {
      name: 'Sales Report',
      endpoint: '/api/reports/sales',
      params: {
        startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0]
      }
    },
    {
      name: 'Inventory Movements',
      endpoint: '/api/inventory/movements',
      params: { limit: 100, sortBy: 'created_at', sortOrder: 'DESC' }
    }
  ];

  let totalPassed = 0;

  for (const test of queryTests) {
    console.log(`   Testing ${test.name}...`);

    const startTime = performance.now();
    try {
      const response = await nodeClient.get(test.endpoint, { params: test.params });
      const endTime = performance.now();
      const queryTime = endTime - startTime;

      if (response.data.success) {
        console.log(`   ${test.name}: ${queryTime.toFixed(0)}ms`);

        if (queryTime < 2000) { // 2 second target for complex queries
          console.log('   ✅ Query performance acceptable');
          totalPassed++;
        } else {
          console.log('   ❌ Query too slow');
        }
      } else {
        console.log(`   ❌ ${test.name}: Query failed`);
      }
    } catch (error) {
      console.log(`   ❌ ${test.name}: ${error.message}`);
    }
  }

  return totalPassed >= Math.ceil(queryTests.length * 0.75);
}

async function test4_MemoryUsageMonitoring() {
  console.log('\n📋 Test 4: Memory Usage Monitoring...');

  try {
    // Get initial memory usage
    const initialMemory = process.memoryUsage();
    console.log('   Initial Memory Usage:');
    console.log(`   RSS: ${Math.round(initialMemory.rss / 1024 / 1024)}MB`);
    console.log(`   Heap Used: ${Math.round(initialMemory.heapUsed / 1024 / 1024)}MB`);

    // Perform memory-intensive operations
    console.log('   Performing memory-intensive operations...');

    const operations = [];
    for (let i = 0; i < 10; i++) {
      operations.push(
        nodeClient.get('/api/products').catch(() => ({}))
      );
    }

    await Promise.all(operations);

    // Check memory after operations
    const afterMemory = process.memoryUsage();
    console.log('   Memory Usage After Operations:');
    console.log(`   RSS: ${Math.round(afterMemory.rss / 1024 / 1024)}MB`);
    console.log(`   Heap Used: ${Math.round(afterMemory.heapUsed / 1024 / 1024)}MB`);

    const memoryIncrease = afterMemory.heapUsed - initialMemory.heapUsed;
    const memoryIncreaseMB = Math.round(memoryIncrease / 1024 / 1024);

    console.log(`   Memory Increase: ${memoryIncreaseMB}MB`);

    metrics.memoryUsage.push({
      initialRSS: initialMemory.rss,
      initialHeap: initialMemory.heapUsed,
      afterRSS: afterMemory.rss,
      afterHeap: afterMemory.heapUsed,
      increase: memoryIncrease
    });

    // Memory increase should be reasonable (< 50MB for these operations)
    if (memoryIncreaseMB < 50) {
      console.log('   ✅ Memory usage within acceptable bounds');
      return true;
    } else {
      console.log('   ❌ Excessive memory usage detected');
      return false;
    }

  } catch (error) {
    console.log('   ❌ Memory monitoring failed:', error.message);
    return false;
  }
}

async function test5_CSharpApiPerformance() {
  console.log('\n📋 Test 5: C# API Performance...');

  const csharpTests = [
    {
      name: 'Health Check',
      method: 'GET',
      endpoint: '/health'
    },
    {
      name: 'Invoice Posting',
      method: 'POST',
      endpoint: '/api/ledger/invoice',
      data: {
        invoiceId: 'perf-test-invoice-001',
        invoiceNumber: 'PERF-INV-001',
        customerId: 'perf-test-customer',
        customerName: 'Performance Test Customer',
        totalAmount: 100.00,
        taxAmount: 8.00,
        subtotal: 92.00,
        issueDate: new Date().toISOString().split('T')[0],
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        items: [
          {
            productId: 'perf-test-product',
            productName: 'Performance Test Product',
            quantity: 1,
            unitPrice: 92.00,
            totalPrice: 92.00,
            taxAmount: 8.00
          }
        ]
      }
    }
  ];

  let totalPassed = 0;

  for (const test of csharpTests) {
    console.log(`   Testing C# ${test.name}...`);

    const attempts = 3;
    const results = [];

    for (let i = 0; i < attempts; i++) {
      const startTime = performance.now();
      try {
        let response;
        if (test.method === 'POST') {
          response = await csharpClient.post(test.endpoint, test.data);
        } else {
          response = await csharpClient.get(test.endpoint);
        }

        const endTime = performance.now();
        results.push({
          success: response.data.success || response.status === 200,
          responseTime: endTime - startTime
        });
      } catch (error) {
        const endTime = performance.now();
        results.push({
          success: false,
          responseTime: endTime - startTime,
          error: error.message
        });
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const avgResponseTime = results.reduce((sum, r) => sum + r.responseTime, 0) / attempts;
    const successRate = (results.filter(r => r.success).length / attempts) * 100;

    console.log(`   ${test.name}: ${avgResponseTime.toFixed(0)}ms avg | ${successRate.toFixed(0)}% success`);

    if (avgResponseTime < 1000 && successRate >= 90) { // More lenient for C# API
      console.log('   ✅ C# API performance acceptable');
      totalPassed++;
    } else {
      console.log('   ❌ C# API performance below target');
    }
  }

  return totalPassed >= Math.ceil(csharpTests.length * 0.8);
}

async function test6_ThroughputBenchmark() {
  console.log('\n📋 Test 6: Throughput Benchmark...');

  try {
    console.log('   Measuring requests per second...');

    const testDuration = 10000; // 10 seconds
    const startTime = performance.now();
    let requestCount = 0;
    let successCount = 0;

    // Start sending requests continuously
    const sendRequest = async () => {
      try {
        const response = await nodeClient.get('/api/health');
        requestCount++;
        if (response.data.success) {
          successCount++;
        }
      } catch (error) {
        requestCount++;
      }
    };

    // Send requests in batches to avoid overwhelming the system
    const batchSize = 5;
    const batchDelay = 100; // 100ms between batches

    while (performance.now() - startTime < testDuration) {
      const batch = [];
      for (let i = 0; i < batchSize; i++) {
        batch.push(sendRequest());
      }
      await Promise.all(batch);
      await new Promise(resolve => setTimeout(resolve, batchDelay));
    }

    const actualDuration = performance.now() - startTime;
    const requestsPerSecond = (requestCount / actualDuration) * 1000;
    const successRate = (successCount / requestCount) * 100;

    metrics.throughputResults.push({
      duration: actualDuration,
      totalRequests: requestCount,
      successfulRequests: successCount,
      requestsPerSecond: requestsPerSecond,
      successRate: successRate
    });

    console.log(`   Total Requests: ${requestCount}`);
    console.log(`   Successful Requests: ${successCount}`);
    console.log(`   Requests/Second: ${requestsPerSecond.toFixed(2)}`);
    console.log(`   Success Rate: ${successRate.toFixed(2)}%`);

    // Target: At least 10 requests/second with 95% success rate
    if (requestsPerSecond >= 10 && successRate >= 95) {
      console.log('   ✅ Throughput benchmark passed');
      return true;
    } else {
      console.log('   ❌ Throughput below target');
      return false;
    }

  } catch (error) {
    console.log('   ❌ Throughput benchmark failed:', error.message);
    return false;
  }
}

async function generatePerformanceReport() {
  console.log('\n📊 PERFORMANCE ANALYSIS REPORT');
  console.log('==============================');

  // API Response Times Summary
  if (metrics.apiResponseTimes.length > 0) {
    console.log('\n🔍 API Response Times:');
    metrics.apiResponseTimes.forEach(metric => {
      console.log(`   ${metric.endpoint}: ${metric.averageTime.toFixed(0)}ms (${metric.successRate.toFixed(0)}% success)`);
    });
  }

  // Concurrent Request Performance
  if (metrics.concurrentRequestResults.length > 0) {
    console.log('\n🔀 Concurrent Request Performance:');
    metrics.concurrentRequestResults.forEach(result => {
      console.log(`   ${result.concurrency} concurrent: ${result.successRate.toFixed(0)}% success, ${result.avgTimePerRequest.toFixed(0)}ms avg`);
    });
  }

  // Memory Usage
  if (metrics.memoryUsage.length > 0) {
    const memory = metrics.memoryUsage[0];
    console.log('\n💾 Memory Usage Analysis:');
    console.log(`   Initial Heap: ${Math.round(memory.initialHeap / 1024 / 1024)}MB`);
    console.log(`   Final Heap: ${Math.round(memory.afterHeap / 1024 / 1024)}MB`);
    console.log(`   Increase: ${Math.round(memory.increase / 1024 / 1024)}MB`);
  }

  // Throughput Results
  if (metrics.throughputResults.length > 0) {
    const throughput = metrics.throughputResults[0];
    console.log('\n⚡ Throughput Analysis:');
    console.log(`   Requests/Second: ${throughput.requestsPerSecond.toFixed(2)}`);
    console.log(`   Success Rate: ${throughput.successRate.toFixed(2)}%`);
    console.log(`   Total Test Requests: ${throughput.totalRequests}`);
  }
}

async function runPerformanceBenchmarks() {
  const results = {
    apiResponseTimes: false,
    concurrentRequests: false,
    databaseQueries: false,
    memoryUsage: false,
    csharpApiPerformance: false,
    throughputBenchmark: false
  };

  console.log('Starting Phase 5 Performance Benchmarking...\n');

  const authSuccess = await setupAuth();
  if (!authSuccess) {
    console.log('❌ Cannot proceed without authentication');
    return results;
  }

  results.apiResponseTimes = await test1_BasicApiResponseTimes();
  results.concurrentRequests = await test2_ConcurrentRequestHandling();
  results.databaseQueries = await test3_DatabaseQueryPerformance();
  results.memoryUsage = await test4_MemoryUsageMonitoring();
  results.csharpApiPerformance = await test5_CSharpApiPerformance();
  results.throughputBenchmark = await test6_ThroughputBenchmark();

  await generatePerformanceReport();

  // Summary
  console.log('\n📊 PHASE 5 PERFORMANCE BENCHMARKING SUMMARY');
  console.log('===========================================');
  const totalTests = Object.keys(results).length;
  const passedTests = Object.values(results).filter(Boolean).length;

  console.log(`Passed: ${passedTests}/${totalTests} tests`);

  Object.entries(results).forEach(([test, passed]) => {
    console.log(`${passed ? '✅' : '❌'} ${test.replace(/([A-Z])/g, ' $1').toLowerCase()}`);
  });

  if (passedTests === totalTests) {
    console.log('\n⚡ PHASE 5 PERFORMANCE BENCHMARKING: COMPLETE!');
    console.log('System demonstrates excellent performance characteristics.');
  } else if (passedTests >= Math.ceil(totalTests * 0.75)) {
    console.log('\n⚠️  PHASE 5 PERFORMANCE BENCHMARKING: ACCEPTABLE');
    console.log('System performance is adequate but has room for optimization.');
  } else {
    console.log('\n❌ PHASE 5 PERFORMANCE BENCHMARKING: NEEDS IMPROVEMENT');
    console.log('System performance requires optimization before production.');
  }

  return results;
}

runPerformanceBenchmarks();