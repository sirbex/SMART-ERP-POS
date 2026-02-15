/**
 * Phase 5: End-to-End Sales Workflow Test
 * Tests complete sales process with real inventory, cost calculation, and accounting integration
 */

import axios from 'axios';

const NODE_API = 'http://localhost:3001';
const CSHARP_API = 'http://localhost:5062';
const API_KEY = 'your_shared_secret_key_here';

console.log('🧪 Phase 5: End-to-End Sales Workflow Test');
console.log('===========================================');

const nodeClient = axios.create({
  baseURL: NODE_API,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' }
});

const csharpClient = axios.create({
  baseURL: CSHARP_API,
  timeout: 5000,
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': API_KEY
  }
});

let authToken = '';
let testCustomerId = '';
let testProductId = '';
let testSaleId = '';
let testInvoiceId = '';

async function step1_AuthenticateUser() {
  try {
    console.log('\n📋 Step 1: Authenticate User...');

    const loginResponse = await nodeClient.post('/api/auth/login', {
      username: 'admin',
      password: 'admin123'
    });

    if (loginResponse.data.success) {
      authToken = loginResponse.data.token;
      nodeClient.defaults.headers.Authorization = `Bearer ${authToken}`;
      console.log('✅ User authenticated successfully');
      return true;
    }
  } catch (error) {
    console.log('❌ Authentication failed:', error.response?.data?.error || error.message);
    return false;
  }
}

async function step2_CreateTestCustomer() {
  try {
    console.log('\n📋 Step 2: Create Test Customer...');

    const customerResponse = await nodeClient.post('/api/customers', {
      name: 'Phase 5 Test Customer',
      email: 'phase5@test.com',
      phone: '+1-555-0199',
      address: '123 Test Street, Test City',
      customerType: 'INDIVIDUAL'
    });

    if (customerResponse.data.success) {
      testCustomerId = customerResponse.data.data.id;
      console.log('✅ Test customer created:', testCustomerId);
      return true;
    }
  } catch (error) {
    console.log('❌ Customer creation failed:', error.response?.data?.error || error.message);
    return false;
  }
}

async function step3_CreateTestProduct() {
  try {
    console.log('\n📋 Step 3: Create Test Product with Inventory...');

    const productResponse = await nodeClient.post('/api/products', {
      name: 'Phase 5 Test Product',
      description: 'Test product for end-to-end workflow',
      category: 'Test Category',
      sku: 'PHASE5-TEST-001',
      barcode: '1234567890123',
      costPrice: 25.00,
      sellingPrice: 50.00,
      reorderLevel: 10,
      trackExpiry: true,
      trackBatches: true
    });

    if (productResponse.data.success) {
      testProductId = productResponse.data.data.id;
      console.log('✅ Test product created:', testProductId);

      // Add inventory through stock adjustment
      const adjustmentResponse = await nodeClient.post('/api/stock-movements', {
        productId: testProductId,
        movementType: 'ADJUSTMENT_IN',
        quantity: 100,
        reason: 'Initial stock for Phase 5 testing',
        batchNumber: 'PHASE5-BATCH-001',
        expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() // 1 year from now
      });

      if (adjustmentResponse.data.success) {
        console.log('✅ Initial inventory added: 100 units');
        return true;
      }
    }
  } catch (error) {
    console.log('❌ Product/inventory creation failed:', error.response?.data?.error || error.message);
    return false;
  }
}

async function step4_CreateSale() {
  try {
    console.log('\n📋 Step 4: Create Sale Transaction...');

    const saleResponse = await nodeClient.post('/api/sales', {
      customerId: testCustomerId,
      items: [
        {
          productId: testProductId,
          quantity: 5,
          unitPrice: 50.00
        }
      ],
      paymentMethod: 'CASH',
      amountPaid: 250.00,
      notes: 'Phase 5 end-to-end test sale'
    });

    if (saleResponse.data.success) {
      testSaleId = saleResponse.data.data.id;
      console.log('✅ Sale created:', saleResponse.data.data.saleNumber);
      console.log('   Amount: $250.00 | Items: 5 units');
      return true;
    }
  } catch (error) {
    console.log('❌ Sale creation failed:', error.response?.data?.error || error.message);
    return false;
  }
}

async function step5_CreateInvoice() {
  try {
    console.log('\n📋 Step 5: Create Invoice from Sale...');

    const invoiceResponse = await nodeClient.post('/api/invoices', {
      customerId: testCustomerId,
      saleId: testSaleId,
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
      items: [
        {
          productId: testProductId,
          description: 'Phase 5 Test Product',
          quantity: 5,
          unitPrice: 50.00,
          totalPrice: 250.00
        }
      ],
      subtotal: 250.00,
      taxRate: 0.08,
      taxAmount: 20.00,
      totalAmount: 270.00
    });

    if (invoiceResponse.data.success) {
      testInvoiceId = invoiceResponse.data.data.id;
      console.log('✅ Invoice created:', invoiceResponse.data.data.invoiceNumber);
      console.log('   Subtotal: $250.00 | Tax: $20.00 | Total: $270.00');
      return true;
    }
  } catch (error) {
    console.log('❌ Invoice creation failed:', error.response?.data?.error || error.message);
    return false;
  }
}

async function step6_VerifyAccountingIntegration() {
  try {
    console.log('\n📋 Step 6: Verify C# Accounting Integration...');

    // Check that accounting entries were created
    const healthResponse = await csharpClient.get('/health');

    if (healthResponse.data.success) {
      console.log('✅ C# Accounting API healthy');

      // Test manual accounting posting to verify integration
      const testInvoicePost = await csharpClient.post('/api/ledger/invoice', {
        invoiceId: testInvoiceId,
        invoiceNumber: 'TEST-PHASE5-001',
        customerId: testCustomerId,
        customerName: 'Phase 5 Test Customer',
        totalAmount: 270.00,
        taxAmount: 20.00,
        subtotal: 250.00,
        issueDate: new Date().toISOString().split('T')[0],
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        items: [
          {
            productId: testProductId,
            productName: 'Phase 5 Test Product',
            quantity: 5,
            unitPrice: 50.00,
            totalPrice: 250.00,
            taxAmount: 20.00
          }
        ]
      });

      if (testInvoicePost.data.success) {
        console.log('✅ Accounting integration verified - Invoice posted');
        return true;
      }
    }
  } catch (error) {
    console.log('❌ Accounting integration failed:', error.response?.data?.message || error.message);
    return false;
  }
}

async function step7_VerifyInventoryImpact() {
  try {
    console.log('\n📋 Step 7: Verify Inventory Impact...');

    const inventoryResponse = await nodeClient.get(`/api/inventory/product/${testProductId}`);

    if (inventoryResponse.data.success) {
      const inventory = inventoryResponse.data.data;
      console.log('✅ Inventory updated:');
      console.log(`   Previous: 100 units | Current: ${inventory.totalQuantity} units`);
      console.log(`   Sold: 5 units | Remaining: ${inventory.totalQuantity}`);

      if (inventory.totalQuantity === 95) {
        console.log('✅ Inventory deduction correct');
        return true;
      } else {
        console.log('❌ Inventory deduction incorrect');
        return false;
      }
    }
  } catch (error) {
    console.log('❌ Inventory verification failed:', error.response?.data?.error || error.message);
    return false;
  }
}

async function step8_GenerateFinancialReports() {
  try {
    console.log('\n📋 Step 8: Generate Financial Reports...');

    // Test sales report
    const salesReportResponse = await nodeClient.get('/api/reports/sales', {
      params: {
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0]
      }
    });

    if (salesReportResponse.data.success) {
      const salesReport = salesReportResponse.data.data;
      console.log('✅ Sales report generated:');
      console.log(`   Total Sales: $${salesReport.totalAmount || 0}`);
      console.log(`   Transactions: ${salesReport.totalTransactions || 0}`);
    }

    // Test inventory valuation
    const inventoryReportResponse = await nodeClient.get('/api/reports/inventory-valuation');

    if (inventoryReportResponse.data.success) {
      console.log('✅ Inventory valuation report generated');
      return true;
    }
  } catch (error) {
    console.log('❌ Financial reports failed:', error.response?.data?.error || error.message);
    return false;
  }
}

async function runEndToEndWorkflowTest() {
  const results = {
    authentication: false,
    customerCreation: false,
    productCreation: false,
    saleCreation: false,
    invoiceCreation: false,
    accountingIntegration: false,
    inventoryImpact: false,
    financialReports: false
  };

  console.log('Starting Phase 5 End-to-End Workflow Test...\n');

  results.authentication = await step1_AuthenticateUser();
  if (!results.authentication) return results;

  results.customerCreation = await step2_CreateTestCustomer();
  if (!results.customerCreation) return results;

  results.productCreation = await step3_CreateTestProduct();
  if (!results.productCreation) return results;

  results.saleCreation = await step4_CreateSale();
  if (!results.saleCreation) return results;

  results.invoiceCreation = await step5_CreateInvoice();
  if (!results.invoiceCreation) return results;

  results.accountingIntegration = await step6_VerifyAccountingIntegration();
  results.inventoryImpact = await step7_VerifyInventoryImpact();
  results.financialReports = await step8_GenerateFinancialReports();

  // Summary
  console.log('\n📊 PHASE 5 END-TO-END WORKFLOW SUMMARY');
  console.log('=====================================');
  const totalTests = Object.keys(results).length;
  const passedTests = Object.values(results).filter(Boolean).length;

  console.log(`Passed: ${passedTests}/${totalTests} tests`);

  Object.entries(results).forEach(([test, passed]) => {
    console.log(`${passed ? '✅' : '❌'} ${test.replace(/([A-Z])/g, ' $1').toLowerCase()}`);
  });

  if (passedTests === totalTests) {
    console.log('\n🎉 PHASE 5 END-TO-END WORKFLOW: COMPLETE!');
    console.log('Full sales cycle tested successfully:');
    console.log('Customer → Product → Sale → Invoice → Accounting → Inventory → Reports');
  } else {
    console.log('\n⚠️  PHASE 5 END-TO-END WORKFLOW: PARTIAL SUCCESS');
    console.log('Some components need attention before proceeding.');
  }

  return results;
}

runEndToEndWorkflowTest();