import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { pool as globalPool } from '../../db/pool.js';
import { inventoryService } from './inventoryService.js';
import { inventoryLedgerRepository } from './inventoryLedgerRepository.js';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../rbac/middleware.js';
import { stockCountRoutes } from './stockCountRoutes.js';
import { asyncHandler } from '../../middleware/errorHandler.js';

// Validation schemas
const AdjustInventorySchema = z
  .object({
    productId: z.string().uuid('Invalid product ID'),
    adjustment: z
      .number()
      .refine((val) => val !== 0, {
        message: 'Adjustment cannot be zero',
      }),
    reason: z.string().min(5, 'Reason must be at least 5 characters'),
    userId: z.string().uuid('Invalid user ID'),
  })
  .strict();

const GetBatchesQuerySchema = z.object({
  productId: z.string().uuid(),
});

const ExpiryQuerySchema = z.object({
  daysThreshold: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val) : 30)),
});

export const inventoryController = {
  /**
   * Get all batches for a product
   */
  /**
   * Get all active batches (for offline sync / pre-warm)
   */
  async getAllActiveBatches(req: Request, res: Response): Promise<void> {
    const pool = req.tenantPool || globalPool;
    const batches = await inventoryService.getAllActiveBatches(pool);
    res.json({ success: true, data: batches });
  },

  async getBatchesByProduct(req: Request, res: Response): Promise<void> {
    const pool = req.tenantPool || globalPool;
    const { productId } = GetBatchesQuerySchema.parse(req.query);
    const batches = await inventoryService.getBatchesByProduct(pool, productId);

    res.json({
      success: true,
      data: batches,
    });
  },

  /**
   * Get batches expiring soon
   */
  async getBatchesExpiringSoon(req: Request, res: Response): Promise<void> {
    const pool = req.tenantPool || globalPool;
    const { daysThreshold } = ExpiryQuerySchema.parse(req.query);
    const batches = await inventoryService.getBatchesExpiringSoon(pool, daysThreshold);

    res.json({
      success: true,
      data: batches,
      message: `Found ${batches.length} batches expiring within ${daysThreshold} days`,
    });
  },

  /**
   * Get stock levels for all products
   */
  async getStockLevels(req: Request, res: Response): Promise<void> {
    const pool = req.tenantPool || globalPool;
    const stockLevels = await inventoryService.getStockLevels(pool);

    res.json({
      success: true,
      data: stockLevels,
    });
  },

  /**
   * Get stock level for specific product
   */
  async getStockLevelByProduct(req: Request, res: Response): Promise<void> {
    const pool = req.tenantPool || globalPool;
    const { productId } = req.params;
    const stockLevel = await inventoryService.getStockLevelByProduct(pool, productId);

    res.json({
      success: true,
      data: stockLevel,
    });
  },

  /**
   * Get products needing reorder
   */
  async getProductsNeedingReorder(req: Request, res: Response): Promise<void> {
    const pool = req.tenantPool || globalPool;
    const products = await inventoryService.getProductsNeedingReorder(pool);

    res.json({
      success: true,
      data: products,
      message: `${products.length} products need reordering`,
    });
  },

  /**
   * Adjust inventory quantity
   */
  async adjustInventory(req: Request, res: Response): Promise<void> {
    const pool = req.tenantPool || globalPool;
    const validatedData = AdjustInventorySchema.parse(req.body);
    const result = await inventoryService.adjustInventory(
      pool,
      validatedData.productId,
      validatedData.adjustment,
      validatedData.reason,
      validatedData.userId
    );

    res.json({
      success: true,
      data: result,
      message: 'Inventory adjusted successfully',
    });
  },

  /**
   * Get inventory value
   */
  async getInventoryValue(req: Request, res: Response): Promise<void> {
    const pool = req.tenantPool || globalPool;
    const { productId } = req.query;
    const value = await inventoryService.getInventoryValue(pool, productId as string | undefined);

    res.json({
      success: true,
      data: value,
    });
  },

  /**
   * Check if batch number exists
   */
  async checkBatchExists(req: Request, res: Response): Promise<void> {
    const pool = req.tenantPool || globalPool;
    const { batchNumber } = req.query;

    if (!batchNumber || typeof batchNumber !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Batch number is required',
      });
      return;
    }

    const result = await pool.query(
      'SELECT EXISTS(SELECT 1 FROM inventory_batches WHERE batch_number = $1)',
      [batchNumber]
    );

    res.json({
      success: true,
      exists: result.rows[0].exists,
    });
  },
};

// Routes
export const inventoryRoutes = Router();

// View routes - all authenticated users
inventoryRoutes.get('/batches-all', authenticate, asyncHandler(inventoryController.getAllActiveBatches));
inventoryRoutes.get('/batches', authenticate, asyncHandler(inventoryController.getBatchesByProduct));
inventoryRoutes.get('/batches/exists', authenticate, asyncHandler(inventoryController.checkBatchExists));
inventoryRoutes.get('/batches/expiring', authenticate, asyncHandler(inventoryController.getBatchesExpiringSoon));
inventoryRoutes.get('/stock-levels', authenticate, asyncHandler(inventoryController.getStockLevels));
inventoryRoutes.get(
  '/stock-levels/:productId',
  authenticate,
  asyncHandler(inventoryController.getStockLevelByProduct)
);
inventoryRoutes.get('/reorder', authenticate, asyncHandler(inventoryController.getProductsNeedingReorder));
inventoryRoutes.get('/value', authenticate, asyncHandler(inventoryController.getInventoryValue));

// Adjustment route - requires inventory.approve permission
inventoryRoutes.post(
  '/adjust',
  authenticate,
  requirePermission('inventory.approve'),
  asyncHandler(inventoryController.adjustInventory)
);

// Stock count routes - nested under /api/inventory/stockcounts
// All routes require authentication (handled in stockCountRoutes)
inventoryRoutes.use('/stockcounts', stockCountRoutes);

// ── Inventory Ledger & Reconciliation ────────────────────────

// Get full movement ledger for a product (audit trail)
inventoryRoutes.get('/ledger/:productId', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const productId = z.string().uuid().parse(req.params.productId);
  const limit = parseInt(String(req.query.limit || '100'), 10);
  const offset = parseInt(String(req.query.offset || '0'), 10);

  const result = await inventoryLedgerRepository.getProductLedger(globalPool, productId, { limit, offset });
  const balance = await inventoryLedgerRepository.getLedgerBalance(globalPool, productId);

  res.json({
    success: true,
    data: {
      ...result,
      ledgerBalance: balance,
      pagination: { limit, offset, total: result.total },
    },
  });
}));

// Get ledger-derived stock balance (truth value)
inventoryRoutes.get('/ledger-balance/:productId', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const productId = z.string().uuid().parse(req.params.productId);
  const balance = await inventoryLedgerRepository.getLedgerBalance(globalPool, productId);
  res.json({ success: true, data: { productId, ledgerBalance: balance } });
}));

// Get valuation layers for a product
inventoryRoutes.get('/valuation-layers/:productId', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const productId = z.string().uuid().parse(req.params.productId);
  const activeOnly = req.query.active !== 'false';
  const layers = await inventoryLedgerRepository.getProductValuationLayers(globalPool, productId, activeOnly);
  res.json({ success: true, data: layers });
}));

// Get total inventory valuation summary
inventoryRoutes.get('/valuation-summary', authenticate, asyncHandler(async (_req: Request, res: Response) => {
  const summary = await inventoryLedgerRepository.getTotalValuation(globalPool);
  res.json({ success: true, data: summary });
}));

// Three-way stock reconciliation (ledger vs batches vs cache)
inventoryRoutes.get('/reconciliation', authenticate, asyncHandler(async (_req: Request, res: Response) => {
  const reconciliation = await inventoryLedgerRepository.getReconciliation(globalPool);
  const discrepancyCount = reconciliation.filter(r => !r.isReconciled).length;
  res.json({
    success: true,
    data: {
      products: reconciliation,
      summary: {
        total: reconciliation.length,
        reconciled: reconciliation.length - discrepancyCount,
        discrepancies: discrepancyCount,
      },
    },
  });
}));

// Get only products with stock discrepancies
inventoryRoutes.get('/discrepancies', authenticate, asyncHandler(async (_req: Request, res: Response) => {
  const discrepancies = await inventoryLedgerRepository.getDiscrepancies(globalPool);
  res.json({ success: true, data: discrepancies });
}));

// Movement summary (by type) — optionally filtered by product
inventoryRoutes.get('/movement-summary', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const productId = req.query.productId ? z.string().uuid().parse(String(req.query.productId)) : undefined;
  const summary = await inventoryLedgerRepository.getMovementSummary(globalPool, productId);
  res.json({ success: true, data: summary });
}));
