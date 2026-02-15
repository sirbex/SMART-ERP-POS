// Simple delivery API test
import axios from 'axios';

async function testDeliveryAPI() {
  try {
    console.log('🧪 Testing Delivery API...');

    // Test health endpoint first
    const healthResponse = await axios.get('http://localhost:3001/health');
    console.log('✅ Health check:', healthResponse.data.status);

    // Test delivery orders endpoint (should get empty list)
    const ordersResponse = await axios.get('http://localhost:3001/api/delivery/orders');
    console.log('✅ Delivery orders endpoint accessible:', ordersResponse.data.success);

    // Test delivery analytics endpoint
    const analyticsResponse = await axios.get('http://localhost:3001/api/delivery/analytics/summary');
    console.log('✅ Analytics endpoint accessible:', analyticsResponse.data.success);

    console.log('🎉 Delivery API tests passed!');
  } catch (error) {
    console.error('❌ API test failed:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
    }
  }
}

testDeliveryAPI();