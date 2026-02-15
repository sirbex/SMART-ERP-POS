/**
 * Phase 3 Integration Verification Script
 * Checks all critical integration points
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🔍 Phase 3 Integration Verification');
console.log('==================================');

const checkResults = {
  accountingApiClient: false,
  invoiceIntegration: false,
  paymentIntegration: false,
  salesIntegration: false,
  serverHealthCheck: false
};

// 1. Check accountingApiClient exists
console.log('\n1. Checking accountingApiClient service...');
const accountingApiClientPath = join(__dirname, 'src/services/accountingApiClient.ts');
if (fs.existsSync(accountingApiClientPath)) {
  const content = fs.readFileSync(accountingApiClientPath, 'utf8');
  if (content.includes('postInvoice') && content.includes('postPayment') && content.includes('postCOGS')) {
    console.log('✅ accountingApiClient.ts exists with all required methods');
    checkResults.accountingApiClient = true;
  } else {
    console.log('❌ accountingApiClient.ts missing required methods');
  }
} else {
  console.log('❌ accountingApiClient.ts not found');
}

// 2. Check invoice integration
console.log('\n2. Checking invoice service integration...');
const invoiceServicePath = join(__dirname, 'src/modules/invoices/invoiceService.ts');
if (fs.existsSync(invoiceServicePath)) {
  const content = fs.readFileSync(invoiceServicePath, 'utf8');
  if (content.includes('accountingApiClient') && content.includes('postInvoice')) {
    console.log('✅ Invoice service has C# accounting integration');
    checkResults.invoiceIntegration = true;
  } else {
    console.log('❌ Invoice service missing C# integration');
  }
} else {
  console.log('❌ Invoice service not found');
}

// 3. Check payment integration
console.log('\n3. Checking payment service integration...');
const paymentServicePath = join(__dirname, 'src/modules/payments/paymentsService.ts');
if (fs.existsSync(paymentServicePath)) {
  const content = fs.readFileSync(paymentServicePath, 'utf8');
  if (content.includes('accountingApiClient') && content.includes('postPayment')) {
    console.log('✅ Payment service has C# accounting integration');
    checkResults.paymentIntegration = true;
  } else {
    console.log('❌ Payment service missing C# integration');
  }
} else {
  console.log('❌ Payment service not found');
}

// 4. Check sales integration
console.log('\n4. Checking sales service integration...');
const salesServicePath = join(__dirname, 'src/modules/sales/salesService.ts');
if (fs.existsSync(salesServicePath)) {
  const content = fs.readFileSync(salesServicePath, 'utf8');
  if (content.includes('accountingApiClient') && content.includes('postCOGS')) {
    console.log('✅ Sales service has C# accounting integration');
    checkResults.salesIntegration = true;
  } else {
    console.log('❌ Sales service missing C# integration');
  }
} else {
  console.log('❌ Sales service not found');
}

// 5. Check server health integration
console.log('\n5. Checking server health check integration...');
const serverPath = join(__dirname, 'src/server.ts');
if (fs.existsSync(serverPath)) {
  const content = fs.readFileSync(serverPath, 'utf8');
  if (content.includes('accountingApiClient') && content.includes('healthCheck')) {
    console.log('✅ Server has C# accounting health check');
    checkResults.serverHealthCheck = true;
  } else {
    console.log('❌ Server missing C# health check');
  }
} else {
  console.log('❌ Server file not found');
}

// Summary
console.log('\n📊 PHASE 3 VERIFICATION SUMMARY');
console.log('==============================');
const totalChecks = Object.keys(checkResults).length;
const passedChecks = Object.values(checkResults).filter(Boolean).length;

console.log(`Passed: ${passedChecks}/${totalChecks} checks`);

Object.entries(checkResults).forEach(([check, passed]) => {
  console.log(`${passed ? '✅' : '❌'} ${check}`);
});

if (passedChecks === totalChecks) {
  console.log('\n🎉 Phase 3 Integration is COMPLETE!');
} else {
  console.log('\n❌ Phase 3 Integration is INCOMPLETE!');
  console.log('Missing integrations need to be implemented.');
}

console.log('\nNext: Phase 4 - C# Accounting API Implementation');