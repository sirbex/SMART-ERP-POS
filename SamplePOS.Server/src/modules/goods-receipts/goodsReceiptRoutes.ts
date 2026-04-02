import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { pool as globalPool } from '../../db/pool.js';
import { goodsReceiptService } from './goodsReceiptService.js';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../rbac/middleware.js';
import { asyncHandler } from '../../middleware/errorHandler.js';

// Validation schemas
const GRItemSchema = z.object({
  poItemId: z.string().uuid().optional().nullable(),
  productId: z.string().uuid('Product ID must be a valid UUID'),
  productName: z.string().min(1, 'Product name is required'),
  orderedQuantity: z.number().nonnegative('Ordered quantity must be non-negative'),
  receivedQuantity: z.number().nonnegative('Received quantity must be non-negative'),
  unitCost: z.number().nonnegative('Unit cost must be non-negative'),
  batchNumber: z.string().optional().nullable(),
  isBonus: z.boolean().optional().default(false),
  expiryDate: z
    .string()
    .optional()
    .nullable(),
});

const CreateGRSchema = z
  .object({
    purchaseOrderId: z
      .string()
      .uuid('Purchase Order ID must be a valid UUID')
      .optional()
      .nullable(),
    supplierId: z.string().uuid('Supplier ID must be a valid UUID').optional().nullable(),
    receiptDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
    notes: z.string().optional().nullable(),
    receivedBy: z.string().uuid('Received By (user ID) must be a valid UUID'),
    source: z.enum(['PURCHASE_ORDER', 'MANUAL', 'OPENING_BALANCE']).optional(),
    items: z.array(GRItemSchema).min(1, 'Goods receipt must have at least one item'),
  })
  .refine(
    (data) => {
      // Must have purchaseOrderId for PO-based GR
      // For manual GR, must have supplierId (backend handles this)
      // At minimum, purchaseOrderId should be provided
      return !!data.purchaseOrderId || !!data.supplierId;
    },
    {
      message: 'Either purchaseOrderId or supplierId must be provided',
    }
  );

const ListGRsQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val) : 1)),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val) : 50)),
  status: z.enum(['DRAFT', 'COMPLETED', 'CANCELLED']).optional(),
  purchaseOrderId: z.string().uuid().optional(),
});

const UpdateGRItemSchema = z
  .object({
    receivedQuantity: z.number().nonnegative().optional(),
    unitCost: z.number().nonnegative().optional(),
    batchNumber: z.string().nullable().optional(),
    isBonus: z.boolean().optional(),
    expiryDate: z
      .string()
      .nullable()
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided to update',
  });

const UuidParamSchema = z.object({
  id: z.string().uuid(),
});

export const goodsReceiptController = {
  /**
   * Create goods receipt
   */
  async createGR(req: Request, res: Response): Promise<void> {
    const pool = req.tenantPool || globalPool;
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📦 [GR CREATE] Incoming Request');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Request Body:', JSON.stringify(req.body, null, 2));
    console.log('\n🔍 [GR CREATE] Field Analysis:');
    console.log(
      '  - purchaseOrderId:',
      req.body.purchaseOrderId,
      '(type:',
      typeof req.body.purchaseOrderId,
      ')'
    );
    console.log(
      '  - supplierId:',
      req.body.supplierId,
      '(type:',
      typeof req.body.supplierId,
      ')'
    );
    console.log(
      '  - receivedBy:',
      req.body.receivedBy,
      '(type:',
      typeof req.body.receivedBy,
      ')'
    );
    console.log(
      '  - receiptDate:',
      req.body.receiptDate,
      '(type:',
      typeof req.body.receiptDate,
      ')'
    );
    console.log('  - items count:', req.body.items?.length || 0);
    if (req.body.items && req.body.items.length > 0) {
      console.log('\n📋 [GR CREATE] First Item Sample:');
      console.log(JSON.stringify(req.body.items[0], null, 2));
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const validatedData = CreateGRSchema.parse(req.body);
    console.log('✅ [GR CREATE] Validation passed!\n');

    const result = await goodsReceiptService.createGR(pool, validatedData);

    // Log audit trail
    try {
      const auditContext = req.auditContext || {
        userId: req.user?.id || '00000000-0000-0000-0000-000000000000',
        userName: req.user?.fullName,
        userRole: req.user?.role,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      };

      const { logGoodsReceiptCreated } = await import('../audit/auditService.js');
      await logGoodsReceiptCreated(
        pool,
        result.gr.id,
        result.gr.grNumber,
        {
          itemCount: result.items?.length || 0,
          totalAmount: 0, // totalAmount is not on GR header — computed from items if needed
          supplierId: result.gr.supplierId,
          purchaseOrderId: result.gr.purchaseOrderId,
          source: result.manualPO ? 'MANUAL' : 'PURCHASE_ORDER',
        },
        auditContext
      );

      const responseMessage = result.manualPO
        ? `Manual goods receipt created successfully. Auto-generated PO ${result.manualPO.poNumber} for tracking.`
        : `Goods receipt ${result.gr.grNumber} created successfully`;

      res.status(201).json({
        success: true,
        data: result,
        message: responseMessage,
      });
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('❌ [GR CREATE] VALIDATION FAILED');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('Error Count:', error.errors.length);
        error.errors.forEach((err, idx) => {
          console.log(`\n🔴 Error ${idx + 1}:`);
          console.log('  Path:', err.path.join(' → ') || 'root');
          console.log('  Code:', err.code);
          console.log('  Message:', err.message);
          if (err.code === 'invalid_type') {
            console.log('  Expected:', 'expected' in err ? err.expected : undefined);
            console.log('  Received:', 'received' in err ? err.received : undefined);
          }
          if (err.code === 'invalid_string') {
            console.log('  Validation:', 'validation' in err ? err.validation : undefined);
          }
        });
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        });
        return;
      }

      console.error('❌ [GR CREATE] Unexpected Error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create goods receipt',
      });
    }
  },

  /**
   * Get GR by ID
   */
  async getGRById(req: Request, res: Response): Promise<void> {
    const pool = req.tenantPool || globalPool;
    const { id } = UuidParamSchema.parse(req.params);
    const result = await goodsReceiptService.getGRById(pool, id);

    res.json({
      success: true,
      data: result,
    });
  },

  /**
   * List goods receipts
   */
  async listGRs(req: Request, res: Response): Promise<void> {
    const pool = req.tenantPool || globalPool;
    const query = ListGRsQuerySchema.parse(req.query);
    const result = await goodsReceiptService.listGRs(pool, query.page, query.limit, {
      status: query.status,
      purchaseOrderId: query.purchaseOrderId,
    });

    res.json({
      success: true,
      data: result.grs,
      pagination: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / query.limit),
      },
    });
  },

  /**
   * Finalize goods receipt
   */
  async finalizeGR(req: Request, res: Response): Promise<void> {
    const pool = req.tenantPool || globalPool;
    const { id } = UuidParamSchema.parse(req.params);
    const result = await goodsReceiptService.finalizeGR(pool, id);

    // Log audit trail for finalization
    try {
      const auditContext = req.auditContext || {
        userId: req.user?.id || '00000000-0000-0000-0000-000000000000',
        userName: req.user?.fullName,
        userRole: req.user?.role,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      };

      const { logGoodsReceiptFinalized } = await import('../audit/auditService.js');
      await logGoodsReceiptFinalized(
        pool,
        result.gr.id,
        result.gr.grNumber,
        {
          itemCount: result.items?.length || 0,
          totalAmount: 0, // totalAmount is not on GR header — computed from items if needed
          batchesCreated: result.items?.length || 0, // Each item creates a batch
          hasAlerts: result.hasAlerts,
        },
        auditContext
      );

      // Build response with cost price change alerts
      const response: Record<string, unknown> = {
        success: true,
        data: result,
        message: `Goods receipt ${result.gr.grNumber} completed successfully`,
        warnings: result.warnings,
      };

      // Add alerts if cost prices changed
      if (result.hasAlerts && result.costPriceChangeAlerts) {
        response.alerts = result.costPriceChangeAlerts.map((alert) => ({
          type: 'COST_PRICE_CHANGE',
          severity: Math.abs(alert.changePercentage) > 10 ? 'HIGH' : 'MEDIUM',
          productId: alert.productId,
          productName: alert.productName,
          message: `Cost price changed from ${alert.previousCost.toFixed(2)} to ${alert.newCost.toFixed(2)} (${alert.changePercentage > 0 ? '+' : ''}${alert.changePercentage.toFixed(2)}%)`,
          details: {
            previousCost: alert.previousCost,
            newCost: alert.newCost,
            changeAmount: alert.changeAmount,
            changePercentage: alert.changePercentage,
            batchNumber: alert.batchNumber,
          },
        }));

        response.alertSummary = result.alertSummary;
      }

      res.json(response);
    } catch (error: unknown) {
      console.error('Error finalizing goods receipt:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to complete goods receipt',
      });
    }
  },

  /**
   * Hydrate GR items from its Purchase Order (DRAFT only)
   */
  async hydrateFromPO(req: Request, res: Response): Promise<void> {
    const pool = req.tenantPool || globalPool;
    const { id } = UuidParamSchema.parse(req.params);
    const result = await goodsReceiptService.hydrateFromPO(pool, id);

    res.json({
      success: true,
      data: result,
      message: 'Goods receipt items hydrated from purchase order',
    });
  },

  /**
   * Update a GR item (DRAFT only)
   */
  async updateGRItem(req: Request, res: Response): Promise<void> {
    const pool = req.tenantPool || globalPool;
    const { id: grId, itemId } = z.object({ id: z.string().uuid(), itemId: z.string().uuid() }).parse(req.params);
    const payload = UpdateGRItemSchema.parse(req.body);
    const updated = await goodsReceiptService.updateGRItem(pool, grId, itemId, {
      receivedQuantity: payload.receivedQuantity,
      unitCost: payload.unitCost,
      batchNumber: payload.batchNumber ?? undefined,
      expiryDate: payload.expiryDate ?? undefined,
    });

    res.json({ success: true, data: updated, message: 'Goods receipt item updated' });
  },
};

// Routes
export const goodsReceiptRoutes = Router();

// View routes - all authenticated users
goodsReceiptRoutes.get('/', authenticate, asyncHandler(goodsReceiptController.listGRs));
goodsReceiptRoutes.get('/:id', authenticate, asyncHandler(goodsReceiptController.getGRById));

// Create/finalize routes - requires purchasing permissions
goodsReceiptRoutes.post(
  '/',
  authenticate,
  requirePermission('purchasing.create'),
  asyncHandler(goodsReceiptController.createGR)
);
goodsReceiptRoutes.post(
  '/:id/finalize',
  authenticate,
  requirePermission('purchasing.post'),
  asyncHandler(goodsReceiptController.finalizeGR)
);
goodsReceiptRoutes.put(
  '/:id/items/:itemId',
  authenticate,
  requirePermission('purchasing.update'),
  asyncHandler(goodsReceiptController.updateGRItem)
);
goodsReceiptRoutes.post(
  '/:id/hydrate-from-po',
  authenticate,
  requirePermission('purchasing.create'),
  asyncHandler(goodsReceiptController.hydrateFromPO)
);
