import { Pool, PoolClient } from 'pg';
import { getBusinessDate, getBusinessYear } from '../../utils/dateRange.js';
import { convertKeysToCamelCase } from '../../utils/caseConverter.js';

// ── Types ────────────────────────────────────────────────────────────

export type OrderStatus = 'PENDING' | 'COMPLETED' | 'CANCELLED';

export interface OrderRecord {
  id: string;
  orderNumber: string;
  customerId: string | null;
  customerName: string | null;
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  totalAmount: string;
  status: OrderStatus;
  createdBy: string;
  createdByName: string | null;
  assignedCashierId: string | null;
  assignedCashierName: string | null;
  orderDate: string;
  notes: string | null;
  createdAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancelledByName: string | null;
  cancelReason: string | null;
  items?: OrderItemRecord[];
}

export interface OrderItemRecord {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
  discountAmount: string;
  uomId: string | null;
  baseQty: string | null;
  baseUomId: string | null;
  conversionFactor: string | null;
}

export interface CreateOrderData {
  customerId?: string | null;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  createdBy: string;
  assignedCashierId?: string | null;
  orderDate?: string;
  notes?: string | null;
  idempotencyKey?: string | null;
}

export interface CreateOrderItemData {
  orderId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  discountAmount?: number;
  uomId?: string | null;
  baseQty?: number | null;
  baseUomId?: string | null;
  conversionFactor?: number | null;
}

// ── Repository ───────────────────────────────────────────────────────

export const ordersRepository = {
  /**
   * Find an existing order by idempotency key (deduplication for offline sync).
   */
  async findByIdempotencyKey(pool: Pool | PoolClient, key: string): Promise<OrderRecord | null> {
    const result = await pool.query(
      `SELECT
        o.id, o.order_number, o.customer_id,
        c.name AS customer_name, o.subtotal, o.discount_amount,
        o.tax_amount, o.total_amount, o.status,
        o.created_by, uc.full_name AS created_by_name,
        o.assigned_cashier_id, ua.full_name AS assigned_cashier_name,
        o.order_date, o.notes, o.created_at,
        o.completed_at, o.cancelled_at,
        o.cancelled_by, o.cancel_reason
      FROM pos_orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      LEFT JOIN users uc ON o.created_by = uc.id
      LEFT JOIN users ua ON o.assigned_cashier_id = ua.id
      WHERE o.idempotency_key = $1
      LIMIT 1`,
      [key]
    );
    return result.rows[0] ? convertKeysToCamelCase(result.rows[0]) as OrderRecord : null;
  },

  /**
   * Generate next order number (ORD-YYYY-NNNN format).
   * Advisory lock prevents concurrent duplicate generation.
   * MUST be called on the transaction client so lock is held until COMMIT.
   */
  async generateOrderNumber(client: Pool | PoolClient): Promise<string> {
    const year = getBusinessYear();
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('order_number_seq'))`);

    const result = await client.query(
      `SELECT order_number FROM pos_orders
       WHERE order_number LIKE $1
       ORDER BY order_number DESC
       LIMIT 1`,
      [`ORD-${year}-%`]
    );

    if (result.rows.length === 0) {
      return `ORD-${year}-0001`;
    }

    const lastNumber = result.rows[0].order_number;
    const sequence = parseInt(lastNumber.split('-')[2]) + 1;
    return `ORD-${year}-${sequence.toString().padStart(4, '0')}`;
  },

  /**
   * Create a new POS order. Must be called inside a transaction.
   */
  async createOrder(client: Pool | PoolClient, data: CreateOrderData): Promise<OrderRecord> {
    const orderNumber = await this.generateOrderNumber(client);

    const result = await client.query(
      `INSERT INTO pos_orders (
        order_number, customer_id, subtotal, discount_amount, tax_amount,
        total_amount, status, created_by, assigned_cashier_id, order_date, notes, idempotency_key
      ) VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', $7, $8, $9, $10, $11)
      RETURNING
        id,
        order_number,
        customer_id,
        subtotal,
        discount_amount,
        tax_amount,
        total_amount,
        status,
        created_by,
        assigned_cashier_id,
        order_date,
        notes,
        created_at,
        completed_at,
        cancelled_at,
        cancelled_by,
        cancel_reason`,
      [
        orderNumber,
        data.customerId || null,
        data.subtotal,
        data.discountAmount,
        data.taxAmount,
        data.totalAmount,
        data.createdBy,
        data.assignedCashierId || null,
        data.orderDate || getBusinessDate(),
        data.notes || null,
        data.idempotencyKey || null,
      ]
    );

    // Attach display names as null (caller can enrich)
    const row = result.rows[0];
    row.customer_name = null;
    row.created_by_name = null;
    row.assigned_cashier_name = null;
    return convertKeysToCamelCase(row) as OrderRecord;
  },

  /**
   * Add items to an order (batch insert).
   */
  async addOrderItems(client: Pool | PoolClient, items: CreateOrderItemData[]): Promise<OrderItemRecord[]> {
    if (items.length === 0) return [];

    const values: unknown[] = [];
    const placeholders: string[] = [];
    let idx = 1;

    for (const item of items) {
      placeholders.push(
        `($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`
      );
      values.push(
        item.orderId,
        item.productId,
        item.productName,
        item.quantity,
        item.unitPrice,
        item.lineTotal,
        item.discountAmount || 0,
        item.uomId || null,
        item.baseQty ?? null,
        item.baseUomId || null,
        item.conversionFactor ?? null
      );
    }

    const result = await client.query(
      `INSERT INTO pos_order_items (
        order_id, product_id, product_name, quantity, unit_price, line_total,
        discount_amount, uom_id, base_qty, base_uom_id, conversion_factor
      ) VALUES ${placeholders.join(', ')}
      RETURNING
        id,
        order_id,
        product_id,
        product_name,
        quantity,
        unit_price,
        line_total,
        discount_amount,
        uom_id,
        base_qty,
        base_uom_id,
        conversion_factor`,
      values
    );

    return result.rows.map(r => convertKeysToCamelCase(r) as OrderItemRecord);
  },

  /**
   * Get a single order by ID (UUID) or order_number, with items and joined names.
   */
  async getById(pool: Pool | PoolClient, identifier: string): Promise<OrderRecord | null> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(identifier);
    const column = isUuid ? 'o.id' : 'o.order_number';

    const orderResult = await pool.query(
      `SELECT
        o.id,
        o.order_number,
        o.customer_id,
        c.name             AS customer_name,
        o.subtotal,
        o.discount_amount,
        o.tax_amount,
        o.total_amount,
        o.status,
        o.created_by,
        uc.full_name       AS created_by_name,
        o.assigned_cashier_id,
        ua.full_name       AS assigned_cashier_name,
        o.order_date,
        o.notes,
        o.created_at,
        o.completed_at,
        o.cancelled_at,
        o.cancelled_by,
        ucx.full_name      AS cancelled_by_name,
        o.cancel_reason
      FROM pos_orders o
      LEFT JOIN customers c ON c.id = o.customer_id
      LEFT JOIN users uc ON uc.id = o.created_by
      LEFT JOIN users ua ON ua.id = o.assigned_cashier_id
      LEFT JOIN users ucx ON ucx.id = o.cancelled_by
      WHERE ${column} = $1`,
      [identifier]
    );

    if (orderResult.rows.length === 0) return null;

    const order: OrderRecord = convertKeysToCamelCase(orderResult.rows[0]) as OrderRecord;

    // Fetch items
    const itemsResult = await pool.query(
      `SELECT
        id,
        order_id,
        product_id,
        product_name,
        quantity,
        unit_price,
        line_total,
        discount_amount,
        uom_id,
        base_qty,
        base_uom_id,
        conversion_factor
      FROM pos_order_items
      WHERE order_id = $1
      ORDER BY product_name`,
      [order.id]
    );

    order.items = itemsResult.rows.map(r => convertKeysToCamelCase(r) as OrderItemRecord);
    return order;
  },

  /**
   * List pending orders (orders queue). Supports filtering by date.
   */
  async listPending(pool: Pool, filters?: { orderDate?: string }): Promise<OrderRecord[]> {
    const conditions = [`o.status = 'PENDING'`];
    const values: unknown[] = [];
    let idx = 1;

    if (filters?.orderDate) {
      conditions.push(`o.order_date = $${idx++}`);
      values.push(filters.orderDate);
    }

    const result = await pool.query(
      `SELECT
        o.id,
        o.order_number,
        o.customer_id,
        c.name             AS customer_name,
        o.subtotal,
        o.discount_amount,
        o.tax_amount,
        o.total_amount,
        o.status,
        o.created_by,
        uc.full_name       AS created_by_name,
        o.assigned_cashier_id,
        ua.full_name       AS assigned_cashier_name,
        o.order_date,
        o.notes,
        o.created_at,
        o.completed_at,
        (SELECT COUNT(*) FROM pos_order_items WHERE order_id = o.id) AS item_count
      FROM pos_orders o
      LEFT JOIN customers c ON c.id = o.customer_id
      LEFT JOIN users uc ON uc.id = o.created_by
      LEFT JOIN users ua ON ua.id = o.assigned_cashier_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY o.created_at ASC`,
      values
    );

    return result.rows.map(r => convertKeysToCamelCase(r) as OrderRecord);
  },

  /**
   * List all orders with pagination and filters.
   */
  async list(
    pool: Pool,
    filters: { status?: OrderStatus; startDate?: string; endDate?: string; page?: number; limit?: number }
  ): Promise<{ rows: OrderRecord[]; total: number }> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (filters.status) {
      conditions.push(`o.status = $${idx++}`);
      values.push(filters.status);
    }
    if (filters.startDate) {
      conditions.push(`o.order_date >= $${idx++}`);
      values.push(filters.startDate);
    }
    if (filters.endDate) {
      conditions.push(`o.order_date <= $${idx++}`);
      values.push(filters.endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const offset = (page - 1) * limit;

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM pos_orders o ${whereClause}`,
      values
    );
    const total = parseInt(countResult.rows[0].count);

    const dataValues = [...values, limit, offset];
    const result = await pool.query(
      `SELECT
        o.id,
        o.order_number,
        o.customer_id,
        c.name             AS customer_name,
        o.subtotal,
        o.discount_amount,
        o.tax_amount,
        o.total_amount,
        o.status,
        o.created_by,
        uc.full_name       AS created_by_name,
        o.assigned_cashier_id,
        ua.full_name       AS assigned_cashier_name,
        o.order_date,
        o.notes,
        o.created_at,
        o.completed_at,
        o.cancelled_at,
        o.cancelled_by,
        ucx.full_name      AS cancelled_by_name,
        o.cancel_reason
      FROM pos_orders o
      LEFT JOIN customers c ON c.id = o.customer_id
      LEFT JOIN users uc ON uc.id = o.created_by
      LEFT JOIN users ua ON ua.id = o.assigned_cashier_id
      LEFT JOIN users ucx ON ucx.id = o.cancelled_by
      ${whereClause}
      ORDER BY o.created_at DESC
      LIMIT $${idx++} OFFSET $${idx++}`,
      dataValues
    );

    return { rows: result.rows.map(r => convertKeysToCamelCase(r) as OrderRecord), total };
  },

  /**
   * Mark an order as COMPLETED (after cashier converts to sale).
   */
  async markCompleted(client: Pool | PoolClient, orderId: string): Promise<void> {
    await client.query(
      `UPDATE pos_orders
       SET status = 'COMPLETED', completed_at = NOW()
       WHERE id = $1 AND status = 'PENDING'`,
      [orderId]
    );
  },

  /**
   * Cancel a pending order.
   */
  async cancelOrder(
    client: Pool | PoolClient,
    orderId: string,
    cancelledBy: string,
    reason: string
  ): Promise<void> {
    await client.query(
      `UPDATE pos_orders
       SET status = 'CANCELLED', cancelled_at = NOW(), cancelled_by = $2, cancel_reason = $3
       WHERE id = $1 AND status = 'PENDING'`,
      [orderId, cancelledBy, reason]
    );
  },

  /**
   * Get the count of pending orders (for badge display).
   */
  async getPendingCount(pool: Pool): Promise<number> {
    const result = await pool.query(
      `SELECT COUNT(*) FROM pos_orders WHERE status = 'PENDING'`
    );
    return parseInt(result.rows[0].count);
  },
};
