/**
 * Test script for Accounting Integration Service
 * Tests Node.js to C# Accounting API integration
 * 
 * Usage: node test-accounting-integration.js
 */

// Direct HTTP test since we're testing the compiled TypeScript
import axios from 'axios';

async function testAccountingIntegration() {
  console.log('🧪 Testing Accounting Integration Service...\n');

  // Initialize service with test configuration
  const accountingService = new AccountingIntegrationService({
    baseURL: 'http://localhost:5062',
    apiKey: 'your_shared_secret_key_here',
    timeout: 10000
  });

  // Test 1: Health Check
  console.log('📋 Test 1: Health Check');
  try {
    const healthResult = await accountingService.healthCheck();
    console.log('✅ Health check result:', healthResult);
  } catch (error) {
    console.log('❌ Health check failed:', error.message);
  }

  // Test 2: Record Invoice Created
  console.log('\n📋 Test 2: Record Invoice Created');
  try {
    const invoiceResult = await accountingService.recordInvoiceCreated({
      invoiceId: 'test-invoice-001',
      amount: 150.75,
      customerId: 'test-customer-001',
      invoiceNumber: 'INV-TEST-001'
    });
    console.log('✅ Invoice recording result:', invoiceResult);
  } catch (error) {
    console.log('❌ Invoice recording failed:', error.message);
  }

  // Test 3: Record Payment Processed
  console.log('\n📋 Test 3: Record Payment Processed');
  try {
    const paymentResult = await accountingService.recordPaymentProcessed({
      paymentId: 'test-payment-001',
      amount: 150.75,
      customerId: 'test-customer-001',
      paymentMethod: 'CASH',
      reference: 'CASH-TEST-001'
    });
    console.log('✅ Payment recording result:', paymentResult);
  } catch (error) {
    console.log('❌ Payment recording failed:', error.message);
  }

  // Test 4: Record Sale Finalized (COGS)
  console.log('\n📋 Test 4: Record Sale Finalized (COGS)');
  try {
    const cogsResult = await accountingService.recordSaleFinalized({
      saleId: 'test-sale-001',
      totalAmount: 150.75,
      cogsAmount: 85.50,
      customerId: 'test-customer-001'
    });
    console.log('✅ COGS recording result:', cogsResult);
  } catch (error) {
    console.log('❌ COGS recording failed:', error.message);
  }

  console.log('\n🏁 Accounting integration tests completed!');
}

// Run tests if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testAccountingIntegration().catch(console.error);
}