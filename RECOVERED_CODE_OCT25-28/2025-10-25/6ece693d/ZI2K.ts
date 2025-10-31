/**
 * Goods Receipts API Module
 * 
 * Handles receiving inventory with or without purchase orders:
 * - Create goods receipt (draft)
 * - Update goods receipt (draft only)
 * - Finalize receipt (creates batches, updates stock, logs movements)
 * - Receive without PO (direct receiving)
 * - List receipts with filters
 * - Get single receipt details
 * - Discrepancy tracking and reporting
 */

import { Router, Request, Response } from 'express';
import { PrismaClient, MovementType, DocumentType } from '@prisma/client';
import { Decimal } from 'decimal.js';
import { authenticate } from '../middleware/auth.js';
import { CostLayerService } from '../services/costLayerService.js';
import { PricingService } from '../services/pricingService.js';
import { ValuationService } from '../services/valuationService.js';
import { BatchPricingService } from '../services/batchPricingService.js';
import logger from '../utils/logger.js';
import {
  CreateGoodsReceiptSchema,
  UpdateGoodsReceiptSchema,
  FinalizeGoodsReceiptSchema,
  ReceiveWithoutPOSchema,
  GoodsReceiptFiltersSchema,
  CreateGoodsReceiptInput,
  UpdateGoodsReceiptInput,
  FinalizeGoodsReceiptInput,
  ReceiveWithoutPOInput,
  GoodsReceiptFilters
} from '../validation/goodsReceipt.js';
import { generateGRNumber, generateBatchNumber, generateSMNumber } from '../utils/numberGenerator.js';
import { sendTablePdf } from '../utils/pdf.js';

const router = Router();
const prisma = new PrismaClient();

/**
 * POST /api/goods-receipts
 * Create a new goods receipt (draft status)
 */
router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const validatedData = CreateGoodsReceiptSchema.parse(req.body) as CreateGoodsReceiptInput;
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // If PO is specified, validate it exists and is in correct status
    if (validatedData.purchaseOrderId) {
      const purchaseOrder = await prisma.purchaseOrder.findUnique({
        where: { id: validatedData.purchaseOrderId },
        include: { items: true }
      });

      if (!purchaseOrder) {
        return res.status(404).json({ error: 'Purchase order not found' });
      }

      if (!['PENDING', 'PARTIAL'].includes(purchaseOrder.status)) {
        return res.status(400).json({
          error: 'Invalid purchase order status',
          details: `Purchase order status is ${purchaseOrder.status}. Can only receive against PENDING or PARTIAL orders.`
        });
      }
    }

    // Validate all products exist
    const productIds = validatedData.items.map(item => item.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } }
    });

    if (products.length !== productIds.length) {
      return res.status(404).json({ error: 'One or more products not found' });
    }

    // Generate receipt number
    const receiptNumber = await generateGRNumber();

    // Create goods receipt with items in transaction
    const goodsReceipt = await prisma.$transaction(async (tx) => {
      const gr = await tx.goodsReceipt.create({
        data: {
          receiptNumber,
          purchaseOrderId: validatedData.purchaseOrderId,
          receivedById: userId,
          receivedDate: validatedData.receivedDate 
            ? new Date(validatedData.receivedDate) 
            : new Date(),
          status: 'DRAFT',
          notes: validatedData.notes,
          items: {
            create: validatedData.items.map(item => ({
              productId: item.productId,
              receivedQuantity: item.receivedQuantity,
              actualCost: item.actualCost,
              batchNumber: item.batchNumber,
              expiryDate: item.expiryDate ? new Date(item.expiryDate) : null,
              discrepancyType: item.discrepancyType || 'NONE',
              discrepancyNotes: item.discrepancyNotes
            }))
          }
        },
        include: {
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  barcode: true,
                  baseUnit: true
                }
              }
            }
          },
          purchaseOrder: {
            select: {
              id: true,
              poNumber: true,
              supplier: true
            }
          },
          receivedBy: {
            select: {
              id: true,
              fullName: true,
              username: true
            }
          }
        }
      });

      return gr;
    });

    return res.status(201).json({
      success: true,
      data: goodsReceipt
    });

  } catch (error: any) {
    console.error('Error creating goods receipt:', error);

    if (error.name === 'ZodError') {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.errors
      });
    }

    return res.status(500).json({
      error: 'Failed to create goods receipt',
      details: error.message
    });
  }
});

/**
 * GET /api/goods-receipts
 * List goods receipts with filters and pagination
 */
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const filters = GoodsReceiptFiltersSchema.parse({
      status: req.query.status,
      purchaseOrderId: req.query.purchaseOrderId,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      hasDiscrepancies: req.query.hasDiscrepancies === 'true',
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 20
    }) as GoodsReceiptFilters;

    const where: any = {};

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.purchaseOrderId) {
      where.purchaseOrderId = filters.purchaseOrderId;
    }

    if (filters.startDate || filters.endDate) {
      where.receivedDate = {};
      if (filters.startDate) {
        where.receivedDate.gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        where.receivedDate.lte = new Date(filters.endDate);
      }
    }

    if (filters.hasDiscrepancies) {
      where.items = {
        some: {
          discrepancyType: {
            not: 'NONE'
          }
        }
      };
    }

    const skip = (filters.page - 1) * filters.limit;
    const take = filters.limit;

    const [goodsReceipts, totalCount] = await Promise.all([
      prisma.goodsReceipt.findMany({
        where,
        skip,
        take,
        orderBy: { receivedDate: 'desc' },
        include: {
          purchaseOrder: {
            select: {
              id: true,
              poNumber: true,
              supplier: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          },
          receivedBy: {
            select: {
              id: true,
              fullName: true
            }
          },
          _count: {
            select: { items: true }
          }
        }
      }),
      prisma.goodsReceipt.count({ where })
    ]);

    return res.json({
      success: true,
      data: goodsReceipts,
      pagination: {
        page: filters.page,
        limit: filters.limit,
        totalCount,
        totalPages: Math.ceil(totalCount / filters.limit)
      }
    });

  } catch (error: any) {
    console.error('Error fetching goods receipts:', error);

    if (error.name === 'ZodError') {
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: error.errors
      });
    }

    return res.status(500).json({
      error: 'Failed to fetch goods receipts',
      details: error.message
    });
  }
});

/**
 * GET /api/goods-receipts/export
 * Export goods receipts (item-level) as CSV
 * Query: startDate, endDate, supplierId (optional)
 * Note: Placed BEFORE parameterized routes to avoid "/export" matching ":id"
 */
// Duplicate CSV export route removed (defined earlier above). Keeping a single definition prevents route conflicts and confusion.

/**
 * GET /api/goods-receipts/export/pdf
 * Export goods receipts (item-level) as PDF
 * Query: startDate, endDate, supplierId (optional)
 * Note: Placed BEFORE parameterized routes to avoid "/export" matching ":id"
 */
router.get('/export/pdf', authenticate, async (req: Request, res: Response) => {
  try {
    const startDateStr = (req.query.startDate as string) || new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const endDateStr = (req.query.endDate as string) || new Date().toISOString();
    const supplierId = req.query.supplierId as string | undefined;

    const where: any = {
      receivedDate: {
        gte: new Date(startDateStr),
        lte: new Date(endDateStr)
      }
    };

    if (supplierId) {
      where.purchaseOrder = { supplierId } as any;
    }

    const receipts = await prisma.goodsReceipt.findMany({
      where,
      orderBy: { receivedDate: 'asc' },
      include: {
        items: { include: { product: { select: { name: true, barcode: true, baseUnit: true } } } },
        purchaseOrder: { include: { supplier: { select: { name: true } } } }
      }
    });

    const headers = ['Receipt #','Received Date','Status','PO #','Supplier','Product','Barcode','Unit','Received Qty','Actual Cost','Line Total','Batch #','Expiry','Discrepancy','Notes'];
    const rows: any[] = [];

    for (const gr of receipts as any[]) {
      for (const item of gr.items) {
        const receivedQty = Number(item.receivedQuantity || 0);
        const cost = Number(item.actualCost || 0);
        const lineTotal = (receivedQty * cost).toFixed(2);
        rows.push([
          gr.receiptNumber,
          new Date(gr.receivedDate).toLocaleString(),
          gr.status,
          gr.purchaseOrder?.poNumber || '',
          gr.purchaseOrder?.supplier?.name || '',
          item.product?.name || '',
          item.product?.barcode || '',
          item.product?.baseUnit || 'pcs',
          receivedQty,
          cost.toFixed(2),
          lineTotal,
          item.batchNumber || '',
          item.expiryDate ? new Date(item.expiryDate).toLocaleDateString() : '',
          item.discrepancyType || 'NONE',
          item.discrepancyNotes || ''
        ]);
      }
    }

    sendTablePdf(
      res,
      'Goods Receipts (Item-level)',
      supplierId ? `Filtered by supplier ${supplierId}` : undefined,
      headers,
      rows,
      `goods-receipts-${Date.now()}.pdf`
    );
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to export goods receipts (PDF)', details: error.message });
  }
});

/**
 * GET /api/goods-receipts/:id
 * Get single goods receipt with full details
 */
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const goodsReceipt = await prisma.goodsReceipt.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                barcode: true,
                baseUnit: true,
                currentStock: true
              }
            }
          }
        },
        purchaseOrder: {
          include: {
            supplier: true,
            items: true
          }
        },
        receivedBy: {
          select: {
            id: true,
            fullName: true,
            username: true
          }
        }
      }
    });

    if (!goodsReceipt) {
      return res.status(404).json({ error: 'Goods receipt not found' });
    }

    return res.json({
      success: true,
      data: goodsReceipt
    });

  } catch (error: any) {
    console.error('Error fetching goods receipt:', error);
    return res.status(500).json({
      error: 'Failed to fetch goods receipt',
      details: error.message
    });
  }
});

/**
 * PUT /api/goods-receipts/:id
 * Update goods receipt (only if status is DRAFT)
 */
router.put('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const validatedData = UpdateGoodsReceiptSchema.parse(req.body) as UpdateGoodsReceiptInput;

    // Check if receipt exists and is DRAFT
    const existingGR = await prisma.goodsReceipt.findUnique({
      where: { id },
      include: { items: true }
    });

    if (!existingGR) {
      return res.status(404).json({ error: 'Goods receipt not found' });
    }

    if (existingGR.status !== 'DRAFT') {
      return res.status(400).json({
        error: 'Cannot update goods receipt',
        details: `Goods receipt status is ${existingGR.status}. Only DRAFT receipts can be updated.`
      });
    }

    // If items are being updated, validate products exist
    if (validatedData.items) {
      const productIds = validatedData.items.map(item => item.productId);
      const products = await prisma.product.findMany({
        where: { id: { in: productIds } }
      });

      if (products.length !== productIds.length) {
        return res.status(404).json({ error: 'One or more products not found' });
      }
    }

    // Update receipt in transaction
    const updatedGR = await prisma.$transaction(async (tx) => {
      // If items are being updated, delete old items and create new ones
      if (validatedData.items) {
        await tx.goodsReceiptItem.deleteMany({
          where: { goodsReceiptId: id }
        });
      }

      const gr = await tx.goodsReceipt.update({
        where: { id },
        data: {
          receivedDate: validatedData.receivedDate 
            ? new Date(validatedData.receivedDate) 
            : undefined,
          notes: validatedData.notes,
          ...(validatedData.items && {
            items: {
              create: validatedData.items.map(item => ({
                productId: item.productId,
                receivedQuantity: item.receivedQuantity,
                actualCost: item.actualCost,
                batchNumber: item.batchNumber,
                expiryDate: item.expiryDate ? new Date(item.expiryDate) : null,
                discrepancyType: item.discrepancyType || 'NONE',
                discrepancyNotes: item.discrepancyNotes
              }))
            }
          })
        },
        include: {
          items: {
            include: {
              product: true
            }
          },
          purchaseOrder: {
            include: {
              supplier: true
            }
          },
          receivedBy: true
        }
      });

      return gr;
    });

    return res.json({
      success: true,
      data: updatedGR
    });

  } catch (error: any) {
    console.error('Error updating goods receipt:', error);

    if (error.name === 'ZodError') {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.errors
      });
    }

    return res.status(500).json({
      error: 'Failed to update goods receipt',
      details: error.message
    });
  }
});

/**
 * POST /api/goods-receipts/:id/finalize
 * Finalize goods receipt - creates batches, updates stock, logs movements
 * This is the critical business logic function
 */
router.post('/:id/finalize', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const validatedData = FinalizeGoodsReceiptSchema.parse(req.body) as FinalizeGoodsReceiptInput;
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if receipt exists and is DRAFT
    const existingGR = await prisma.goodsReceipt.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: true
          }
        },
        purchaseOrder: {
          include: {
            items: true
          }
        }
      }
    });

    if (!existingGR) {
      return res.status(404).json({ error: 'Goods receipt not found' });
    }

    if (existingGR.status !== 'DRAFT') {
      return res.status(400).json({
        error: 'Cannot finalize goods receipt',
        details: `Goods receipt status is ${existingGR.status}. Only DRAFT receipts can be finalized.`
      });
    }

    // Process finalization in a large transaction (all or nothing)
    const result = await prisma.$transaction(async (tx) => {
      const batches = [];
      const movements = [];
      const productStockUpdates = [];

      // Process each receipt item
      for (const item of existingGR.items) {
        const receivedQty = new Decimal(item.receivedQuantity);

        // Skip if zero quantity
        if (receivedQty.lte(0)) {
          continue;
        }

        // Generate batch number if not provided
        const batchNum = item.batchNumber || await generateBatchNumber();

        // Create inventory batch if enabled
        if (validatedData.createBatches) {
          const batch = await tx.inventoryBatch.create({
            data: {
              batchNumber: batchNum,
              productId: item.productId,
              quantity: receivedQty.toNumber(),
              remainingQuantity: receivedQty.toNumber(),
              costPrice: item.actualCost,
              expiryDate: item.expiryDate,
              receivedDate: existingGR.receivedDate,
              status: 'ACTIVE'
            }
          });

          batches.push(batch);

          // Auto-price the batch (uses product formula if available)
          try {
            await BatchPricingService.autoPriceBatch(batch.id, tx);
          } catch (e: any) {
            logger.warn(`Failed to auto-price batch ${batch.id}: ${e?.message || e}`);
            // Non-critical - continue processing
          }

          // Create cost layer for valuation
          await CostLayerService.createCostLayer({
            productId: item.productId,
            quantity: receivedQty.toNumber(),
            unitCost: item.actualCost.toNumber(),
            receivedDate: existingGR.receivedDate,
            goodsReceiptId: existingGR.id,
            batchNumber: batchNum,
          });

          // Create stock movement (IN type) for this batch
          const movementNumber = await generateSMNumber();
          const currentStock = new Decimal(item.product.currentStock);
          const newStock = currentStock.plus(receivedQty);

          const movement = await tx.stockMovement.create({
            data: {
              movementNumber,
              productId: item.productId,
              batchId: batch.id,
              movementType: 'IN',
              quantity: receivedQty.toNumber(),
              beforeQuantity: currentStock.toNumber(),
              afterQuantity: newStock.toNumber(),
              performedById: userId,
              reference: existingGR.receiptNumber,
              reason: 'Goods receipt finalized',
              notes: item.discrepancyType !== 'NONE' 
                ? `Discrepancy: ${item.discrepancyType} - ${item.discrepancyNotes}` 
                : null
            }
          });

          movements.push(movement);

          // Record valuation layer for this movement
          try {
            await ValuationService.record(tx, {
              productId: item.productId,
              movementType: MovementType.IN,
              quantity: receivedQty.toNumber(),
              unitCost: new Decimal(item.actualCost).toNumber(),
              totalCost: new Decimal(item.actualCost).mul(receivedQty).toNumber(),
              movementId: movement.id,
              batchId: batch.id,
              sourceDocType: DocumentType.PURCHASE_RECEIPT,
              sourceDocId: existingGR.id,
              reference: existingGR.receiptNumber,
              performedById: userId,
            });
          } catch (e: any) {
            throw new Error(`Valuation logging failed for product ${item.productId} on GR ${existingGR.id}: ${e?.message || e}`);
          }
        }

        // Update product stock if enabled
        if (validatedData.updateStock) {
          productStockUpdates.push({
            productId: item.productId,
            quantity: receivedQty
          });
        }
      }

      // Bulk update product stocks
      if (validatedData.updateStock) {
        for (const update of productStockUpdates) {
          const product = await tx.product.findUnique({
            where: { id: update.productId }
          });

          if (product) {
            const currentStock = new Decimal(product.currentStock);
            const newStock = currentStock.plus(update.quantity);

            await tx.product.update({
              where: { id: update.productId },
              data: { currentStock: newStock.toNumber() }
            });
          }
        }
      }

      // Update purchase order if enabled and PO exists
      if (validatedData.updatePurchaseOrder && existingGR.purchaseOrderId) {
        const po = existingGR.purchaseOrder!;

        // Update received quantities on PO items
        for (const grItem of existingGR.items) {
          const poItem = po.items.find(pi => pi.productId === grItem.productId);

          if (poItem) {
            const currentReceived = new Decimal(poItem.receivedQuantity || 0);
            const newReceived = currentReceived.plus(grItem.receivedQuantity);

            await tx.purchaseOrderItem.update({
              where: { id: poItem.id },
              data: { receivedQuantity: newReceived.toNumber() }
            });
          }
        }

        // Check if all items are fully received
        const updatedPOItems = await tx.purchaseOrderItem.findMany({
          where: { purchaseOrderId: po.id }
        });

        let allFullyReceived = true;
        let anyPartiallyReceived = false;

        for (const item of updatedPOItems) {
          const ordered = new Decimal(item.orderedQuantity);
          const received = new Decimal(item.receivedQuantity || 0);

          if (received.lt(ordered)) {
            allFullyReceived = false;
            if (received.gt(0)) {
              anyPartiallyReceived = true;
            }
          }
        }

        // Update PO status
        let newPOStatus = po.status;
        if (allFullyReceived) {
          newPOStatus = 'COMPLETED';
        } else if (anyPartiallyReceived) {
          newPOStatus = 'PARTIAL';
        }

        if (newPOStatus !== po.status) {
          await tx.purchaseOrder.update({
            where: { id: po.id },
            data: { status: newPOStatus }
          });
        }
      }

      // Mark goods receipt as COMPLETED
      const finalizedGR = await tx.goodsReceipt.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          finalizedDate: validatedData.finalizedDate 
            ? new Date(validatedData.finalizedDate) 
            : new Date()
        },
        include: {
          items: {
            include: {
              product: true
            }
          },
          purchaseOrder: {
            include: {
              supplier: true
            }
          },
          receivedBy: true
        }
      });

      return {
        goodsReceipt: finalizedGR,
        batchesCreated: batches.length,
        movementsCreated: movements.length,
        productsUpdated: productStockUpdates.length
      };
    });

    // Trigger price recalculation for products with auto-update enabled
    // This runs outside the transaction to avoid locking issues
    const productIds = new Set(result.goodsReceipt.items.map(item => item.productId));
    for (const productId of productIds) {
      try {
        await PricingService.onCostChange(productId);
      } catch (error) {
        logger.warn('Failed to auto-update prices after goods receipt', { 
          error, 
          productId, 
          goodsReceiptId: result.goodsReceipt.id 
        });
      }
    }

    return res.json({
      success: true,
      message: 'Goods receipt finalized successfully',
      data: result
    });

  } catch (error: any) {
    console.error('Error finalizing goods receipt:', error);

    if (error.name === 'ZodError') {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.errors
      });
    }

    return res.status(500).json({
      error: 'Failed to finalize goods receipt',
      details: error.message
    });
  }
});

/**
 * POST /api/goods-receipts/receive-without-po
 * Direct receiving without a purchase order
 */
router.post('/receive-without-po', authenticate, async (req: Request, res: Response) => {
  try {
    const validatedData = ReceiveWithoutPOSchema.parse(req.body) as ReceiveWithoutPOInput;
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Validate all products exist
    const productIds = validatedData.items.map(item => item.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } }
    });

    if (products.length !== productIds.length) {
      return res.status(404).json({ error: 'One or more products not found' });
    }

    // Generate receipt number
    const receiptNumber = await generateGRNumber();

    // Create receipt
    const goodsReceipt = await prisma.$transaction(async (tx) => {
      const gr = await tx.goodsReceipt.create({
        data: {
          receiptNumber,
          purchaseOrderId: null, // No PO
          receivedById: userId,
          receivedDate: validatedData.receivedDate 
            ? new Date(validatedData.receivedDate) 
            : new Date(),
          status: validatedData.autoFinalize ? 'COMPLETED' : 'DRAFT',
          notes: validatedData.notes,
          finalizedDate: validatedData.autoFinalize ? new Date() : null,
          items: {
            create: validatedData.items.map(item => ({
              productId: item.productId,
              receivedQuantity: item.receivedQuantity,
              actualCost: item.actualCost,
              batchNumber: item.batchNumber,
              expiryDate: item.expiryDate ? new Date(item.expiryDate) : null,
              discrepancyType: 'NONE',
              discrepancyNotes: null
            }))
          }
        },
        include: {
          items: {
            include: {
              product: true
            }
          },
          receivedBy: true
        }
      });

      // If auto-finalize, create batches and update stock immediately
      if (validatedData.autoFinalize) {
        for (const item of gr.items) {
          const receivedQty = new Decimal(item.receivedQuantity);

          if (receivedQty.lte(0)) {
            continue;
          }

          const batchNum = item.batchNumber || await generateBatchNumber();

          // Create batch
          const batch = await tx.inventoryBatch.create({
            data: {
              batchNumber: batchNum,
              productId: item.productId,
              quantity: receivedQty.toNumber(),
              remainingQuantity: receivedQty.toNumber(),
              costPrice: item.actualCost,
              expiryDate: item.expiryDate,
              receivedDate: gr.receivedDate,
              status: 'ACTIVE'
            }
          });

          // Auto-price the batch (uses product formula if available)
          try {
            await BatchPricingService.autoPriceBatch(batch.id, tx);
          } catch (e: any) {
            logger.warn(`Failed to auto-price batch ${batch.id}: ${e?.message || e}`);
            // Non-critical - continue processing
          }

          // Update product stock
          const product = await tx.product.findUnique({
            where: { id: item.productId }
          });

          if (product) {
            const currentStock = new Decimal(product.currentStock);
            const newStock = currentStock.plus(receivedQty);

            await tx.product.update({
              where: { id: item.productId },
              data: { currentStock: newStock.toNumber() }
            });

            // Create stock movement
            const movementNumber = await generateSMNumber();
            const movement = await tx.stockMovement.create({
              data: {
                movementNumber,
                productId: item.productId,
                batchId: batch.id,
                movementType: 'IN',
                quantity: receivedQty.toNumber(),
                beforeQuantity: currentStock.toNumber(),
                afterQuantity: newStock.toNumber(),
                performedById: userId,
                reference: gr.receiptNumber,
                reason: 'Direct receiving without PO'
              }
            });

            // Record valuation layer for direct receiving
            try {
              await ValuationService.record(tx, {
                productId: item.productId,
                movementType: MovementType.IN,
                quantity: receivedQty.toNumber(),
                unitCost: new Decimal(item.actualCost).toNumber(),
                totalCost: new Decimal(item.actualCost).mul(receivedQty).toNumber(),
                movementId: movement.id,
                batchId: batch.id,
                sourceDocType: DocumentType.PURCHASE_RECEIPT,
                sourceDocId: gr.id,
                reference: gr.receiptNumber,
                performedById: userId,
              });
            } catch (e: any) {
              throw new Error(`Valuation logging failed for product ${item.productId} on direct GR ${gr.id}: ${e?.message || e}`);
            }
          }
        }
      }

      return gr;
    });

    return res.status(201).json({
      success: true,
      message: validatedData.autoFinalize 
        ? 'Direct receipt finalized successfully' 
        : 'Direct receipt created in draft',
      data: goodsReceipt
    });

  } catch (error: any) {
    console.error('Error creating direct receipt:', error);

    if (error.name === 'ZodError') {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.errors
      });
    }

    return res.status(500).json({
      error: 'Failed to create direct receipt',
      details: error.message
    });
  }
});

/**
 * GET /api/purchase-orders/:id/receive
 * Get PO details formatted for receiving screen
 */
router.get('/purchase-orders/:id/receive', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const purchaseOrder = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                barcode: true,
                baseUnit: true,
                currentStock: true
              }
            }
          }
        },
        supplier: true,
        goodsReceipts: {
          include: {
            items: true
          }
        }
      }
    });

    if (!purchaseOrder) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }

    if (!['PENDING', 'PARTIAL'].includes(purchaseOrder.status)) {
      return res.status(400).json({
        error: 'Invalid purchase order status',
        details: `Cannot receive against a ${purchaseOrder.status} purchase order`
      });
    }

    // Calculate remaining quantities for each item
    const itemsWithRemaining = purchaseOrder.items.map(item => {
      const ordered = new Decimal(item.orderedQuantity);
      const received = new Decimal(item.receivedQuantity || 0);
      const remaining = ordered.minus(received);

      return {
        ...item,
        remainingQuantity: remaining.toNumber()
      };
    });

    return res.json({
      success: true,
      data: {
        ...purchaseOrder,
        items: itemsWithRemaining
      }
    });

  } catch (error: any) {
    console.error('Error fetching PO for receiving:', error);
    return res.status(500).json({
      error: 'Failed to fetch purchase order',
      details: error.message
    });
  }
});

/**
 * GET /api/goods-receipts/export
 * Export goods receipts (item-level) as CSV
 * Query: startDate, endDate, supplierId (optional)
 */
router.get('/export', authenticate, async (req: Request, res: Response) => {
  try {
    const startDateStr = (req.query.startDate as string) || new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const endDateStr = (req.query.endDate as string) || new Date().toISOString();
    const supplierId = req.query.supplierId as string | undefined;

    const where: any = {
      receivedDate: {
        gte: new Date(startDateStr),
        lte: new Date(endDateStr)
      }
    };

    if (supplierId) {
      // filter via related purchase order supplier
      where.purchaseOrder = { supplierId } as any;
    }

    const receipts = await prisma.goodsReceipt.findMany({
      where,
      orderBy: { receivedDate: 'asc' },
      include: {
        items: { include: { product: { select: { name: true, barcode: true, baseUnit: true } } } },
        purchaseOrder: { include: { supplier: { select: { name: true } }, items: false } }
      }
    });

    const headers = [
      'Receipt Number','Received Date','Status','PO Number','Supplier','Product Name','Barcode','Unit','Received Qty','Actual Cost','Line Total','Batch Number','Expiry Date','Discrepancy Type','Discrepancy Notes'
    ];
    const rows: string[] = [];

    for (const gr of receipts as any[]) {
      for (const item of gr.items) {
        const receivedQty = Number(item.receivedQuantity || 0);
        const cost = Number(item.actualCost || 0);
        const lineTotal = (receivedQty * cost).toFixed(2);
        const row = [
          gr.receiptNumber,
          new Date(gr.receivedDate).toISOString(),
          gr.status,
          gr.purchaseOrder?.poNumber || '',
          gr.purchaseOrder?.supplier?.name || '',
          item.product?.name || '',
          item.product?.barcode || '',
          item.product?.baseUnit || 'pcs',
          receivedQty,
          cost.toFixed(2),
          lineTotal,
          item.batchNumber || '',
          item.expiryDate ? new Date(item.expiryDate).toISOString() : '',
          item.discrepancyType || 'NONE',
          item.discrepancyNotes || ''
        ].map((c) => `"${c}"`).join(',');
        rows.push(row);
      }
    }

    const csv = [headers.join(','), ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="goods-receipts-${Date.now()}.csv"`);
    return res.send(csv);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to export goods receipts', details: error.message });
  }
});

export default router;
