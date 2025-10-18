// Check available purchase orders for receiving
console.log('=== Checking Purchase Orders for Receiving ===');

// Mock localStorage for Node.js
global.localStorage = {
  getItem: (key) => {
    const mockData = {
      'purchaseOrders': JSON.stringify([
        {
          id: 'po-001',
          orderNumber: 'PO202510-001', 
          supplierId: 'sup-001',
          supplierName: 'ABC Distribution Ltd',
          status: 'confirmed',
          orderDate: '2025-10-06',
          totalValue: 351000,
          items: [
            {
              productId: 'p1',
              productName: 'Rice 25kg',
              quantityOrdered: 10,
              unitPrice: 25000,
              totalPrice: 250000
            },
            {
              productId: 'p2', 
              productName: 'Cooking Oil 5L',
              quantityOrdered: 20,
              unitPrice: 15000,
              totalPrice: 300000
            }
          ]
        }
      ])
    };
    return mockData[key] || null;
  },
  setItem: (key, value) => {
    console.log(`Would save ${key}:`, JSON.parse(value));
  }
};

try {
  // Import the service
  const PurchaseManagementService = require('./src/services/PurchaseManagementService.js').default;
  
  if (!PurchaseManagementService) {
    console.log('❌ PurchaseManagementService not found');
    process.exit(1);
  }
  
  const service = PurchaseManagementService.getInstance();
  const allOrders = service.getPurchaseOrders();
  
  console.log('📋 All Purchase Orders:', allOrders.length);
  
  // Filter orders ready for receiving
  const readyOrders = allOrders.filter(order => 
    ['confirmed', 'partial'].includes(order.status)
  );
  
  console.log('✅ Orders Ready for Receiving:', readyOrders.length);
  console.log('');
  
  readyOrders.forEach((order, index) => {
    console.log(`${index + 1}. ${order.orderNumber}`);
    console.log(`   Supplier: ${order.supplierName}`);
    console.log(`   Status: ${order.status.toUpperCase()}`);
    console.log(`   Total: ${order.totalValue.toLocaleString()} UGX`);
    console.log(`   Order Date: ${order.orderDate}`);
    console.log(`   Items (${order.items.length}):`);
    
    order.items.forEach(item => {
      console.log(`     • ${item.productName}: ${item.quantityOrdered} units @ ${item.unitPrice.toLocaleString()} UGX`);
    });
    
    console.log('');
  });
  
  if (readyOrders.length === 0) {
    console.log('❌ No purchase orders are ready for receiving.');
    console.log('   Orders must be in "confirmed" or "partial" status.');
  }
  
} catch (error) {
  console.log('❌ Error:', error.message);
}