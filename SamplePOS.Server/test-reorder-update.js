// Test reorder point update
import { PrismaClient } from '@prisma/client';
import { ProductHistoryService } from './src/services/productHistoryService.js';

const prisma = new PrismaClient();

async function testReorderPointUpdate() {
  try {
    // Get MINUTE MAID product
    const product = await prisma.product.findFirst({
      where: { name: { contains: 'MINUTE MAID', mode: 'insensitive' } }
    });
    
    if (!product) {
      console.log('❌ MINUTE MAID product not found');
      return;
    }
    
    console.log(`\n📊 Testing reorder point update for: ${product.name}`);
    console.log(`Current reorder level: ${product.reorderLevel}`);
    
    // Update the reorder point
    const newReorderPoint = 25;
    console.log(`\n🔄 Updating reorder point to: ${newReorderPoint}`);
    
    const updatedProduct = await prisma.product.update({
      where: { id: product.id },
      data: { reorderLevel: newReorderPoint }
    });
    
    console.log(`✅ Product updated! New reorder level: ${updatedProduct.reorderLevel}`);
    
    // Wait a moment for the timestamp to be different
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Check history
    console.log(`\n📋 Checking product history...`);
    const history = await ProductHistoryService.getProductHistory(product.id);
    
    console.log(`Events found: ${history.events.length}`);
    
    // Find update events
    const updateEvents = history.events.filter(e => e.type === 'UPDATED');
    console.log(`Update events: ${updateEvents.length}`);
    
    if (updateEvents.length > 0) {
      const latestUpdate = updateEvents[0];
      console.log(`\n📝 Latest update event:`);
      console.log(`- Title: ${latestUpdate.title}`);
      console.log(`- Time: ${new Date(latestUpdate.occurredAt).toLocaleString()}`);
      console.log(`- Reorder level in metadata: ${latestUpdate.metadata?.currentReorderLevel}`);
    }
    
    console.log('\n✅ Test completed!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

testReorderPointUpdate();