import { ProductHistoryService } from './dist/services/productHistoryService.js';

async function testHistoryService() {
  try {
    const productId = 'cmgyw8h190000tjdccquetg0l'; // MINUTE MAID ID
    
    console.log(`🔍 Testing history service for product: ${productId}`);
    
    const history = await ProductHistoryService.getProductHistory(productId);
    
    console.log('\n📊 Service Response:');
    console.log(`- Events: ${history.events.length}`);
    console.log(`- Cost History: ${history.costHistory.length}`);
    console.log(`- Batch Receipts: ${history.batchReceipts.length}`);
    
    if (history.events.length > 0) {
      console.log('\n📝 Recent Events:');
      history.events.slice(0, 3).forEach(event => {
        console.log(`  - ${event.type}: ${event.description}`);
      });
    }
    
    if (history.batchReceipts.length > 0) {
      console.log('\n📦 Batch Receipts:');
      history.batchReceipts.slice(0, 3).forEach(batch => {
        console.log(`  - ${batch.batchNumber}: ${batch.quantityReceived} received, ${batch.quantityRemaining} remaining @ $${batch.unitCost}`);
      });
    }
    
    if (history.costHistory.length > 0) {
      console.log('\n💰 Cost History:');
      history.costHistory.slice(0, 3).forEach(cost => {
        console.log(`  - ${cost.date}: $${cost.cost} for ${cost.quantity} units (Batch: ${cost.batchNumber})`);
      });
    }
    
    console.log('\n✅ Service test completed successfully!');
    
  } catch (error) {
    console.error('❌ Service Error:', error.message);
    console.error(error.stack);
  }
}

testHistoryService();