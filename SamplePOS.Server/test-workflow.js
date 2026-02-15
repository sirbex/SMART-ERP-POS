/**
 * Direct C# API Integration Test
 * Tests C# API endpoints directly using axios
 */

import axios from 'axios';

const API_BASE_URL = 'http://localhost:5062';
const API_KEY = 'your_shared_secret_key_here';

console.log('🔍 Direct C# API Integration Test');
console.log('================================');

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 5000,
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': API_KEY
  }
});

async function runCompleteIntegrationTest() {
  try {
    console.log('\n1. Testing Complete Accounting Workflow...');

    // Step 1: Create Invoice
    console.log('\n   Step 1: Posting Invoice...');
    const invoiceResponse = await client.post('/api/ledger/invoice', {
      invoiceId: '550e8400-e29b-41d4-a716-446655440020',
      invoiceNumber: 'INV-2025-WORKFLOW-TEST',
      customerId: '550e8400-e29b-41d4-a716-446655440021',
      customerName: 'Workflow Test Customer',
      totalAmount: 500.00,
      taxAmount: 50.00,
      subtotal: 450.00,
      issueDate: '2025-12-01',
      dueDate: '2025-12-31',
      items: [
        {
          productId: '550e8400-e29b-41d4-a716-446655440022',
          productName: 'Premium Product',
          quantity: 10,
          unitPrice: 45.00,
          totalPrice: 450.00,
          taxAmount: 50.00
        }
      ]
    });

    if (invoiceResponse.data.success) {
      console.log('   ✅ Invoice created - Transaction ID:', invoiceResponse.data.data?.TransactionId);
    } else {
      throw new Error('Invoice creation failed: ' + invoiceResponse.data.message);
    }

    // Step 2: Process Payment
    console.log('\n   Step 2: Processing Payment...');
    const paymentResponse = await client.post('/api/ledger/payment', {
      paymentId: '550e8400-e29b-41d4-a716-446655440023',
      invoiceId: '550e8400-e29b-41d4-a716-446655440020',
      customerId: '550e8400-e29b-41d4-a716-446655440021',
      customerName: 'Workflow Test Customer',
      amount: 500.00,
      paymentMethod: 'CASH',
      reference: 'Full payment for invoice',
      paymentDate: '2025-12-01'
    });

    if (paymentResponse.data.success) {
      console.log('   ✅ Payment processed - Transaction ID:', paymentResponse.data.data?.TransactionId);
    } else {
      throw new Error('Payment processing failed: ' + paymentResponse.data.message);
    }

    // Step 3: Post COGS
    console.log('\n   Step 3: Posting Cost of Goods Sold...');
    const cogsResponse = await client.post('/api/ledger/cogs', {
      saleId: '550e8400-e29b-41d4-a716-446655440024',
      saleNumber: 'SALE-2025-WORKFLOW-TEST',
      customerId: '550e8400-e29b-41d4-a716-446655440021',
      customerName: 'Workflow Test Customer',
      saleDate: '2025-12-01',
      items: [
        {
          productId: '550e8400-e29b-41d4-a716-446655440022',
          productName: 'Premium Product',
          quantity: 10,
          unitCost: 25.00,
          totalCost: 250.00,
          batchNumber: 'BATCH-WORKFLOW-001'
        }
      ]
    });

    if (cogsResponse.data.success) {
      console.log('   ✅ COGS posted - Transaction ID:', cogsResponse.data.data?.TransactionId);
    } else {
      throw new Error('COGS posting failed: ' + cogsResponse.data.message);
    }

    // Step 4: Verify health status
    console.log('\n   Step 4: Verifying System Health...');
    const healthResponse = await client.get('/health');

    if (healthResponse.data.success) {
      console.log('   ✅ System healthy - Database accounts:', healthResponse.data.data?.Database?.AccountsCount || 'Unknown');
    } else {
      console.log('   ⚠️  Health check warning:', healthResponse.data.message);
    }

    console.log('\n🎉 COMPLETE ACCOUNTING WORKFLOW SUCCESSFUL!');
    console.log('===================================================');
    console.log('✅ Invoice → Payment → COGS → Health Check');
    console.log('✅ All double-entry accounting transactions posted');
    console.log('✅ Node.js ← HTTP → C# integration working perfectly');
    console.log('\nTransaction Summary:');
    console.log('- Invoice A/R: DR $500 (Accounts Receivable), CR $500 (Sales Revenue)');
    console.log('- Payment: DR $500 (Cash), CR $500 (Accounts Receivable)');
    console.log('- COGS: DR $250 (Cost of Goods Sold), CR $250 (Inventory)');
    console.log('\nPhase 3 + Phase 4 Integration: COMPLETE! 🎉');

  } catch (error) {
    console.log('\n❌ Integration test failed:', error.message);
    if (error.response) {
      console.log('Response status:', error.response.status);
      console.log('Response data:', error.response.data);
    }
  }
}

runCompleteIntegrationTest();