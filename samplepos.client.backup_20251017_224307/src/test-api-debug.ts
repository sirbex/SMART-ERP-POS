// Quick test to debug the API call
import api from './config/api.config';

async function testTransactionsAPI() {
  console.log('Testing transactions API...');
  try {
    const response = await api.get('/transactions/recent');
    console.log('Response status:', response.status);
    console.log('Response data type:', typeof response.data);
    console.log('Response data is array:', Array.isArray(response.data));
    console.log('Response data length:', response.data?.length);
    console.log('First item:', response.data?.[0]);
    console.log('SUCCESS: Transaction count:', response.data?.length || 0);
  } catch (error: any) {
    console.error('ERROR caught:');
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    console.error('Error response:', error.response);
    console.error('Error request:', error.request);
    console.error('Full error:', error);
  }
}

// Export for use in console
(window as any).testTransactionsAPI = testTransactionsAPI;

console.log('Test function loaded. Run: testTransactionsAPI()');
