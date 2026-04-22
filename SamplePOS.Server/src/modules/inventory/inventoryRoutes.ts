import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { pool as globalPool } from '../../db/pool.js';
import { inventoryService } from './inventoryService.js';
import { inventoryRepository } from './inventoryRepository.js';
import { inventoryLedgerRepository } from './inventoryLedgerRepository.js';
import { validateExpiryEdit } from './batchExpiryGovernanceService.js';
import { UnitOfWork } from '../../db/unitOfWork.js';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../rbac/middleware.js';
import { stockCountRoutes } from './stockCountRoutes.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { BatchAdjustmentSchema } from '../../../../shared/zod/inventory.js';

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
   * Enterprise-grade batch adjustment
   * Accepts explicit direction + reason — no sign inference, no negative quantities.
   * Creates an inventory_adjustment_document as the audit header.
   */
  async adjustBatch(req: Request, res: Response): Promise<void> {
    const pool = req.tenantPool || globalPool;
    const validated = BatchAdjustmentSchema.parse(req.body);
    const result = await inventoryService.adjustBatch(pool, {
      batchId: validated.batchId,         // optional — FEFO auto-select when absent
      productId: validated.productId,
      quantity: validated.quantity,
      direction: validated.direction,
      reason: validated.reason,
      notes: validated.notes,
      userId: validated.userId,
      documentId: validated.documentId,
    });

    res.json({
      success: true,
      data: result,
      message: `${validated.reason} adjustment recorded (${validated.direction === 'IN' ? '+' : '-'}${validated.quantity})`,
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

// Enterprise batch adjustment route — direction + reason explicit, no sign inference
inventoryRoutes.post(
  '/adjust-batch',
  authenticate,
  requirePermission('inventory.approve'),
  asyncHandler(inventoryController.adjustBatch)
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

// ── Batch Expiry Management (SAP master data correction) ─────────────────────

const PatchExpirySchema = z.object({
  newExpiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  reason: z.string().min(5, 'Reason must be at least 5 characters'),
});

// GET /api/inventory/batches/:id — get single batch by ID
inventoryRoutes.get(
  '/batches/:id',
  authenticate,
  requirePermission('inventory.read'),
  asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const { id } = req.params;
    if (!/^[0-9a-f-]{36}$/.test(id)) {
      res.status(400).json({ success: false, error: 'Invalid batch ID' });
      return;
    }
    const batch = await inventoryRepository.getBatchById(pool, id);
    if (!batch) {
      res.status(404).json({ success: false, error: 'Batch not found' });
      return;
    }
    res.json({ success: true, data: batch });
  })
);

// PATCH /api/inventory/batches/:id/expiry — update batch expiry (governance-gated)
inventoryRoutes.patch(
  '/batches/:id/expiry',
  authenticate,
  requirePermission('inventory.batch_expiry_edit'),
  asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const { id } = req.params;
    if (!/^[0-9a-f-]{36}$/.test(id)) {
      res.status(400).json({ success: false, error: 'Invalid batch ID' });
      return;
    }
    const body = PatchExpirySchema.parse(req.body);

    // Fetch batch (must exist)
    const batch = await inventoryRepository.getBatchById(pool, id);
    if (!batch) {
      res.status(404).json({ success: false, error: 'Batch not found' });
      return;
    }

    // Build user context from JWT (req.user set by authenticate middleware)
    // permissions come from req.authContext (loaded by requirePermission middleware)
    // Fall back to full-grant for legacy ADMIN role if RBAC context is not available
    const userPermissions: Set<string> = req.authContext?.permissions ?? new Set(['inventory.batch_expiry_edit']);
    const userCtx = {
      id: req.user!.id,
      fullName: req.user!.fullName ?? req.user!.email,
      permissions: userPermissions,
    };

    // Governance validation — throws ForbiddenError or ValidationError on violation
    const validated = validateExpiryEdit(
      batch as { id: string; batch_number: string; remaining_quantity: string; expiry_date: string | null; product_name: string },
      userCtx,
      body.newExpiryDate,
      body.reason
    );

    // Atomic update + audit (single transaction)
    await UnitOfWork.run(pool, async (client) => {
      await inventoryRepository.updateBatchExpiry(client, id, validated.newExpiryDate);
      await inventoryRepository.createExpiryAuditRecord(client, {
        batchId: validated.batchId,
        batchNumber: validated.batchNumber,
        productId: batch.product_id as string,
        productName: batch.product_name as string,
        oldExpiryDate: validated.oldExpiryDate,
        newExpiryDate: validated.newExpiryDate,
        changedById: validated.userId,
        changedByName: validated.userName,
        reason: validated.reason,
        ipAddress: req.ip ?? null,
      });
    });

    res.json({
      success: true,
      data: { batchId: id, newExpiryDate: validated.newExpiryDate },
      message: `Batch ${validated.batchNumber} expiry updated to ${validated.newExpiryDate}`,
    });
  })
);

// GET /api/inventory/batches/:id/expiry-audit — fetch audit history
inventoryRoutes.get(
  '/batches/:id/expiry-audit',
  authenticate,
  requirePermission('inventory.read'),
  asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const { id } = req.params;
    if (!/^[0-9a-f-]{36}$/.test(id)) {
      res.status(400).json({ success: false, error: 'Invalid batch ID' });
      return;
    }
    const history = await inventoryRepository.getExpiryAuditHistory(pool, id);
    res.json({ success: true, data: history });
  })
);
