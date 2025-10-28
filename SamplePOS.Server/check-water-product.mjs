import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkProduct() {
  try {
    const product = await prisma.product.findFirst({
      where: {
        name: {
          contains: 'water',
          mode: 'insensitive'
        }
      }
    });
    
    console.log('=== Product ===');
    console.log(JSON.stringify(product, null, 2));
    
    if (product) {
      console.log('\n=== StockBatches for this product ===');
      const batches = await prisma.stockBatch.findMany({
        where: { productId: product.id },
        orderBy: { createdAt: 'desc' }
      });
      console.log(JSON.stringify(batches, null, 2));

      console.log('\n=== GoodsReceiptItems for this product ===');
      const goodsReceipts = await prisma.goodsReceiptItem.findMany({
        where: { productId: product.id },
        include: {
          goodsReceipt: {
            include: {
              purchaseOrder: {
                include: {
                  supplier: true
                }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
      console.log(JSON.stringify(goodsReceipts, null, 2));
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkProduct();
