/**
 * Partial Orders Demo - Understanding How SamplePOS Handles Partial Deliveries
 * 
 * This demonstrates the complete lifecycle of partial order receiving
 */

console.log('🚚 PARTIAL ORDERS MANAGEMENT DEMO');
console.log('=================================\n');

// Simulate a purchase order
const originalOrder = {
    id: 'po-demo-001',
    orderNumber: 'PO202410-DEMO',
    supplierId: 'supplier-001',
    supplierName: 'Fresh Foods Ltd',
    items: [
        { productId: 'prod-001', productName: 'Coffee Beans', quantityOrdered: 100, unitCost: 15000 },
        { productId: 'prod-002', productName: 'Sugar', quantityOrdered: 50, unitCost: 8500 },
        { productId: 'prod-003', productName: 'Rice', quantityOrdered: 200, unitCost: 5000 }
    ],
    status: 'confirmed',
    totalValue: 2425000, // 100*15000 + 50*8500 + 200*5000
    orderDate: '2025-10-06'
};

console.log('📋 ORIGINAL PURCHASE ORDER:');
console.log('Order Number:', originalOrder.orderNumber);
console.log('Status:', originalOrder.status);
console.log('Items Ordered:');
originalOrder.items.forEach(item => {
    console.log(`  - ${item.productName}: ${item.quantityOrdered} units @ ${item.unitCost.toLocaleString()} UGX`);
});
console.log(`Total Value: ${originalOrder.totalValue.toLocaleString()} UGX`);
console.log('');

// Scenario 1: First Partial Delivery
console.log('🚛 SCENARIO 1: FIRST PARTIAL DELIVERY');
console.log('=====================================');

const firstDelivery = {
    deliveryDate: '2025-10-08',
    itemsReceived: [
        { productId: 'prod-001', productName: 'Coffee Beans', quantityReceived: 60, batchNumber: 'COF20251008' },
        { productId: 'prod-002', productName: 'Sugar', quantityReceived: 50, batchNumber: 'SUG20251008' }
        // Note: Rice not delivered yet
    ]
};

console.log('Items Received:');
firstDelivery.itemsReceived.forEach(item => {
    const ordered = originalOrder.items.find(i => i.productId === item.productId)?.quantityOrdered || 0;
    const percentage = ((item.quantityReceived / ordered) * 100).toFixed(1);
    console.log(`  ✅ ${item.productName}: ${item.quantityReceived}/${ordered} units (${percentage}%)`);
});

console.log('Items Still Pending:');
originalOrder.items.forEach(orderItem => {
    const received = firstDelivery.itemsReceived.find(r => r.productId === orderItem.productId);
    if (!received) {
        console.log(`  ⏳ ${orderItem.productName}: 0/${orderItem.quantityOrdered} units (0%)`);
    } else if (received.quantityReceived < orderItem.quantityOrdered) {
        const pending = orderItem.quantityOrdered - received.quantityReceived;
        console.log(`  ⏳ ${orderItem.productName}: ${pending} units still pending`);
    }
});

console.log('\n📊 ORDER STATUS AFTER FIRST DELIVERY:');
console.log('Status: PARTIAL (some items received, some pending)');
console.log('Progress:');
const totalOrdered = originalOrder.items.reduce((sum, item) => sum + item.quantityOrdered, 0);
const totalReceived = firstDelivery.itemsReceived.reduce((sum, item) => sum + item.quantityReceived, 0);
const progressPercentage = ((totalReceived / totalOrdered) * 100).toFixed(1);
console.log(`  Overall: ${totalReceived}/${totalOrdered} units (${progressPercentage}%)`);
console.log('');

// Scenario 2: Second Partial Delivery
console.log('🚛 SCENARIO 2: SECOND PARTIAL DELIVERY');
console.log('======================================');

const secondDelivery = {
    deliveryDate: '2025-10-10',
    itemsReceived: [
        { productId: 'prod-001', productName: 'Coffee Beans', quantityReceived: 30, batchNumber: 'COF20251010' },
        { productId: 'prod-003', productName: 'Rice', quantityReceived: 120, batchNumber: 'RIC20251010' }
    ]
};

console.log('Second Delivery Items:');
secondDelivery.itemsReceived.forEach(item => {
    console.log(`  ✅ ${item.productName}: ${item.quantityReceived} units (Batch: ${item.batchNumber})`);
});

console.log('\n📊 CUMULATIVE STATUS AFTER SECOND DELIVERY:');
const cumulativeReceived = {};
[...firstDelivery.itemsReceived, ...secondDelivery.itemsReceived].forEach(item => {
    cumulativeReceived[item.productId] = (cumulativeReceived[item.productId] || 0) + item.quantityReceived;
});

console.log('Cumulative Progress:');
originalOrder.items.forEach(orderItem => {
    const received = cumulativeReceived[orderItem.productId] || 0;
    const percentage = ((received / orderItem.quantityOrdered) * 100).toFixed(1);
    const status = received >= orderItem.quantityOrdered ? '✅ COMPLETE' : '⏳ PARTIAL';
    console.log(`  ${orderItem.productName}: ${received}/${orderItem.quantityOrdered} units (${percentage}%) ${status}`);
});

const totalCumulativeReceived = Object.values(cumulativeReceived).reduce((sum, qty) => sum + qty, 0);
const overallProgress = ((totalCumulativeReceived / totalOrdered) * 100).toFixed(1);
console.log(`\nOverall Progress: ${totalCumulativeReceived}/${totalOrdered} units (${overallProgress}%)`);

const isFullyReceived = originalOrder.items.every(item => 
    (cumulativeReceived[item.productId] || 0) >= item.quantityOrdered
);

console.log(`Order Status: ${isFullyReceived ? 'RECEIVED (Complete)' : 'PARTIAL (Still pending items)'}`);
console.log('');

// Scenario 3: Final Delivery
console.log('🚛 SCENARIO 3: FINAL DELIVERY');
console.log('=============================');

const finalDelivery = {
    deliveryDate: '2025-10-12',
    itemsReceived: [
        { productId: 'prod-001', productName: 'Coffee Beans', quantityReceived: 10, batchNumber: 'COF20251012' },
        { productId: 'prod-003', productName: 'Rice', quantityReceived: 80, batchNumber: 'RIC20251012' }
    ]
};

console.log('Final Delivery Items:');
finalDelivery.itemsReceived.forEach(item => {
    console.log(`  ✅ ${item.productName}: ${item.quantityReceived} units (Batch: ${item.batchNumber})`);
});

// Calculate final status
const finalCumulative = {};
[...firstDelivery.itemsReceived, ...secondDelivery.itemsReceived, ...finalDelivery.itemsReceived]
    .forEach(item => {
        finalCumulative[item.productId] = (finalCumulative[item.productId] || 0) + item.quantityReceived;
    });

console.log('\n📊 FINAL STATUS:');
console.log('Final Progress:');
originalOrder.items.forEach(orderItem => {
    const received = finalCumulative[orderItem.productId] || 0;
    const percentage = ((received / orderItem.quantityOrdered) * 100).toFixed(1);
    const status = received >= orderItem.quantityOrdered ? '✅ COMPLETE' : '❌ SHORT';
    console.log(`  ${orderItem.productName}: ${received}/${orderItem.quantityOrdered} units (${percentage}%) ${status}`);
});

const finalIsComplete = originalOrder.items.every(item => 
    (finalCumulative[item.productId] || 0) >= item.quantityOrdered
);

console.log(`\n🎉 FINAL ORDER STATUS: ${finalIsComplete ? 'RECEIVED (All items complete)' : 'PARTIAL (Some shortages remain)'}`);
console.log('');

console.log('🏭 INVENTORY IMPACT:');
console.log('===================');
console.log('Multiple Batches Created:');

// Show all batches created from partial deliveries
const allBatches = [
    ...firstDelivery.itemsReceived.map(item => ({...item, deliveryDate: firstDelivery.deliveryDate})),
    ...secondDelivery.itemsReceived.map(item => ({...item, deliveryDate: secondDelivery.deliveryDate})),
    ...finalDelivery.itemsReceived.map(item => ({...item, deliveryDate: finalDelivery.deliveryDate}))
];

const batchesByProduct = {};
allBatches.forEach(batch => {
    if (!batchesByProduct[batch.productName]) {
        batchesByProduct[batch.productName] = [];
    }
    batchesByProduct[batch.productName].push(batch);
});

Object.entries(batchesByProduct).forEach(([productName, batches]) => {
    console.log(`\n${productName}:`);
    batches.forEach((batch, index) => {
        console.log(`  Batch ${index + 1}: ${batch.batchNumber} - ${batch.quantityReceived} units (${batch.deliveryDate})`);
    });
    const totalQty = batches.reduce((sum, batch) => sum + batch.quantityReceived, 0);
    console.log(`  Total: ${totalQty} units across ${batches.length} batches`);
});

console.log('\n📝 KEY POINTS ABOUT PARTIAL ORDERS:');
console.log('===================================');
console.log('✅ Orders can be received in multiple deliveries');
console.log('✅ Each delivery creates separate inventory batches');
console.log('✅ Order status changes to PARTIAL after first incomplete delivery');
console.log('✅ Order status changes to RECEIVED when all items are complete');
console.log('✅ You can track progress for each item individually');
console.log('✅ FIFO (First In, First Out) applies to each batch separately');
console.log('✅ Each batch maintains its own expiry dates and batch numbers');
console.log('✅ Inventory movements are recorded for each partial delivery');
console.log('✅ System prevents over-receiving (can\'t receive more than ordered)');
console.log('✅ Partial orders remain available for receiving until complete');

module.exports = { 
    demonstratePartialOrders: () => console.log('Demo complete!') 
};