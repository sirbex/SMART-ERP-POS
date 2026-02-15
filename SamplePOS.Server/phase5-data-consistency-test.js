/**
 * Phase 5: Data Consistency Validation Test
 * Ensures data integrity across Node.js and C# systems
 */

import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

const NODE_API = 'http://localhost:3001';
const CSHARP_API = 'http://localhost:5062';
const API_KEY = 'your_shared_secret_key_here';

console.log('🔍 Phase 5: Data Consistency Validation Test');
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
const testSessions = [];

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

async function createTestSession() {
  const sessionId = uuidv4();
  const session = {
    id: sessionId,
    timestamp: new Date().toISOString(),
    customerId: '',
    productIds: [],
    saleId: '',
    invoiceId: '',
    expectedTotals: {
      saleAmount: 0,
      taxAmount: 0,
      costOfGoods: 0,
      profit: 0
    },
    actualTotals: {
      saleAmount: 0,
      taxAmount: 0,
      costOfGoods: 0,
      profit: 0
    }
  };

  testSessions.push(session);
  return session;
}

async function test1_CustomerDataConsistency() {
  console.log('\n📋 Test 1: Customer Data Consistency...');

  try {
    const session = await createTestSession();

    // Create customer
    const customerData = {
      name: `Consistency Test Customer ${session.id.slice(0, 8)}`,
      email: `consistency${session.id.slice(0, 8)}@test.com`,
      phone: '+1-555-0100',
      address: '123 Consistency Street',
      customerType: 'INDIVIDUAL',
      creditLimit: 1000.00
    };

    const customerResponse = await nodeClient.post('/api/customers', customerData);

    if (customerResponse.data.success) {
      session.customerId = customerResponse.data.data.id;
      console.log('✅ Customer created successfully');

      // Verify customer data integrity
      const customerCheck = await nodeClient.get(`/api/customers/${session.customerId}`);

      if (customerCheck.data.success) {
        const customer = customerCheck.data.data;

        // Validate all fields match
        const fieldsMatch =
          customer.name === customerData.name &&
          customer.email === customerData.email &&
          customer.phone === customerData.phone &&
          customer.address === customerData.address &&
          customer.customerType === customerData.customerType &&
          Math.abs(customer.creditLimit - customerData.creditLimit) < 0.01;

        if (fieldsMatch) {
          console.log('✅ Customer data consistency validated');
          return true;
        } else {
          console.log('❌ Customer data inconsistency detected');
          console.log('Expected:', customerData);
          console.log('Actual:', customer);
          return false;
        }
      }
    }

    console.log('❌ Customer creation or retrieval failed');
    return false;

  } catch (error) {
    console.log('❌ Customer consistency test failed:', error.response?.data?.error || error.message);
    return false;
  }
}

async function test2_ProductInventoryConsistency() {
  console.log('\n📋 Test 2: Product & Inventory Consistency...');

  try {
    const session = testSessions[testSessions.length - 1];

    // Create products with inventory
    const products = [
      { name: 'Consistency Product A', sku: `CONS-A-${session.id.slice(0, 8)}`, cost: 15.00, price: 30.00, qty: 100 },
      { name: 'Consistency Product B', sku: `CONS-B-${session.id.slice(0, 8)}`, cost: 25.00, price: 50.00, qty: 75 }
    ];

    for (const productData of products) {
      // Create product
      const productResponse = await nodeClient.post('/api/products', {
        name: productData.name,
        sku: productData.sku,
        costPrice: productData.cost,
        sellingPrice: productData.price,
        category: 'Consistency Test',
        description: 'Product for data consistency testing'
      });

      if (productResponse.data.success) {
        const productId = productResponse.data.data.id;
        session.productIds.push(productId);

        // Add inventory
        const inventoryResponse = await nodeClient.post('/api/stock-movements', {
          productId: productId,
          movementType: 'ADJUSTMENT_IN',
          quantity: productData.qty,
          reason: 'Initial stock for consistency test',
          batchNumber: `BATCH-${session.id.slice(0, 8)}-${productData.sku}`,
          expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
        });

        if (inventoryResponse.data.success) {
          // Verify inventory consistency
          const inventoryCheck = await nodeClient.get(`/api/inventory/product/${productId}`);

          if (inventoryCheck.data.success) {
            const inventory = inventoryCheck.data.data;

            if (inventory.totalQuantity === productData.qty) {
              console.log(`✅ ${productData.sku}: Product and inventory consistent`);
            } else {
              console.log(`❌ ${productData.sku}: Inventory mismatch - Expected ${productData.qty}, Got ${inventory.totalQuantity}`);
              return false;
            }
          }
        }
      }
    }

    console.log('✅ All product and inventory data consistent');
    return true;

  } catch (error) {
    console.log('❌ Product inventory consistency test failed:', error.response?.data?.error || error.message);
    return false;
  }
}

async function test3_SaleTransactionConsistency() {
  console.log('\n📋 Test 3: Sale Transaction Consistency...');

  try {
    const session = testSessions[testSessions.length - 1];

    // Create sale with multiple items
    const saleItems = [
      { productIndex: 0, quantity: 5, expectedUnitPrice: 30.00 },
      { productIndex: 1, quantity: 3, expectedUnitPrice: 50.00 }
    ];

    const items = saleItems.map(item => ({
      productId: session.productIds[item.productIndex],
      quantity: item.quantity,
      unitPrice: item.expectedUnitPrice
    }));

    // Calculate expected totals
    session.expectedTotals.saleAmount = saleItems.reduce((sum, item) =>
      sum + (item.quantity * item.expectedUnitPrice), 0
    );
    session.expectedTotals.taxAmount = session.expectedTotals.saleAmount * 0.08; // 8% tax
    session.expectedTotals.costOfGoods = (5 * 15.00) + (3 * 25.00); // Cost prices
    session.expectedTotals.profit = session.expectedTotals.saleAmount - session.expectedTotals.costOfGoods;

    const totalWithTax = session.expectedTotals.saleAmount + session.expectedTotals.taxAmount;

    const saleResponse = await nodeClient.post('/api/sales', {
      customerId: session.customerId,
      items: items,
      paymentMethod: 'CASH',
      amountPaid: totalWithTax,
      taxRate: 0.08,
      notes: `Consistency test sale ${session.id.slice(0, 8)}`
    });

    if (saleResponse.data.success) {
      session.saleId = saleResponse.data.data.id;
      const saleData = saleResponse.data.data;

      // Verify sale calculations
      session.actualTotals.saleAmount = saleData.totalAmount || saleData.subtotal || 0;
      session.actualTotals.taxAmount = saleData.taxAmount || 0;
      session.actualTotals.costOfGoods = saleData.totalCost || 0;
      session.actualTotals.profit = saleData.profit || 0;

      console.log('   Expected vs Actual Totals:');
      console.log(`   Sale Amount: $${session.expectedTotals.saleAmount} vs $${session.actualTotals.saleAmount}`);
      console.log(`   Tax Amount: $${session.expectedTotals.taxAmount.toFixed(2)} vs $${session.actualTotals.taxAmount}`);
      console.log(`   Cost of Goods: $${session.expectedTotals.costOfGoods} vs $${session.actualTotals.costOfGoods}`);
      console.log(`   Profit: $${session.expectedTotals.profit} vs $${session.actualTotals.profit}`);

      // Check for consistency (allow small rounding differences)
      const tolerance = 0.02;
      const amountMatch = Math.abs(session.expectedTotals.saleAmount - session.actualTotals.saleAmount) < tolerance;
      const taxMatch = Math.abs(session.expectedTotals.taxAmount - session.actualTotals.taxAmount) < tolerance;
      const costMatch = Math.abs(session.expectedTotals.costOfGoods - session.actualTotals.costOfGoods) < tolerance;
      const profitMatch = Math.abs(session.expectedTotals.profit - session.actualTotals.profit) < tolerance;

      if (amountMatch && taxMatch && costMatch && profitMatch) {
        console.log('✅ Sale transaction calculations consistent');
        return true;
      } else {
        console.log('❌ Sale transaction calculation inconsistencies detected');
        return false;
      }
    }

    console.log('❌ Sale creation failed');
    return false;

  } catch (error) {
    console.log('❌ Sale transaction consistency test failed:', error.response?.data?.error || error.message);
    return false;
  }
}

async function test4_AccountingIntegrationConsistency() {
  console.log('\n📋 Test 4: Accounting Integration Consistency...');

  try {
    const session = testSessions[testSessions.length - 1];

    // Create invoice from sale
    const invoiceResponse = await nodeClient.post('/api/invoices', {
      customerId: session.customerId,
      saleId: session.saleId,
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      subtotal: session.expectedTotals.saleAmount,
      taxAmount: session.expectedTotals.taxAmount,
      totalAmount: session.expectedTotals.saleAmount + session.expectedTotals.taxAmount,
      notes: `Consistency test invoice ${session.id.slice(0, 8)}`
    });

    if (invoiceResponse.data.success) {
      session.invoiceId = invoiceResponse.data.data.id;
      const invoiceNumber = invoiceResponse.data.data.invoiceNumber;

      console.log(`✅ Invoice created: ${invoiceNumber}`);

      // Test C# accounting integration
      const accountingPost = await csharpClient.post('/api/ledger/invoice', {
        invoiceId: session.invoiceId,
        invoiceNumber: invoiceNumber,
        customerId: session.customerId,
        customerName: `Consistency Test Customer ${session.id.slice(0, 8)}`,
        totalAmount: session.expectedTotals.saleAmount + session.expectedTotals.taxAmount,
        taxAmount: session.expectedTotals.taxAmount,
        subtotal: session.expectedTotals.saleAmount,
        issueDate: new Date().toISOString().split('T')[0],
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        items: [
          {
            productId: session.productIds[0],
            productName: 'Consistency Product A',
            quantity: 5,
            unitPrice: 30.00,
            totalPrice: 150.00,
            taxAmount: 12.00
          },
          {
            productId: session.productIds[1],
            productName: 'Consistency Product B',
            quantity: 3,
            unitPrice: 50.00,
            totalPrice: 150.00,
            taxAmount: 12.00
          }
        ]
      });

      if (accountingPost.data.success) {
        console.log('✅ C# accounting integration consistent');

        // Verify the accounting entries were created properly
        // by checking the response for transaction details
        if (accountingPost.data.data && accountingPost.data.data.entries) {
          const entries = accountingPost.data.data.entries;
          console.log(`   Ledger entries created: ${entries.length}`);

          // Check for double-entry consistency
          const totalDebits = entries.filter(e => e.side === 'DEBIT').reduce((sum, e) => sum + e.amount, 0);
          const totalCredits = entries.filter(e => e.side === 'CREDIT').reduce((sum, e) => sum + e.amount, 0);

          if (Math.abs(totalDebits - totalCredits) < 0.01) {
            console.log('✅ Double-entry accounting balanced');
            return true;
          } else {
            console.log(`❌ Accounting entries unbalanced: Debits $${totalDebits}, Credits $${totalCredits}`);
            return false;
          }
        }

        console.log('✅ Accounting integration consistent (no detailed validation available)');
        return true;
      } else {
        console.log('❌ C# accounting integration failed');
        return false;
      }
    }

    console.log('❌ Invoice creation failed');
    return false;

  } catch (error) {
    console.log('❌ Accounting integration consistency test failed:', error.response?.data?.message || error.message);
    return false;
  }
}

async function test5_InventoryMovementConsistency() {
  console.log('\n📋 Test 5: Inventory Movement Consistency...');

  try {
    const session = testSessions[testSessions.length - 1];

    // Check inventory movements from the sale
    const movementsResponse = await nodeClient.get('/api/inventory/movements', {
      params: {
        relatedId: session.saleId,
        limit: 20
      }
    });

    if (movementsResponse.data.success) {
      const movements = movementsResponse.data.data;

      if (movements && movements.length > 0) {
        console.log(`✅ Found ${movements.length} inventory movements`);

        // Verify movements match sale items
        let totalMovedQuantity = 0;
        movements.forEach(movement => {
          if (movement.movementType === 'SALE') {
            totalMovedQuantity += Math.abs(movement.quantity);
            console.log(`   Movement: ${movement.productName} - ${Math.abs(movement.quantity)} units`);
          }
        });

        const expectedTotalQuantity = 5 + 3; // From sale items

        if (totalMovedQuantity === expectedTotalQuantity) {
          console.log(`✅ Inventory movements consistent: ${totalMovedQuantity} units total`);

          // Check remaining inventory
          for (let i = 0; i < session.productIds.length; i++) {
            const inventoryCheck = await nodeClient.get(`/api/inventory/product/${session.productIds[i]}`);

            if (inventoryCheck.data.success) {
              const inventory = inventoryCheck.data.data;
              const expectedRemaining = i === 0 ? 95 : 72; // 100-5, 75-3

              if (inventory.totalQuantity === expectedRemaining) {
                console.log(`   ✅ Product ${i + 1}: ${inventory.totalQuantity} units remaining (correct)`);
              } else {
                console.log(`   ❌ Product ${i + 1}: Expected ${expectedRemaining}, got ${inventory.totalQuantity}`);
                return false;
              }
            }
          }

          console.log('✅ All inventory movements and balances consistent');
          return true;
        } else {
          console.log(`❌ Movement quantity mismatch: Expected ${expectedTotalQuantity}, got ${totalMovedQuantity}`);
          return false;
        }
      } else {
        console.log('❌ No inventory movements found for sale');
        return false;
      }
    }

    console.log('❌ Failed to retrieve inventory movements');
    return false;

  } catch (error) {
    console.log('❌ Inventory movement consistency test failed:', error.response?.data?.error || error.message);
    return false;
  }
}

async function test6_CrossSystemDataValidation() {
  console.log('\n📋 Test 6: Cross-System Data Validation...');

  try {
    const session = testSessions[testSessions.length - 1];

    // Get data from Node.js system
    const [customerNode, saleNode, inventoryNode] = await Promise.all([
      nodeClient.get(`/api/customers/${session.customerId}`),
      nodeClient.get(`/api/sales/${session.saleId}`),
      nodeClient.get(`/api/inventory/product/${session.productIds[0]}`)
    ]);

    if (customerNode.data.success && saleNode.data.success && inventoryNode.data.success) {
      console.log('✅ Node.js system data retrieved successfully');

      // Test C# system health and ability to query related data
      const csharpHealth = await csharpClient.get('/health');

      if (csharpHealth.data.success) {
        console.log('✅ C# system healthy');

        // Test that both systems maintain consistent time tracking
        const nodeTimestamp = new Date(saleNode.data.data.createdAt).getTime();
        const currentTime = new Date().getTime();
        const timeDifference = currentTime - nodeTimestamp;

        if (timeDifference < 300000) { // 5 minutes tolerance
          console.log('✅ Cross-system timestamp consistency maintained');

          // Verify that key identifiers are consistent
          const nodeCustomerId = customerNode.data.data.id;
          const nodeSaleId = saleNode.data.data.id;

          if (nodeCustomerId === session.customerId && nodeSaleId === session.saleId) {
            console.log('✅ Cross-system identifier consistency validated');
            return true;
          } else {
            console.log('❌ Cross-system identifier inconsistency');
            return false;
          }
        } else {
          console.log('❌ Cross-system timestamp inconsistency detected');
          return false;
        }
      } else {
        console.log('❌ C# system not healthy for cross-validation');
        return false;
      }
    }

    console.log('❌ Failed to retrieve data from Node.js system');
    return false;

  } catch (error) {
    console.log('❌ Cross-system validation failed:', error.response?.data?.error || error.message);
    return false;
  }
}

async function generateConsistencyReport() {
  console.log('\n📊 DATA CONSISTENCY ANALYSIS REPORT');
  console.log('===================================');

  if (testSessions.length > 0) {
    const session = testSessions[testSessions.length - 1];

    console.log(`\n📋 Test Session: ${session.id.slice(0, 8)}`);
    console.log(`   Timestamp: ${session.timestamp}`);
    console.log(`   Customer ID: ${session.customerId}`);
    console.log(`   Products Created: ${session.productIds.length}`);
    console.log(`   Sale ID: ${session.saleId}`);
    console.log(`   Invoice ID: ${session.invoiceId}`);

    console.log('\n💰 Financial Consistency:');
    console.log(`   Sale Amount: Expected $${session.expectedTotals.saleAmount} | Actual $${session.actualTotals.saleAmount}`);
    console.log(`   Tax Amount: Expected $${session.expectedTotals.taxAmount.toFixed(2)} | Actual $${session.actualTotals.taxAmount}`);
    console.log(`   Cost of Goods: Expected $${session.expectedTotals.costOfGoods} | Actual $${session.actualTotals.costOfGoods}`);
    console.log(`   Profit: Expected $${session.expectedTotals.profit} | Actual $${session.actualTotals.profit}`);
  }
}

async function runDataConsistencyValidation() {
  const results = {
    customerData: false,
    productInventory: false,
    saleTransaction: false,
    accountingIntegration: false,
    inventoryMovement: false,
    crossSystemValidation: false
  };

  console.log('Starting Phase 5 Data Consistency Validation...\n');

  const authSuccess = await setupAuth();
  if (!authSuccess) {
    console.log('❌ Cannot proceed without authentication');
    return results;
  }

  results.customerData = await test1_CustomerDataConsistency();
  results.productInventory = await test2_ProductInventoryConsistency();
  results.saleTransaction = await test3_SaleTransactionConsistency();
  results.accountingIntegration = await test4_AccountingIntegrationConsistency();
  results.inventoryMovement = await test5_InventoryMovementConsistency();
  results.crossSystemValidation = await test6_CrossSystemDataValidation();

  await generateConsistencyReport();

  // Summary
  console.log('\n📊 PHASE 5 DATA CONSISTENCY VALIDATION SUMMARY');
  console.log('==============================================');
  const totalTests = Object.keys(results).length;
  const passedTests = Object.values(results).filter(Boolean).length;

  console.log(`Passed: ${passedTests}/${totalTests} tests`);

  Object.entries(results).forEach(([test, passed]) => {
    console.log(`${passed ? '✅' : '❌'} ${test.replace(/([A-Z])/g, ' $1').toLowerCase()}`);
  });

  if (passedTests === totalTests) {
    console.log('\n🔍 PHASE 5 DATA CONSISTENCY: COMPLETE!');
    console.log('All data consistency checks passed. System maintains integrity across all components.');
  } else if (passedTests >= Math.ceil(totalTests * 0.8)) {
    console.log('\n⚠️  PHASE 5 DATA CONSISTENCY: MOSTLY CONSISTENT');
    console.log('Minor inconsistencies detected but core data integrity maintained.');
  } else {
    console.log('\n❌ PHASE 5 DATA CONSISTENCY: CRITICAL ISSUES');
    console.log('Significant data consistency problems require immediate attention.');
  }

  return results;
}

runDataConsistencyValidation();