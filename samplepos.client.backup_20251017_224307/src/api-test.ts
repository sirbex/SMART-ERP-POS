/**
 * API Test Script
 * 
 * This script tests the API connectivity and basic operations
 */

import api from './config/api.config';

// Test health check endpoint
async function testHealthEndpoint() {
  console.log('Testing API health check endpoint...');
  try {
    const response = await api.get('/health');
    console.log('✅ Health check successful:', response.data);
    return true;
  } catch (error: any) {
    console.error('❌ Health check failed:', error.message || String(error));
    return false;
  }
}

// Test inventory endpoints
async function testInventoryEndpoints() {
  console.log('\nTesting inventory endpoints...');
  try {
    // Get all inventory items
    const itemsResponse = await api.get('/inventory');
    console.log(`✅ Retrieved ${itemsResponse.data.length} inventory items`);
    
    // If we have items, test getting a specific one
    if (itemsResponse.data.length > 0) {
      const firstItem = itemsResponse.data[0];
      console.log(`Testing get item by ID: ${firstItem.id}`);
      
      const itemResponse = await api.get(`/inventory/${firstItem.id}`);
      console.log(`✅ Retrieved item: ${itemResponse.data.name}`);
    }
    
    return true;
  } catch (error: any) {
    console.error('❌ Inventory endpoint test failed:', error.message || String(error));
    return false;
  }
}

// Test product endpoints
async function testProductEndpoints() {
  console.log('\nTesting batch inventory product endpoints...');
  try {
    // Get all products
    const productsResponse = await api.get('/inventory/products');
    console.log(`✅ Retrieved ${productsResponse.data.length} products`);
    
    // If we have products, test getting stock info
    if (productsResponse.data.length > 0) {
      const firstProduct = productsResponse.data[0];
      console.log(`Testing get product stock: ${firstProduct.id}`);
      
      const stockResponse = await api.get(`/inventory/products/${firstProduct.id}/stock`);
      console.log(`✅ Retrieved stock info for ${stockResponse.data.productName}: ${stockResponse.data.availableQuantity} available`);
    }
    
    return true;
  } catch (error: any) {
    console.error('❌ Product endpoint test failed:', error.message || String(error));
    return false;
  }
}

// Test customer endpoints
async function testCustomerEndpoints() {
  console.log('\nTesting customer endpoints...');
  try {
    // Get all customers
    const customersResponse = await api.get('/customers');
    console.log(`✅ Retrieved ${customersResponse.data.length} customers`);
    
    return true;
  } catch (error: any) {
    console.error('❌ Customer endpoint test failed:', error.message || String(error));
    return false;
  }
}

// Test transaction endpoints
async function testTransactionEndpoints() {
  console.log('\nTesting transaction endpoints...');
  try {
    // Get recent transactions
    const transactionsResponse = await api.get('/transactions/recent', { params: { limit: 5 } });
    console.log(`✅ Retrieved ${transactionsResponse.data.length} transactions`);
    
    return true;
  } catch (error: any) {
    console.error('❌ Transaction endpoint test failed:', error.message || String(error));
    return false;
  }
}

// Run all tests
async function runAllTests() {
  console.log('🧪 Starting API connectivity tests...\n');
  
  // Test health first - if this fails, don't continue
  const healthOk = await testHealthEndpoint();
  if (!healthOk) {
    console.error('\n❌ Health check failed. Ensure your backend server is running on port 3001.');
    console.error('Try running the backend with: npm run server');
    return;
  }
  
  // Run remaining tests
  await testInventoryEndpoints();
  await testProductEndpoints();
  await testCustomerEndpoints();
  await testTransactionEndpoints();
  
  console.log('\n🔍 API Tests completed!');
}

// Execute all tests
runAllTests();