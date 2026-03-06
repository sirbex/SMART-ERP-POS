import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { pool as globalPool } from '../../db/pool.js';
import { salesService, CreateSaleInput } from './salesService.js';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../rbac/middleware.js';
import { normalizeResponse, normalizePaginatedResponse } from '../../utils/caseConverter.js';
import { POSSaleSchema, POSSaleLineItemSchema } from '../../../../shared/zod/pos-sale.js';
import { asyncHandler } from '../../middleware/errorHandler.js';

// Internal validation for legacy format compatibility
const SaleItemSchema = z.object({
  productId: z.string().min(1), // Accept UUID or custom IDs for quotation conversion
  productName: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
});

const CreateSaleSchema = z
  .object({
    customerId: z.string().uuid().optional().nullable(),
    customerName: z.string().optional().nullable(),
    items: z.array(SaleItemSchema).min(1),
    paymentMethod: z.enum(['CASH', 'CARD', 'MOBILE_MONEY', 'CREDIT']),
    paymentReceived: z.number().nonnegative(),
    soldBy: z.string().uuid(),
  })
  .strict();

const ListSalesQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val) : 1)),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val) : 50)),
  status: z.enum(['COMPLETED', 'CANCELLED', 'REFUNDED']).optional(),
  customerId: z.string().uuid().optional(),
  startDate: z.string().optional(), // Keep as string (YYYY-MM-DD format)
  endDate: z.string().optional(), // Keep as string (YYYY-MM-DD format)
});

export const salesController = {
  /**
   * Create a new sale
   * Accepts EITHER:
   * 1. New format (from POS frontend): { customerId?, lineItems[], subtotal, taxAmount, totalAmount, paymentMethod, amountTendered?, changeGiven? }
   * 2. Legacy format: { customerId?, items[], paymentMethod, paymentReceived, soldBy }
   */
  async createSale(req: Request, res: Response): Promise<void> {
      const pool = req.tenantPool || globalPool;
      let validatedData: z.infer<typeof POSSaleSchema> | z.infer<typeof CreateSaleSchema> | undefined;
      let serviceInput: CreateSaleInput & { customerName?: string | null };

      // Try new POS format first
      const posValidation = POSSaleSchema.safeParse(req.body);
      if (posValidation.success) {
    const posData = posValidation.data;

    // Convert POS format to service format
    serviceInput = {
      customerId: posData.customerId || null,
      quoteId: posData.quoteId || null, // Link to quotation for auto-conversion
      cashRegisterSessionId: posData.cashRegisterSessionId || undefined, // Link to cash register for drawer tracking
      customerName: null, // Will be fetched from DB if needed
      items: posData.lineItems.map((item: z.infer<typeof POSSaleLineItemSchema>) => ({
        productId: item.productId,
        productName: item.productName,
        uom: item.uom,
        uomId: item.uomId, // Include UOM ID for tracking
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
      subtotal: posData.subtotal,
      discountAmount: posData.discountAmount || 0,
      taxAmount: posData.taxAmount,
      totalAmount: posData.totalAmount,
      paymentMethod: posData.paymentMethod || (posData.paymentLines && posData.paymentLines.length > 0
        ? posData.paymentLines.reduce((primary, line) => line.amount > primary.amount ? line : primary, posData.paymentLines[0]).paymentMethod
        : 'CASH'), // Use highest-amount payment line as primary method
      paymentReceived: posData.amountTendered || posData.totalAmount,
      soldBy: req.user?.id || '00000000-0000-0000-0000-000000000000', // From auth middleware - null UUID for system
      saleDate: posData.saleDate || undefined, // Backdated sale date if provided
      paymentLines: posData.paymentLines || undefined, // Include payment lines for split payment
    };
      } else {
    // Log POS validation errors
    console.error('POS Schema validation failed:', JSON.stringify(posValidation.error.errors, null, 2));
    console.error('Request body:', JSON.stringify(req.body, null, 2));

    // Try legacy format
    const legacyValidation = CreateSaleSchema.safeParse(req.body);
    if (legacyValidation.success) {
      serviceInput = legacyValidation.data;
    } else {
      // Both validations failed - return POS schema errors as they're more relevant
      console.error('Legacy Schema validation also failed:', JSON.stringify(legacyValidation.error.errors, null, 2));
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: posValidation.error.errors,
      });
      return;
    }
      }

      const result = await salesService.createSale(pool, serviceInput);

      // Log audit trail with context from request
      try {
    const auditContext = req.auditContext || {
      userId: req.user?.id || '00000000-0000-0000-0000-000000000000',
      userName: req.user?.fullName,
      userRole: req.user?.role,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    };

    // Import audit service dynamically
    const { logSaleCreated } = await import('../audit/auditService.js');
    await logSaleCreated(
      pool,
      result.sale.id,
      result.sale.saleNumber,
      {
        itemCount: result.items.length,
        totalAmount: result.sale.totalAmount,
        totalCost: result.sale.totalCost ?? 0,
        profit: result.sale.profit ?? 0,
        paymentMethod: result.sale.paymentMethod,
        customerId: result.sale.customerId,
      },
      auditContext
    );

      res.status(201).json({
        success: true,
        data: normalizeResponse(result),
        message: `Sale ${result.sale.saleNumber} created successfully`,
        warnings: result.warnings,
      });
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        });
        return;
      }

      console.error('Error creating sale:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create sale',
      });
    }
  },

  /**
   * Get sale by ID
   */
  async getSaleById(req: Request, res: Response): Promise<void> {
      const pool = req.tenantPool || globalPool;
      const { id } = req.params;
      const result = await salesService.getSaleById(pool, id);

      res.json({
    success: true,
    data: normalizeResponse(result),
      });
  },

  /**
   * List sales with pagination and filters
   */
  async listSales(req: Request, res: Response): Promise<void> {
      const pool = req.tenantPool || globalPool;
      const query = ListSalesQuerySchema.parse(req.query);
      const result = await salesService.listSales(pool, query.page, query.limit, {
    status: query.status,
    customerId: query.customerId,
    startDate: query.startDate,
    endDate: query.endDate,
      });

      res.json({
    success: true,
    data: result.sales.map((sale) => normalizeResponse(sale)),
    pagination: {
      page: query.page,
      limit: query.limit,
      total: result.total,
      totalPages: Math.ceil(result.total / query.limit),
    },
      });
  },  /**
   * Get sales summary (totals, count, by payment method)
   */
  async getSalesSummary(req: Request, res: Response): Promise<void> {
      const pool = req.tenantPool || globalPool;
      const { startDate, endDate, groupBy } = req.query;

      const filters: { startDate?: string; endDate?: string; groupBy?: string } = {};
      if (startDate) filters.startDate = startDate as string;
      if (endDate) filters.endDate = endDate as string;
      if (groupBy) filters.groupBy = groupBy as string;

      const result = await salesService.getSalesSummary(pool, filters);

      res.json({
    success: true,
    data: result,
      });
  },

  /**
   * Get product sales summary report
   */
  async getProductSalesSummary(req: Request, res: Response): Promise<void> {
      const pool = req.tenantPool || globalPool;
      const { startDate, endDate, productId, customerId } = req.query;

      const filters: { startDate?: string; endDate?: string; productId?: string; customerId?: string } = {};
      if (startDate) filters.startDate = startDate as string;
      if (endDate) filters.endDate = endDate as string;
      if (productId) filters.productId = productId as string;
      if (customerId) filters.customerId = customerId as string;

      const result = await salesService.getProductSalesSummary(pool, filters);

      res.json({
    success: true,
    data: result,
    message: `Retrieved sales summary for ${result.length} product(s)`,
      });
  },

  /**
   * Get top selling products
   */
  async getTopSellingProducts(req: Request, res: Response): Promise<void> {
      const pool = req.tenantPool || globalPool;
      const { limit, startDate, endDate } = req.query;

      const filters: { startDate?: string; endDate?: string } = {};
      if (startDate) filters.startDate = startDate as string;
      if (endDate) filters.endDate = endDate as string;

      const result = await salesService.getTopSellingProducts(
    pool,
    limit ? parseInt(limit as string) : 10,
    filters
      );

      res.json({
    success: true,
    data: result,
      });
  },

  /**
   * Get sales summary by date
   */
  async getSalesSummaryByDate(req: Request, res: Response): Promise<void> {
      const pool = req.tenantPool || globalPool;
      const { groupBy, startDate, endDate } = req.query;

      const filters: { startDate?: string; endDate?: string } = {};
      // Keep dates as strings (YYYY-MM-DD format) to avoid timezone issues
      if (startDate) filters.startDate = startDate as string;
      if (endDate) filters.endDate = endDate as string;

      const validGroupBy = ['day', 'week', 'month'].includes(groupBy as string)
    ? (groupBy as 'day' | 'week' | 'month')
    : 'day';

      const result = await salesService.getSalesSummaryByDate(pool, validGroupBy, filters);

      res.json({
    success: true,
    data: result,
      });
  },

  /**
   * Void a sale (requires manager approval for high-value sales)
   * POST /api/sales/:id/void
   * Body: { reason: string, approvedById?: string }
   */
  async voidSale(req: Request, res: Response): Promise<void> {
      const pool = req.tenantPool || globalPool;
      const { id } = req.params;
      const { reason, approvedById, amountThreshold } = req.body;

      // Validate inputs
      if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
    res.status(400).json({
      success: false,
      error: 'Void reason is required',
    });
    return;
      }

      const voidedById = req.user?.id;
      if (!voidedById) {
    res.status(401).json({
      success: false,
      error: 'User not authenticated',
    });
    return;
      }

      // Void the sale
      const result = await salesService.voidSale(
    pool,
    id,
    voidedById,
    reason.trim(),
    approvedById || undefined,
    amountThreshold || 1000000 // Default threshold: 1M UGX
      );

      // Log audit trail
      try {
    const auditContext = req.auditContext || {
      userId: voidedById,
      userName: req.user?.fullName,
      userRole: req.user?.role,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    };

    const { logSaleVoided } = await import('../audit/auditService.js');
    await logSaleVoided(
      pool,
      id,
      String(result.sale.saleNumber || ''),
      reason.trim(),
      {
        totalAmount: result.totalAmount,
        itemsRestored: result.itemsRestored,
        voidedById,
        approvedById: approvedById || null,
      },
      auditContext
    );

      res.json({
        success: true,
        data: normalizeResponse(result),
        message: `Sale ${result.sale.saleNumber} voided successfully`,
      });
    } catch (error: unknown) {
      console.error('Error voiding sale:', error);

      // Return appropriate status codes
      if ((error instanceof Error ? error.message : String(error)).includes('not found')) {
        res.status(404).json({
          success: false,
          error: (error instanceof Error ? error.message : String(error)),
        });
        return;
      }

      if ((error instanceof Error ? error.message : String(error)).includes('Manager approval required') || (error instanceof Error ? error.message : String(error)).includes('must have MANAGER')) {
        res.status(403).json({
          success: false,
          error: (error instanceof Error ? error.message : String(error)),
        });
        return;
      }

      if ((error instanceof Error ? error.message : String(error)).includes('Cannot void')) {
        res.status(400).json({
          success: false,
          error: (error instanceof Error ? error.message : String(error)),
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to void sale',
      });
    }
  },
};

// Routes
export const salesRoutes = Router();

// Create sale - requires sales.create permission
salesRoutes.post(
  '/',
  authenticate,
  requirePermission('sales.create'),
  asyncHandler(salesController.createSale)
);

// List and view sales - all authenticated users
salesRoutes.get('/', authenticate, asyncHandler(salesController.listSales));
salesRoutes.get('/summary', authenticate, asyncHandler(salesController.getSalesSummary));
salesRoutes.get('/:id', authenticate, asyncHandler(salesController.getSaleById));

// Sales reports - all authenticated users
salesRoutes.get('/reports/product-summary', authenticate, asyncHandler(salesController.getProductSalesSummary));
salesRoutes.get('/reports/top-selling', authenticate, asyncHandler(salesController.getTopSellingProducts));
salesRoutes.get('/reports/summary-by-date', authenticate, asyncHandler(salesController.getSalesSummaryByDate));

// Void sale - requires sales.void permission (with audit trail)
salesRoutes.post(
  '/:id/void',
  authenticate,
  requirePermission('sales.void'),
  asyncHandler(salesController.voidSale)
);
