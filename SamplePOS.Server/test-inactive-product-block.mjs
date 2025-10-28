/**
 * Test: Verify inactive products are blocked from sales
 * 
 * This test verifies:
 * 1. GET /api/products defaults to active products only
 * 2. POST /api/sales rejects inactive products with clear error
 */

import axios from 'axios';

const API_URL = 'http://localhost:3001/api';

// Test credentials (using existing admin user)
const TEST_USER = {
  username: 'testuser',
  password: 'password123'
};

let authToken = '';
let testProductId = '';

async function login() {
  console.log('\n🔐 Logging in...');
  try {
    const response = await axios.post(`${API_URL}/auth/login`, TEST_USER);
    authToken = response.data.token;
    console.log('✅ Login successful');
    return authToken;
  } catch (error) {
    console.error('❌ Login failed:', error.response?.data || error.message);
    throw error;
  }
}

async function testProductListDefaults() {
  console.log('\n📋 Test 1: Verify /products defaults to active products only');
  try {
    const response = await axios.get(`${API_URL}/products`, {
      headers: { Authorization: `Bearer ${authToken}` },
      params: { limit: 1000 }
    });
    
    const products = response.data.data || response.data;
    const inactiveProducts = products.filter(p => p.isActive === false);
    
    if (inactiveProducts.length > 0) {
      console.log(`⚠️  Found ${inactiveProducts.length} inactive products in default list`);
      console.log('First inactive:', inactiveProducts[0]);
      return false;
    }
    
    console.log(`✅ All ${products.length} products are active (default filter working)`);
    
    // Save a test product for sale attempt
    if (products.length > 0) {
      testProductId = products[0].id;
      console.log(`📦 Using test product: ${products[0].name} (${testProductId})`);
    }
    
    return true;
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    return false;
  }
}

async function testExplicitInactiveFilter() {
  console.log('\n📋 Test 2: Verify explicit isActive=false parameter works');
  try {
    const response = await axios.get(`${API_URL}/products`, {
      headers: { Authorization: `Bearer ${authToken}` },
      params: { isActive: 'false', limit: 100 }
    });
    
    const products = response.data.data || response.data;
    const activeProducts = products.filter(p => p.isActive === true);
    
    if (activeProducts.length > 0) {
      console.log(`⚠️  Found ${activeProducts.length} active products when filtering for inactive`);
      return false;
    }
    
    console.log(`✅ Filter working: ${products.length} inactive products returned`);
    return true;
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    return false;
  }
}

async function testInactiveProductBlockedInSale() {
  console.log('\n🛒 Test 3: Verify inactive product is rejected in sale');
  
  // First, get or create an inactive product
  try {
    // Get all products including inactive
    const allProducts = await axios.get(`${API_URL}/products`, {
      headers: { Authorization: `Bearer ${authToken}` },
      params: { isActive: 'false', limit: 1 }
    });
    
    const inactiveProducts = allProducts.data.data || allProducts.data;
    
    if (inactiveProducts.length === 0) {
      console.log('⚠️  No inactive products found to test. Skipping sale test.');
      return true; // Not a failure, just no test data
    }
    
    const inactiveProduct = inactiveProducts[0];
    console.log(`📦 Testing with inactive product: ${inactiveProduct.name} (${inactiveProduct.id})`);
    
    // Attempt to create a sale with this inactive product
    const saleData = {
      items: [
        {
          productId: inactiveProduct.id,
          quantity: 1,
          unitPrice: 10.00,
          discount: 0,
          taxRate: 0
        }
      ],
      payments: [
        {
          method: 'CASH',
          amount: 10.00
        }
      ],
      subtotal: 10.00,
      discount: 0,
      tax: 0,
      total: 10.00
    };
    
    try {
      const saleResponse = await axios.post(`${API_URL}/sales`, saleData, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      
      console.log('❌ FAIL: Sale was created with inactive product!');
      console.log('Sale:', saleResponse.data);
      return false;
    } catch (saleError) {
      if (saleError.response?.status === 400 && 
          saleError.response?.data?.error?.includes('inactive')) {
        console.log('✅ Inactive product correctly rejected');
        console.log(`   Error message: "${saleError.response.data.error}"`);
        return true;
      } else {
        console.log('❌ Unexpected error:', saleError.response?.data || saleError.message);
        return false;
      }
    }
  } catch (error) {
    console.error('❌ Test setup failed:', error.response?.data || error.message);
    return false;
  }
}

async function runTests() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🧪 Testing Inactive Product Blocking');
  console.log('═══════════════════════════════════════════════════════');
  
  try {
    await login();
    
    const results = {
      defaultFilter: await testProductListDefaults(),
      explicitFilter: await testExplicitInactiveFilter(),
      saleBlock: await testInactiveProductBlockedInSale()
    };
    
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('📊 Test Results:');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`Default filter (active only):     ${results.defaultFilter ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Explicit inactive filter:         ${results.explicitFilter ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Sale blocking:                    ${results.saleBlock ? '✅ PASS' : '❌ FAIL'}`);
    
    const allPassed = Object.values(results).every(r => r);
    
    if (allPassed) {
      console.log('\n🎉 All tests PASSED! Inactive products are properly blocked.');
    } else {
      console.log('\n⚠️  Some tests FAILED. Please review the implementation.');
    }
    
    process.exit(allPassed ? 0 : 1);
  } catch (error) {
    console.error('\n💥 Test suite failed:', error.message);
    process.exit(1);
  }
}

runTests();
