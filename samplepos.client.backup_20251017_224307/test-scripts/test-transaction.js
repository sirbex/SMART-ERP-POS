import axios from 'axios';

const testTransaction = {
  customerId: null,
  subtotal: 10.99,
  tax: 0,
  discount: 0,
  total: 10.99,
  paymentMethod: 'cash',
  paymentStatus: 'completed',
  amountPaid: 15.00,
  changeAmount: 4.01,
  notes: '',
  createdBy: 'test',
  items: [{
    inventoryItemId: '1',
    name: 'Test Product',
    sku: 'TEST001',
    price: 10.99,
    quantity: 1,
    unit: 'piece',
    uomDisplayName: 'piece',
    conversionFactor: 1,
    discount: 0,
    subtotal: 10.99,
    tax: 0,
    total: 10.99,
    costPrice: 5.00,
    notes: ''
  }]
};

axios.post('http://localhost:3001/api/transactions', testTransaction)
  .then(response => {
    console.log('✅ Transaction created successfully:', response.data);
  })
  .catch(error => {
    console.error('❌ Error creating transaction:', error.response?.data || error.message);
  });