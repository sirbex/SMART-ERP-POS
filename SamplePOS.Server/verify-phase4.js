/**
 * Phase 4 C# API Endpoints Verification
 * Tests the completed C# accounting API endpoints
 */

import axios from 'axios';

const API_BASE_URL = 'http://localhost:5062';
const API_KEY = 'your_shared_secret_key_here';

console.log('🔍 Phase 4 C# API Endpoints Verification');
console.log('=====================================');

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 5000,
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': API_KEY
  }
});

async function testHealthEndpoint() {
  try {
    console.log('\n1. Testing Health Endpoint...');
    const response = await client.get('/health');

    if (response.status === 200 && response.data.success) {
      console.log('✅ Health endpoint working');
      console.log('   Status:', response.data.data?.Status);
      console.log('   Database:', response.data.data?.Database?.Connected ? 'Connected' : 'Disconnected');
      return true;
    } else {
      console.log('❌ Health endpoint failed');
      return false;
    }
  } catch (error) {
    console.log('❌ Health endpoint error:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.log('   → C# API is not running on port 5062');
    }
    return false;
  }
}

async function testInvoiceEndpoint() {
  try {
    console.log('\n2. Testing Invoice Posting Endpoint...');

    const testInvoice = {
      invoiceId: '550e8400-e29b-41d4-a716-446655440000',
      invoiceNumber: 'INV-2025-TEST',
      customerId: '550e8400-e29b-41d4-a716-446655440001',
      customerName: 'Test Customer',
      totalAmount: 150.00,
      taxAmount: 15.00,
      subtotal: 135.00,
      issueDate: '2025-12-01',
      dueDate: '2025-12-15',
      items: [
        {
          productId: '550e8400-e29b-41d4-a716-446655440002',
          productName: 'Test Product',
          quantity: 2,
          unitPrice: 67.50,
          totalPrice: 135.00,
          taxAmount: 15.00
        }
      ]
    };

    const response = await client.post('/api/ledger/invoice', testInvoice);

    if (response.status === 200 && response.data.success) {
      console.log('✅ Invoice posting endpoint working');
      console.log('   Transaction ID:', response.data.data?.TransactionId);
      return true;
    } else {
      console.log('❌ Invoice posting failed');
      console.log('   Error:', response.data.message || 'Unknown error');
      return false;
    }
  } catch (error) {
    console.log('❌ Invoice posting error:', error.response?.data?.message || error.message);
    return false;
  }
}

async function testPaymentEndpoint() {
  try {
    console.log('\n3. Testing Payment Posting Endpoint...');

    const testPayment = {
      paymentId: '550e8400-e29b-41d4-a716-446655440003',
      invoiceId: '550e8400-e29b-41d4-a716-446655440000',
      customerId: '550e8400-e29b-41d4-a716-446655440001',
      customerName: 'Test Customer',
      amount: 150.00,
      paymentMethod: 'CASH',
      reference: 'Cash payment test',
      paymentDate: '2025-12-01'
    };

    const response = await client.post('/api/ledger/payment', testPayment);

    if (response.status === 200 && response.data.success) {
      console.log('✅ Payment posting endpoint working');
      console.log('   Transaction ID:', response.data.data?.TransactionId);
      return true;
    } else {
      console.log('❌ Payment posting failed');
      console.log('   Error:', response.data.message || 'Unknown error');
      return false;
    }
  } catch (error) {
    console.log('❌ Payment posting error:', error.response?.data?.message || error.message);
    return false;
  }
}

async function testCOGSEndpoint() {
  try {
    console.log('\n4. Testing COGS Posting Endpoint...');

    const testCOGS = {
      saleId: '550e8400-e29b-41d4-a716-446655440004',
      saleNumber: 'SALE-2025-TEST',
      customerId: '550e8400-e29b-41d4-a716-446655440001',
      customerName: 'Test Customer',
      saleDate: '2025-12-01',
      items: [
        {
          productId: '550e8400-e29b-41d4-a716-446655440002',
          productName: 'Test Product',
          quantity: 2,
          unitCost: 25.00,
          totalCost: 50.00,
          batchNumber: 'BATCH-001'
        }
      ]
    };

    const response = await client.post('/api/ledger/cogs', testCOGS);

    if (response.status === 200 && response.data.success) {
      console.log('✅ COGS posting endpoint working');
      console.log('   Transaction ID:', response.data.data?.TransactionId);
      return true;
    } else {
      console.log('❌ COGS posting failed');
      console.log('   Error:', response.data.message || 'Unknown error');
      return false;
    }
  } catch (error) {
    console.log('❌ COGS posting error:', error.response?.data?.message || error.message);
    return false;
  }
}

async function runTests() {
  const results = {
    health: false,
    invoice: false,
    payment: false,
    cogs: false
  };

  results.health = await testHealthEndpoint();

  if (results.health) {
    // Only test other endpoints if health check passes
    results.invoice = await testInvoiceEndpoint();
    results.payment = await testPaymentEndpoint();
    results.cogs = await testCOGSEndpoint();
  }

  // Summary
  console.log('\n📊 PHASE 4 API ENDPOINTS SUMMARY');
  console.log('================================');
  const totalTests = Object.keys(results).length;
  const passedTests = Object.values(results).filter(Boolean).length;

  console.log(`Passed: ${passedTests}/${totalTests} tests`);

  Object.entries(results).forEach(([test, passed]) => {
    console.log(`${passed ? '✅' : '❌'} ${test} endpoint`);
  });

  if (passedTests === totalTests) {
    console.log('\n🎉 Phase 4 C# API Endpoints are COMPLETE!');
    console.log('All endpoints working correctly and ready for integration.');
  } else if (passedTests > 0) {
    console.log('\n⚠️  Phase 4 C# API Endpoints are PARTIALLY COMPLETE!');
    console.log('Some endpoints working, others need attention.');
  } else {
    console.log('\n❌ Phase 4 C# API Endpoints are NOT WORKING!');
    console.log('C# API may not be running or has configuration issues.');
  }

  console.log('\nNext: Full integration testing between Node.js and C# services');
}

// Run the tests
runTests();