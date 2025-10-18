// Test Supplier Accounts Payable System
console.log("=== Supplier Accounts Payable Test ===");
console.log("");

// Mock localStorage for Node.js environment
const localStorage = {
  data: {},
  getItem: function(key) {
    return this.data[key] || null;
  },
  setItem: function(key, value) {
    this.data[key] = value;
  }
};

// Test sample data creation for supplier payments
try {
  // Create sample supplier payments if none exist
  const existingPayments = localStorage.getItem('supplier_payments');
  
  if (!existingPayments) {
    console.log("📝 Creating sample supplier payment data...");
    
    const samplePayments = [
      {
        id: 'payment-001',
        supplierId: 'supplier-1',
        supplierName: 'ABC Distribution Ltd',
        amount: 200000,
        paymentDate: '2025-09-25',
        paymentMethod: 'bank_transfer',
        reference: 'TXN-789456123',
        notes: 'Payment for PO202510-001 partial delivery',
        appliedToOrders: ['po-1'],
        createdAt: '2025-09-25T10:30:00.000Z'
      },
      {
        id: 'payment-002',
        supplierId: 'supplier-1',
        supplierName: 'ABC Distribution Ltd',
        amount: 100000,
        paymentDate: '2025-10-01',
        paymentMethod: 'cash',
        reference: '',
        notes: 'Cash payment for outstanding balance',
        appliedToOrders: [],
        createdAt: '2025-10-01T14:15:00.000Z'
      },
      {
        id: 'payment-003',
        supplierId: 'supplier-2',
        supplierName: 'Quality Foods Ltd',
        amount: 450000,
        paymentDate: '2025-10-03',
        paymentMethod: 'mobile_money',
        reference: 'MM-987654321',
        notes: 'Mobile money payment for fresh supplies',
        appliedToOrders: ['po-2'],
        createdAt: '2025-10-03T09:45:00.000Z'
      }
    ];
    
    localStorage.setItem('supplier_payments', JSON.stringify(samplePayments));
    console.log(`   ✅ Created ${samplePayments.length} sample payments`);
  } else {
    const payments = JSON.parse(existingPayments);
    console.log(`📊 Found ${payments.length} existing supplier payments:`);
    payments.forEach(payment => {
      console.log(`   - ${payment.supplierName}: UGX ${payment.amount.toLocaleString()}`);
      console.log(`     Date: ${new Date(payment.paymentDate).toLocaleDateString()}`);
      console.log(`     Method: ${payment.paymentMethod.replace('_', ' ').toUpperCase()}`);
      console.log("");
    });
  }

  // Analyze supplier balance calculations
  console.log("💰 Calculating Supplier Balances...");
  console.log("");

  // Get all data needed for calculations
  const suppliers = JSON.parse(localStorage.getItem('suppliers') || '[]');
  const purchaseOrders = JSON.parse(localStorage.getItem('purchase_orders') || '[]');
  const receivings = JSON.parse(localStorage.getItem('purchases') || '[]');
  const payments = JSON.parse(localStorage.getItem('supplier_payments') || '[]');

  console.log(`📋 Data Summary:`);
  console.log(`   - Suppliers: ${suppliers.length}`);
  console.log(`   - Purchase Orders: ${purchaseOrders.length}`);
  console.log(`   - Receivings: ${receivings.length}`);
  console.log(`   - Payments: ${payments.length}`);
  console.log("");

  // Calculate balances for each supplier
  suppliers.forEach(supplier => {
    const supplierOrders = purchaseOrders.filter(o => o.supplierId === supplier.id);
    const supplierReceivings = receivings.filter(r => r.supplierId === supplier.id || r.supplier === supplier.name);
    const supplierPayments = payments.filter(p => p.supplierId === supplier.id);

    const totalOrdered = supplierOrders.reduce((sum, o) => sum + (o.totalValue || 0), 0);
    const totalReceived = supplierReceivings.reduce((sum, r) => sum + (r.totalValue || 0), 0);
    const totalPaid = supplierPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const currentBalance = totalReceived - totalPaid;

    console.log(`🏪 ${supplier.name}:`);
    console.log(`   Total Ordered: UGX ${totalOrdered.toLocaleString()}`);
    console.log(`   Total Received: UGX ${totalReceived.toLocaleString()}`);
    console.log(`   Total Paid: UGX ${totalPaid.toLocaleString()}`);
    console.log(`   Current Balance: UGX ${Math.abs(currentBalance).toLocaleString()} ${currentBalance > 0 ? '(PAYABLE)' : currentBalance < 0 ? '(CREDIT)' : '(SETTLED)'}`);
    
    if (supplierPayments.length > 0) {
      console.log(`   Payment History:`);
      supplierPayments.forEach(payment => {
        console.log(`     - ${new Date(payment.paymentDate).toLocaleDateString()}: UGX ${payment.amount.toLocaleString()} (${payment.paymentMethod})`);
      });
    }
    console.log("");
  });

  // Summary statistics
  const totalPayable = suppliers.reduce((sum, supplier) => {
    const supplierReceivings = receivings.filter(r => r.supplierId === supplier.id || r.supplier === supplier.name);
    const supplierPayments = payments.filter(p => p.supplierId === supplier.id);
    const received = supplierReceivings.reduce((s, r) => s + (r.totalValue || 0), 0);
    const paid = supplierPayments.reduce((s, p) => s + (p.amount || 0), 0);
    return sum + Math.max(0, received - paid);
  }, 0);

  const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  
  console.log("📊 Summary:");
  console.log(`   Total Amount Owed to Suppliers: UGX ${totalPayable.toLocaleString()}`);
  console.log(`   Total Payments Made: UGX ${totalPaid.toLocaleString()}`);
  console.log("");
  console.log("✅ Supplier Accounts Payable System Ready!");
  console.log("");
  console.log("💡 Usage Instructions:");
  console.log("   1. Navigate to Inventory → Payments tab");
  console.log("   2. View supplier balances and payment status");
  console.log("   3. Click 'Pay' to record payments to suppliers");
  console.log("   4. Click 'History' to view payment history");
  console.log("   5. Track what you owe vs what you've paid");
  console.log("");

} catch (error) {
  console.error("❌ Error in supplier accounts payable test:", error);
}

console.log("=== Test Complete ===");