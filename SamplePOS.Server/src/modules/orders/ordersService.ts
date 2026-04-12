import { Pool, PoolClient } from 'pg';
import { UnitOfWork } from '../../db/unitOfWork.js';
import { ordersRepository, CreateOrderData, CreateOrderItemData, OrderRecord } from './ordersRepository.js';
import { ValidationError, NotFoundError, BusinessError } from '../../middleware/errorHandler.js';
import * as documentFlowService from '../document-flow/documentFlowService.js';
import logger from '../../utils/logger.js';
import Decimal from 'decimal.js';

// ── Input types ──────────────────────────────────────────────────────

export interface OrderItemInput {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  discountAmount?: number;
  uomId?: string | null;
  baseQty?: number | null;
  baseUomId?: string | null;
  conversionFactor?: number | null;
}

export interface CreateOrderInput {
  customerId?: string | null;
  items: OrderItemInput[];
  subtotal?: number;
  discountAmount?: number;
  taxAmount?: number;
  totalAmount?: number;
  createdBy: string;
  assignedCashierId?: string | null;
  orderDate?: string;
  notes?: string | null;
  idempotencyKey?: string;
}

// ── Service ──────────────────────────────────────────────────────────

export const ordersService = {
  /**
   * Create a new POS order (dispenser workflow).
   * Calculates line totals, validates items, persists in a transaction.
   */
  async createOrder(pool: Pool, input: CreateOrderInput): Promise<OrderRecord> {
    if (!input.items || input.items.length === 0) {
      throw new ValidationError('Order must have at least one item');
    }

    // Idempotency guard: if an order with this key already exists, return it
    if (input.idempotencyKey) {
      const existing = await ordersRepository.findByIdempotencyKey(pool, input.idempotencyKey);
      if (existing) {
        logger.info('Order idempotency hit — returning existing order', { idempotencyKey: input.idempotencyKey, orderNumber: existing.orderNumber });
        return existing;
      }
    }

    // Calculate totals from items
    let calculatedSubtotal = new Decimal(0);
    let calculatedDiscount = new Decimal(0);

    for (const item of input.items) {
      const lineTotal = new Decimal(item.quantity).times(new Decimal(item.unitPrice));
      calculatedSubtotal = calculatedSubtotal.plus(lineTotal);
      if (item.discountAmount) {
        calculatedDiscount = calculatedDiscount.plus(new Decimal(item.discountAmount));
      }
    }

    const subtotal = input.subtotal !== undefined ? new Decimal(input.subtotal) : calculatedSubtotal;
    const discountAmount = input.discountAmount !== undefined ? new Decimal(input.discountAmount) : calculatedDiscount;
    const taxAmount = input.taxAmount !== undefined ? new Decimal(input.taxAmount) : new Decimal(0);
    const totalAmount = input.totalAmount !== undefined
      ? new Decimal(input.totalAmount)
      : subtotal.minus(discountAmount).plus(taxAmount);

    let order: OrderRecord;
    try {
      order = await UnitOfWork.run(pool, async (client: PoolClient) => {
        // Create order header
        const orderData: CreateOrderData = {
          customerId: input.customerId || null,
          subtotal: parseFloat(subtotal.toFixed(2)),
          discountAmount: parseFloat(discountAmount.toFixed(2)),
          taxAmount: parseFloat(taxAmount.toFixed(2)),
          totalAmount: parseFloat(totalAmount.toFixed(2)),
          createdBy: input.createdBy,
          assignedCashierId: input.assignedCashierId || null,
          orderDate: input.orderDate,
          notes: input.notes || null,
          idempotencyKey: input.idempotencyKey || null,
        };

        const createdOrder = await ordersRepository.createOrder(client, orderData);

        // Create order items
        const itemsData: CreateOrderItemData[] = input.items.map(item => {
          const lineTotal = new Decimal(item.quantity).times(new Decimal(item.unitPrice));
          return {
            orderId: createdOrder.id,
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            lineTotal: parseFloat(lineTotal.toFixed(2)),
            discountAmount: item.discountAmount || 0,
            uomId: item.uomId || null,
            baseQty: item.baseQty ?? null,
            baseUomId: item.baseUomId || null,
            conversionFactor: item.conversionFactor ?? null,
          };
        });

        const items = await ordersRepository.addOrderItems(client, itemsData);
        createdOrder.items = items;

        return createdOrder;
      });
    } catch (err: unknown) {
      // Race condition: unique constraint on idempotency_key fired between pre-check and INSERT
      const pgErr = err as { code?: string };
      if (pgErr.code === '23505' && input.idempotencyKey) {
        const existing = await ordersRepository.findByIdempotencyKey(pool, input.idempotencyKey);
        if (existing) {
          logger.info('Order idempotency race resolved — returning existing order', { idempotencyKey: input.idempotencyKey });
          return existing;
        }
      }
      throw err;
    }

    logger.info('POS order created', { orderNumber: order.orderNumber, totalAmount: totalAmount.toFixed(2) });
    return order;
  },

  /**
   * Get a single order by ID or order number.
   */
  async getOrder(pool: Pool, identifier: string): Promise<OrderRecord> {
    const order = await ordersRepository.getById(pool, identifier);
    if (!order) {
      throw new NotFoundError(`Order not found: ${identifier}`);
    }
    return order;
  },

  /**
   * List pending orders for the queue screen.
   */
  async listPendingOrders(pool: Pool, filters?: { orderDate?: string }): Promise<OrderRecord[]> {
    return ordersRepository.listPending(pool, filters);
  },

  /**
   * Get pending order count (for nav badge).
   */
  async getPendingCount(pool: Pool): Promise<number> {
    return ordersRepository.getPendingCount(pool);
  },

  /**
   * List all orders with pagination.
   */
  async listOrders(
    pool: Pool,
    filters: { status?: 'PENDING' | 'COMPLETED' | 'CANCELLED'; startDate?: string; endDate?: string; page?: number; limit?: number }
  ) {
    return ordersRepository.list(pool, filters);
  },

  /**
   * Cancel a pending order. Only PENDING orders can be cancelled.
   */
  async cancelOrder(pool: Pool, orderId: string, cancelledBy: string, reason: string): Promise<OrderRecord> {
    if (!reason || reason.trim().length === 0) {
      throw new ValidationError('Cancellation reason is required');
    }

    const order = await ordersRepository.getById(pool, orderId);
    if (!order) {
      throw new NotFoundError(`Order not found: ${orderId}`);
    }
    if (order.status !== 'PENDING') {
      throw new BusinessError(
        `Cannot cancel order ${order.orderNumber} — status is ${order.status}`,
        'ERR_ORDER_002',
        { orderId, currentStatus: order.status }
      );
    }

    await UnitOfWork.run(pool, async (client: PoolClient) => {
      await ordersRepository.cancelOrder(client, orderId, cancelledBy, reason);
    });

    logger.info('POS order cancelled', { orderNumber: order.orderNumber, reason });
    return this.getOrder(pool, orderId);
  },

  /**
   * Complete an order by converting it to a sale.
   * Returns the order items formatted for the sales service CreateSaleInput.
   * The actual sale creation is done by the caller (controller) using salesService.createSale().
   * This method validates the order and marks it COMPLETED inside the caller's transaction.
   */
  async prepareOrderForPayment(pool: Pool, orderId: string): Promise<OrderRecord> {
    const order = await ordersRepository.getById(pool, orderId);
    if (!order) {
      throw new NotFoundError(`Order not found: ${orderId}`);
    }
    if (order.status !== 'PENDING') {
      throw new BusinessError(
        `Cannot complete order ${order.orderNumber} — status is ${order.status}`,
        'ERR_ORDER_003',
        { orderId, currentStatus: order.status }
      );
    }
    if (!order.items || order.items.length === 0) {
      throw new BusinessError(
        `Order ${order.orderNumber} has no items`,
        'ERR_ORDER_004',
        { orderId }
      );
    }
    return order;
  },

  /**
   * Mark order as completed and link to sale (called after sale creation).
   */
  async completeOrderInTransaction(
    pool: Pool,
    orderId: string,
    saleId: string
  ): Promise<void> {
    await UnitOfWork.run(pool, async (client: PoolClient) => {
      await ordersRepository.markCompleted(client, orderId);

      // Link from_order_id on the sale
      await client.query(
        `UPDATE sales SET from_order_id = $1 WHERE id = $2`,
        [orderId, saleId]
      );

      // Document flow: ORDER → SALE
      try {
        await documentFlowService.linkDocuments(client, 'ORDER', orderId, 'SALE', saleId, 'CREATES');
      } catch (err) {
        logger.warn('Document flow link ORDER→SALE failed (non-fatal)', { orderId, saleId, error: err });
      }
    });
  },
};
