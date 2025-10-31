import prisma from '../config/database.js';
import logger from '../utils/logger.js';

export interface ProductHistoryEvent {
  id: string;
  productId: string;
  type: 'CREATED' | 'UPDATED' | 'STATUS_CHANGE' | 'PURCHASE_RECEIPT' | 'STOCK_ADJUSTMENT' | 'SALE' | 'BATCH_EXPIRY_ALERT';
  occurredAt: string; // ISO date string to match frontend
  title: string;
  description?: string;
  metadata?: Record<string, any>;
}

export interface ProductHistorySummary {
  totalQuantitySold: number;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  averageSellingPrice: number;
  averageCostPrice: number;
  profitMargin: number;
  currentStock: number;
  totalReceived: number;
  stockTurnover: number;
}

export interface ProductHistoryResponse {
  events: ProductHistoryEvent[];
  summary: ProductHistorySummary;
  costHistory: Array<{
    date: Date;
    cost: number;
    batchNumber?: string;
    quantity: number;
    expiryDate?: Date;
    supplier?: string;
    source: 'PURCHASE' | 'ADJUSTMENT';
  }>;
  batchReceipts: Array<{
    batchNumber: string;
    receivedDate: Date;
    quantityReceived: number;
    quantityRemaining: number;
    unitCost: number;
    expiryDate?: Date;
    totalCost: number;
  }>;
}

export class ProductHistoryService {
  static async getProductHistory(productId: string): Promise<ProductHistoryResponse> {
    try {
      // Get the product to ensure it exists
      const product = await prisma.product.findUnique({
        where: { id: productId },
      });

      if (!product) {
        throw new Error('Product not found');
      }

      // Fetch all related data in parallel for better performance
      const [
        saleItems,
        stockBatches,
        inventoryBatches,
        goodsReceiptItems,
        stockMovements,
        purchaseOrderItems,
      ] = await Promise.all([
        // Sales data
        prisma.saleItem.findMany({
          where: { productId },
          include: {
            sale: {
              include: {
                customer: { select: { name: true } },
                createdBy: { select: { fullName: true } },
              },
            },
            batch: true,
          },
          orderBy: { sale: { saleDate: 'desc' } },
        }),
        
        // Stock batches
        prisma.stockBatch.findMany({
          where: { productId },
          orderBy: { receivedDate: 'desc' },
        }),
        
        // Inventory batches (newer purchasing system)
        prisma.inventoryBatch.findMany({
          where: { productId },
          orderBy: { receivedDate: 'desc' },
        }),
        
        // Goods receipt items (purchases/receipts)
        prisma.goodsReceiptItem.findMany({
          where: { productId },
          include: {
            goodsReceipt: {
              include: {
                receivedBy: { select: { fullName: true } },
                purchaseOrder: {
                  include: {
                    supplier: { select: { name: true } },
                  },
                },
              },
            },
          },
          orderBy: { goodsReceipt: { receivedDate: 'desc' } },
        }),
        
        // Stock movements (adjustments)
        prisma.stockMovement.findMany({
          where: { productId },
          include: {
            performedBy: { select: { fullName: true } },
            batch: true,
          },
          orderBy: { createdAt: 'desc' },
        }),
        
        // Purchase order items (for cost history)
        prisma.purchaseOrderItem.findMany({
          where: { productId },
          include: {
            purchaseOrder: {
              include: {
                supplier: { select: { name: true } },
              },
            },
          },
          orderBy: { purchaseOrder: { orderDate: 'desc' } },
        }),
      ]);

      // Generate timeline events
      const events: ProductHistoryEvent[] = [];

      // Product creation event
      events.push({
        id: `created:${product.id}`,
        productId: product.id,
        type: 'CREATED',
        occurredAt: product.createdAt.toISOString(),
        title: `Product created`,
        description: `Product "${product.name}" was created`,
        metadata: {
          name: product.name,
          barcode: product.barcode,
          category: product.category,
          baseUnit: product.baseUnit,
          costPrice: product.costPrice.toNumber(),
          sellingPrice: product.sellingPrice.toNumber(),
        },
      });

      // Product updates (if updatedAt differs from createdAt)
      if (product.updatedAt.getTime() !== product.createdAt.getTime()) {
        events.push({
          id: `updated:${product.id}:${product.updatedAt.getTime()}`,
          productId: product.id,
          type: 'UPDATED',
          occurredAt: product.updatedAt.toISOString(),
          title: `Product updated`,
          description: `Product "${product.name}" was updated`,
          metadata: {
            name: product.name,
            barcode: product.barcode,
            category: product.category,
            currentCostPrice: product.costPrice.toNumber(),
            currentSellingPrice: product.sellingPrice.toNumber(),
            currentReorderLevel: product.reorderLevel.toNumber(),
            currentStock: product.currentStock.toNumber(),
            isActive: product.isActive,
            hasMultipleUnits: product.hasMultipleUnits,
            alternateUnit: product.alternateUnit,
            conversionFactor: product.conversionFactor?.toNumber(),
            taxRate: product.taxRate.toNumber(),
          },
        });
      }

      // Sale events
  saleItems.forEach((item: any) => {
        events.push({
          id: `sale:${item.id}`,
          productId: product.id,
          type: 'SALE',
          occurredAt: item.sale.saleDate.toISOString(),
          title: `Sale completed`,
          description: `Sold ${item.quantity} ${item.unit} for $${item.total} to ${item.sale.customer?.name || 'Walk-in Customer'}`,
          metadata: {
            quantity: item.quantity.toNumber(),
            unit: item.unit,
            unitPrice: item.unitPrice.toNumber(),
            total: item.total.toNumber(),
            profit: item.profit.toNumber(),
            customer: item.sale.customer?.name || 'Walk-in Customer',
            saleNumber: item.sale.saleNumber,
            batchNumber: item.batch?.batchNumber,
          },
        });
      });

      // Stock batch receipts
  stockBatches.forEach((batch: any) => {
        events.push({
          id: `receipt:${batch.id}`,
          productId: product.id,
          type: 'PURCHASE_RECEIPT',
          occurredAt: batch.receivedDate.toISOString(),
          title: `Stock received`,
          description: `Received ${batch.quantityReceived} units in batch ${batch.batchNumber} at $${batch.unitCost} per unit`,
          metadata: {
            quantity: batch.quantityReceived.toNumber(),
            quantityReceived: batch.quantityReceived.toNumber(),
            unitCost: batch.unitCost.toNumber(),
            batchNumber: batch.batchNumber,
            totalCost: batch.quantityReceived.toNumber() * batch.unitCost.toNumber(),
            expiryDate: batch.expiryDate,
          },
        });
      });

      // Goods receipt events
  goodsReceiptItems.forEach((item: any) => {
        events.push({
          id: `goods_receipt:${item.id}`,
          productId: product.id,
          type: 'PURCHASE_RECEIPT',
          occurredAt: item.goodsReceipt.receivedDate.toISOString(),
          title: `Goods received`,
          description: `Received ${item.receivedQuantity} units from ${item.goodsReceipt.purchaseOrder?.supplier?.name || 'Unknown Supplier'} at $${item.actualCost}`,
          metadata: {
            quantity: item.receivedQuantity.toNumber(),
            quantityReceived: item.receivedQuantity.toNumber(),
            actualCost: item.actualCost.toNumber(),
            unitCost: item.actualCost.toNumber(),
            batchNumber: item.batchNumber,
            expiryDate: item.expiryDate,
            supplier: item.goodsReceipt.purchaseOrder?.supplier?.name,
            receiptNumber: item.goodsReceipt.receiptNumber,
            discrepancyType: item.discrepancyType,
          },
        });
      });

      // Stock movement events (exclude movements from goods receipt finalization)
      stockMovements
        .filter((movement: any) => movement.reason !== 'Goods receipt finalized')
        .forEach((movement: any) => {
          events.push({
            id: `movement:${movement.id}`,
            productId: product.id,
            type: 'STOCK_ADJUSTMENT',
            occurredAt: movement.createdAt.toISOString(),
            title: `Stock adjustment`,
            description: `${movement.movementType} adjustment: ${movement.quantity} units (${movement.beforeQuantity} → ${movement.afterQuantity})`,
            metadata: {
              movementType: movement.movementType,
              quantity: movement.quantity.toNumber(),
              beforeQuantity: movement.beforeQuantity.toNumber(),
              afterQuantity: movement.afterQuantity.toNumber(),
              reason: movement.reason,
              notes: movement.notes,
              batchNumber: movement.batch?.batchNumber,
            },
          });
        });

      // Sort events by occurredAt (newest first)
      events.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

      // Calculate summary statistics
  const totalQuantitySold = saleItems.reduce((sum: number, item: any) => sum + item.quantity.toNumber(), 0);
  const totalRevenue = saleItems.reduce((sum: number, item: any) => sum + item.total.toNumber(), 0);
  const totalCost = saleItems.reduce((sum: number, item: any) => sum + item.costTotal.toNumber(), 0);
      const totalProfit = totalRevenue - totalCost;
      const averageSellingPrice = totalQuantitySold > 0 ? totalRevenue / totalQuantitySold : 0;
  const totalReceived = stockBatches.reduce((sum: number, batch: any) => sum + batch.quantityReceived.toNumber(), 0);
      const stockTurnover = totalReceived > 0 ? totalQuantitySold / totalReceived : 0;

      const summary: ProductHistorySummary = {
        totalQuantitySold,
        totalRevenue,
        totalCost,
        totalProfit,
        averageSellingPrice,
        averageCostPrice: product.costPrice.toNumber(),
        profitMargin: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
        currentStock: product.currentStock.toNumber(),
        totalReceived,
        stockTurnover: stockTurnover * 100, // As percentage
      };

      // Build cost history
      // Note: Filter out InventoryBatches that were created from GoodsReceipt finalization
      // to avoid duplicates (they have matching batch numbers and dates)
      const goodsReceiptBatchNumbers = new Set(
  goodsReceiptItems.map((item: any) => 
          `${item.batchNumber}-${item.goodsReceipt.receivedDate.toISOString().split('T')[0]}`
        )
      );

      const costHistory = [
  ...goodsReceiptItems.map((item: any) => ({
          date: item.goodsReceipt.receivedDate,
          cost: item.actualCost.toNumber(),
          batchNumber: item.batchNumber || undefined,
          quantity: item.receivedQuantity.toNumber(),
          expiryDate: item.expiryDate || undefined,
          supplier: item.goodsReceipt.purchaseOrder?.supplier?.name || undefined,
          source: 'PURCHASE' as const,
        })),
  ...stockBatches.map((batch: any) => ({
          date: batch.receivedDate,
          cost: batch.unitCost.toNumber(),
          batchNumber: batch.batchNumber,
          quantity: batch.quantityReceived.toNumber(),
          expiryDate: batch.expiryDate || undefined,
          supplier: undefined, // StockBatch doesn't have supplier relation
          source: 'PURCHASE' as const,
        })),
        ...inventoryBatches
          .filter((batch: any) => {
            // Exclude InventoryBatches created from GoodsReceipt finalization
            const key = `${batch.batchNumber}-${batch.receivedDate.toISOString().split('T')[0]}`;
            return !goodsReceiptBatchNumbers.has(key);
          })
          .map((batch: any) => ({
            date: batch.receivedDate,
            cost: batch.costPrice.toNumber(),
            batchNumber: batch.batchNumber,
            quantity: batch.quantity.toNumber(),
            expiryDate: batch.expiryDate || undefined,
            supplier: undefined, // InventoryBatch doesn't have supplier relation
            source: 'PURCHASE' as const,
          })),
      ].sort((a, b) => b.date.getTime() - a.date.getTime());

      // Build batch receipts summary
  const batchReceipts = stockBatches.map((batch: any) => ({
        batchNumber: batch.batchNumber,
        receivedDate: batch.receivedDate,
        quantityReceived: batch.quantityReceived.toNumber(),
        quantityRemaining: batch.quantityRemaining.toNumber(),
        unitCost: batch.unitCost.toNumber(),
        expiryDate: batch.expiryDate || undefined,
        totalCost: batch.quantityReceived.toNumber() * batch.unitCost.toNumber(),
      }));

      logger.info(`Generated product history for ${product.name}`, { 
        productId, 
        eventsCount: events.length,
        totalSales: totalQuantitySold 
      });

      return {
        events,
        summary,
        costHistory,
        batchReceipts,
      };
    } catch (error) {
      logger.error('Error generating product history:', error);
      throw error;
    }
  }
}