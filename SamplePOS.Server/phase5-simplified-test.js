/**
 * Phase 5: Simplified Integration Test
 * Tests C# API integration and system health with available components
 */

import axios from 'axios';

const CSHARP_API = 'http://localhost:5062';
const API_KEY = 'your_shared_secret_key_here';

console.log('🚀 PHASE 5: SIMPLIFIED INTEGRATION TEST');
console.log('=====================================');
console.log('Testing available system components...\n');

const csharpClient = axios.create({
  baseURL: CSHARP_API,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': API_KEY
  }
});

const results = {
  csharpHealthCheck: false,
  invoicePosting: false,
  paymentPosting: false,
  cogsPosting: false,
  errorHandling: false
};

async function test1_CSharpHealthCheck() {
  console.log('📋 Test 1: C# Accounting API Health Check...');

  try {
    const response = await csharpClient.get('/health');

    if (response.data.success) {
      console.log('✅ C# API is healthy');
      console.log(`   Database Connected: ${response.data.data.database.connected}`);
      console.log(`   Accounts Count: ${response.data.data.database.accountsCount}`);
      console.log(`   Ledger Service: ${response.data.data.services.ledgerService}`);
      return true;
    } else {
      console.log('❌ C# API health check failed');
      return false;
    }
  } catch (error) {
    console.log('❌ C# API health check error:', error.message);
    return false;
  }
}

async function test2_InvoicePosting() {
  console.log('\n📋 Test 2: Invoice Posting to C# API...');

  try {
    const testInvoice = {
      invoiceId: '550e8400-e29b-41d4-a716-446655440025',
      invoiceNumber: 'PHASE5-TEST-001',
      customerId: '550e8400-e29b-41d4-a716-446655440026',
      customerName: 'Phase 5 Test Customer',
      totalAmount: 100.00,
      taxAmount: 8.00,
      subtotal: 92.00,
      issueDate: new Date().toISOString().split('T')[0],
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      items: [
        {
          productId: '550e8400-e29b-41d4-a716-446655440027',
          productName: 'Phase 5 Test Product',
          quantity: 1,
          unitPrice: 92.00,
          totalPrice: 92.00,
          taxAmount: 8.00
        }
      ]
    };

    const response = await csharpClient.post('/api/ledger/invoice', testInvoice);

    if (response.data.success) {
      console.log('✅ Invoice posted successfully');
      console.log(`   Transaction ID: ${response.data.data.transactionId || 'N/A'}`);
      return true;
    } else {
      console.log('❌ Invoice posting failed:', response.data.message || response.data.error);
      return false;
    }
  } catch (error) {
    console.log('❌ Invoice posting error:', error.response?.data?.message || error.message);
    return false;
  }
}

async function test3_PaymentPosting() {
  console.log('\n📋 Test 3: Payment Posting to C# API...');

  try {
    const testPayment = {
      paymentId: '550e8400-e29b-41d4-a716-446655440028',
      invoiceId: '550e8400-e29b-41d4-a716-446655440025',
      customerId: '550e8400-e29b-41d4-a716-446655440026',
      customerName: 'Phase 5 Test Customer',
      amount: 100.00,
      paymentMethod: 'CASH',
      reference: 'Phase 5 test payment',
      paymentDate: new Date().toISOString().split('T')[0]
    };

    const response = await csharpClient.post('/api/ledger/payment', testPayment);

    if (response.data.success) {
      console.log('✅ Payment posted successfully');
      console.log(`   Transaction ID: ${response.data.data.transactionId || 'N/A'}`);
      return true;
    } else {
      console.log('❌ Payment posting failed:', response.data.message || response.data.error);
      return false;
    }
  } catch (error) {
    console.log('❌ Payment posting error:', error.response?.data?.message || error.message);
    return false;
  }
}

async function test4_CogsPosting() {
  console.log('\n📋 Test 4: Cost of Goods Sold Posting to C# API...');

  try {
    const testCogs = {
      saleId: '550e8400-e29b-41d4-a716-446655440029',
      saleNumber: 'SALE-PHASE5-001',
      customerId: '550e8400-e29b-41d4-a716-446655440026',
      customerName: 'Phase 5 Test Customer',
      saleDate: new Date().toISOString().split('T')[0],
      items: [
        {
          productId: '550e8400-e29b-41d4-a716-446655440027',
          productName: 'Phase 5 Test Product',
          quantity: 1,
          unitCost: 50.00,
          totalCost: 50.00,
          batchNumber: 'PHASE5-BATCH-001'
        }
      ]
    };

    const response = await csharpClient.post('/api/ledger/cogs', testCogs);

    if (response.data.success) {
      console.log('✅ COGS posted successfully');
      console.log(`   Transaction ID: ${response.data.data.transactionId || 'N/A'}`);
      return true;
    } else {
      console.log('❌ COGS posting failed:', response.data.message || response.data.error);
      return false;
    }
  } catch (error) {
    console.log('❌ COGS posting error:', error.response?.data?.message || error.message);
    return false;
  }
}

async function test5_ErrorHandling() {
  console.log('\n📋 Test 5: Error Handling Validation...');

  try {
    // Test with invalid data
    const invalidInvoice = {
      invoiceId: 'invalid-uuid-format',
      totalAmount: 'not-a-number', // Invalid number
      issueDate: 'invalid-date',   // Invalid date
      items: null                  // Invalid items
    };

    const response = await csharpClient.post('/api/ledger/invoice', invalidInvoice);

    // If it succeeds, that's wrong
    console.log('❌ API accepted invalid data - validation failed');
    return false;

  } catch (error) {
    if (error.response && error.response.status === 400) {
      console.log('✅ API correctly rejected invalid data with 400 status');
      console.log(`   Error message: ${error.response.data.message || error.response.data.error}`);
      return true;
    } else {
      console.log('❌ Unexpected error response:', error.message);
      return false;
    }
  }
}

async function runSimplifiedIntegrationTest() {
  console.log('Starting Phase 5 Simplified Integration Test...\n');

  results.csharpHealthCheck = await test1_CSharpHealthCheck();

  if (results.csharpHealthCheck) {
    results.invoicePosting = await test2_InvoicePosting();
    results.paymentPosting = await test3_PaymentPosting();
    results.cogsPosting = await test4_CogsPosting();
    results.errorHandling = await test5_ErrorHandling();
  } else {
    console.log('\n⚠️  Skipping remaining tests due to API health issues');
  }

  // Summary
  console.log('\n📊 PHASE 5 SIMPLIFIED INTEGRATION TEST SUMMARY');
  console.log('==============================================');

  const totalTests = Object.keys(results).length;
  const passedTests = Object.values(results).filter(Boolean).length;

  console.log(`Passed: ${passedTests}/${totalTests} tests`);

  Object.entries(results).forEach(([test, passed]) => {
    const testName = test.replace(/([A-Z])/g, ' $1').toLowerCase();
    console.log(`${passed ? '✅' : '❌'} ${testName}`);
  });

  if (passedTests === totalTests) {
    console.log('\n🎉 PHASE 5 INTEGRATION: SUCCESS!');
    console.log('C# Accounting API integration verified and operational.');
    console.log('Key achievements:');
    console.log('- C# API health monitoring operational');
    console.log('- Invoice posting workflow validated');
    console.log('- Payment processing integration confirmed');
    console.log('- Cost of Goods Sold tracking functional');
    console.log('- Error handling and validation working correctly');
  } else if (passedTests >= Math.ceil(totalTests * 0.8)) {
    console.log('\n⚠️  PHASE 5 INTEGRATION: MOSTLY SUCCESSFUL');
    console.log('Most integration components working with minor issues.');
  } else {
    console.log('\n❌ PHASE 5 INTEGRATION: CRITICAL ISSUES');
    console.log('Significant integration problems require immediate attention.');
  }

  console.log(`\n📄 PHASE 5 STATUS: ${passedTests === totalTests ? 'SUCCESS' : passedTests >= Math.ceil(totalTests * 0.8) ? 'PARTIAL SUCCESS' : 'FAILURE'}`);
  console.log('='.repeat(80));

  return results;
}

runSimplifiedIntegrationTest();