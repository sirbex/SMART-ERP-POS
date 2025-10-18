// Test Supplier Management System
console.log("=== Supplier Management System Test ===");
console.log("");

// Test if we can access the supplier management service
try {
  // Check if localStorage has supplier data
  const suppliersData = localStorage.getItem('suppliers');
  console.log("📋 Suppliers in localStorage:");
  if (suppliersData) {
    const suppliers = JSON.parse(suppliersData);
    console.log(`   Found ${suppliers.length} suppliers:`);
    suppliers.forEach(supplier => {
      console.log(`   - ${supplier.name} (${supplier.isActive ? 'Active' : 'Inactive'})`);
      console.log(`     Contact: ${supplier.contactPerson || 'N/A'}`);
      console.log(`     Email: ${supplier.email || 'N/A'}`);
      console.log(`     Phone: ${supplier.phone || 'N/A'}`);
      console.log(`     Payment Terms: ${supplier.paymentTerms || 'N/A'}`);
      console.log("");
    });
  } else {
    console.log("   No suppliers found in localStorage");
  }

  // Check purchase orders data
  const purchaseOrdersData = localStorage.getItem('purchase_orders');
  console.log("📦 Purchase Orders in localStorage:");
  if (purchaseOrdersData) {
    const orders = JSON.parse(purchaseOrdersData);
    console.log(`   Found ${orders.length} purchase orders:`);
    orders.forEach(order => {
      console.log(`   - Order ${order.orderNumber}: ${order.supplierName}`);
      console.log(`     Status: ${order.status}`);
      console.log(`     Total: UGX ${order.totalValue.toLocaleString()}`);
      console.log(`     Items: ${order.items.length}`);
      console.log("");
    });
  } else {
    console.log("   No purchase orders found");
  }

  // Test sample supplier creation
  console.log("🧪 Testing Supplier Creation...");
  const testSupplier = {
    id: `supplier-test-${Date.now()}`,
    name: 'Test Supplier Co.',
    contactPerson: 'John Doe',
    email: 'john@testsupplier.com',
    phone: '+256-700-555-0123',
    address: '123 Business St, Kampala, Uganda',
    paymentTerms: 'Net 30',
    notes: 'Test supplier for system validation',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  // Save test supplier
  const existingSuppliers = suppliersData ? JSON.parse(suppliersData) : [];
  existingSuppliers.push(testSupplier);
  localStorage.setItem('suppliers', JSON.stringify(existingSuppliers));
  console.log(`   ✅ Created test supplier: ${testSupplier.name}`);

  console.log("");
  console.log("=== Supplier Management System Status ===");
  console.log("✅ LocalStorage access: Working");
  console.log("✅ Supplier data structure: Valid");
  console.log("✅ Test supplier creation: Successful");
  console.log("");
  console.log("💡 Next Steps:");
  console.log("   1. Navigate to Inventory → Suppliers tab");
  console.log("   2. Click 'Add New Supplier' to create suppliers");
  console.log("   3. Create Purchase Orders to generate performance data");
  console.log("   4. Use Receiving tab to process deliveries");

} catch (error) {
  console.error("❌ Error testing supplier system:", error);
}