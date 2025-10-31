const { PrismaClient, Prisma } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixExistingSalesStock() {
  console.log('🔧 Starting to fix stock for existing sales...\n');

  try {
    // Get all completed sales that haven't had their stock deducted yet
    const sales = await prisma.sale.findMany({
      where: {
        status: 'COMPLETED'
      },
      include: {
        items: {
          include: {
            product: {
              include: {
                stockBatches: {
                  where: { quantityRemaining: { gt: 0 } },
                  orderBy: { receivedDate: 'asc' }
                }
              }
            }
          }
        }
      },
      orderBy: {
        saleDate: 'asc' // Process oldest sales first
      }
    });

    console.log(`📦 Found ${sales.length} completed sales to process\n`);

    let successCount = 0;
    let errorCount = 0;

    for (const sale of sales) {
      console.log(`\n📝 Processing Sale: ${sale.saleNumber} (${sale.saleDate.toISOString()})`);
      
      try {
        await prisma.$transaction(async (tx) => {
          for (const item of sale.items) {
            console.log(`  - Item: ${item.product.name}, Quantity: ${item.quantityInBase}`);
            
            // Get fresh stock batches for FIFO calculation
            const stockBatches = await tx.stockBatch.findMany({
              where: { 
                productId: item.productId,
                quantityRemaining: { gt: 0 }
              },
              orderBy: { receivedDate: 'asc' }
            });

            if (stockBatches.length === 0) {
              console.log(`    ⚠️  No stock batches available for ${item.product.name}`);
              continue;
            }

            // Calculate FIFO allocation
            let remainingQty = new Prisma.Decimal(item.quantityInBase);
            const allocations = [];

            for (const batch of stockBatches) {
              if (remainingQty.lte(0)) break;

              const allocatedQty = Prisma.Decimal.min(remainingQty, batch.quantityRemaining);
              allocations.push({
                batchId: batch.id,
                quantity: allocatedQty,
                batchNumber: batch.batchNumber
              });

              remainingQty = remainingQty.sub(allocatedQty);
            }

            if (remainingQty.gt(0)) {
              console.log(`    ⚠️  Insufficient stock for ${item.product.name}. Short by: ${remainingQty}`);
              console.log(`    ℹ️  Skipping this sale to prevent negative stock`);
              throw new Error(`Insufficient stock for ${item.product.name}`);
            }

            // Get current stock before update
            const productBefore = await tx.product.findUnique({
              where: { id: item.productId },
              select: { currentStock: true }
            });
            const beforeQty = productBefore?.currentStock || new Prisma.Decimal(0);
            const afterQty = beforeQty.sub(item.quantityInBase);

            // Deduct from batches and create stock movements
            for (let i = 0; i < allocations.length; i++) {
              const allocation = allocations[i];
              
              // Update batch
              await tx.stockBatch.update({
                where: { id: allocation.batchId },
                data: {
                  quantityRemaining: {
                    decrement: allocation.quantity
                  }
                }
              });

              // Create stock movement for audit trail
              const movementNumber = `SM-FIX-${sale.saleNumber}-${i}`;
              await tx.stockMovement.create({
                data: {
                  movementNumber,
                  productId: item.productId,
                  batchId: allocation.batchId,
                  movementType: 'OUT',
                  quantity: allocation.quantity,
                  beforeQuantity: beforeQty,
                  afterQuantity: afterQty,
                  performedById: sale.createdById,
                  reference: sale.saleNumber,
                  reason: 'Retroactive stock deduction for completed sale',
                  notes: `Fixed stock for sale item: ${item.product.name} (Batch: ${allocation.batchNumber})`,
                }
              });

              console.log(`    ✅ Deducted ${allocation.quantity} from batch ${allocation.batchNumber}`);
            }

            // Update product's current stock
            await tx.product.update({
              where: { id: item.productId },
              data: {
                currentStock: {
                  decrement: item.quantityInBase
                }
              }
            });

            console.log(`    ✅ Updated product stock: ${beforeQty} → ${afterQty}`);
          }
        });

        successCount++;
        console.log(`✅ Successfully processed sale ${sale.saleNumber}`);
        
      } catch (error) {
        errorCount++;
        console.log(`❌ Error processing sale ${sale.saleNumber}: ${error.message}`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log(`\n🎉 Stock Fix Complete!`);
    console.log(`   ✅ Successfully processed: ${successCount} sales`);
    console.log(`   ❌ Errors: ${errorCount} sales`);
    console.log('\n' + '='.repeat(60));

    // Show final stock summary
    console.log('\n📊 Current Stock Summary:\n');
    const products = await prisma.product.findMany({
      select: {
        name: true,
        currentStock: true,
        baseUnit: true
      },
      orderBy: { name: 'asc' }
    });

    for (const product of products) {
      console.log(`   ${product.name}: ${product.currentStock} ${product.baseUnit}`);
    }

  } catch (error) {
    console.error('\n❌ Fatal error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the fix
fixExistingSalesStock();
