import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkStockStatus() {
  try {
    const products = await prisma.product.findMany({
      where: { isActive: true },
      include: { 
        stockBatches: {
          orderBy: { receivedDate: 'asc' }
        }
      },
      orderBy: { name: 'asc' }
    });

    console.log('\n📦 Active Products Stock Status:\n');
    
    products.forEach(p => {
      const totalBatchStock = p.stockBatches.reduce((sum, b) => sum + Number(b.quantityRemaining || 0), 0);
      
      console.log(`${p.name} (${p.id}):`);
      console.log(`  currentStock: ${p.currentStock}`);
      console.log(`  Batches: ${p.stockBatches.length} (Total: ${totalBatchStock})`);
      
      if (p.stockBatches.length > 0) {
        p.stockBatches.forEach(b => {
          console.log(`    - ${b.batchNumber}: ${b.quantityRemaining} remaining @ $${b.unitCost}`);
        });
      } else {
        console.log(`    ⚠️  NO BATCHES!`);
      }
      console.log('');
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkStockStatus();
