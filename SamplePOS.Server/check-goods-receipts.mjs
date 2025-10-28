import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkGoodsReceipts() {
  try {
    const goodsReceipts = await prisma.goodsReceipt.findMany({
      include: {
        purchaseOrder: {
          include: {
            supplier: true
          }
        },
        items: {
          include: {
            product: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 5
    });
    
    console.log('=== Recent GoodsReceipts ===');
    console.log(JSON.stringify(goodsReceipts, null, 2));
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkGoodsReceipts();
