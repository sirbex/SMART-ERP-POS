import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkBatches() {
  try {
    console.log('=== Checking GoodsReceiptItems (Batch d-435) ===');
    const goodsReceipt435 = await prisma.goodsReceiptItem.findMany({
      where: { batchNumber: 'd-435' },
      include: {
        goodsReceipt: {
          include: {
            purchaseOrder: {
              include: {
                supplier: true
              }
            }
          }
        },
        product: {
          select: { name: true, barcode: true }
        }
      }
    });
    console.log('GoodsReceiptItem d-435:', JSON.stringify(goodsReceipt435, null, 2));

    console.log('\n=== Checking GoodsReceiptItems (Batch 4594) ===');
    const goodsReceipt4594 = await prisma.goodsReceiptItem.findMany({
      where: { batchNumber: '4594' },
      include: {
        goodsReceipt: {
          include: {
            purchaseOrder: {
              include: {
                supplier: true
              }
            }
          }
        },
        product: {
          select: { name: true, barcode: true }
        }
      }
    });
    console.log('GoodsReceiptItem 4594:', JSON.stringify(goodsReceipt4594, null, 2));

    console.log('\n=== Checking StockBatches ===');
    const stockBatches = await prisma.stockBatch.findMany({
      where: {
        OR: [
          { batchNumber: 'd-435' },
          { batchNumber: '4594' }
        ]
      }
    });
    console.log('StockBatches:', JSON.stringify(stockBatches, null, 2));

    console.log('\n=== Checking InventoryBatches ===');
    const inventoryBatches = await prisma.inventoryBatch.findMany({
      where: {
        OR: [
          { batchNumber: 'd-435' },
          { batchNumber: '4594' }
        ]
      }
    });
    console.log('InventoryBatches:', JSON.stringify(inventoryBatches, null, 2));

    console.log('\n=== Checking ALL GoodsReceiptItems (recent) ===');
    const allRecent = await prisma.goodsReceiptItem.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        goodsReceipt: {
          include: {
            purchaseOrder: {
              include: {
                supplier: true
              }
            }
          }
        },
        product: {
          select: { name: true, barcode: true }
        }
      }
    });
    console.log('Recent GoodsReceiptItems:', JSON.stringify(allRecent, null, 2));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkBatches();
