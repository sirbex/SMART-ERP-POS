import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { purchaseOrderService } from './purchaseOrderService.js';
import { authenticate, authorize } from '../../middleware/auth.js';

// Validation schemas
const POItemSchema = z.object({
  productId: z.string().uuid(),
  productName: z.string().min(1),
  quantity: z.number().positive(),
  unitCost: z.number().nonnegative(),
});

const CreatePOSchema = z
  .object({
    supplierId: z.string().uuid(),
    orderDate: z.string().transform((val) => new Date(val)),
    expectedDate: z
      .string()
      .optional()
      .transform((val) => (val ? new Date(val) : null)),
    notes: z.string().optional().nullable(),
    createdBy: z.string().uuid().optional(), // Optional - will use req.user if not provided
    items: z.array(POItemSchema).min(1, 'Purchase order must have at least one item'),
  })
  .strict();

const UpdatePOStatusSchema = z
  .object({
    status: z.enum(['DRAFT', 'PENDING', 'COMPLETED', 'CANCELLED']),
  })
  .strict();

const ListPOsQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val) : 1)),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val) : 50)),
  status: z.enum(['DRAFT', 'PENDING', 'COMPLETED', 'CANCELLED']).optional(),
  supplierId: z.string().uuid().optional(),
});

export const purchaseOrderController = {
  /**
   * Create purchase order
   */
  async createPO(req: Request, res: Response): Promise<void> {
    try {
      const validatedData = CreatePOSchema.parse(req.body);

      // Use authenticated user's ID if createdBy not provided
      const createdBy = validatedData.createdBy || (req as any).user?.id || (req as any).user?.userId;
      if (!createdBy) {
        res.status(400).json({
          success: false,
          error: 'User ID is required. Please provide createdBy or ensure you are authenticated.',
        });
        return;
      }

      const result = await purchaseOrderService.createPO(pool, {
        ...validatedData,
        createdBy,
      });

      // Log audit trail
      try {
        const auditContext = (req as any).auditContext || {
          userId: (req as any).user?.id || createdBy,
          userName: (req as any).user?.full_name,
          userRole: (req as any).user?.role,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        };

        const { logPurchaseOrderCreated } = await import('../audit/auditService.js');
        await logPurchaseOrderCreated(
          pool,
          result.po.id,
          result.po.poNumber,
          {
            itemCount: result.items?.length || 0,
            totalAmount: result.po.totalAmount,
            supplierId: result.po.supplierId,
            status: result.po.status,
          },
          auditContext
        );
      } catch (auditError) {
        console.error('Audit logging failed (non-fatal):', auditError);
      }

      res.status(201).json({
        success: true,
        data: result,
        message: `Purchase order ${result.po.poNumber} created successfully`,
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        });
        return;
      }

      console.error('Error creating purchase order:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to create purchase order',
      });
    }
  },

  /**
   * Get PO by ID
   */
  async getPOById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const result = await purchaseOrderService.getPOById(pool, id);

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      console.error('Error getting purchase order:', error);

      if (error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: error.message,
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to get purchase order',
      });
    }
  },

  /**
   * List purchase orders
   */
  async listPOs(req: Request, res: Response): Promise<void> {
    try {
      const query = ListPOsQuerySchema.parse(req.query);
      const result = await purchaseOrderService.listPOs(pool, query.page, query.limit, {
        status: query.status,
        supplierId: query.supplierId,
      });

      res.json({
        success: true,
        data: result.pos,
        pagination: {
          page: query.page,
          limit: query.limit,
          total: result.total,
          totalPages: Math.ceil(result.total / query.limit),
        },
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Invalid query parameters',
          details: error.errors,
        });
        return;
      }

      console.error('Error listing purchase orders:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to list purchase orders',
      });
    }
  },

  /**
   * Update PO status
   */
  async updatePOStatus(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { status } = UpdatePOStatusSchema.parse(req.body);

      // Get current status before update for audit
      const currentPO = await purchaseOrderService.getPOById(pool, id);
      const oldStatus = currentPO?.po?.status;

      const result = await purchaseOrderService.updatePOStatus(pool, id, status);

      // Log audit trail for status change
      try {
        const auditContext = (req as any).auditContext || {
          userId: (req as any).user?.id || '00000000-0000-0000-0000-000000000000',
          userName: (req as any).user?.full_name,
          userRole: (req as any).user?.role,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        };

        const { logPurchaseOrderStatusChanged } = await import('../audit/auditService.js');
        await logPurchaseOrderStatusChanged(
          pool,
          id,
          result.po?.poNumber || result.poNumber,
          oldStatus || 'UNKNOWN',
          status,
          auditContext
        );
      } catch (auditError) {
        console.error('Audit logging failed (non-fatal):', auditError);
      }

      res.json({
        success: true,
        data: result,
        message: `Purchase order status updated to ${status}`,
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        });
        return;
      }

      console.error('Error updating purchase order status:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to update purchase order status',
      });
    }
  },

  /**
   * Submit purchase order (DRAFT -> PENDING)
   */
  async submitPO(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const result = await purchaseOrderService.submitPO(pool, id);

      res.json({
        success: true,
        data: result,
        message: 'Purchase order submitted successfully',
      });
    } catch (error: any) {
      console.error('Error submitting purchase order:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to submit purchase order',
      });
    }
  },

  /**
   * Cancel purchase order
   */
  async cancelPO(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const result = await purchaseOrderService.cancelPO(pool, id);

      res.json({
        success: true,
        data: result,
        message: 'Purchase order cancelled successfully',
      });
    } catch (error: any) {
      console.error('Error cancelling purchase order:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to cancel purchase order',
      });
    }
  },

  /**
   * Delete purchase order
   */
  async deletePO(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      await purchaseOrderService.deletePO(pool, id);

      res.json({
        success: true,
        message: 'Purchase order deleted successfully',
      });
    } catch (error: any) {
      console.error('Error deleting purchase order:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to delete purchase order',
      });
    }
  },

  /**
   * Send PO to supplier (auto-creates goods receipt draft)
   */
  async sendPOToSupplier(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = (req as any).user.id;

      const result = await purchaseOrderService.sendPOToSupplier(pool, id, userId);

      res.json({
        success: true,
        data: result,
        message: 'Purchase order sent to supplier. Goods receipt draft created for receiving.',
      });
    } catch (error: any) {
      console.error('Error sending PO to supplier:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to send PO to supplier',
      });
    }
  },

  /**
   * Create supplier invoice
   */
  async createInvoice(req: Request, res: Response): Promise<void> {
    try {
      const {
        purchaseOrderId,
        goodsReceiptId,
        invoiceNumber,
        invoiceDate,
        dueDate,
        supplierId,
        totalAmount,
        paymentTerms,
        notes,
      } = req.body;
      const userId = (req as any).user.id;

      const invoice = await purchaseOrderService.createSupplierInvoice(pool, {
        purchaseOrderId,
        goodsReceiptId,
        invoiceNumber,
        invoiceDate: new Date(invoiceDate),
        dueDate: new Date(dueDate),
        supplierId,
        totalAmount: parseFloat(totalAmount),
        paymentTerms,
        notes,
        createdBy: userId,
      });

      res.status(201).json({
        success: true,
        data: invoice,
        message: 'Supplier invoice created successfully',
      });
    } catch (error: any) {
      console.error('Error creating invoice:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to create invoice',
      });
    }
  },

  /**
   * Record payment
   */
  async recordPayment(req: Request, res: Response): Promise<void> {
    try {
      const { invoiceId, supplierId, amount, paymentMethod, paymentDate, referenceNumber, notes } =
        req.body;
      const userId = (req as any).user.id;

      const payment = await purchaseOrderService.recordPayment(pool, {
        invoiceId,
        supplierId,
        amount: parseFloat(amount),
        paymentMethod,
        paymentDate: new Date(paymentDate),
        referenceNumber,
        notes,
        createdBy: userId,
      });

      res.status(201).json({
        success: true,
        data: payment,
        message: 'Payment recorded successfully',
      });
    } catch (error: any) {
      console.error('Error recording payment:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to record payment',
      });
    }
  },
};

// Routes
export const purchaseOrderRoutes = Router();

// View routes - all authenticated users
purchaseOrderRoutes.get('/', authenticate, purchaseOrderController.listPOs);
purchaseOrderRoutes.get('/:id', authenticate, purchaseOrderController.getPOById);

// Create/modify routes - ADMIN, MANAGER only
purchaseOrderRoutes.post(
  '/',
  authenticate,
  authorize('ADMIN', 'MANAGER'),
  purchaseOrderController.createPO
);
purchaseOrderRoutes.put(
  '/:id/status',
  authenticate,
  authorize('ADMIN', 'MANAGER'),
  purchaseOrderController.updatePOStatus
);
purchaseOrderRoutes.post(
  '/:id/submit',
  authenticate,
  authorize('ADMIN', 'MANAGER'),
  purchaseOrderController.submitPO
);
purchaseOrderRoutes.post(
  '/:id/send-to-supplier',
  authenticate,
  authorize('ADMIN', 'MANAGER'),
  purchaseOrderController.sendPOToSupplier
);
purchaseOrderRoutes.post(
  '/:id/cancel',
  authenticate,
  authorize('ADMIN', 'MANAGER'),
  purchaseOrderController.cancelPO
);
purchaseOrderRoutes.delete(
  '/:id',
  authenticate,
  authorize('ADMIN', 'MANAGER'),
  purchaseOrderController.deletePO
);

// Invoice and payment routes
purchaseOrderRoutes.post(
  '/invoices',
  authenticate,
  authorize('ADMIN', 'MANAGER'),
  purchaseOrderController.createInvoice
);
purchaseOrderRoutes.post(
  '/payments',
  authenticate,
  authorize('ADMIN', 'MANAGER'),
  purchaseOrderController.recordPayment
);
