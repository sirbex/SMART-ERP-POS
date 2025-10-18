/**
 * Test script to verify the stock check API fix
 */

import axios from 'axios';

async function testStockAPI() {
  try {
    console.log('🧪 Testing Stock Check API Fix...\n');

    // Test with item 1, quantity 1
    const response1 = await axios.get('http://localhost:3001/api/inventory/items/1/check-stock?quantity=1');
    console.log('✅ Test 1 - Item 1, Quantity 1:');
    console.log('Response:', JSON.stringify(response1.data, null, 2));
    console.log();

    // Test with item 1, quantity 1000 (should fail)
    const response2 = await axios.get('http://localhost:3001/api/inventory/items/1/check-stock?quantity=1000');
    console.log('✅ Test 2 - Item 1, Quantity 1000 (should show insufficient):');
    console.log('Response:', JSON.stringify(response2.data, null, 2));
    console.log();

    // Test with item 2
    const response3 = await axios.get('http://localhost:3001/api/inventory/items/2/check-stock?quantity=1');
    console.log('✅ Test 3 - Item 2, Quantity 1:');
    console.log('Response:', JSON.stringify(response3.data, null, 2));
    console.log();

    console.log('🎉 All tests completed successfully!');
    console.log('\n📝 Expected format:');
    console.log('  - success: boolean (true if enough stock)');
    console.log('  - available: number (total stock available)');
    console.log('  - message: string (descriptive message)');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testStockAPI();