import { Pool, PoolClient } from 'pg';
import Decimal from 'decimal.js';
import { Money } from '../../utils/money.js';
import { BusinessError } from '../../middleware/errorHandler.js';
import { checkAccountingPeriodOpen } from '../../utils/periodGuard.js';

export interface SaleRecord {
  id: string;
  saleNumber: string;
  customerId: string | null;
  customerName: string | null;
  subtotal?: number;
  taxAmount?: number;
  discountAmount?: number;
  totalAmount: number;
  totalCost?: number;
  profit?: number;
  profitMargin?: number;
  paymentMethod: string;
  paymentReceived: number;
  amountPaid?: number;
  changeAmount: number;
  status: string;
  soldBy: string;
  cashierId?: string;
  quoteId?: string | null;
  createdAt: Date;
  saleDate?: string;
}

export interface SaleItemRecord {
  id: string;
  saleId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  costPrice: number;
  profit: number;
}

export interface VoidSaleItemRecord {
  id: string;
  saleId: string;
  productId: string;
  batchId: string | null;
  quantity: string;
  unitPrice: string;
  unitCost: string;
  totalPrice: string;
  profit: string;
  uomId: string | null;
  productName: string;
  sku: string;
}

export interface RefundableSaleItemRecord {
  id: string;
  saleId: string;
  productId: string | null;
  batchId: string | null;
  quantity: string;
  refundedQty: string;
  remainingQty: string;
  unitPrice: string;
  unitCost: string;
  totalPrice: string;
  discountAmount: string;
  profit: string;
  uomId: string | null;
  productType: string;
  itemType: string;
  productName: string;
  sku: string | null;
}

export interface RefundRecord {
  id: string;
  refundNumber: string;
  saleId: string;
  refundDate: string;
  reason: string;
  totalAmount: string;
  totalCost: string;
  status: string;
  glTransactionId: string | null;
  createdById: string;
  approvedById: string | null;
  createdAt: string;
}

export interface RefundItemRecord {
  id: string;
  refundId: string;
  saleItemId: string;
  productId: string | null;
  batchId: string | null;
  quantity: string;
  unitPrice: string;
  unitCost: string;
  lineTotal: string;
  costTotal: string;
  productName: string;
  sku: string | null;
}

export interface CreateRefundData {
  saleId: string;
  refundDate?: string;
  reason: string;
  totalAmount: string;
  totalCost: string;
  createdById: string;
  approvedById?: string;
}

export interface CreateRefundItemData {
  refundId: string;
  saleItemId: string;
  productId: string | null;
  batchId: string | null;
  quantity: string;
  unitPrice: string;
  unitCost: string;
  lineTotal: string;
  costTotal: string;
}

export interface CreateSaleData {
  customerId: string | null;
  subtotal?: number; // Subtotal before discount/tax
  totalAmount: number;
  totalCost?: number;
  discountAmount?: number; // Discount applied to sale
  taxAmount?: number;
  paymentMethod: string;
  paymentReceived: number;
  changeAmount: number;
  soldBy: string;
  saleDate?: string; // ISO 8601 datetime for backdated sales
  isSplitPayment?: boolean; // Indicates if sale uses split payment
  totalPaid?: number; // Total amount paid (may differ from totalAmount for credit)
  balanceDue?: number; // Remaining balance (for customer credit)
  quoteId?: string | null; // Link to quotation if sale is from quote conversion
  idempotencyKey?: string; // Offline sync idempotency key
  offlineId?: string; // Offline sale identifier
}

export interface CreateSaleItemData {
  saleId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  costPrice: number;
  profit: number;
  discountAmount?: number; // Per-item discount amount
  uomId?: string; // UUID of the product_uom used (optional for backward compatibility)
}

export const salesRepository = {
  /**
   * Generate next sale number (SALE-YYYY-NNNN format)
   * Accepts Pool or PoolClient — MUST be called on the transaction client
   * so the advisory lock is held until COMMIT.
   */
  async generateSaleNumber(pool: Pool | PoolClient): Promise<string> {
    const year = new Date().getFullYear();
    // Advisory lock prevents concurrent duplicate sale number generation (held until TX commit)
    await pool.query(`SELECT pg_advisory_xact_lock(hashtext('sale_number_seq'))`);
    const result = await pool.query(
      `SELECT sale_number FROM sales 
       WHERE sale_number LIKE $1 
       ORDER BY sale_number DESC 
       LIMIT 1`,
      [`SALE-${year}-%`]
    );

    if (result.rows.length === 0) {
      return `SALE-${year}-0001`;
    }

    const lastNumber = result.rows[0].sale_number;
    const sequence = parseInt(lastNumber.split('-')[2]) + 1;
    return `SALE-${year}-${sequence.toString().padStart(4, '0')}`;
  },

  /**
   * Create a new sale (transaction wrapper should be handled in service)
   * Accepts Pool or PoolClient to participate in caller's transaction.
   * Maps to actual sales table schema from 001_initial_schema.sql
   */
  async createSale(pool: Pool | PoolClient, data: CreateSaleData): Promise<SaleRecord> {
    const saleNumber = await this.generateSaleNumber(pool);

    // Schema fields: sale_number, customer_id, sale_date, subtotal, tax_amount,
    // discount_amount, total_amount, total_cost, profit, profit_margin,
    // payment_method, amount_paid, change_amount, status, notes, cashier_id

    // Calculate profit and margin with BANK-GRADE PRECISION
    const totalAmount = new Decimal(data.totalAmount);
    const totalCost = new Decimal(data.totalCost || 0);
    const taxAmount = new Decimal(data.taxAmount || 0);
    const discountAmount = new Decimal(data.discountAmount || 0);

    // Use subtotal from input if provided, otherwise calculate as total + discount - tax
    const subtotal =
      data.subtotal !== undefined
        ? new Decimal(data.subtotal)
        : totalAmount.plus(discountAmount).minus(taxAmount);

    // CRITICAL: Profit should EXCLUDE tax (tax is pass-through to government)
    // Profit = Revenue - Cost, where Revenue = Subtotal (before tax)
    // Formula: Profit = (Subtotal - Discount) - TotalCost
    const revenueBeforeTax = subtotal.minus(discountAmount);
    const profit = revenueBeforeTax.minus(totalCost);
    const profitMargin = revenueBeforeTax.greaterThan(0)
      ? profit.dividedBy(revenueBeforeTax)
      : new Decimal(0);

    let result;
    try {
      // Period enforcement (replaces trg_enforce_period_sales)
      await checkAccountingPeriodOpen(pool, data.saleDate ?? new Date().toISOString().slice(0, 10));

      result = await pool.query(
        `INSERT INTO sales (
        sale_number, customer_id, sale_date, subtotal, tax_amount, discount_amount, total_amount,
        total_cost, profit, profit_margin,
        payment_method, amount_paid, change_amount, cashier_id, quote_id,
        idempotency_key, offline_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING 
        id,
        sale_number as "saleNumber",
        customer_id as "customerId",
        sale_date as "saleDate",
        subtotal,
        tax_amount as "taxAmount",
        discount_amount as "discountAmount",
        total_amount as "totalAmount",
        total_cost as "totalCost",
        profit,
        profit_margin as "profitMargin",
        payment_method as "paymentMethod",
        amount_paid as "amountPaid",
        change_amount as "changeAmount",
        cashier_id as "cashierId",
        quote_id as "quoteId",
        created_at as "createdAt"`,
        [
          saleNumber,
          data.customerId,
          data.saleDate || new Date().toLocaleDateString('en-CA'), // Use YYYY-MM-DD string format, no Date object conversion
          subtotal.toFixed(2), // $4 — string for PostgreSQL NUMERIC (bank-grade precision)
          taxAmount.toFixed(2), // $5
          discountAmount.toFixed(2), // $6
          totalAmount.toFixed(2), // $7
          totalCost.toFixed(2), // $8
          profit.toFixed(2), // $9
          profitMargin.toFixed(4), // 4 decimal places for margin (0.2500 = 25%)
          data.paymentMethod,
          data.paymentReceived,
          data.changeAmount,
          data.soldBy, // Maps to cashier_id
          data.quoteId || null, // Link to quotation
          data.idempotencyKey || null,
          data.offlineId || null,
        ]
      );
    } catch (dbError: unknown) {
      // Convert PostgreSQL constraint violations to structured BusinessErrors
      const pgError = dbError as { constraint?: string; message?: string };
      if (pgError.constraint === 'chk_sales_payment_valid') {
        throw new BusinessError(
          `Payment amount is invalid for this sale. Amount paid: ${data.paymentReceived}, Total: ${totalAmount.toFixed(2)}`,
          'ERR_PAYMENT_005',
          {
            amountPaid: data.paymentReceived,
            totalAmount: Money.toNumber(totalAmount),
            constraint: 'chk_sales_payment_valid',
          }
        );
      }
      throw dbError; // Re-throw non-constraint DB errors
    }

    return result.rows[0];
  },

  /**
   * Add items to a sale
   * Accepts Pool or PoolClient to participate in caller's transaction.
   * Schema fields: sale_id, product_id, product_name, item_type, batch_id, quantity, unit_price,
   * unit_cost, discount_amount, total_price, profit
   */
  async addSaleItems(
    pool: Pool | PoolClient,
    items: CreateSaleItemData[]
  ): Promise<SaleItemRecord[]> {
    // Batch-fetch product_type and income_account_id for all non-custom items
    // (replaces trg_sale_items_set_product_type trigger)
    const productIds = items
      .filter((item) => !item.productId?.startsWith('custom_') && item.productId)
      .map((item) => item.productId!);

    const productTypeMap = new Map<
      string,
      { productType: string; incomeAccountId: string | null }
    >();
    if (productIds.length > 0) {
      const uniqueIds = [...new Set(productIds)];
      const ptResult = await pool.query(
        `SELECT p.id, p.product_type,
           COALESCE(p.income_account_id,
             CASE WHEN p.product_type = 'service'
               THEN (SELECT "Id" FROM accounts WHERE "AccountCode" = '4100' LIMIT 1)
               ELSE (SELECT "Id" FROM accounts WHERE "AccountCode" = '4000' LIMIT 1)
             END
           ) AS income_account_id
         FROM products p
         WHERE p.id = ANY($1)`,
        [uniqueIds]
      );
      for (const row of ptResult.rows) {
        productTypeMap.set(row.id, {
          productType: row.product_type || 'inventory',
          incomeAccountId: row.income_account_id || null,
        });
      }
    }

    const values: unknown[] = [];
    const placeholders: string[] = [];

    items.forEach((item, index) => {
      const offset = index * 13; // 13 fields now (added product_type, income_account_id)
      placeholders.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13})`
      );

      // Use provided profit if available (may include discount allocation),
      // otherwise calculate from lineTotal - (costPrice * quantity)
      const lineTotal = new Decimal(item.lineTotal || 0);
      const costPrice = new Decimal(item.costPrice || 0);
      const quantity = new Decimal(item.quantity || 0);
      const itemProfit =
        item.profit !== undefined
          ? new Decimal(item.profit) // Use pre-calculated profit (with discount allocation)
          : lineTotal.minus(costPrice.times(quantity)); // Fallback calculation

      // Handle custom/service items (productId starts with 'custom_')
      const isCustomItem = item.productId?.startsWith('custom_');
      const productId = isCustomItem ? null : item.productId;
      const itemType = isCustomItem ? 'custom' : 'product';

      // Resolve product_type and income_account_id from batch lookup
      const productInfo = productId ? productTypeMap.get(productId) : null;
      const productType = productInfo?.productType || 'inventory';
      const incomeAccountId = productInfo?.incomeAccountId || null;

      values.push(
        item.saleId,
        productId, // NULL for custom items
        item.productName || null, // Store name for custom items
        itemType,
        item.quantity,
        item.unitPrice,
        lineTotal.toFixed(2), // Maps to total_price — string for PostgreSQL NUMERIC
        costPrice.toFixed(2), // Maps to unit_cost
        itemProfit.toFixed(2), // Maps to profit
        item.uomId || null, // Include uom_id (NULL if not provided)
        item.discountAmount || 0, // Per-item discount amount
        productType,
        incomeAccountId
      );
    });

    const result = await pool.query(
      `INSERT INTO sale_items (
        sale_id, product_id, product_name, item_type, quantity, unit_price, total_price, unit_cost, profit, uom_id, discount_amount, product_type, income_account_id
      ) VALUES ${placeholders.join(', ')}
      RETURNING *`,
      values
    );

    return result.rows;
  },

  /**
   * Get sale by ID with items
   */
  async getSaleById(
    pool: Pool | PoolClient,
    id: string
  ): Promise<{
    sale: SaleRecord;
    items: SaleItemRecord[];
    paymentLines?: Record<string, unknown>[];
  } | null> {
    const saleResult = await pool.query('SELECT * FROM sales WHERE id = $1', [id]);

    if (saleResult.rows.length === 0) {
      return null;
    }

    // Include product name (and identifiers) by joining products
    // For custom items, use si.product_name; for inventory items, use p.name
    const itemsResult = await pool.query(
      `SELECT 
        si.*,
        COALESCE(p.name, si.product_name) AS product_name,
        p.sku AS sku,
        p.barcode AS barcode
       FROM sale_items si
       LEFT JOIN products p ON p.id = si.product_id
       WHERE si.sale_id = $1
       ORDER BY si.created_at`,
      [id]
    );

    // Fetch payment lines (for split payment support)
    const paymentLinesResult = await pool.query(
      `SELECT 
        id,
        payment_method,
        amount,
        reference,
        created_at
       FROM payment_lines
       WHERE sale_id = $1
       ORDER BY created_at`,
      [id]
    );

    return {
      sale: saleResult.rows[0],
      items: itemsResult.rows,
      paymentLines: paymentLinesResult.rows.length > 0 ? paymentLinesResult.rows : undefined,
    };
  },

  /**
   * List sales with pagination
   */
  async listSales(
    pool: Pool,
    page: number = 1,
    limit: number = 50,
    filters?: {
      status?: string;
      customerId?: string;
      cashierId?: string;
      startDate?: string;
      endDate?: string;
    }
  ): Promise<{ sales: SaleRecord[]; total: number }> {
    const offset = (page - 1) * limit;
    const whereClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (filters?.status) {
      whereClauses.push(`s.status = $${paramIndex++}`);
      values.push(filters.status);
    }

    if (filters?.customerId) {
      whereClauses.push(`s.customer_id = $${paramIndex++}`);
      values.push(filters.customerId);
    }

    if (filters?.cashierId) {
      whereClauses.push(`s.cashier_id = $${paramIndex++}`);
      values.push(filters.cashierId);
    }

    if (filters?.startDate) {
      whereClauses.push(`s.sale_date >= $${paramIndex++}::date`);
      values.push(filters.startDate);
    }

    if (filters?.endDate) {
      whereClauses.push(`s.sale_date <= $${paramIndex++}::date`);
      values.push(filters.endDate);
    }

    const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countResult = await pool.query(`SELECT COUNT(*) FROM sales s ${whereClause}`, values);

    const result = await pool.query(
      `SELECT 
        s.id,
        s.sale_number,
        s.customer_id,
        s.sale_date,
        s.subtotal,
        s.tax_amount,
        s.discount_amount,
        s.total_amount,
        s.total_cost,
        s.profit,
        s.profit_margin,
        s.payment_method,
        s.amount_paid,
        s.change_amount,
        s.status,
        s.notes,
        s.cashier_id,
        s.created_at,
        c.name as customer_name,
        u.full_name as cashier_name
       FROM sales s
       LEFT JOIN customers c ON s.customer_id = c.id
       LEFT JOIN users u ON s.cashier_id = u.id
       ${whereClause} 
       ORDER BY s.sale_date DESC, s.created_at DESC 
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...values, limit, offset]
    );

    return {
      sales: result.rows,
      total: parseInt(countResult.rows[0].count),
    };
  },

  /**
   * Get FIFO cost layers for a product (oldest first)
   * Uses FOR UPDATE to prevent concurrent depletion by parallel sales.
   */
  async getFIFOCostLayers(
    pool: Pool | PoolClient,
    productId: string
  ): Promise<Record<string, unknown>[]> {
    const result = await pool.query(
      `SELECT * FROM cost_layers 
       WHERE product_id = $1 AND remaining_quantity > 0 
       ORDER BY created_at ASC
       FOR UPDATE`,
      [productId]
    );
    return result.rows;
  },

  /**
   * Update cost layer remaining quantity
   * @param poolOrClient - Pool for standalone operations, PoolClient for transactional operations
   */
  async updateCostLayerQuantity(
    poolOrClient: Pool | PoolClient,
    layerId: string,
    newQuantity: number
  ): Promise<void> {
    await poolOrClient.query('UPDATE cost_layers SET remaining_quantity = $1, updated_at = NOW() WHERE id = $2', [
      newQuantity,
      layerId,
    ]);
  },

  /**
   * Create cost layer (when receiving goods)
   */
  async createCostLayer(
    pool: Pool,
    data: {
      productId: string;
      batchNumber?: string | null; // aligned with schema
      quantity: number;
      unitCost: number; // aligned with schema
    }
  ): Promise<Record<string, unknown>> {
    // Note: Prefer using costLayerService.createCostLayer; this is a fallback aligned to schema
    const result = await pool.query(
      `INSERT INTO cost_layers (product_id, quantity, remaining_quantity, unit_cost, batch_number)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [data.productId, data.quantity, data.quantity, data.unitCost, data.batchNumber || null]
    );
    return result.rows[0];
  },

  /**
   * Get overall sales summary (totals, count, by payment method)
   */
  async getSalesSummary(
    pool: Pool,
    filters?: {
      startDate?: string;
      endDate?: string;
      groupBy?: string;
      cashierId?: string;
    }
  ): Promise<Record<string, unknown>> {
    const whereClauses: string[] = ['status = $1'];
    const values: unknown[] = ['COMPLETED'];
    let paramIndex = 2;

    if (filters?.cashierId) {
      whereClauses.push(`cashier_id = $${paramIndex++}`);
      values.push(filters.cashierId);
    }

    if (filters?.startDate) {
      whereClauses.push(`sale_date >= $${paramIndex++}::date`);
      values.push(filters.startDate);
    }

    if (filters?.endDate) {
      whereClauses.push(`sale_date <= $${paramIndex++}::date`);
      values.push(filters.endDate);
    }

    const whereClause = whereClauses.join(' AND ');

    // Get overall summary
    const summaryResult = await pool.query(
      `SELECT 
        COUNT(*) as total_sales,
        COALESCE(SUM(total_amount), 0) as total_amount,
        COALESCE(SUM(total_cost), 0) as total_cost,
        COALESCE(SUM(total_amount - COALESCE(total_cost, 0)), 0) as total_profit,
        COALESCE(SUM(discount_amount), 0) as total_discounts
       FROM sales
       WHERE ${whereClause}`,
      values
    );

    // Get breakdown by payment method
    const paymentMethodResult = await pool.query(
      `SELECT 
        payment_method,
        COUNT(*) as count,
        COALESCE(SUM(total_amount), 0) as total_amount
       FROM sales
       WHERE ${whereClause}
       GROUP BY payment_method
       ORDER BY total_amount DESC`,
      values
    );

    // Get credit sales + partial payment counts (server-side, not limited by pagination)
    const creditResult = await pool.query(
      `SELECT 
        COUNT(*) as credit_count,
        COUNT(*) FILTER (WHERE amount_paid > 0 AND amount_paid < total_amount) as partial_count
       FROM sales
       WHERE ${whereClause} AND payment_method = 'CREDIT'`,
      values
    );

    return {
      totalSales: parseInt(summaryResult.rows[0].total_sales),
      totalAmount: parseFloat(summaryResult.rows[0].total_amount),
      totalCost: parseFloat(summaryResult.rows[0].total_cost),
      totalProfit: parseFloat(summaryResult.rows[0].total_profit),
      totalDiscounts: parseFloat(summaryResult.rows[0].total_discounts),
      creditSalesCount: parseInt(creditResult.rows[0].credit_count),
      partialPaymentCount: parseInt(creditResult.rows[0].partial_count),
      byPaymentMethod: paymentMethodResult.rows.map((row) => ({
        paymentMethod: row.payment_method,
        count: parseInt(row.count),
        totalAmount: parseFloat(row.total_amount),
      })),
    };
  },

  /**
   * Get product sales summary report
   * Returns aggregated sales data per product for a date range
   */
  async getProductSalesSummary(
    pool: Pool,
    filters?: {
      startDate?: string;
      endDate?: string;
      productId?: string;
      customerId?: string;
      cashierId?: string;
    }
  ): Promise<Record<string, unknown>[]> {
    const whereClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    // Join sales with sale_items to get product-level data
    let query = `
      SELECT 
        si.product_id,
        si.product_name,
        COUNT(DISTINCT s.id) as transaction_count,
        ROUND(SUM(si.quantity)::numeric, 2) as total_quantity_sold,
        ROUND(SUM(si.total_price)::numeric, 2) as total_revenue,
        ROUND(SUM(si.unit_cost * si.quantity)::numeric, 2) as total_cost,
        ROUND(SUM(si.profit)::numeric, 2) as total_profit,
        ROUND(AVG(si.unit_price)::numeric, 2) as avg_selling_price,
        ROUND(AVG(si.unit_cost)::numeric, 2) as avg_cost_price,
        TO_CHAR(MIN(s.sale_date), 'Mon DD, YYYY') as first_sale_date,
        TO_CHAR(MAX(s.sale_date), 'Mon DD, YYYY') as last_sale_date
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
    `;

    // Only include completed sales
    whereClauses.push(`s.status = 'COMPLETED'`);

    if (filters?.cashierId) {
      whereClauses.push(`s.cashier_id = $${paramIndex++}`);
      values.push(filters.cashierId);
    }

    if (filters?.startDate) {
      whereClauses.push(`s.sale_date >= $${paramIndex++}::date`);
      values.push(filters.startDate);
    }

    if (filters?.endDate) {
      whereClauses.push(`s.sale_date <= $${paramIndex++}::date`);
      values.push(filters.endDate);
    }

    if (filters?.productId) {
      whereClauses.push(`si.product_id = $${paramIndex++}`);
      values.push(filters.productId);
    }

    if (filters?.customerId) {
      whereClauses.push(`s.customer_id = $${paramIndex++}`);
      values.push(filters.customerId);
    }

    if (whereClauses.length > 0) {
      query += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    query += `
      GROUP BY si.product_id, si.product_name
      ORDER BY total_revenue DESC
    `;

    const result = await pool.query(query, values);

    // Calculate profit margin percentage for each product
    return result.rows.map((row: Record<string, unknown>) => {
      const totalRevenue = Number(row.total_revenue) || 0;
      const totalProfit = Number(row.total_profit) || 0;
      return {
        ...row,
        profit_margin_pct:
          totalRevenue > 0
            ? new Decimal(totalProfit)
              .dividedBy(totalRevenue)
              .times(100)
              .toDecimalPlaces(2)
              .toString()
            : '0.00',
      };
    });
  },

  /**
   * Get top selling products
   */
  async getTopSellingProducts(
    pool: Pool,
    limit: number = 10,
    filters?: {
      startDate?: string;
      endDate?: string;
      cashierId?: string;
    }
  ): Promise<Record<string, unknown>[]> {
    const whereClauses: string[] = ["s.status = 'COMPLETED'"];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (filters?.cashierId) {
      whereClauses.push(`s.cashier_id = $${paramIndex++}`);
      values.push(filters.cashierId);
    }

    if (filters?.startDate) {
      whereClauses.push(`s.sale_date >= $${paramIndex++}::date`);
      values.push(filters.startDate);
    }

    if (filters?.endDate) {
      whereClauses.push(`s.sale_date <= $${paramIndex++}::date`);
      values.push(filters.endDate);
    }

    const query = `
      SELECT 
        si.product_id,
        si.product_name,
        ROUND(SUM(si.quantity)::numeric, 2) as total_quantity,
        ROUND(SUM(si.total_price)::numeric, 2) as total_revenue,
        COUNT(DISTINCT s.id) as sale_count
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      WHERE ${whereClauses.join(' AND ')}
      GROUP BY si.product_id, si.product_name
      ORDER BY total_quantity DESC
      LIMIT $${paramIndex}
    `;

    const result = await pool.query(query, [...values, limit]);
    return result.rows;
  },

  /**
   * Get sales summary by date — LEDGER-DRIVEN (SAP/Odoo pattern)
   *
   * Reads from double-entry GL postings instead of the sales table.
   * Revenue  = credits to REVENUE accounts (4xxx)
   * COGS     = debits to account 5000
   * Profit   = Revenue − COGS
   * Cash     = debits to ASSET receivable accounts (1010, 1200)
   *
   * This makes the report immune to POS table bugs — it reflects
   * accounting truth exactly as SAP Gross Profit Report does.
   */
  async getSalesSummaryByDate(
    pool: Pool,
    groupBy: 'day' | 'week' | 'month' = 'day',
    filters?: {
      startDate?: string;
      endDate?: string;
      cashierId?: string;
    }
  ): Promise<Record<string, unknown>[]> {
    const whereClauses: string[] = [
      `lt."Status" = 'POSTED'`,
      `lt."ReferenceType" = 'SALE'`,
    ];
    const values: unknown[] = [];
    let paramIndex = 1;

    // For cashier filtering we still join the sales table — the GL
    // doesn't store cashier_id, but the link is via ReferenceNumber.
    let cashierJoin = '';
    if (filters?.cashierId) {
      cashierJoin = `JOIN sales s ON lt."ReferenceNumber" = s.sale_number`;
      whereClauses.push(`s.cashier_id = $${paramIndex++}`);
      values.push(filters.cashierId);
    }

    if (filters?.startDate) {
      whereClauses.push(`lt."TransactionDate"::date >= $${paramIndex++}::date`);
      values.push(filters.startDate);
    }

    if (filters?.endDate) {
      whereClauses.push(`lt."TransactionDate"::date <= $${paramIndex++}::date`);
      values.push(filters.endDate);
    }

    let dateExpr = '';
    let dateFormat = '';
    switch (groupBy) {
      case 'day':
        dateExpr = `lt."TransactionDate"::date`;
        dateFormat = `TO_CHAR(lt."TransactionDate"::date, 'Mon DD, YYYY')`;
        break;
      case 'week':
        dateExpr = `DATE_TRUNC('week', lt."TransactionDate")`;
        dateFormat = `TO_CHAR(DATE_TRUNC('week', lt."TransactionDate"), 'Mon DD, YYYY')`;
        break;
      case 'month':
        dateExpr = `DATE_TRUNC('month', lt."TransactionDate")`;
        dateFormat = `TO_CHAR(DATE_TRUNC('month', lt."TransactionDate"), 'Mon YYYY')`;
        break;
    }

    const query = `
      SELECT
        ${dateFormat} AS period,
        COUNT(DISTINCT lt."Id") AS transaction_count,
        ROUND(SUM(
          CASE WHEN a."AccountType" = 'REVENUE'
               THEN le."CreditAmount" - le."DebitAmount" ELSE 0 END
        )::numeric, 2) AS total_revenue,
        ROUND(SUM(
          CASE WHEN a."AccountCode" = '5000'
               THEN le."DebitAmount" - le."CreditAmount" ELSE 0 END
        )::numeric, 2) AS total_cost,
        ROUND(
          SUM(CASE WHEN a."AccountType" = 'REVENUE'
                   THEN le."CreditAmount" - le."DebitAmount" ELSE 0 END)
        - SUM(CASE WHEN a."AccountCode" = '5000'
                   THEN le."DebitAmount" - le."CreditAmount" ELSE 0 END)
        , 2) AS total_profit,
        ROUND(
          SUM(CASE WHEN a."AccountType" = 'REVENUE'
                   THEN le."CreditAmount" - le."DebitAmount" ELSE 0 END)
          / NULLIF(COUNT(DISTINCT lt."Id"), 0)
        , 2) AS avg_transaction_value
      FROM ledger_entries le
      JOIN accounts a ON le."AccountId" = a."Id"
      JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
      ${cashierJoin}
      WHERE ${whereClauses.join(' AND ')}
      GROUP BY ${dateExpr}
      ORDER BY ${dateExpr} DESC
    `;

    const result = await pool.query(query, values);
    return result.rows;
  },

  /**
   * Get sales details report - aggregated by date and product with revenue/cost metrics
   */
  async getSalesDetailsReport(
    pool: Pool,
    filters: Record<string, unknown> = {}
  ): Promise<Record<string, unknown>[]> {
    const whereClauses = ['s.status = $1'];
    const values: unknown[] = ['COMPLETED'];
    let paramIndex = 2;

    if (filters.startDate) {
      whereClauses.push(`s.sale_date >= $${paramIndex++}`);
      values.push(filters.startDate);
    }

    if (filters.endDate) {
      whereClauses.push(`s.sale_date <= $${paramIndex++}`);
      values.push(filters.endDate);
    }

    if (filters.productId) {
      whereClauses.push(`p.id = $${paramIndex++}`);
      values.push(filters.productId);
    }

    const query = `
      SELECT 
        TO_CHAR(DATE(s.sale_date), 'Mon DD, YYYY') as sale_date,
        p.name as product_name,
        p.sku,
        (SELECT u.symbol FROM product_uoms pu JOIN uoms u ON pu.uom_id = u.id WHERE pu.product_id = p.id AND pu.is_default = true LIMIT 1) as unit_of_measure,
        ROUND(SUM(si.quantity)::numeric, 2) as total_quantity,
        ROUND(AVG(si.unit_price)::numeric, 2) as avg_unit_price,
        ROUND(SUM(si.total_price)::numeric, 2) as total_revenue,
        CASE 
          WHEN SUM(si.total_price) > 0 
          THEN ROUND((SUM(si.profit) / SUM(si.total_price) * 100)::numeric, 2)
          ELSE 0 
        END as profit_margin_percent,
        COUNT(DISTINCT s.id) as transaction_count
      FROM sales s
      INNER JOIN sale_items si ON s.id = si.sale_id
      INNER JOIN products p ON si.product_id = p.id
      WHERE ${whereClauses.join(' AND ')}
      GROUP BY DATE(s.sale_date), p.id, p.name, p.sku
      ORDER BY DATE(s.sale_date) DESC, total_revenue DESC
    `;

    const result = await pool.query(query, values);
    return result.rows;
  },

  /**
   * Get sales by cashier report - shows sales performance by user/cashier
   */
  async getSalesByCashier(
    pool: Pool,
    filters: Record<string, unknown> = {}
  ): Promise<Record<string, unknown>[]> {
    const whereClauses = ['s.status = $1'];
    const values: unknown[] = ['COMPLETED'];
    let paramIndex = 2;

    if (filters.startDate) {
      whereClauses.push(`s.sale_date >= $${paramIndex++}`);
      values.push(filters.startDate);
    }

    if (filters.endDate) {
      whereClauses.push(`s.sale_date <= $${paramIndex++}`);
      values.push(filters.endDate);
    }

    if (filters.userId) {
      whereClauses.push(`s.cashier_id = $${paramIndex++}`);
      values.push(filters.userId);
    }

    const query = `
      SELECT 
        u.id as user_id,
        u.full_name as cashier_name,
        u.email,
        u.role,
        COUNT(DISTINCT s.id) as total_transactions,
        COUNT(DISTINCT s.customer_id) as unique_customers,
        ROUND(SUM(s.total_amount)::numeric, 2) as total_revenue,
        ROUND(SUM(s.total_cost)::numeric, 2) as total_cost,
        ROUND(SUM(s.profit)::numeric, 2) as total_profit,
        CASE 
          WHEN SUM(s.subtotal - s.discount_amount) > 0 
          THEN ROUND((SUM(s.profit) / SUM(s.subtotal - s.discount_amount) * 100)::numeric, 2)
          ELSE 0 
        END as profit_margin_percentage,
        ROUND(AVG(s.total_amount)::numeric, 2) as avg_transaction_value,
        TO_CHAR(MAX(s.sale_date), 'Mon DD, YYYY HH24:MI') as last_sale_date,
        TO_CHAR(MIN(s.sale_date), 'Mon DD, YYYY HH24:MI') as first_sale_date
      FROM sales s
      INNER JOIN users u ON s.cashier_id = u.id
      WHERE ${whereClauses.join(' AND ')}
      GROUP BY u.id, u.full_name, u.email, u.role
      ORDER BY total_revenue DESC
    `;

    const result = await pool.query(query, values);
    return result.rows;
  },

  /**
   * Void a sale (mark as VOID, record who/when/why)
   * Accepts Pool or PoolClient to participate in caller's transaction.
   * Returns updated sale record with void details
   */
  async voidSale(
    pool: Pool | PoolClient,
    saleId: string,
    voidedById: string,
    voidReason: string,
    approvedById?: string
  ): Promise<Record<string, unknown>> {
    const result = await pool.query(
      `UPDATE sales 
       SET status = 'VOID',
           voided_at = CURRENT_TIMESTAMP,
           voided_by_id = $2,
           void_reason = $3,
           void_approved_by_id = $4::uuid,
           void_approved_at = CASE WHEN $4::uuid IS NOT NULL THEN CURRENT_TIMESTAMP ELSE NULL END
       WHERE id = $1 AND status = 'COMPLETED'
       RETURNING 
         id,
         sale_number as "saleNumber",
         status,
         voided_at as "voidedAt",
         voided_by_id as "voidedById",
         void_reason as "voidReason",
         void_approved_by_id as "voidApprovedById",
         void_approved_at as "voidApprovedAt"`,
      [saleId, voidedById, voidReason, approvedById || null]
    );

    if (result.rows.length === 0) {
      throw new BusinessError('Sale not found or already voided', 'ERR_SALE_013', { saleId });
    }

    return result.rows[0];
  },

  /**
   * Get sale items for a sale (needed for inventory restoration)
   * Accepts Pool or PoolClient to participate in caller's transaction.
   */
  async getSaleItemsForVoid(
    pool: Pool | PoolClient,
    saleId: string
  ): Promise<VoidSaleItemRecord[]> {
    const result = await pool.query(
      `SELECT 
        si.id,
        si.sale_id as "saleId",
        si.product_id as "productId",
        si.batch_id as "batchId",
        si.quantity,
        si.unit_price as "unitPrice",
        si.unit_cost as "unitCost",
        si.total_price as "totalPrice",
        si.profit,
        si.uom_id as "uomId",
        p.name as "productName",
        p.sku
       FROM sale_items si
       JOIN products p ON si.product_id = p.id
       WHERE si.sale_id = $1`,
      [saleId]
    );

    return result.rows;
  },

  /**
   * Check if user has manager role (required for void approval)
   */
  async isManager(pool: Pool | PoolClient, userId: string): Promise<boolean> {
    const result = await pool.query(`SELECT role FROM users WHERE id = $1`, [userId]);

    if (result.rows.length === 0) {
      return false;
    }

    const role = result.rows[0].role;
    return role === 'ADMIN' || role === 'MANAGER';
  },

  // ============================================================
  // REFUND OPERATIONS
  // ============================================================

  /**
   * Get sale items with refundable quantities for a given sale.
   * Returns items where (quantity - refunded_qty) > 0.
   */
  async getSaleItemsForRefund(
    pool: Pool | PoolClient,
    saleId: string
  ): Promise<RefundableSaleItemRecord[]> {
    const result = await pool.query(
      `SELECT
        si.id,
        si.sale_id AS "saleId",
        si.product_id AS "productId",
        si.batch_id AS "batchId",
        si.quantity,
        si.refunded_qty AS "refundedQty",
        (si.quantity - si.refunded_qty) AS "remainingQty",
        si.unit_price AS "unitPrice",
        si.unit_cost AS "unitCost",
        si.total_price AS "totalPrice",
        si.discount_amount AS "discountAmount",
        si.profit,
        si.uom_id AS "uomId",
        si.product_type AS "productType",
        si.item_type AS "itemType",
        COALESCE(p.name, si.product_name) AS "productName",
        p.sku
       FROM sale_items si
       LEFT JOIN products p ON si.product_id = p.id
       WHERE si.sale_id = $1
       ORDER BY si.created_at`,
      [saleId]
    );

    return result.rows;
  },

  /**
   * Generate next refund number (REF-YYYY-NNNN format).
   * Must be called inside a transaction for advisory lock safety.
   */
  async generateRefundNumber(pool: Pool | PoolClient): Promise<string> {
    const year = new Date().getFullYear();
    await pool.query(`SELECT pg_advisory_xact_lock(hashtext('refund_number_seq'))`);
    const result = await pool.query(
      `SELECT refund_number FROM sale_refunds
       WHERE refund_number LIKE $1
       ORDER BY refund_number DESC
       LIMIT 1`,
      [`REF-${year}-%`]
    );

    if (result.rows.length === 0) {
      return `REF-${year}-0001`;
    }

    const lastNumber = result.rows[0].refund_number;
    const sequence = parseInt(lastNumber.split('-')[2]) + 1;
    return `REF-${year}-${sequence.toString().padStart(4, '0')}`;
  },

  /**
   * Create a refund document header.
   */
  async createRefund(
    pool: Pool | PoolClient,
    data: CreateRefundData
  ): Promise<RefundRecord> {
    const refundNumber = await this.generateRefundNumber(pool);
    const result = await pool.query(
      `INSERT INTO sale_refunds (
        refund_number, sale_id, refund_date, reason,
        total_amount, total_cost, status,
        created_by_id, approved_by_id
      ) VALUES ($1, $2, $3, $4, $5, $6, 'COMPLETED', $7, $8)
      RETURNING
        id,
        refund_number AS "refundNumber",
        sale_id AS "saleId",
        refund_date AS "refundDate",
        reason,
        total_amount AS "totalAmount",
        total_cost AS "totalCost",
        status,
        gl_transaction_id AS "glTransactionId",
        created_by_id AS "createdById",
        approved_by_id AS "approvedById",
        created_at AS "createdAt"`,
      [
        refundNumber,
        data.saleId,
        data.refundDate || new Date().toLocaleDateString('en-CA'),
        data.reason,
        data.totalAmount,
        data.totalCost,
        data.createdById,
        data.approvedById || null,
      ]
    );
    return result.rows[0];
  },

  /**
   * Create refund line items.
   */
  async addRefundItems(
    pool: Pool | PoolClient,
    items: CreateRefundItemData[]
  ): Promise<RefundItemRecord[]> {
    if (items.length === 0) return [];

    const values: unknown[] = [];
    const placeholders: string[] = [];

    items.forEach((item, index) => {
      const offset = index * 9;
      placeholders.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9})`
      );
      values.push(
        item.refundId,
        item.saleItemId,
        item.productId || null,
        item.batchId || null,
        item.quantity,
        item.unitPrice,
        item.unitCost,
        item.lineTotal,
        item.costTotal,
      );
    });

    const result = await pool.query(
      `INSERT INTO sale_refund_items (
        refund_id, sale_item_id, product_id, batch_id,
        quantity, unit_price, unit_cost, line_total, cost_total
      ) VALUES ${placeholders.join(', ')}
      RETURNING
        id,
        refund_id AS "refundId",
        sale_item_id AS "saleItemId",
        product_id AS "productId",
        batch_id AS "batchId",
        quantity,
        unit_price AS "unitPrice",
        unit_cost AS "unitCost",
        line_total AS "lineTotal",
        cost_total AS "costTotal"`,
      values
    );

    return result.rows;
  },

  /**
   * Increment refunded_qty on a sale_item (within a transaction).
   */
  async incrementRefundedQty(
    pool: Pool | PoolClient,
    saleItemId: string,
    qty: number
  ): Promise<void> {
    const result = await pool.query(
      `UPDATE sale_items
       SET refunded_qty = refunded_qty + $1
       WHERE id = $2
         AND refunded_qty + $1 <= quantity
       RETURNING id`,
      [qty, saleItemId]
    );
    if (result.rows.length === 0) {
      throw new BusinessError(
        'Refund quantity exceeds remaining refundable quantity',
        'ERR_REFUND_002',
        { saleItemId, requestedQty: qty }
      );
    }
  },

  /**
   * Check if ALL items on a sale are fully refunded.
   * Returns true if every sale_item has refunded_qty = quantity.
   */
  async isSaleFullyRefunded(pool: Pool | PoolClient, saleId: string): Promise<boolean> {
    const result = await pool.query(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE refunded_qty >= quantity) AS fully_refunded
       FROM sale_items
       WHERE sale_id = $1`,
      [saleId]
    );
    const row = result.rows[0];
    return parseInt(row.total) > 0 && parseInt(row.total) === parseInt(row.fully_refunded);
  },

  /**
   * Mark a sale as REFUNDED (only when all items fully refunded).
   */
  async markSaleRefunded(pool: Pool | PoolClient, saleId: string): Promise<void> {
    await pool.query(
      `UPDATE sales SET status = 'REFUNDED' WHERE id = $1 AND status = 'COMPLETED'`,
      [saleId]
    );
  },

  /**
   * Update refund's gl_transaction_id after GL posting.
   */
  async updateRefundGlTransaction(
    pool: Pool | PoolClient,
    refundId: string,
    glTransactionId: string
  ): Promise<void> {
    // Direct update on new row still in COMPLETED status within same TX
    await pool.query(
      `UPDATE sale_refunds SET gl_transaction_id = $1 WHERE id = $2`,
      [glTransactionId, refundId]
    );
  },

  /**
   * Get refunds for a sale.
   */
  async getRefundsBySaleId(
    pool: Pool | PoolClient,
    saleId: string
  ): Promise<RefundRecord[]> {
    const result = await pool.query(
      `SELECT
        id,
        refund_number AS "refundNumber",
        sale_id AS "saleId",
        refund_date AS "refundDate",
        reason,
        total_amount AS "totalAmount",
        total_cost AS "totalCost",
        status,
        gl_transaction_id AS "glTransactionId",
        created_by_id AS "createdById",
        approved_by_id AS "approvedById",
        created_at AS "createdAt"
       FROM sale_refunds
       WHERE sale_id = $1
       ORDER BY created_at DESC`,
      [saleId]
    );
    return result.rows;
  },

  /**
   * Get refund items for a refund.
   */
  async getRefundItems(
    pool: Pool | PoolClient,
    refundId: string
  ): Promise<RefundItemRecord[]> {
    const result = await pool.query(
      `SELECT
        ri.id,
        ri.refund_id AS "refundId",
        ri.sale_item_id AS "saleItemId",
        ri.product_id AS "productId",
        ri.batch_id AS "batchId",
        ri.quantity,
        ri.unit_price AS "unitPrice",
        ri.unit_cost AS "unitCost",
        ri.line_total AS "lineTotal",
        ri.cost_total AS "costTotal",
        COALESCE(p.name, si.product_name) AS "productName",
        p.sku
       FROM sale_refund_items ri
       LEFT JOIN products p ON ri.product_id = p.id
       LEFT JOIN sale_items si ON ri.sale_item_id = si.id
       WHERE ri.refund_id = $1
       ORDER BY ri.created_at`,
      [refundId]
    );
    return result.rows;
  },
};
