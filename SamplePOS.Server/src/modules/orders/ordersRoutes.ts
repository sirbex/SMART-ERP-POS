import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { pool as globalPool } from '../../db/pool.js';
import { ordersService, CreateOrderInput, OrderItemInput } from './ordersService.js';
import { salesService, CreateSaleInput, SaleItemInput } from '../sales/salesService.js';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission, requireAnyPermission } from '../../rbac/middleware.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { Money } from '../../utils/money.js';

// ── Validation Schemas ────────────────────────────────────────────────

const OrderItemSchema = z.object({
  productId: z.string().min(1),
  productName: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  discountAmount: z.number().nonnegative().optional(),
  uomId: z.string().uuid().nullable().optional(),
  baseQty: z.number().nullable().optional(),
  baseUomId: z.string().uuid().nullable().optional(),
  conversionFactor: z.number().nullable().optional(),
});

const CreateOrderSchema = z.object({
  customerId: z.string().uuid().nullable().optional(),
  items: z.array(OrderItemSchema).min(1),
  subtotal: z.number().nonnegative().optional(),
  discountAmount: z.number().nonnegative().optional(),
  taxAmount: z.number().nonnegative().optional(),
  totalAmount: z.number().nonnegative().optional(),
  assignedCashierId: z.string().uuid().nullable().optional(),
  orderDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().nullable().optional(),
  idempotencyKey: z.string().max(100).optional(),
});

const CompleteOrderSchema = z.object({
  paymentMethod: z.enum(['CASH', 'CARD', 'MOBILE_MONEY', 'CREDIT', 'DEPOSIT', 'BANK_TRANSFER']),
  paymentReceived: z.number().nonnegative(),
  paymentLines: z.array(z.object({
    paymentMethod: z.enum(['CASH', 'CARD', 'MOBILE_MONEY', 'CREDIT', 'DEPOSIT']),
    amount: z.number().positive(),
    reference: z.string().optional(),
  })).optional(),
  customerId: z.string().uuid().nullable().optional(),
  cashRegisterSessionId: z.string().uuid().optional(),
});

const CancelOrderSchema = z.object({
  reason: z.string().min(1, 'Cancellation reason is required'),
});

const ListOrdersQuerySchema = z.object({
  page: z.string().optional().transform(val => val ? parseInt(val) : 1),
  limit: z.string().optional().transform(val => val ? parseInt(val) : 50),
  status: z.enum(['PENDING', 'COMPLETED', 'CANCELLED']).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

// ── Router ────────────────────────────────────────────────────────────

const router = Router();

// All order routes require authentication
router.use(authenticate);

/**
 * GET /api/orders/pending
 * List pending orders for the queue screen.
 * Access: CASHIER, ADMIN, MANAGER, STAFF
 */
router.get(
  '/pending',
  requireAnyPermission(['orders.read', 'orders.pay', 'orders.create']),
  asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const orderDate = typeof req.query.orderDate === 'string' ? req.query.orderDate : undefined;
    const orders = await ordersService.listPendingOrders(pool, { orderDate });
    res.json({ success: true, data: orders });
  })
);

/**
 * GET /api/orders/pending-count
 * Get count of pending orders (for badge display).
 */
router.get(
  '/pending-count',
  requireAnyPermission(['orders.read', 'orders.pay', 'orders.create']),
  asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const count = await ordersService.getPendingCount(pool);
    res.json({ success: true, data: { count } });
  })
);

/**
 * POST /api/orders
 * Create a new POS order (dispenser workflow).
 * Access: orders.create (STAFF/dispenser role, ADMIN, MANAGER)
 */
router.post(
  '/',
  requirePermission('orders.create'),
  asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const validated = CreateOrderSchema.parse(req.body);
    const userId = req.user!.id;

    const input: CreateOrderInput = {
      ...validated,
      createdBy: userId,
      items: validated.items as OrderItemInput[],
    };

    const order = await ordersService.createOrder(pool, input);
    res.status(201).json({ success: true, data: order, message: `Order ${order.orderNumber} created` });
  })
);

/**
 * GET /api/orders
 * List all orders with pagination and filters.
 */
router.get(
  '/',
  requireAnyPermission(['orders.read', 'orders.pay', 'orders.create']),
  asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const filters = ListOrdersQuerySchema.parse(req.query);
    const { rows, total } = await ordersService.listOrders(pool, filters);

    const page = filters.page || 1;
    const limit = filters.limit || 50;
    res.json({
      success: true,
      data: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  })
);

/**
 * GET /api/orders/:id
 * Get a single order by ID or order number.
 */
router.get(
  '/:id',
  requireAnyPermission(['orders.read', 'orders.pay', 'orders.create']),
  asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const order = await ordersService.getOrder(pool, req.params.id);
    res.json({ success: true, data: order });
  })
);

/**
 * POST /api/orders/:id/complete
 * Complete an order by converting it to a sale (cashier workflow).
 * The cashier provides payment details; the order items become sale items.
 * Access: orders.pay (CASHIER, ADMIN, MANAGER)
 */
router.post(
  '/:id/complete',
  requirePermission('orders.pay'),
  asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const paymentData = CompleteOrderSchema.parse(req.body);
    const userId = req.user!.id;
    const orderId = req.params.id;

    // 1. Validate the order is PENDING and get its items
    const order = await ordersService.prepareOrderForPayment(pool, orderId);

    // 2. Build CreateSaleInput from order items
    const saleItems: SaleItemInput[] = order.items!.map(item => ({
      productId: item.productId,
      productName: item.productName,
      quantity: Money.toNumber(Money.parseDb(item.quantity)),
      unitPrice: Money.toNumber(Money.parseDb(item.unitPrice)),
      discountAmount: item.discountAmount ? Money.toNumber(Money.parseDb(item.discountAmount)) : undefined,
      uomId: item.uomId || undefined,
    }));

    // Allow customer override at payment time (cashier can assign/change customer)
    const effectiveCustomerId = paymentData.customerId ?? order.customerId;

    const saleInput: CreateSaleInput = {
      customerId: effectiveCustomerId,
      items: saleItems,
      subtotal: Money.toNumber(Money.parseDb(order.subtotal)),
      discountAmount: Money.toNumber(Money.parseDb(order.discountAmount)),
      taxAmount: Money.toNumber(Money.parseDb(order.taxAmount)),
      totalAmount: Money.toNumber(Money.parseDb(order.totalAmount)),
      paymentMethod: paymentData.paymentMethod,
      paymentReceived: paymentData.paymentReceived,
      soldBy: userId,
      paymentLines: paymentData.paymentLines,
      cashRegisterSessionId: paymentData.cashRegisterSessionId,
      // Atomically mark the order COMPLETED within the same sale transaction
      fromOrderId: orderId,
    };

    // 3. Create the sale AND atomically mark order completed (single transaction)
    const result = await salesService.createSale(pool, saleInput);

    res.json({
      success: true,
      data: { order: { ...order, status: 'COMPLETED' }, sale: result.sale },
      message: `Order ${order.orderNumber} completed → Sale ${result.sale.saleNumber}`,
    });
  })
);

/**
 * POST /api/orders/:id/cancel
 * Cancel a pending order.
 * Access: orders.cancel (ADMIN, MANAGER, or the dispenser who created it)
 */
router.post(
  '/:id/cancel',
  requireAnyPermission(['orders.cancel', 'orders.create']),
  asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const { reason } = CancelOrderSchema.parse(req.body);
    const userId = req.user!.id;

    const order = await ordersService.cancelOrder(pool, req.params.id, userId, reason);
    res.json({ success: true, data: order, message: `Order ${order.orderNumber} cancelled` });
  })
);

export default router;
