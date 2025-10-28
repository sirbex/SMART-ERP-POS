import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testCheckStockLogic() {
  try {
    console.log('Testing check-stock logic...\n');
    
    // Get a few products
    const products = await prisma.product.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        currentStock: true,
        reorderLevel: true
      },
      take: 5
    });
    
    console.log(`Found ${products.length} active products\n`);
    
    for (const product of products) {
      console.log(`Product: ${product.name} (ID: ${product.id})`);
      console.log(`  currentStock: ${product.currentStock}`);
      
      // Check batch availability
      const batchAgg = await prisma.stockBatch.aggregate({
        where: { productId: product.id, quantityRemaining: { gt: 0 } },
        _sum: { quantityRemaining: true }
      });
      
      const availableFromBatches = batchAgg._sum.quantityRemaining
        ? Number(batchAgg._sum.quantityRemaining.toString())
        : 0;
      
      const availableFromProduct = product.currentStock
        ? Number(product.currentStock.toString())
        : 0;
      
      const available = Math.max(availableFromBatches, availableFromProduct);
      
      console.log(`  Batch availability: ${availableFromBatches}`);
      console.log(`  Product availability: ${availableFromProduct}`);
      console.log(`  Final availability: ${available}`);
      console.log('');
    }
    
  } catch (error) {
    console.error('Error testing check-stock:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testCheckStockLogic();
