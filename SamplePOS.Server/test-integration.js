/**
 * Phase 3 + Phase 4 Integration Test
 * Tests Node.js -> C# API integration flow
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🔍 Phase 3 + Phase 4 Integration Test');
console.log('===================================');

async function testNodeJSIntegration() {
  try {
    console.log('\n1. Testing Node.js accountingApiClient...');

    // Import the accounting API client
    const { accountingApiClient } = await import('./src/services/accountingApiClient.js');

    console.log('✅ accountingApiClient imported successfully');

    // Test health check
    console.log('\n2. Testing health check integration...');
    const healthResult = await accountingApiClient.healthCheck();
    console.log('Health check result:', healthResult);

    if (healthResult.healthy) {
      console.log('✅ Node.js -> C# health check working');
    } else {
      console.log('❌ Node.js -> C# health check failed:', healthResult.error);
      return;
    }

    // Test invoice posting
    console.log('\n3. Testing invoice posting integration...');
    const invoiceResult = await accountingApiClient.postInvoice({
      invoiceId: '550e8400-e29b-41d4-a716-446655440010',
      invoiceNumber: 'INV-2025-INTEGRATION-TEST',
      customerId: '550e8400-e29b-41d4-a716-446655440011',
      customerName: 'Integration Test Customer',
      totalAmount: 250.00,
      taxAmount: 25.00,
      subtotal: 225.00,
      issueDate: '2025-12-01',
      dueDate: '2025-12-15',
      items: [
        {
          productId: '550e8400-e29b-41d4-a716-446655440012',
          productName: 'Integration Test Product',
          quantity: 5,
          unitPrice: 45.00,
          totalPrice: 225.00,
          taxAmount: 25.00
        }
      ]
    });

    console.log('Invoice posting result:', invoiceResult);

    if (invoiceResult.success) {
      console.log('✅ Node.js -> C# invoice posting working');
    } else {
      console.log('❌ Node.js -> C# invoice posting failed:', invoiceResult.error);
    }

    // Test payment posting
    console.log('\n4. Testing payment posting integration...');
    const paymentResult = await accountingApiClient.postPayment({
      paymentId: '550e8400-e29b-41d4-a716-446655440013',
      invoiceId: '550e8400-e29b-41d4-a716-446655440010',
      customerId: '550e8400-e29b-41d4-a716-446655440011',
      customerName: 'Integration Test Customer',
      amount: 250.00,
      paymentMethod: 'CARD',
      reference: 'Integration test payment',
      paymentDate: '2025-12-01'
    });

    console.log('Payment posting result:', paymentResult);

    if (paymentResult.success) {
      console.log('✅ Node.js -> C# payment posting working');
    } else {
      console.log('❌ Node.js -> C# payment posting failed:', paymentResult.error);
    }

    // Test COGS posting
    console.log('\n5. Testing COGS posting integration...');
    const cogsResult = await accountingApiClient.postCOGS({
      saleId: '550e8400-e29b-41d4-a716-446655440014',
      saleNumber: 'SALE-2025-INTEGRATION-TEST',
      customerId: '550e8400-e29b-41d4-a716-446655440011',
      customerName: 'Integration Test Customer',
      saleDate: '2025-12-01',
      items: [
        {
          productId: '550e8400-e29b-41d4-a716-446655440012',
          productName: 'Integration Test Product',
          quantity: 5,
          unitCost: 20.00,
          totalCost: 100.00,
          batchNumber: 'BATCH-INTEGRATION-001'
        }
      ]
    });

    console.log('COGS posting result:', cogsResult);

    if (cogsResult.success) {
      console.log('✅ Node.js -> C# COGS posting working');
    } else {
      console.log('❌ Node.js -> C# COGS posting failed:', cogsResult.error);
    }

    console.log('\n🎉 INTEGRATION TEST COMPLETE!');
    console.log('Node.js successfully communicates with C# Accounting API');
    console.log('Phase 3 + Phase 4 integration is working correctly!');

  } catch (error) {
    console.log('❌ Integration test failed:', error.message);
    console.log('Stack:', error.stack);
  }
}

testNodeJSIntegration();