import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixMissingBatches() {
  try {
    console.log('Finding products with stock but no batches...\n');
    
    // Get all active products with currentStock > 0
    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        currentStock: { gt: 0 }
      },
      include: {
        stockBatches: {
          where: { quantityRemaining: { gt: 0 } }
        }
      }
    });
    
    console.log(`Found ${products.length} products with currentStock > 0\n`);
    
    const productsNeedingBatches = products.filter(p => p.stockBatches.length === 0);
    
    console.log(`${productsNeedingBatches.length} products need batch records created:\n`);
    
    if (productsNeedingBatches.length === 0) {
      console.log('✅ All products already have batches!');
      return;
    }
    
    for (const product of productsNeedingBatches) {
      console.log(`  - ${product.name}: ${product.currentStock} units (no batches)`);
    }
    
    console.log('\n📝 Creating missing batch records...\n');
    
    const now = new Date();
    let created = 0;
    
    for (const product of productsNeedingBatches) {
      // Create a single batch with all the current stock
      const batchNumber = `BATCH-FIX-${product.id.slice(-8)}-${Date.now()}`;
      const unitCost = product.costPrice || product.averageCost || product.lastCost || 0;
      
      await prisma.stockBatch.create({
        data: {
          productId: product.id,
          batchNumber: batchNumber,
          quantityReceived: product.currentStock,
          quantityRemaining: product.currentStock,
          unitCost: unitCost,
          receivedDate: now,
          expiryDate: null
        }
      });
      
      console.log(`  ✅ Created batch for ${product.name}: ${product.currentStock} units @ $${unitCost}/unit`);
      created++;
    }
    
    console.log(`\n✅ Successfully created ${created} batch records!`);
    console.log('\n🎉 All products now have proper batch records for FIFO.');
    
  } catch (error) {
    console.error('❌ Error fixing batches:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixMissingBatches();
