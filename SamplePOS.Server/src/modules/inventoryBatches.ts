/**
 * Inventory Batches API Module
 * 
 * Manages inventory batches with FEFO logic:
 * - List all batches with pagination
 * - Get batches for specific product
 * - Get single batch details
 * - Get expiring batches (alert system)
 * - Get expired batches (cleanup system)
 * - Update batch status (EXPIRED, RECALLED)
 * - Get FEFO-ordered batches for product (for POS integration)
 */

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { Decimal } from 'decimal.js';
import {
  getFEFOBatchesForProduct,
  getExpiringBatches,
  getExpiredBatches
} from '../utils/fefoLogic.js';

const router = Router();
const prisma = new PrismaClient();

/**
 * GET /api/inventory/batches
 * List all batches with pagination
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const status = req.query.status as string;
    const productId = req.query.productId as string;

    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (productId) {
      where.productId = productId;
    }

    const skip = (page - 1) * limit;

    const [batches, totalCount] = await Promise.all([
      prisma.inventoryBatch.findMany({
        where,
        skip,
        take: limit,
        orderBy: [
          { expiryDate: 'asc' },
          { receivedDate: 'asc' }
        ],
        include: {
          product: {
            select: {
              id: true,
              name: true,
              barcode: true,
              baseUnit: true
            }
          },
          stockMovements: {
            select: {
              id: true,
              movementNumber: true,
              movementType: true,
              quantity: true,
              createdAt: true
            },
            orderBy: { createdAt: 'desc' },
            take: 5 // Last 5 movements
          }
        }
      }),
      prisma.inventoryBatch.count({ where })
    ]);

    // Calculate days until expiry for each batch
    const batchesWithDays = batches.map(batch => {
      let daysUntilExpiry = null;
      if (batch.expiryDate) {
        const now = new Date();
        const expiry = new Date(batch.expiryDate);
        const diffTime = expiry.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        daysUntilExpiry = diffDays;
      }

      return {
        ...batch,
        daysUntilExpiry
      };
    });

    return res.json({
      success: true,
      data: batchesWithDays,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit)
      }
    });

  } catch (error: any) {
    console.error('Error fetching batches:', error);
    return res.status(500).json({
      error: 'Failed to fetch batches',
      details: error.message
    });
  }
});

/**
 * GET /api/inventory/batches/product/:productId
 * Get all batches for a specific product
 */
router.get('/product/:productId', async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;

    // Validate product exists
    const product = await prisma.product.findUnique({
      where: { id: productId }
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const batches = await prisma.inventoryBatch.findMany({
      where: { productId },
      orderBy: [
        { expiryDate: 'asc' },
        { receivedDate: 'asc' }
      ],
      include: {
        stockMovements: {
          select: {
            id: true,
            movementNumber: true,
            movementType: true,
            quantity: true,
            createdAt: true
          },
          orderBy: { createdAt: 'desc' },
          take: 3
        }
      }
    });

    // Calculate days until expiry
    const batchesWithDays = batches.map(batch => {
      let daysUntilExpiry = null;
      if (batch.expiryDate) {
        const now = new Date();
        const expiry = new Date(batch.expiryDate);
        const diffTime = expiry.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        daysUntilExpiry = diffDays;
      }

      return {
        ...batch,
        daysUntilExpiry,
        isExpired: daysUntilExpiry !== null && daysUntilExpiry < 0,
        isExpiring: daysUntilExpiry !== null && daysUntilExpiry >= 0 && daysUntilExpiry <= 30
      };
    });

    // Calculate totals
    const totalQuantity = batches.reduce((sum, batch) => {
      return new Decimal(sum).plus(batch.quantity);
    }, new Decimal(0)).toNumber();

    const totalRemaining = batches.reduce((sum, batch) => {
      return new Decimal(sum).plus(batch.remainingQuantity);
    }, new Decimal(0)).toNumber();

    return res.json({
      success: true,
      data: {
        product: {
          id: product.id,
          name: product.name,
          sku: product.barcode,
          currentStock: product.currentStock
        },
        batches: batchesWithDays,
        summary: {
          totalBatches: batches.length,
          activeBatches: batches.filter(b => b.status === 'ACTIVE').length,
          totalQuantity,
          totalRemaining,
          expiredBatches: batchesWithDays.filter(b => b.isExpired).length,
          expiringBatches: batchesWithDays.filter(b => b.isExpiring).length
        }
      }
    });

  } catch (error: any) {
    console.error('Error fetching product batches:', error);
    return res.status(500).json({
      error: 'Failed to fetch product batches',
      details: error.message
    });
  }
});

/**
 * GET /api/inventory/batches/:id
 * Get single batch with full details
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const batch = await prisma.inventoryBatch.findUnique({
      where: { id },
      include: {
        product: true,
        stockMovements: {
          include: {
            performedBy: {
              select: {
                id: true,
                fullName: true,
                username: true
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!batch) {
      return res.status(404).json({ error: 'Batch not found' });
    }

    // Calculate days until expiry
    let daysUntilExpiry = null;
    let isExpired = false;
    if (batch.expiryDate) {
      const now = new Date();
      const expiry = new Date(batch.expiryDate);
      const diffTime = expiry.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      daysUntilExpiry = diffDays;
      isExpired = diffDays < 0;
    }

    return res.json({
      success: true,
      data: {
        ...batch,
        daysUntilExpiry,
        isExpired,
        isExpiring: daysUntilExpiry !== null && daysUntilExpiry >= 0 && daysUntilExpiry <= 30,
        utilizationRate: new Decimal(batch.quantity).greaterThan(0)
          ? new Decimal(batch.quantity).minus(batch.remainingQuantity)
              .dividedBy(batch.quantity).times(100).toFixed(2)
          : '0.00'
      }
    });

  } catch (error: any) {
    console.error('Error fetching batch:', error);
    return res.status(500).json({
      error: 'Failed to fetch batch',
      details: error.message
    });
  }
});

/**
 * GET /api/inventory/batches/expiring
 * Get batches expiring within specified days (default 30)
 */
router.get('/expiring', async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30;

    const expiringBatches = await getExpiringBatches(days);

    // Group by product
    const groupedByProduct = expiringBatches.reduce((acc: any, batch) => {
      if (!acc[batch.productId]) {
        acc[batch.productId] = {
          product: batch.product,
          batches: [],
          totalQuantity: 0,
          totalRemaining: 0
        };
      }

      acc[batch.productId].batches.push(batch);
      acc[batch.productId].totalQuantity += batch.quantity;
      acc[batch.productId].totalRemaining += batch.remainingQuantity;

      return acc;
    }, {});

    const result = Object.values(groupedByProduct);

    return res.json({
      success: true,
      data: result,
      summary: {
        totalBatches: expiringBatches.length,
        totalProducts: result.length,
        daysThreshold: days
      }
    });

  } catch (error: any) {
    console.error('Error fetching expiring batches:', error);
    return res.status(500).json({
      error: 'Failed to fetch expiring batches',
      details: error.message
    });
  }
});

/**
 * GET /api/inventory/batches/expired
 * Get all expired batches
 */
router.get('/expired', async (req: Request, res: Response) => {
  try {
    const expiredBatches = await getExpiredBatches();

    // Group by product
    const groupedByProduct = expiredBatches.reduce((acc: any, batch) => {
      if (!acc[batch.productId]) {
        acc[batch.productId] = {
          product: batch.product,
          batches: [],
          totalQuantity: 0,
          totalRemaining: 0
        };
      }

      acc[batch.productId].batches.push(batch);
      acc[batch.productId].totalQuantity += batch.quantity;
      acc[batch.productId].totalRemaining += batch.remainingQuantity;

      return acc;
    }, {});

    const result = Object.values(groupedByProduct);

    return res.json({
      success: true,
      data: result,
      summary: {
        totalBatches: expiredBatches.length,
        totalProducts: result.length
      }
    });

  } catch (error: any) {
    console.error('Error fetching expired batches:', error);
    return res.status(500).json({
      error: 'Failed to fetch expired batches',
      details: error.message
    });
  }
});

/**
 * GET /api/inventory/batches/fefo/:productId
 * Get FEFO-ordered batches for a product (for POS integration)
 */
router.get('/fefo/:productId', async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;

    // Validate product exists
    const product = await prisma.product.findUnique({
      where: { id: productId }
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const batches = await getFEFOBatchesForProduct(productId);

    // Calculate days until expiry for each batch
    const batchesWithDays = batches.map(batch => {
      let daysUntilExpiry = null;
      if (batch.expiryDate) {
        const now = new Date();
        const expiry = new Date(batch.expiryDate);
        const diffTime = expiry.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        daysUntilExpiry = diffDays;
      }

      return {
        ...batch,
        daysUntilExpiry
      };
    });

    return res.json({
      success: true,
      data: {
        product: {
          id: product.id,
          name: product.name,
          sku: product.barcode
        },
        batches: batchesWithDays,
        totalAvailable: batches.reduce((sum, b) => new Decimal(sum).plus(b.remainingQuantity), new Decimal(0)).toNumber()
      }
    });

  } catch (error: any) {
    console.error('Error fetching FEFO batches:', error);
    return res.status(500).json({
      error: 'Failed to fetch FEFO batches',
      details: error.message
    });
  }
});

/**
 * PUT /api/inventory/batches/:id/status
 * Update batch status (EXPIRED, RECALLED, DEPLETED)
 */
router.put('/:id/status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    const validStatuses = ['ACTIVE', 'EXPIRED', 'RECALLED', 'DEPLETED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        error: 'Invalid status',
        details: `Status must be one of: ${validStatuses.join(', ')}`
      });
    }

    const batch = await prisma.inventoryBatch.findUnique({
      where: { id }
    });

    if (!batch) {
      return res.status(404).json({ error: 'Batch not found' });
    }

    // Update batch status
    const updatedBatch = await prisma.inventoryBatch.update({
      where: { id },
      data: { 
        status,
        notes: reason ? `Status changed to ${status}: ${reason}` : batch.notes
      },
      include: {
        product: true
      }
    });

    return res.json({
      success: true,
      message: `Batch status updated to ${status}`,
      data: updatedBatch
    });

  } catch (error: any) {
    console.error('Error updating batch status:', error);
    return res.status(500).json({
      error: 'Failed to update batch status',
      details: error.message
    });
  }
});

export default router;
