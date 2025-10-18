// Create sample purchase order for testing receiving functionality
console.log('=== Creating Sample Purchase Order for Receiving ===');

// Mock localStorage for Node.js environment
global.localStorage = {
  data: {},
  getItem: function(key) {
    return this.data[key] || null;
  },
  setItem: function(key, value) {
    this.data[key] = value;
    console.log(`✅ Saved ${key}`);
  }
};

try {
  // Initialize with sample suppliers and products
  const suppliers = [
    {
      id: 'supplier-1',
      name: 'ABC Distribution Ltd',
      contactPerson: 'John Doe',
      email: 'john@abcdist.com',
      phone: '+256-700-123456',
      address: 'Plot 123, Industrial Area, Kampala',
      paymentTerms: 'Net 30',
      isActive: true,
      notes: 'Main supplier for beverages and snacks',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];

  const products = [
    {
      id: 'product-1',
      name: 'Rice 25kg Bag',
      sku: 'RICE-25KG',
      category: 'Food',
      unit: 'bag',
      hasExpiry: true,
      expiryAlertDays: 90,
      reorderLevel: 5,
      isActive: true
    },
    {
      id: 'product-2',
      name: 'Cooking Oil 5L',
      sku: 'OIL-5L',
      category: 'Food',
      unit: 'bottle',
      hasExpiry: true,
      expiryAlertDays: 180,
      reorderLevel: 10,
      isActive: true
    },
    {
      id: 'product-3',
      name: 'Sugar 50kg Bag',
      sku: 'SUGAR-50KG',
      category: 'Food',
      unit: 'bag',
      hasExpiry: false,
      reorderLevel: 3,
      isActive: true
    }
  ];

  // Create a sample purchase order ready for receiving
  const purchaseOrder = {
    id: 'po-001',
    orderNumber: 'PO202510-001',
    supplierId: 'supplier-1',
    supplierName: 'ABC Distribution Ltd',
    orderDate: '2025-10-06',
    expectedDeliveryDate: '2025-10-13',
    items: [
      {
        productId: 'product-1',
        productName: 'Rice 25kg Bag',
        quantityOrdered: 20,
        unitCost: 35000,
        totalCost: 700000,
        notes: '25kg premium rice bags'
      },
      {
        productId: 'product-2', 
        productName: 'Cooking Oil 5L',
        quantityOrdered: 15,
        unitCost: 18000,
        totalCost: 270000,
        notes: '5L cooking oil bottles'
      },
      {
        productId: 'product-3',
        productName: 'Sugar 50kg Bag', 
        quantityOrdered: 8,
        unitCost: 180000,
        totalCost: 1440000,
        notes: '50kg sugar bags'
      }
    ],
    subtotal: 2410000,
    tax: 433800, // 18% VAT
    shippingCost: 50000,
    totalValue: 2893800,
    status: 'confirmed', // Ready for receiving
    paymentTerms: 'Net 30',
    notes: 'Bulk order for monthly stock replenishment',
    createdBy: 'admin',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  // Save to localStorage format expected by the system
  localStorage.setItem('suppliers', JSON.stringify(suppliers));
  localStorage.setItem('inventory_products', JSON.stringify(products));
  localStorage.setItem('purchase_orders', JSON.stringify([purchaseOrder]));

  console.log('');
  console.log('📦 Sample Purchase Order Created:');
  console.log(`   Order Number: ${purchaseOrder.orderNumber}`);
  console.log(`   Supplier: ${purchaseOrder.supplierName}`);
  console.log(`   Status: ${purchaseOrder.status.toUpperCase()} (Ready for receiving)`);
  console.log(`   Total Value: ${purchaseOrder.totalValue.toLocaleString()} UGX`);
  console.log(`   Items: ${purchaseOrder.items.length}`);
  
  purchaseOrder.items.forEach((item, index) => {
    console.log(`     ${index + 1}. ${item.productName}: ${item.quantityOrdered} units @ ${item.unitCost.toLocaleString()} UGX`);
  });

  console.log('');
  console.log('🎯 Next Steps:');
  console.log('   1. Open your browser to https://localhost:5174');
  console.log('   2. Navigate to: Inventory Management → Receiving tab');  
  console.log('   3. You should see the purchase order ready for receiving');
  console.log('   4. Click "Receive" to start the receiving process');
  console.log('');
  console.log('📋 Receiving Form Fields:');
  console.log('   - Supplier: ABC Distribution Ltd (auto-filled)');
  console.log('   - Received By: Enter your name');
  console.log('   - Received Date: 2025-10-06 (today)'); 
  console.log('   - Items: Adjust quantities received, add batch numbers, expiry dates');
  console.log('');

} catch (error) {
  console.error('❌ Error creating sample data:', error.message);
}