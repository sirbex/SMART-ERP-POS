/**
 * Phase 5: Financial Reports Validation Test
 * Validates accounting reports generate correctly from integrated system
 */

import axios from 'axios';

const NODE_API = 'http://localhost:3001';
const CSHARP_API = 'http://localhost:5062';
const API_KEY = 'your_shared_secret_key_here';

console.log('📊 Phase 5: Financial Reports Validation Test');
console.log('============================================');

const nodeClient = axios.create({
  baseURL: NODE_API,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' }
});

const csharpClient = axios.create({
  baseURL: CSHARP_API,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': API_KEY
  }
});

let authToken = '';
const testData = {
  customerId: '',
  productIds: [],
  saleIds: [],
  invoiceIds: [],
  today: new Date().toISOString().split('T')[0],
  startOfMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
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

async function setupTestData() {
  try {
    console.log('🔧 Setting up test data for financial reports...');

    // Create test customer
    const customerResponse = await nodeClient.post('/api/customers', {
      name: 'Financial Reports Test Customer',
      email: 'reports@test.com',
      phone: '+1-555-REPORTS',
      address: '456 Reports Avenue'
    });

    if (customerResponse.data.success) {
      testData.customerId = customerResponse.data.data.id;
      console.log('✅ Test customer created');
    }

    // Create multiple test products
    const products = [
      { name: 'Product A', sku: 'REPT-A-001', cost: 10, price: 20 },
      { name: 'Product B', sku: 'REPT-B-002', cost: 25, price: 45 },
      { name: 'Product C', sku: 'REPT-C-003', cost: 5, price: 12 }
    ];

    for (const product of products) {
      const productResponse = await nodeClient.post('/api/products', {
        name: product.name,
        sku: product.sku,
        costPrice: product.cost,
        sellingPrice: product.price,
        category: 'Test Reports',
        description: 'Product for financial reports testing'
      });

      if (productResponse.data.success) {
        testData.productIds.push(productResponse.data.data.id);
        console.log(`✅ Test product created: ${product.name}`);

        // Add inventory
        await nodeClient.post('/api/stock-movements', {
          productId: productResponse.data.data.id,
          movementType: 'ADJUSTMENT_IN',
          quantity: 50,
          reason: 'Initial stock for reports testing'
        });
      }
    }

    // Create multiple test sales with different payment methods
    const salesData = [
      { method: 'CASH', items: [{ productIndex: 0, qty: 3 }, { productIndex: 1, qty: 2 }] },
      { method: 'CARD', items: [{ productIndex: 1, qty: 1 }, { productIndex: 2, qty: 5 }] },
      { method: 'MOBILE_MONEY', items: [{ productIndex: 0, qty: 2 }, { productIndex: 2, qty: 3 }] }
    ];

    for (const sale of salesData) {
      const items = sale.items.map(item => ({
        productId: testData.productIds[item.productIndex],
        quantity: item.qty,
        unitPrice: products[item.productIndex].price
      }));

      const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);

      const saleResponse = await nodeClient.post('/api/sales', {
        customerId: testData.customerId,
        items,
        paymentMethod: sale.method,
        amountPaid: totalAmount,
        notes: `Reports test - ${sale.method} payment`
      });

      if (saleResponse.data.success) {
        testData.saleIds.push(saleResponse.data.data.id);
        console.log(`✅ Test sale created: ${sale.method} - $${totalAmount}`);
      }
    }

    console.log('✅ Test data setup complete');
    return true;

  } catch (error) {
    console.log('❌ Test data setup failed:', error.response?.data?.error || error.message);
    return false;
  }
}

async function test1_SalesReportValidation() {
  try {
    console.log('\n📋 Test 1: Sales Report Validation...');

    const response = await nodeClient.get('/api/reports/sales', {
      params: {
        startDate: testData.startOfMonth,
        endDate: testData.today,
        groupBy: 'payment_method'
      }
    });

    if (response.data.success) {
      const report = response.data.data;
      console.log('✅ Sales report generated successfully');

      // Validate report structure
      if (report.summary && report.details) {
        console.log('✅ Report has required sections (summary, details)');

        // Check summary data
        if (report.summary.totalAmount && report.summary.totalTransactions) {
          console.log(`   Total Amount: $${report.summary.totalAmount}`);
          console.log(`   Total Transactions: ${report.summary.totalTransactions}`);
          console.log('✅ Summary data present');

          // Check payment method breakdown
          if (report.details.byPaymentMethod) {
            const paymentMethods = Object.keys(report.details.byPaymentMethod);
            console.log(`   Payment methods: ${paymentMethods.join(', ')}`);
            console.log('✅ Payment method breakdown available');
            return true;
          }
        }
      }

      console.log('❌ Report structure incomplete');
      return false;
    }

  } catch (error) {
    console.log('❌ Sales report test failed:', error.response?.data?.error || error.message);
    return false;
  }
}

async function test2_InventoryValuationReport() {
  try {
    console.log('\n📋 Test 2: Inventory Valuation Report...');

    const response = await nodeClient.get('/api/reports/inventory-valuation', {
      params: {
        asOfDate: testData.today,
        costMethod: 'FIFO'
      }
    });

    if (response.data.success) {
      const report = response.data.data;
      console.log('✅ Inventory valuation report generated');

      // Validate report contains test products
      if (report.items && Array.isArray(report.items)) {
        const testProductsInReport = report.items.filter(item =>
          item.sku && item.sku.startsWith('REPT-')
        );

        if (testProductsInReport.length > 0) {
          console.log(`✅ Found ${testProductsInReport.length} test products in valuation`);

          // Check valuation calculations
          testProductsInReport.forEach(item => {
            console.log(`   ${item.sku}: Qty ${item.quantity} | Unit Cost $${item.unitCost} | Total $${item.totalValue}`);
          });

          if (report.summary && report.summary.totalValue) {
            console.log(`   Total Inventory Value: $${report.summary.totalValue}`);
            console.log('✅ Valuation calculations present');
            return true;
          }
        }
      }

      console.log('❌ Inventory valuation incomplete or missing test data');
      return false;
    }

  } catch (error) {
    console.log('❌ Inventory valuation test failed:', error.response?.data?.error || error.message);
    return false;
  }
}

async function test3_ProfitLossReport() {
  try {
    console.log('\n📋 Test 3: Profit & Loss Report...');

    const response = await nodeClient.get('/api/reports/profit-loss', {
      params: {
        startDate: testData.startOfMonth,
        endDate: testData.today,
        period: 'monthly'
      }
    });

    if (response.data.success) {
      const report = response.data.data;
      console.log('✅ Profit & Loss report generated');

      // Validate P&L structure
      if (report.revenue && report.costs && report.grossProfit !== undefined) {
        console.log(`   Revenue: $${report.revenue}`);
        console.log(`   Cost of Goods Sold: $${report.costs.cogs || 0}`);
        console.log(`   Gross Profit: $${report.grossProfit}`);

        // Calculate expected gross profit margin
        if (report.revenue > 0) {
          const margin = ((report.grossProfit / report.revenue) * 100).toFixed(2);
          console.log(`   Gross Profit Margin: ${margin}%`);
        }

        console.log('✅ P&L calculations complete');
        return true;
      } else {
        console.log('❌ P&L report missing required sections');
        return false;
      }
    }

  } catch (error) {
    console.log('❌ P&L report test failed:', error.response?.data?.error || error.message);
    return false;
  }
}

async function test4_CustomerAnalyticsReport() {
  try {
    console.log('\n📋 Test 4: Customer Analytics Report...');

    const response = await nodeClient.get('/api/reports/customer-analytics', {
      params: {
        startDate: testData.startOfMonth,
        endDate: testData.today,
        includeRanking: true
      }
    });

    if (response.data.success) {
      const report = response.data.data;
      console.log('✅ Customer analytics report generated');

      // Find our test customer
      if (report.customers && Array.isArray(report.customers)) {
        const testCustomer = report.customers.find(c => c.name === 'Financial Reports Test Customer');

        if (testCustomer) {
          console.log(`✅ Test customer found in analytics:`);
          console.log(`   Total Purchases: $${testCustomer.totalPurchases || 0}`);
          console.log(`   Transaction Count: ${testCustomer.transactionCount || 0}`);
          console.log(`   Average Order Value: $${testCustomer.averageOrderValue || 0}`);

          if (report.summary && report.summary.totalCustomers) {
            console.log(`   Total Active Customers: ${report.summary.totalCustomers}`);
            console.log('✅ Customer analytics complete');
            return true;
          }
        } else {
          console.log('❌ Test customer not found in analytics');
          return false;
        }
      }

      console.log('❌ Customer analytics data missing');
      return false;
    }

  } catch (error) {
    console.log('❌ Customer analytics test failed:', error.response?.data?.error || error.message);
    return false;
  }
}

async function test5_ProductPerformanceReport() {
  try {
    console.log('\n📋 Test 5: Product Performance Report...');

    const response = await nodeClient.get('/api/reports/product-performance', {
      params: {
        startDate: testData.startOfMonth,
        endDate: testData.today,
        sortBy: 'revenue',
        limit: 20
      }
    });

    if (response.data.success) {
      const report = response.data.data;
      console.log('✅ Product performance report generated');

      // Find test products in performance report
      if (report.products && Array.isArray(report.products)) {
        const testProducts = report.products.filter(p => p.sku && p.sku.startsWith('REPT-'));

        if (testProducts.length > 0) {
          console.log(`✅ Found ${testProducts.length} test products in performance report:`);

          testProducts.forEach(product => {
            console.log(`   ${product.sku}: Revenue $${product.revenue} | Sold ${product.quantitySold} units | Margin ${product.profitMargin}%`);
          });

          console.log('✅ Product performance metrics complete');
          return true;
        } else {
          console.log('❌ Test products not found in performance report');
          return false;
        }
      }

      console.log('❌ Product performance data missing');
      return false;
    }

  } catch (error) {
    console.log('❌ Product performance test failed:', error.response?.data?.error || error.message);
    return false;
  }
}

async function test6_AccountingIntegrationReports() {
  try {
    console.log('\n📋 Test 6: C# Accounting Integration Reports...');

    // Test C# API ledger balance report
    const balanceResponse = await csharpClient.get('/api/reports/trial-balance', {
      params: {
        asOfDate: testData.today
      }
    });

    if (balanceResponse.data.success) {
      console.log('✅ Trial balance report from C# API generated');

      const report = balanceResponse.data.data;
      if (report.accounts && Array.isArray(report.accounts)) {
        console.log(`   Accounts in trial balance: ${report.accounts.length}`);

        // Look for key account types
        const accountTypes = [...new Set(report.accounts.map(acc => acc.accountType))];
        console.log(`   Account types: ${accountTypes.join(', ')}`);

        if (report.totals && report.totals.debits !== undefined && report.totals.credits !== undefined) {
          console.log(`   Total Debits: $${report.totals.debits}`);
          console.log(`   Total Credits: $${report.totals.credits}`);
          console.log(`   Balance: ${Math.abs(report.totals.debits - report.totals.credits) < 0.01 ? '✅ Balanced' : '❌ Unbalanced'}`);

          console.log('✅ C# accounting reports integration verified');
          return true;
        }
      }
    }

    console.log('❌ C# accounting reports integration failed');
    return false;

  } catch (error) {
    console.log('❌ Accounting integration reports test failed:', error.response?.data?.message || error.message);
    return false;
  }
}

async function runFinancialReportsValidation() {
  const results = {
    salesReport: false,
    inventoryValuation: false,
    profitLoss: false,
    customerAnalytics: false,
    productPerformance: false,
    accountingIntegration: false
  };

  console.log('Starting Phase 5 Financial Reports Validation...\n');

  const authSuccess = await setupAuth();
  if (!authSuccess) {
    console.log('❌ Cannot proceed without authentication');
    return results;
  }

  const dataSetupSuccess = await setupTestData();
  if (!dataSetupSuccess) {
    console.log('❌ Cannot proceed without test data');
    return results;
  }

  // Wait a moment for data to be processed
  console.log('⏳ Allowing time for data processing...');
  await new Promise(resolve => setTimeout(resolve, 2000));

  results.salesReport = await test1_SalesReportValidation();
  results.inventoryValuation = await test2_InventoryValuationReport();
  results.profitLoss = await test3_ProfitLossReport();
  results.customerAnalytics = await test4_CustomerAnalyticsReport();
  results.productPerformance = await test5_ProductPerformanceReport();
  results.accountingIntegration = await test6_AccountingIntegrationReports();

  // Summary
  console.log('\n📊 PHASE 5 FINANCIAL REPORTS VALIDATION SUMMARY');
  console.log('===============================================');
  const totalTests = Object.keys(results).length;
  const passedTests = Object.values(results).filter(Boolean).length;

  console.log(`Passed: ${passedTests}/${totalTests} tests`);

  Object.entries(results).forEach(([test, passed]) => {
    console.log(`${passed ? '✅' : '❌'} ${test.replace(/([A-Z])/g, ' $1').toLowerCase()}`);
  });

  if (passedTests === totalTests) {
    console.log('\n📊 PHASE 5 FINANCIAL REPORTS: COMPLETE!');
    console.log('All financial reporting systems validated and integrated.');
  } else {
    console.log('\n⚠️  PHASE 5 FINANCIAL REPORTS: PARTIAL SUCCESS');
    console.log('Some reports need enhancement before production.');
  }

  return results;
}

runFinancialReportsValidation();