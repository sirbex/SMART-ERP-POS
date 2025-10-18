/**
 * Sync Supplier Data - Load backend data into frontend localStorage
 */

async function syncSupplierData() {
    console.log('🔄 Starting supplier data sync...\n');

    try {
        // Fetch data from backend API
        console.log('📡 Fetching data from backend...');
        const response = await fetch('http://localhost:3001/api/purchase-workflow/orders');
        
        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }

        const data = await response.json();
        const orders = data.orders || [];
        
        console.log(`✅ Found ${orders.length} purchase orders in backend\n`);

        if (orders.length === 0) {
            console.log('⚠️  No orders found in backend. Creating sample data...\n');
            
            // Create sample purchase orders
            const sampleOrders = [
                {
                    id: 'po-sample-001',
                    orderNumber: 'PO202410-001',
                    supplierId: 'supplier-001',
                    supplierName: 'Fresh Foods Ltd',
                    items: [
                        { productId: 'prod-001', productName: 'Coffee Beans', quantity: 50, unitCost: 15000 },
                        { productId: 'prod-002', productName: 'Sugar', quantity: 25, unitCost: 8500 }
                    ],
                    status: 'RECEIVED',
                    totalAmount: 962500,
                    orderDate: new Date().toISOString(),
                    expectedDelivery: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                    actualDelivery: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
                },
                {
                    id: 'po-sample-002',
                    orderNumber: 'PO202410-002', 
                    supplierId: 'supplier-001',
                    supplierName: 'Fresh Foods Ltd',
                    items: [
                        { productId: 'prod-003', productName: 'Rice', quantity: 100, unitCost: 5000 }
                    ],
                    status: 'RECEIVED',
                    totalAmount: 500000,
                    orderDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
                    expectedDelivery: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
                    actualDelivery: new Date().toISOString()
                }
            ];

            // Store in localStorage
            localStorage.setItem('purchase_orders', JSON.stringify(sampleOrders));
            console.log('✅ Sample purchase orders created in localStorage');

            // Create supplier data
            const suppliers = [
                {
                    id: 'supplier-001',
                    name: 'Fresh Foods Ltd',
                    contact: '+256 700 123456',
                    email: 'orders@freshfoods.ug',
                    address: 'Industrial Area, Kampala',
                    paymentTerms: 'NET 30',
                    status: 'ACTIVE'
                }
            ];

            localStorage.setItem('suppliers', JSON.stringify(suppliers));
            console.log('✅ Sample suppliers created in localStorage');

        } else {
            // Sync existing orders to localStorage
            localStorage.setItem('purchase_orders', JSON.stringify(orders));
            console.log('✅ Purchase orders synced to localStorage');
        }

        console.log('\n📊 Current localStorage Data:');
        console.log('Purchase Orders:', JSON.parse(localStorage.getItem('purchase_orders') || '[]').length);
        console.log('Suppliers:', JSON.parse(localStorage.getItem('suppliers') || '[]').length);

        console.log('\n🎉 Sync complete! Refresh your browser to see updated supplier metrics.');

    } catch (error) {
        console.error('❌ Sync failed:', error.message);
        console.log('\n💡 Make sure the backend server is running on http://localhost:3001');
    }
}

// Run in browser context if available
if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    syncSupplierData();
} else {
    console.log('⚠️  This script needs to run in a browser context with localStorage access');
    console.log('📋 To fix the 0 orders issue:');
    console.log('1. Open your browser to https://localhost:5173');
    console.log('2. Open Developer Tools (F12)');
    console.log('3. Go to Console tab');
    console.log('4. Paste and run this script');
}

module.exports = { syncSupplierData };