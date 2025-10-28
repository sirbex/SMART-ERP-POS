/**
 * Stock Movements API Module
 * 
 * Tracks all inventory movements for audit trail:
 * - List movements with filters and pagination
 * - Get movements by product
 * - Get movements by batch
 * - Create manual adjustment
 * - Audit report generation
 * - Export movements (CSV, JSON)
 * 
 * Note: Stock movements are IMMUTABLE - no update or delete operations
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { PrismaClient, MovementType } from '@prisma/client';
import { Decimal } from 'decimal.js';
import {
  CreateAdjustmentSchema,
  StockMovementFiltersSchema,
  AuditReportQuerySchema,
  ExportMovementsQuerySchema,
  CreateAdjustmentInput,
  StockMovementFilters,
  AuditReportQuery,
  ExportMovementsQuery
} from '../validation/stockMovement.js';
import { generateSMNumber } from '../utils/numberGenerator.js';
import { ValuationService } from '../services/valuationService.js';

const router = Router();
const prisma = new PrismaClient();

/**
 * GET /api/stock-movements
 * List stock movements with filters and pagination
 */
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const filters = StockMovementFiltersSchema.parse({
      movementType: req.query.movementType,
      productId: req.query.productId,
      batchId: req.query.batchId,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      performedById: req.query.performedById,
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 50
    }) as StockMovementFilters;

    const where: any = {};

    if (filters.movementType) {
      where.movementType = filters.movementType;
    }

    if (filters.productId) {
      where.productId = filters.productId;
    }

    if (filters.batchId) {
      where.batchId = filters.batchId;
    }

    if (filters.performedById) {
      where.performedById = filters.performedById;
    }

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        where.createdAt.lte = new Date(filters.endDate);
      }
    }

    const skip = (filters.page - 1) * filters.limit;
    const take = filters.limit;

    const [movements, totalCount] = await Promise.all([
      prisma.stockMovement.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              barcode: true,
              baseUnit: true
            }
          },
          batch: {
            select: {
              id: true,
              batchNumber: true,
              expiryDate: true,
              status: true
            }
          },
          performedBy: {
            select: {
              id: true,
              fullName: true,
              username: true
            }
          }
        }
      }),
      prisma.stockMovement.count({ where })
    ]);

    return res.json({
      success: true,
      data: movements,
      pagination: {
        page: filters.page,
        limit: filters.limit,
        totalCount,
        totalPages: Math.ceil(totalCount / filters.limit)
      }
    });

  } catch (error: any) {
    console.error('Error fetching stock movements:', error);

    if (error.name === 'ZodError') {
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: error.errors
      });
    }

    return res.status(500).json({
      error: 'Failed to fetch stock movements',
      details: error.message
    });
  }
});

/**
 * GET /api/stock-movements/product/:productId
 * Get all movements for a specific product
 */
router.get('/product/:productId', authenticate, async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    // Validate product exists
    const product = await prisma.product.findUnique({
      where: { id: productId }
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const skip = (page - 1) * limit;

    const [movements, totalCount] = await Promise.all([
      prisma.stockMovement.findMany({
        where: { productId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          batch: {
            select: {
              id: true,
              batchNumber: true,
              expiryDate: true
            }
          },
          performedBy: {
            select: {
              id: true,
              fullName: true
            }
          }
        }
      }),
      prisma.stockMovement.count({ where: { productId } })
    ]);

    // Calculate movement summary
    const summary = {
      totalIn: 0,
      totalOut: 0,
      totalAdjustments: 0
    };

    movements.forEach(movement => {
      if (['IN', 'RETURN'].includes(movement.movementType)) {
        summary.totalIn = new Decimal(summary.totalIn).plus(movement.quantity).toNumber();
      } else if (['OUT', 'DAMAGE', 'EXPIRY'].includes(movement.movementType)) {
        summary.totalOut = new Decimal(summary.totalOut).plus(movement.quantity).toNumber();
      } else if (movement.movementType === 'ADJUSTMENT') {
        summary.totalAdjustments += 1;
      }
    });

    return res.json({
      success: true,
      data: {
        product: {
          id: product.id,
          name: product.name,
          sku: product.barcode,
          currentStock: product.currentStock
        },
        movements,
        summary
      },
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit)
      }
    });

  } catch (error: any) {
    console.error('Error fetching product movements:', error);
    return res.status(500).json({
      error: 'Failed to fetch product movements',
      details: error.message
    });
  }
});

/**
 * GET /api/stock-movements/batch/:batchId
 * Get all movements for a specific batch
 */
router.get('/batch/:batchId', authenticate, async (req: Request, res: Response) => {
  try {
    const { batchId } = req.params;

    // Validate batch exists
    const batch = await prisma.inventoryBatch.findUnique({
      where: { id: batchId },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            barcode: true
          }
        }
      }
    });

    if (!batch) {
      return res.status(404).json({ error: 'Batch not found' });
    }

    const movements = await prisma.stockMovement.findMany({
      where: { batchId },
      orderBy: { createdAt: 'desc' },
      include: {
        performedBy: {
          select: {
            id: true,
            fullName: true
          }
        }
      }
    });

    return res.json({
      success: true,
      data: {
        batch: {
          id: batch.id,
          batchNumber: batch.batchNumber,
          product: batch.product,
          quantity: batch.quantity,
          remainingQuantity: batch.remainingQuantity,
          status: batch.status
        },
        movements
      }
    });

  } catch (error: any) {
    console.error('Error fetching batch movements:', error);
    return res.status(500).json({
      error: 'Failed to fetch batch movements',
      details: error.message
    });
  }
});

/**
 * POST /api/stock-movements/adjustment
 * Create a manual stock adjustment
 */
router.post('/adjustment', authenticate, async (req: Request, res: Response) => {
  try {
    const validatedData = CreateAdjustmentSchema.parse(req.body) as CreateAdjustmentInput;
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Validate product exists
    const product = await prisma.product.findUnique({
      where: { id: validatedData.productId }
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // If batch is specified, validate it exists and belongs to product
    if (validatedData.batchId) {
      const batch = await prisma.inventoryBatch.findUnique({
        where: { id: validatedData.batchId }
      });

      if (!batch) {
        return res.status(404).json({ error: 'Batch not found' });
      }

      if (batch.productId !== validatedData.productId) {
        return res.status(400).json({
          error: 'Batch does not belong to the specified product'
        });
      }
    }

    // Calculate new quantities
    const currentStock = new Decimal(product.currentStock);
    const adjustment = new Decimal(validatedData.adjustmentQuantity);
    const newStock = currentStock.plus(adjustment);

    // Prevent negative stock
    if (newStock.lt(0)) {
      return res.status(400).json({
        error: 'Adjustment would result in negative stock',
        details: `Current stock: ${currentStock.toString()}, Adjustment: ${adjustment.toString()}`
      });
    }

    // Create adjustment in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Generate movement number
      const movementNumber = await generateSMNumber();

      // Create stock movement
      const movement = await tx.stockMovement.create({
        data: {
          movementNumber,
          productId: validatedData.productId,
          batchId: validatedData.batchId,
          movementType: 'ADJUSTMENT',
          quantity: Math.abs(adjustment.toNumber()),
          beforeQuantity: currentStock.toNumber(),
          afterQuantity: newStock.toNumber(),
          performedById: userId,
          reference: validatedData.reference,
          reason: validatedData.reason,
          notes: validatedData.notes
        },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              barcode: true
            }
          },
          batch: {
            select: {
              id: true,
              batchNumber: true
            }
          },
          performedBy: {
            select: {
              id: true,
              fullName: true
            }
          }
        }
      });

      // Record valuation for adjustment using current average cost as unit cost
      const unitCostNum = new Decimal((product as any).averageCost || 0).toNumber();
      const qtyAbs = Math.abs(adjustment.toNumber());
      try {
        await ValuationService.record(tx, {
          productId: validatedData.productId,
          movementType: MovementType.ADJUSTMENT,
          quantity: qtyAbs,
          unitCost: unitCostNum,
          totalCost: new Decimal(unitCostNum).mul(qtyAbs).toNumber(),
          movementId: movement.id,
          batchId: validatedData.batchId ?? null,
          reference: validatedData.reference || null,
          performedById: userId,
        });
      } catch (e: any) {
        throw new Error(`Valuation logging failed for adjustment on product ${validatedData.productId}: ${e?.message || e}`);
      }

      // Update product stock
      await tx.product.update({
        where: { id: validatedData.productId },
        data: { currentStock: newStock.toNumber() }
      });

      // If batch-specific, update batch quantity
      if (validatedData.batchId) {
        const batch = await tx.inventoryBatch.findUnique({
          where: { id: validatedData.batchId }
        });

        if (batch) {
          const batchRemaining = new Decimal(batch.remainingQuantity);
          const newBatchRemaining = batchRemaining.plus(adjustment);

          // Prevent negative batch quantity
          if (newBatchRemaining.lt(0)) {
            throw new Error('Adjustment would result in negative batch quantity');
          }

          await tx.inventoryBatch.update({
            where: { id: validatedData.batchId },
            data: { 
              remainingQuantity: newBatchRemaining.toNumber(),
              status: newBatchRemaining.eq(0) ? 'DEPLETED' : batch.status
            }
          });
        }
      }

      return movement;
    });

    return res.status(201).json({
      success: true,
      message: 'Stock adjustment created successfully',
      data: result
    });

  } catch (error: any) {
    console.error('Error creating adjustment:', error);

    if (error.name === 'ZodError') {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.errors
      });
    }

    return res.status(500).json({
      error: 'Failed to create adjustment',
      details: error.message
    });
  }
});

/**
 * GET /api/stock-movements/audit
 * Generate audit report with grouping and aggregation
 */
router.get('/audit', authenticate, async (req: Request, res: Response) => {
  try {
    const query = AuditReportQuerySchema.parse({
      productId: req.query.productId,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      groupBy: req.query.groupBy,
      includeZeroMovements: req.query.includeZeroMovements === 'true'
    }) as AuditReportQuery;

    const where: any = {
      createdAt: {
        gte: new Date(query.startDate),
        lte: new Date(query.endDate)
      }
    };

    if (query.productId) {
      where.productId = query.productId;
    }

    // Fetch movements
    const movements = await prisma.stockMovement.findMany({
      where,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            barcode: true
          }
        },
        batch: {
          select: {
            id: true,
            batchNumber: true
          }
        },
        performedBy: {
          select: {
            id: true,
            fullName: true
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    // Group movements based on groupBy parameter
    let grouped: any = {};

    movements.forEach(movement => {
      let key: string;

      switch (query.groupBy) {
        case 'product':
          key = movement.productId;
          break;
        case 'batch':
          key = movement.batchId || 'no-batch';
          break;
        case 'type':
          key = movement.movementType;
          break;
        case 'user':
          key = movement.performedById;
          break;
        case 'day':
          key = movement.createdAt.toISOString().split('T')[0];
          break;
        default:
          key = movement.productId;
      }

      if (!grouped[key]) {
        grouped[key] = {
          key,
          movements: [],
          summary: {
            totalIn: 0,
            totalOut: 0,
            totalAdjustments: 0,
            count: 0
          }
        };
      }

      grouped[key].movements.push(movement);
      grouped[key].summary.count += 1;

      if (['IN', 'RETURN'].includes(movement.movementType)) {
        grouped[key].summary.totalIn = new Decimal(grouped[key].summary.totalIn).plus(movement.quantity).toNumber();
      } else if (['OUT', 'DAMAGE', 'EXPIRY'].includes(movement.movementType)) {
        grouped[key].summary.totalOut = new Decimal(grouped[key].summary.totalOut).plus(movement.quantity).toNumber();
      } else if (movement.movementType === 'ADJUSTMENT') {
        grouped[key].summary.totalAdjustments += 1;
      }
    });

    const report = Object.values(grouped);

    return res.json({
      success: true,
      data: report,
      summary: {
        period: {
          start: query.startDate,
          end: query.endDate
        },
        totalMovements: movements.length,
        totalGroups: report.length,
        groupBy: query.groupBy
      }
    });

  } catch (error: any) {
    console.error('Error generating audit report:', error);

    if (error.name === 'ZodError') {
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: error.errors
      });
    }

    return res.status(500).json({
      error: 'Failed to generate audit report',
      details: error.message
    });
  }
});

/**
 * GET /api/stock-movements/export
 * Export stock movements to CSV/JSON
 */
router.get('/export', authenticate, async (req: Request, res: Response) => {
  try {
    const query = ExportMovementsQuerySchema.parse({
      format: req.query.format,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      productId: req.query.productId,
      movementType: req.query.movementType
    }) as ExportMovementsQuery;

    const where: any = {
      createdAt: {
        gte: new Date(query.startDate),
        lte: new Date(query.endDate)
      }
    };

    if (query.productId) {
      where.productId = query.productId;
    }

    if (query.movementType) {
      where.movementType = query.movementType;
    }

    const movements = await prisma.stockMovement.findMany({
      where,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            barcode: true,
          }
        },
        batch: {
          select: {
            id: true,
            batchNumber: true,
            expiryDate: true
          }
        },
        performedBy: {
          select: {
            id: true,
            fullName: true,
            username: true
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    if (query.format === 'json') {
      return res.json({
        success: true,
        data: movements,
        metadata: {
          exportDate: new Date().toISOString(),
          period: {
            start: query.startDate,
            end: query.endDate
          },
          totalRecords: movements.length
        }
      });
    }

    // CSV format
    if (query.format === 'csv') {
      // Create CSV header
      const headers = [
        'Movement Number',
        'Date',
        'Product SKU',
        'Product Name',
        'Batch Number',
        'Movement Type',
        'Quantity',
        'Before Qty',
        'After Qty',
        'Performed By',
        'Reference',
        'Reason',
        'Notes'
      ];

      // Create CSV rows
      const rows = movements.map(m => [
        m.movementNumber,
        m.createdAt.toISOString(),
        m.product.barcode || '',
        m.product.name,
        m.batch?.batchNumber || '',
        m.movementType,
        m.quantity,
        m.beforeQuantity,
        m.afterQuantity,
        m.performedBy.fullName,
        m.reference || '',
        m.reason || '',
        m.notes || ''
      ]);

      // Combine header and rows
      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="stock-movements-${Date.now()}.csv"`);
      return res.send(csvContent);
    }

    return res.status(400).json({
      error: 'Invalid format',
      details: 'Supported formats: json, csv'
    });

  } catch (error: any) {
    console.error('Error exporting movements:', error);

    if (error.name === 'ZodError') {
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: error.errors
      });
    }

    return res.status(500).json({
      error: 'Failed to export movements',
      details: error.message
    });
  }
});

export default router;
