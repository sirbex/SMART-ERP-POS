import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkMinuteMaidData() {
  try {
    // Find MINUTE MAID product
    const product = await prisma.product.findFirst({
      where: { 
        name: { contains: 'MINUTE MAID', mode: 'insensitive' }
      }
    });
    
    if (!product) {
      console.log('❌ MINUTE MAID product not found');
      
      // Show available products
      const allProducts = await prisma.product.findMany({
        select: { id: true, name: true },
        take: 5
      });
      console.log('Available products:', allProducts.map(p => p.name));
      return;
    }
    
    console.log(`✅ Found product: ${product.name} (ID: ${product.id})`);
    
    // Check for related data
    const [stockBatches, saleItems, goodsReceiptItems, stockMovements] = await Promise.all([
      prisma.stockBatch.findMany({ 
        where: { productId: product.id },
        select: { id: true, batchNumber: true, quantityReceived: true, unitCost: true, receivedDate: true }
      }),
      prisma.saleItem.findMany({ 
        where: { productId: product.id },
        take: 3,
        select: { id: true, quantity: true, unitPrice: true, sale: { select: { saleDate: true, saleNumber: true } } }
      }),
      prisma.goodsReceiptItem.findMany({ 
        where: { productId: product.id },
        select: { id: true, receivedQuantity: true, actualCost: true, batchNumber: true }
      }),
      prisma.stockMovement.findMany({ 
        where: { productId: product.id },
        take: 3,
        select: { id: true, movementType: true, quantity: true, createdAt: true }
      })
    ]);
    
    console.log('\n📊 Data Summary:');
    console.log(`- Stock Batches: ${stockBatches.length}`);
    console.log(`- Sale Items: ${saleItems.length}`);  
    console.log(`- Goods Receipt Items: ${goodsReceiptItems.length}`);
    console.log(`- Stock Movements: ${stockMovements.length}`);
    
    if (stockBatches.length > 0) {
      console.log('\n📦 Stock Batches:');
      stockBatches.forEach(batch => {
        console.log(`  - ${batch.batchNumber}: ${batch.quantityReceived} units @ $${batch.unitCost} (${batch.receivedDate})`);
      });
    }
    
    if (saleItems.length > 0) {
      console.log('\n💰 Recent Sales:');
      saleItems.forEach(sale => {
        console.log(`  - ${sale.quantity} units @ $${sale.unitPrice} (${sale.sale.saleDate})`);
      });
    }
    
    // If no data, let's create some sample data
    if (stockBatches.length === 0 && saleItems.length === 0) {
      console.log('\n🔧 No historical data found. Consider adding sample data for testing.');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkMinuteMaidData();