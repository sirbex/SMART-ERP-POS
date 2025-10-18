/**
 * Test script to verify the batch API fix
 */

import axios from 'axios';

async function testBatchAPI() {
  try {
    console.log('🧪 Testing Batch API Fix...\n');

    // Test batch endpoint for product 3 (the one causing the error)
    const response1 = await axios.get('http://localhost:3001/api/inventory/batches/product/3');
    console.log('✅ Test 1 - Product 3 Batches:');
    console.log('Status:', response1.status);
    console.log('Data:', JSON.stringify(response1.data, null, 2));
    console.log();

    // Test with product 1 (should also work)
    const response2 = await axios.get('http://localhost:3001/api/inventory/batches/product/1');
    console.log('✅ Test 2 - Product 1 Batches:');
    console.log('Status:', response2.status);
    console.log('Data:', JSON.stringify(response2.data, null, 2));
    console.log();

    // Test with non-existent product (should handle gracefully)
    try {
      const response3 = await axios.get('http://localhost:3001/api/inventory/batches/product/999');
      console.log('✅ Test 3 - Non-existent Product 999:');
      console.log('Status:', response3.status);
      console.log('Data:', JSON.stringify(response3.data, null, 2));
    } catch (error) {
      console.log('✅ Test 3 - Non-existent Product 999 (expected error):');
      console.log('Status:', error.response?.status || 'No response');
      console.log('Error:', error.response?.data || error.message);
    }

    console.log('\n🎉 Batch API tests completed!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testBatchAPI();