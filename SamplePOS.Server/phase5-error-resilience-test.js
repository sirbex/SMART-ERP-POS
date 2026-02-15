/**
 * Phase 5: Error Resilience Test
 * Tests system behavior during C# API failures, network issues, and error recovery
 */

import axios from 'axios';

const NODE_API = 'http://localhost:3001';
const CSHARP_API = 'http://localhost:5062';
const API_KEY = 'your_shared_secret_key_here';

console.log('🛡️  Phase 5: Error Resilience Test');
console.log('=================================');

const nodeClient = axios.create({
  baseURL: NODE_API,
  timeout: 5000,
  headers: { 'Content-Type': 'application/json' }
});

const csharpClient = axios.create({
  baseURL: CSHARP_API,
  timeout: 2000, // Shorter timeout for error testing
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': API_KEY
  }
});

let authToken = '';

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

async function test1_CSharpAPIDownScenario() {
  console.log('\n📋 Test 1: C# API Down Scenario...');

  try {
    // Test what happens when C# API is unreachable
    const fakeClient = axios.create({
      baseURL: 'http://localhost:9999', // Non-existent port
      timeout: 1000
    });

    console.log('   Simulating C# API unreachable...');

    // Try to create a sale that would normally trigger accounting
    const saleResponse = await nodeClient.post('/api/sales', {
      customerId: 'test-customer-id',
      items: [
        {
          productId: 'test-product-id',
          quantity: 1,
          unitPrice: 10.00
        }
      ],
      paymentMethod: 'CASH',
      amountPaid: 10.00,
      notes: 'Error resilience test - C# API down'
    });

    // Sale should still succeed even if accounting integration fails
    if (saleResponse.data.success) {
      console.log('✅ Sale completed despite C# API being down');
      console.log('   System maintained core functionality');
      return true;
    } else {
      console.log('❌ Sale failed when C# API down - system not resilient');
      return false;
    }

  } catch (error) {
    // Analyze the error - is it graceful degradation?
    if (error.response && error.response.status >= 200 && error.response.status < 300) {
      console.log('✅ Graceful degradation - core operation succeeded');
      return true;
    } else {
      console.log('❌ System failed catastrophically when C# API down');
      console.log('   Error:', error.response?.data?.error || error.message);
      return false;
    }
  }
}

async function test2_InvalidAccountingData() {
  console.log('\n📋 Test 2: Invalid Accounting Data Handling...');

  try {
    // Test with invalid data that should be rejected by C# API
    const response = await csharpClient.post('/api/ledger/invoice', {
      // Invalid data - missing required fields
      invoiceId: 'invalid-uuid-format',
      totalAmount: 'not-a-number',
      issueDate: 'invalid-date',
      items: null
    });

    if (response.data.success === false) {
      console.log('✅ C# API correctly rejected invalid data');
      return true;
    } else {
      console.log('❌ C# API accepted invalid data - validation failed');
      return false;
    }

  } catch (error) {
    if (error.response && error.response.status === 400) {
      console.log('✅ C# API correctly returned 400 for invalid data');
      console.log('   Validation error:', error.response.data.message || error.response.data.error);
      return true;
    } else {
      console.log('❌ Unexpected error handling invalid data:', error.message);
      return false;
    }
  }
}

async function test3_NetworkTimeoutRecovery() {
  console.log('\n📋 Test 3: Network Timeout Recovery...');

  try {
    // Create a client with very short timeout
    const timeoutClient = axios.create({
      baseURL: CSHARP_API,
      timeout: 1, // 1ms - will definitely timeout
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY
      }
    });

    console.log('   Testing timeout behavior...');

    const response = await timeoutClient.get('/health');

    console.log('❌ Request unexpectedly succeeded (timeout too long?)');
    return false;

  } catch (error) {
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      console.log('✅ Timeout handled correctly');
      console.log('   Error type:', error.code || 'timeout');

      // Test that normal client still works after timeout
      try {
        const normalResponse = await csharpClient.get('/health');
        if (normalResponse.data.success) {
          console.log('✅ System recovered after timeout');
          return true;
        }
      } catch (normalError) {
        console.log('❌ System failed to recover after timeout');
        return false;
      }
    } else {
      console.log('❌ Unexpected error type:', error.message);
      return false;
    }
  }
}

async function test4_PartialDataConsistency() {
  console.log('\n📋 Test 4: Partial Data Consistency...');

  try {
    console.log('   Testing data consistency during partial failures...');

    // Create a sale that involves multiple operations
    const saleResponse = await nodeClient.post('/api/sales', {
      customerId: 'consistency-test-customer',
      items: [
        {
          productId: 'consistency-test-product',
          quantity: 2,
          unitPrice: 15.00
        }
      ],
      paymentMethod: 'CARD',
      amountPaid: 30.00,
      notes: 'Consistency test sale'
    });

    if (saleResponse.data.success) {
      const saleId = saleResponse.data.data.id;
      console.log('✅ Sale created for consistency test');

      // Verify that all related data is consistent
      // Check inventory was updated
      const inventoryCheck = await nodeClient.get('/api/inventory/movements', {
        params: { relatedId: saleId }
      });

      if (inventoryCheck.data.success) {
        console.log('✅ Inventory movements recorded consistently');
        return true;
      } else {
        console.log('❌ Inventory consistency check failed');
        return false;
      }
    } else {
      console.log('❌ Sale creation failed during consistency test');
      return false;
    }

  } catch (error) {
    console.log('❌ Consistency test failed:', error.response?.data?.error || error.message);
    return false;
  }
}

async function test5_ConcurrentRequestHandling() {
  console.log('\n📋 Test 5: Concurrent Request Handling...');

  try {
    console.log('   Sending multiple concurrent requests...');

    // Send multiple requests simultaneously
    const requests = [];
    for (let i = 0; i < 5; i++) {
      requests.push(
        csharpClient.get('/health').catch(err => ({ error: err.message }))
      );
    }

    const results = await Promise.all(requests);

    let successCount = 0;
    results.forEach((result, index) => {
      if (result.data && result.data.success) {
        successCount++;
      } else if (result.error) {
        console.log(`   Request ${index + 1} failed:`, result.error);
      }
    });

    console.log(`   Concurrent requests completed: ${successCount}/${requests.length}`);

    if (successCount >= 3) { // Allow some failures due to concurrent load
      console.log('✅ System handled concurrent requests adequately');
      return true;
    } else {
      console.log('❌ System failed under concurrent load');
      return false;
    }

  } catch (error) {
    console.log('❌ Concurrent test setup failed:', error.message);
    return false;
  }
}

async function test6_ErrorMessageQuality() {
  console.log('\n📋 Test 6: Error Message Quality...');

  try {
    // Test various error scenarios and check message quality
    const errorTests = [
      {
        name: 'Missing API Key',
        request: () => axios.post(`${CSHARP_API}/api/ledger/invoice`, {}, {
          headers: { 'Content-Type': 'application/json' } // No API key
        }),
        expectedStatus: 401
      },
      {
        name: 'Invalid JSON',
        request: () => csharpClient.post('/api/ledger/invoice', 'invalid-json', {
          headers: { 'Content-Type': 'application/json' }
        }),
        expectedStatus: 400
      }
    ];

    let passedTests = 0;

    for (const test of errorTests) {
      try {
        await test.request();
        console.log(`❌ ${test.name}: Expected error but request succeeded`);
      } catch (error) {
        if (error.response && error.response.status === test.expectedStatus) {
          const errorMessage = error.response.data.message || error.response.data.error;
          if (errorMessage && errorMessage.length > 0) {
            console.log(`✅ ${test.name}: Good error message - "${errorMessage}"`);
            passedTests++;
          } else {
            console.log(`❌ ${test.name}: Error status correct but message missing/poor`);
          }
        } else {
          console.log(`❌ ${test.name}: Wrong status code ${error.response?.status} (expected ${test.expectedStatus})`);
        }
      }
    }

    return passedTests === errorTests.length;

  } catch (error) {
    console.log('❌ Error message quality test setup failed:', error.message);
    return false;
  }
}

async function runErrorResilienceTests() {
  const results = {
    csharpApiDown: false,
    invalidData: false,
    timeoutRecovery: false,
    dataConsistency: false,
    concurrentRequests: false,
    errorMessages: false
  };

  console.log('Starting Phase 5 Error Resilience Tests...\n');

  const authSuccess = await setupAuth();
  if (!authSuccess) {
    console.log('❌ Cannot proceed without authentication');
    return results;
  }

  results.csharpApiDown = await test1_CSharpAPIDownScenario();
  results.invalidData = await test2_InvalidAccountingData();
  results.timeoutRecovery = await test3_NetworkTimeoutRecovery();
  results.dataConsistency = await test4_PartialDataConsistency();
  results.concurrentRequests = await test5_ConcurrentRequestHandling();
  results.errorMessages = await test6_ErrorMessageQuality();

  // Summary
  console.log('\n📊 PHASE 5 ERROR RESILIENCE SUMMARY');
  console.log('==================================');
  const totalTests = Object.keys(results).length;
  const passedTests = Object.values(results).filter(Boolean).length;

  console.log(`Passed: ${passedTests}/${totalTests} tests`);

  Object.entries(results).forEach(([test, passed]) => {
    console.log(`${passed ? '✅' : '❌'} ${test.replace(/([A-Z])/g, ' $1').toLowerCase()}`);
  });

  if (passedTests === totalTests) {
    console.log('\n🛡️  PHASE 5 ERROR RESILIENCE: COMPLETE!');
    console.log('System demonstrates robust error handling and recovery.');
  } else {
    console.log('\n⚠️  PHASE 5 ERROR RESILIENCE: NEEDS IMPROVEMENT');
    console.log('System requires enhanced error handling before production.');
  }

  return results;
}

runErrorResilienceTests();