// Reports Repository - Database queries with bank-grade precision
// All monetary calculations use Decimal.js for accuracy

import { Pool } from 'pg';
import Decimal from 'decimal.js';
import logger from '../../utils/logger.js';
import { demandForecastRepository, type ProductDemandStats } from './demandForecastRepository.js';
import type {
  SalesReportRow,
  SupplierCostAnalysisRow,
  PaymentReportRow,
  InventoryAdjustmentRow,
  PurchaseOrderSummaryRow,
  StockMovementAnalysisRow,
  CustomerAccountStatementData,
  DailyCashFlowRow,
  TopCustomerRow,
  StockAgingRow,
  SalesByCategoryRow,
  SalesByPaymentMethodRow,
  HourlySalesAnalysisRow,
  BusinessPositionData,
  InventoryValuationRow,
  ExpiringItemRow,
  LowStockItemRow,
  BestSellingProductRow,
  GoodsReceivedRow,
  CustomerPaymentsRow,
  ProfitLossRow,
  DeletedItemRow,
  ProfitMarginByProductRow,
  SupplierPaymentStatusRow,
  CustomerAgingRow,
  WasteDamageRow,
  ReorderRecommendationRow,
  SalesComparisonRow,
  CustomerPurchaseHistoryRow,
  CashRegisterSessionSummaryData,
  CashRegisterMovementBreakdownData,
  CashRegisterSessionHistoryData,
  DeliveryNoteReportRow,
  QuotationReportRow,
  ManualJournalEntryReportRow,
  BankTransactionReportRow,
} from './reportTypes.js';

// Configure Decimal for financial precision (2 decimal places for currency)
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

// Utility function to format timestamps in a simplified, human-readable format
// NOTE: This is only for TIMESTAMPTZ audit fields, NOT for DATE columns
function formatDate(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  // If already a plain date string (YYYY-MM-DD), return as-is (timezone strategy)
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

// Utility function to format date only (no time)
// For DATE columns, returns the string as-is per timezone strategy
function formatDateOnly(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  // If already a plain date string (YYYY-MM-DD), return as-is (timezone strategy)
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

export interface ReportRunRecord {
  id: string;
  report_type: string;
  report_name: string;
  parameters: Record<string, unknown>;
  generated_by_id: string | null;
  start_date: Date | null;
  end_date: Date | null;
  record_count: number;
  file_path: string | null;
  file_format: string | null;
  execution_time_ms: number | null;
  created_at: Date;
}

export const reportsRepository = {
  /**
   * Log a report run for audit trail
   * Uses report_runs table created by migration 009
   */
  async logReportRun(
    pool: Pool,
    data: {
      reportType: string;
      reportName: string;
      parameters: Record<string, unknown>;
      generatedById: string | null;
      startDate?: Date | null;
      endDate?: Date | null;
      recordCount: number;
      filePath?: string | null;
      fileFormat?: string | null;
      executionTimeMs?: number | null;
    }
  ): Promise<ReportRunRecord | null> {
    try {
      const result = await pool.query(
        `INSERT INTO report_runs (
          report_type, report_name, parameters, generated_by_id,
          start_date, end_date, record_count, file_path, file_format, execution_time_ms
        ) VALUES ($1::report_type, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING 
          id,
          report_type as "reportType",
          report_name as "reportName",
          parameters,
          generated_by_id as "generatedById",
          start_date as "startDate",
          end_date as "endDate",
          record_count as "recordCount",
          file_path as "filePath",
          file_format as "fileFormat",
          execution_time_ms as "executionTimeMs",
          created_at as "createdAt"`,
        [
          data.reportType,
          data.reportName,
          JSON.stringify(data.parameters),
          data.generatedById,
          data.startDate || null,
          data.endDate || null,
          data.recordCount,
          data.filePath || null,
          data.fileFormat || null,
          data.executionTimeMs || null,
        ]
      );
      return result.rows[0];
    } catch (error: unknown) {
      logger.warn('Failed to log report run', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  },

  /**
   * INVENTORY VALUATION REPORT
   * Calculate current inventory value using specified valuation method
   */
  async getInventoryValuation(
    pool: Pool,
    options: {
      asOfDate?: Date;
      categoryId?: string;
      valuationMethod?: 'FIFO' | 'AVCO' | 'LIFO';
    }
  ): Promise<InventoryValuationRow[]> {
    const asOfDate = options.asOfDate || new Date();
    const method = options.valuationMethod || 'FIFO';

    let categoryFilter = '';
    const params: unknown[] = [asOfDate];
    let methodParamIndex = 2;

    if (options.categoryId) {
      categoryFilter = 'AND p.category = $2';
      params.push(options.categoryId);
      methodParamIndex = 3;
    }

    // Add method as a parameter to avoid SQL injection
    params.push(method);

    // Use product_inventory + product_valuation as the primary source;
    // fall back to batch-level costing when batches exist.
    const query = `
      WITH batch_cost AS (
        SELECT
          b.product_id,
          CASE
            WHEN $${methodParamIndex} = 'FIFO' THEN
              (SELECT b2.cost_price FROM inventory_batches b2
               WHERE b2.product_id = b.product_id AND b2.received_date <= $1
                 AND b2.remaining_quantity > 0
               ORDER BY b2.received_date ASC LIMIT 1)
            WHEN $${methodParamIndex} = 'LIFO' THEN
              (SELECT b2.cost_price FROM inventory_batches b2
               WHERE b2.product_id = b.product_id AND b2.received_date <= $1
                 AND b2.remaining_quantity > 0
               ORDER BY b2.received_date DESC LIMIT 1)
            ELSE AVG(b.cost_price)
          END AS batch_unit_cost
        FROM inventory_batches b
        WHERE b.received_date <= $1 AND b.remaining_quantity > 0
        GROUP BY b.product_id
      )
      SELECT
        p.id AS product_id,
        p.name AS product_name,
        p.sku,
        p.category,
        COALESCE(pi.quantity_on_hand, 0) AS total_quantity,
        COALESCE(bc.batch_unit_cost, pv.cost_price, 0) AS unit_cost,
        COALESCE(pv.selling_price, 0) AS selling_price,
        NOW() AS last_updated
      FROM products p
      LEFT JOIN product_inventory pi ON pi.product_id = p.id
      LEFT JOIN product_valuation pv ON pv.product_id = p.id
      LEFT JOIN batch_cost bc ON bc.product_id = p.id
      WHERE p.is_active = true
        AND COALESCE(pi.quantity_on_hand, 0) > 0
        ${categoryFilter}
      ORDER BY (COALESCE(pi.quantity_on_hand, 0) * COALESCE(bc.batch_unit_cost, pv.cost_price, 0)) DESC
    `;

    const result = await pool.query(query, params);

    // Use Decimal.js for precise calculations
    return result.rows.map((row) => {
      const qty = new Decimal(row.total_quantity || 0);
      const cost = new Decimal(row.unit_cost || 0);
      const sell = new Decimal(row.selling_price || 0);
      const totalValue = qty.times(cost).toDecimalPlaces(2).toNumber();
      const potentialRevenue = qty.times(sell).toDecimalPlaces(2).toNumber();
      const profitPerUnit = sell.minus(cost).toDecimalPlaces(2).toNumber();
      const potentialProfit = qty.times(sell.minus(cost)).toDecimalPlaces(2).toNumber();
      const profitMargin = sell.greaterThan(0)
        ? sell.minus(cost).dividedBy(sell).times(100).toDecimalPlaces(2).toNumber()
        : 0;
      return {
        productId: row.product_id,
        productName: row.product_name,
        sku: row.sku,
        category: row.category,
        quantityOnHand: qty.toNumber(),
        unitCost: cost.toDecimalPlaces(2).toNumber(),
        sellingPrice: sell.toDecimalPlaces(2).toNumber(),
        totalValue,
        potentialRevenue,
        profitPerUnit,
        potentialProfit,
        profitMargin,
        lastUpdated: formatDate(row.last_updated),
      };
    });
  },

  /**
   * SALES REPORT
   * Comprehensive sales analysis with profit calculations
   */
  async getSalesReport(
    pool: Pool,
    options: {
      startDate: Date;
      endDate: Date;
      groupBy?: 'day' | 'week' | 'month' | 'product' | 'customer' | 'payment_method';
      customerId?: string;
    }
  ): Promise<SalesReportRow[]> {
    const params: unknown[] = [options.startDate, options.endDate];
    let groupByClause = '';
    let selectClause = '';
    let customerFilter = '';

    if (options.customerId) {
      customerFilter = 'AND s.customer_id = $3';
      params.push(options.customerId);
    }

    switch (options.groupBy) {
      case 'day':
        selectClause = 'DATE(fs.sale_date) as period';
        groupByClause = 'DATE(fs.sale_date)';
        break;
      case 'week':
        selectClause = "DATE_TRUNC('week', fs.sale_date)::DATE as period";
        groupByClause = "DATE_TRUNC('week', fs.sale_date)";
        break;
      case 'month':
        selectClause = "DATE_TRUNC('month', fs.sale_date)::DATE as period";
        groupByClause = "DATE_TRUNC('month', fs.sale_date)";
        break;
      case 'product':
        // Handled separately below — groups by product at item level
        selectClause = '';
        groupByClause = '';
        break;
      case 'customer':
        selectClause = "COALESCE(c.name, 'Walk-in Customer') as period";
        groupByClause = "COALESCE(c.name, 'Walk-in Customer')";
        break;
      case 'payment_method':
        selectClause = 'fs.payment_method as period';
        groupByClause = 'fs.payment_method';
        break;
      default:
        selectClause = 'DATE(fs.sale_date) as period';
        groupByClause = 'DATE(fs.sale_date)';
    }

    let query: string;

    if (options.groupBy === 'product') {
      // Product groupBy: group sale_items directly by product name.
      // Sale-level discount can't be meaningfully attributed to individual products.
      query = `
        SELECT 
          COALESCE(p.name, si.product_name, 'Custom Item') as period,
          COUNT(DISTINCT s.id) as transaction_count,
          SUM(si.quantity) as total_quantity_sold,
          SUM(si.total_price) as total_sales,
          0 as total_discounts,
          SUM(si.quantity * si.unit_cost) as total_cost,
          SUM(si.profit) as gross_profit,
          AVG(si.total_price) as average_transaction_value
        FROM sale_items si
        INNER JOIN sales s ON s.id = si.sale_id
        LEFT JOIN products p ON p.id = si.product_id
        WHERE DATE(s.sale_date) BETWEEN DATE($1) AND DATE($2)
          AND s.status NOT IN ('VOID', 'REFUNDED')
          ${customerFilter}
        GROUP BY COALESCE(p.name, si.product_name, 'Custom Item')
        ORDER BY period
      `;
    } else {
      // All other groupBy modes: use CTEs to avoid inflating sale-header fields
      // (discount_amount, total_amount) by the number of sale_items per sale.
      query = `
        WITH filtered_sales AS (
          SELECT s.id, s.sale_date, s.customer_id, s.payment_method,
                 s.total_amount, s.discount_amount
          FROM sales s
          WHERE DATE(s.sale_date) BETWEEN DATE($1) AND DATE($2)
            AND s.status NOT IN ('VOID', 'REFUNDED')
            ${customerFilter}
        ),
        sale_line_agg AS (
          SELECT si.sale_id,
                 SUM(si.quantity) as total_qty,
                 SUM(si.total_price) as total_sales,
                 SUM(si.quantity * si.unit_cost) as total_cost,
                 SUM(si.profit) as gross_profit
          FROM sale_items si
          WHERE si.sale_id IN (SELECT id FROM filtered_sales)
          GROUP BY si.sale_id
        )
        SELECT 
          ${selectClause},
          COUNT(fs.id) as transaction_count,
          SUM(sla.total_qty) as total_quantity_sold,
          SUM(sla.total_sales) as total_sales,
          SUM(fs.discount_amount) as total_discounts,
          SUM(sla.total_cost) as total_cost,
          SUM(sla.gross_profit) as gross_profit,
          AVG(fs.total_amount) as average_transaction_value
        FROM filtered_sales fs
        INNER JOIN sale_line_agg sla ON sla.sale_id = fs.id
        LEFT JOIN customers c ON c.id = fs.customer_id
        GROUP BY ${groupByClause}
        ORDER BY period
      `;
    }

    const result = await pool.query(query, params);

    return result.rows.map((row) => {
      const totalSales = new Decimal(row.total_sales || 0);
      const totalDiscounts = new Decimal(row.total_discounts || 0);
      const netRevenue = totalSales.minus(totalDiscounts);
      const totalCost = new Decimal(row.total_cost || 0);
      const grossProfit = netRevenue.minus(totalCost);
      const profitMargin = netRevenue.isZero()
        ? new Decimal(0)
        : grossProfit.dividedBy(netRevenue).times(100);

      return {
        period: formatDateOnly(row.period) || String(row.period),
        totalSales: totalSales.toDecimalPlaces(2).toNumber(),
        totalDiscounts: totalDiscounts.toDecimalPlaces(2).toNumber(),
        netRevenue: netRevenue.toDecimalPlaces(2).toNumber(),
        totalCost: totalCost.toDecimalPlaces(2).toNumber(),
        grossProfit: grossProfit.toDecimalPlaces(2).toNumber(),
        profitMargin: profitMargin.toDecimalPlaces(2).toNumber(),
        transactionCount: parseInt(row.transaction_count),
        averageTransactionValue: new Decimal(row.average_transaction_value || 0)
          .toDecimalPlaces(2)
          .toNumber(),
      };
    });
  },

  /**
   * EXPIRING ITEMS REPORT
   * Products approaching expiry date
   */
  async getExpiringItems(
    pool: Pool,
    options: {
      daysAhead: number;
      categoryId?: string;
    }
  ): Promise<ExpiringItemRow[]> {
    const params: unknown[] = [options.daysAhead];
    let categoryFilter = '';

    if (options.categoryId) {
      categoryFilter = 'AND p.category = $2';
      params.push(options.categoryId);
    }

    const query = `
      SELECT 
        b.id as batch_id,
        b.product_id,
        p.name as product_name,
        b.batch_number,
        b.expiry_date,
        b.cost_price as unit_cost,
        (b.expiry_date - CURRENT_DATE) as days_until_expiry,
        b.remaining_quantity as quantity_remaining
      FROM inventory_batches b
      INNER JOIN products p ON p.id = b.product_id
      WHERE b.expiry_date IS NOT NULL
        AND b.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '1 day' * $1
        AND b.remaining_quantity > 0
        ${categoryFilter}
      ORDER BY b.expiry_date ASC, b.remaining_quantity DESC
    `;

    const result = await pool.query(query, params);

    return result.rows.map((row) => {
      const quantityRemaining = new Decimal(row.quantity_remaining);
      const unitCost = new Decimal(row.unit_cost);
      const potentialLoss = quantityRemaining.times(unitCost);

      return {
        batchId: row.batch_id,
        productId: row.product_id,
        productName: row.product_name,
        batchNumber: row.batch_number,
        expiryDate: formatDateOnly(row.expiry_date),
        daysUntilExpiry: row.days_until_expiry,
        quantityRemaining: quantityRemaining.toDecimalPlaces(3).toNumber(),
        unitCost: unitCost.toDecimalPlaces(2).toNumber(),
        potentialLoss: potentialLoss.toDecimalPlaces(2).toNumber(),
      };
    });
  },

  /**
   * LOW STOCK REPORT
   * Products below reorder level
   */
  async getLowStockItems(
    pool: Pool,
    options: {
      threshold?: number;
      categoryId?: string;
    }
  ): Promise<LowStockItemRow[]> {
    const params: unknown[] = [];
    let categoryFilter = '';
    let thresholdFilter = '';

    if (options.categoryId) {
      categoryFilter = 'AND p.category = $1';
      params.push(options.categoryId);
    }

    if (options.threshold !== undefined) {
      const paramIndex = params.length + 1;
      thresholdFilter = `AND current_stock <= $${paramIndex}`;
      params.push(options.threshold);
    }

    const query = `
      WITH product_stock AS (
        SELECT 
          p.id as product_id,
          p.name as product_name,
          p.sku,
          pi.reorder_level,
          0 as reorder_quantity,
          COALESCE(SUM(
            CASE 
              WHEN sm.movement_type IN ('GOODS_RECEIPT', 'ADJUSTMENT_IN', 'RETURN', 'TRANSFER_IN', 'OPENING_BALANCE')
              THEN sm.quantity
              WHEN sm.movement_type IN ('SALE', 'ADJUSTMENT_OUT', 'EXPIRY', 'DAMAGE', 'TRANSFER_OUT')
              THEN -sm.quantity
              ELSE 0
            END
          ), 0) as current_stock
        FROM products p
        LEFT JOIN product_inventory pi ON pi.product_id = p.id
        LEFT JOIN stock_movements sm ON sm.product_id = p.id
        WHERE p.is_active = true
          ${categoryFilter}
        GROUP BY p.id, p.name, p.sku, pi.reorder_level
      )
      SELECT 
        product_id,
        product_name,
        sku,
        current_stock,
        reorder_level,
        reorder_quantity
      FROM product_stock
      WHERE current_stock <= reorder_level
        ${thresholdFilter}
      ORDER BY 
        CASE 
          WHEN current_stock <= 0 THEN 1
          WHEN current_stock <= reorder_level * 0.5 THEN 2
          ELSE 3
        END,
        current_stock ASC
    `;

    const result = await pool.query(query, params);

    return result.rows.map((row) => {
      const currentStock = new Decimal(row.current_stock);
      const reorderLevel = new Decimal(row.reorder_level);

      let status: 'CRITICAL' | 'LOW' | 'WARNING' = 'WARNING';
      if (currentStock.lessThanOrEqualTo(0)) {
        status = 'CRITICAL';
      } else if (currentStock.lessThanOrEqualTo(reorderLevel.times(0.5))) {
        status = 'LOW';
      }

      return {
        productId: row.product_id,
        productName: row.product_name,
        sku: row.sku,
        currentStock: currentStock.toDecimalPlaces(3).toNumber(),
        reorderLevel: reorderLevel.toDecimalPlaces(3).toNumber(),
        reorderQuantity: row.reorder_quantity
          ? new Decimal(row.reorder_quantity).toDecimalPlaces(3).toNumber()
          : undefined,
        status,
      };
    });
  },

  /**
   * BEST SELLING PRODUCTS REPORT
   * Top products by quantity and revenue
   */
  async getBestSellingProducts(
    pool: Pool,
    options: {
      startDate: Date;
      endDate: Date;
      limit: number;
      categoryId?: string;
    }
  ): Promise<BestSellingProductRow[]> {
    const params: unknown[] = [options.startDate, options.endDate, options.limit];
    let categoryFilter = '';

    if (options.categoryId) {
      categoryFilter = 'AND p.category = $4';
      params.push(options.categoryId);
    }

    const query = `
      SELECT 
        p.id as product_id,
        COALESCE(p.name, si.product_name, 'Custom Item') as product_name,
        p.sku,
        SUM(si.quantity) as quantity_sold,
        SUM(si.total_price) as total_revenue,
        SUM(si.quantity * si.unit_cost) as total_cost,
        SUM(si.profit) as gross_profit,
        COUNT(DISTINCT s.id) as transaction_count
      FROM sale_items si
      INNER JOIN sales s ON s.id = si.sale_id
      LEFT JOIN products p ON p.id = si.product_id
      WHERE DATE(s.sale_date) BETWEEN DATE($1) AND DATE($2)
        AND s.status NOT IN ('VOID', 'REFUNDED')
        ${categoryFilter}
      GROUP BY p.id, COALESCE(p.name, si.product_name, 'Custom Item'), p.sku
      ORDER BY quantity_sold DESC
      LIMIT $3
    `;

    const result = await pool.query(query, params);

    return result.rows.map((row) => {
      const totalRevenue = new Decimal(row.total_revenue);
      const totalCost = new Decimal(row.total_cost);
      const grossProfit = totalRevenue.minus(totalCost);
      const profitMargin = totalRevenue.isZero()
        ? new Decimal(0)
        : grossProfit.dividedBy(totalRevenue).times(100);

      return {
        productId: row.product_id,
        productName: row.product_name,
        sku: row.sku,
        quantitySold: new Decimal(row.quantity_sold).toDecimalPlaces(3).toNumber(),
        totalRevenue: totalRevenue.toDecimalPlaces(2).toNumber(),
        totalCost: totalCost.toDecimalPlaces(2).toNumber(),
        grossProfit: grossProfit.toDecimalPlaces(2).toNumber(),
        profitMargin: profitMargin.toDecimalPlaces(2).toNumber(),
        transactionCount: parseInt(row.transaction_count),
      };
    });
  },

  /**
   * SUPPLIER COST ANALYSIS REPORT
   * Analyze supplier performance and costs
   */
  async getSupplierCostAnalysis(
    pool: Pool,
    options: {
      startDate: Date;
      endDate: Date;
      supplierId?: string;
    }
  ): Promise<SupplierCostAnalysisRow[]> {
    const params: unknown[] = [options.startDate, options.endDate];
    let supplierFilter = '';

    if (options.supplierId) {
      supplierFilter = 'AND s."Id" = $3';
      params.push(options.supplierId);
    }

    // Use pre-aggregated subqueries to avoid multiplicative joins
    // (joining POs to GRs directly would inflate SUM(po.total_amount) when a PO has multiple GRs)
    const query = `
      WITH po_agg AS (
        SELECT 
          supplier_id,
          COUNT(id) as total_purchase_orders,
          SUM(total_amount) as total_purchase_value
        FROM purchase_orders
        WHERE DATE(order_date) BETWEEN DATE($1) AND DATE($2)
        GROUP BY supplier_id
      ),
      gr_agg AS (
        SELECT 
          po.supplier_id,
          SUM(gri.received_quantity) as total_items_received,
          AVG(EXTRACT(EPOCH FROM (gr.received_date - po.order_date)) / 86400) as average_lead_time_days,
          (COUNT(CASE WHEN gr.received_date <= po.expected_delivery_date THEN 1 END)::DECIMAL / 
           NULLIF(COUNT(gr.id), 0) * 100) as on_time_delivery_rate
        FROM purchase_orders po
        INNER JOIN goods_receipts gr ON gr.purchase_order_id = po.id
        LEFT JOIN goods_receipt_items gri ON gri.goods_receipt_id = gr.id
        WHERE DATE(po.order_date) BETWEEN DATE($1) AND DATE($2)
        GROUP BY po.supplier_id
      )
      SELECT 
        s."Id" as supplier_id,
        s."SupplierCode" as supplier_number,
        s."CompanyName" as supplier_name,
        COALESCE(pa.total_purchase_orders, 0) as total_purchase_orders,
        COALESCE(pa.total_purchase_value, 0) as total_purchase_value,
        COALESCE(ga.total_items_received, 0) as total_items_received,
        ga.average_lead_time_days,
        ga.on_time_delivery_rate
      FROM suppliers s
      INNER JOIN po_agg pa ON pa.supplier_id = s."Id"
      LEFT JOIN gr_agg ga ON ga.supplier_id = s."Id"
      WHERE 1=1
        ${supplierFilter}
      ORDER BY total_purchase_value DESC
    `;

    const result = await pool.query(query, params);

    return result.rows.map((row) => ({
      supplierId: row.supplier_id,
      supplierNumber: row.supplier_number,
      supplierName: row.supplier_name,
      totalPurchaseOrders: parseInt(row.total_purchase_orders),
      totalPurchaseValue: new Decimal(row.total_purchase_value || 0).toDecimalPlaces(2).toNumber(),
      totalItemsReceived: new Decimal(row.total_items_received || 0).toDecimalPlaces(3).toNumber(),
      averageLeadTime: row.average_lead_time_days
        ? new Decimal(row.average_lead_time_days).toDecimalPlaces(1).toNumber()
        : undefined,
      onTimeDeliveryRate: row.on_time_delivery_rate
        ? new Decimal(row.on_time_delivery_rate).toDecimalPlaces(2).toNumber()
        : undefined,
    }));
  },

  /**
   * GOODS RECEIVED REPORT
   * Detailed goods receipts log
   */
  async getGoodsReceivedReport(
    pool: Pool,
    options: {
      startDate: Date;
      endDate: Date;
      supplierId?: string;
      productId?: string;
    }
  ): Promise<GoodsReceivedRow[]> {
    const params: unknown[] = [options.startDate, options.endDate];
    let filters = '';

    if (options.supplierId) {
      filters += ' AND s."Id" = $3';
      params.push(options.supplierId);
    }

    if (options.productId) {
      const paramIndex = params.length + 1;
      filters += ` AND EXISTS (
        SELECT 1 FROM goods_receipt_items gri 
        WHERE gri.goods_receipt_id = gr.id AND gri.product_id = $${paramIndex}
      )`;
      params.push(options.productId);
    }

    const query = `
      SELECT 
        gr.id as goods_receipt_id,
        gr.receipt_number as goods_receipt_number,
        po.order_number as purchase_order_number,
        s."SupplierCode" as supplier_number,
        s."CompanyName" as supplier_name,
        gr.received_date,
        gr.status,
        COUNT(gri.id) as items_count,
        SUM(gri.received_quantity * gri.cost_price) as total_value
      FROM goods_receipts gr
      INNER JOIN purchase_orders po ON po.id = gr.purchase_order_id
      INNER JOIN suppliers s ON s."Id" = po.supplier_id
      LEFT JOIN goods_receipt_items gri ON gri.goods_receipt_id = gr.id
      WHERE DATE(gr.received_date) BETWEEN DATE($1) AND DATE($2)
        ${filters}
      GROUP BY gr.id, gr.receipt_number, po.order_number, s."SupplierCode", s."CompanyName", gr.received_date, gr.status
      ORDER BY gr.received_date DESC
    `;

    const result = await pool.query(query, params);

    return result.rows.map((row) => ({
      goodsReceiptId: row.goods_receipt_id,
      goodsReceiptNumber: row.goods_receipt_number,
      purchaseOrderNumber: row.purchase_order_number,
      supplierNumber: row.supplier_number,
      supplierName: row.supplier_name,
      receivedDate: formatDate(row.received_date),
      totalValue: new Decimal(row.total_value || 0).toDecimalPlaces(2).toNumber(),
      itemsCount: parseInt(row.items_count),
      status: row.status,
    }));
  },

  /**
   * PAYMENT REPORT
   * Breakdown of payments by method
   */
  async getPaymentReport(
    pool: Pool,
    options: {
      startDate: Date;
      endDate: Date;
      paymentMethod?: string;
    }
  ): Promise<PaymentReportRow[]> {
    const params: unknown[] = [options.startDate, options.endDate];
    let methodFilter = '';

    if (options.paymentMethod) {
      methodFilter = 'AND s.payment_method = $3::payment_method';
      params.push(options.paymentMethod);
    }

    const query = `
      WITH payment_summary AS (
        SELECT 
          s.payment_method,
          COUNT(*) as transaction_count,
          SUM(s.total_amount) as total_amount
        FROM sales s
        WHERE DATE(s.sale_date) BETWEEN DATE($1) AND DATE($2)
          AND s.status NOT IN ('VOID', 'REFUNDED')
          ${methodFilter}
        GROUP BY s.payment_method
      ),
      grand_total AS (
        SELECT SUM(total_amount) as grand_total FROM payment_summary
      )
      SELECT 
        ps.payment_method,
        ps.transaction_count,
        ps.total_amount,
        ps.total_amount / ps.transaction_count as average_amount,
        (ps.total_amount / gt.grand_total * 100) as percentage_of_total
      FROM payment_summary ps
      CROSS JOIN grand_total gt
      ORDER BY ps.total_amount DESC
    `;

    const result = await pool.query(query, params);

    return result.rows.map((row) => ({
      paymentMethod: row.payment_method,
      transactionCount: parseInt(row.transaction_count),
      totalAmount: new Decimal(row.total_amount).toDecimalPlaces(2).toNumber(),
      averageAmount: new Decimal(row.average_amount).toDecimalPlaces(2).toNumber(),
      percentageOfTotal: new Decimal(row.percentage_of_total || 0).toDecimalPlaces(2).toNumber(),
    }));
  },

  /**
   * CUSTOMER PAYMENTS REPORT
   * Customer payment behavior and outstanding balances
   */
  async getCustomerPaymentsReport(
    pool: Pool,
    options: {
      startDate: Date;
      endDate: Date;
      customerId?: string;
      status?: string;
    }
  ): Promise<CustomerPaymentsRow[]> {
    const params: unknown[] = [options.startDate, options.endDate];
    let filters = '';

    if (options.customerId) {
      filters += ' AND c.id = $3';
      params.push(options.customerId);
    }

    if (options.status) {
      const paramIndex = params.length + 1;
      filters += ` AND i."Status" = $${paramIndex}::invoice_status`;
      params.push(options.status);
    }

    // Use pre-aggregated subqueries to avoid multiplicative joins.
    // Joining invoices to invoice_payments directly inflates SUM(i."TotalAmount"), etc.
    // when an invoice has multiple partial payments.
    const query = `
      WITH invoice_agg AS (
        SELECT 
          i."CustomerId" as customer_id,
          COUNT(i."Id") as total_invoices,
          SUM(i."TotalAmount") as total_invoiced,
          SUM(i."AmountPaid") as total_paid,
          SUM(i."OutstandingBalance") as total_outstanding,
          SUM(CASE 
            WHEN i."DueDate" < CURRENT_DATE AND i."OutstandingBalance" > 0 THEN i."OutstandingBalance" 
            ELSE 0 
          END) as overdue_amount
        FROM invoices i
        WHERE DATE(i."InvoiceDate") BETWEEN DATE($1) AND DATE($2)
          ${filters}
        GROUP BY i."CustomerId"
      ),
      payment_days AS (
        SELECT 
          i."CustomerId" as customer_id,
          AVG(EXTRACT(EPOCH FROM (ip.payment_date - i."InvoiceDate")) / 86400) as average_payment_days
        FROM invoices i
        INNER JOIN invoice_payments ip ON ip.invoice_id = i."Id"
        WHERE DATE(i."InvoiceDate") BETWEEN DATE($1) AND DATE($2)
          ${filters}
        GROUP BY i."CustomerId"
      )
      SELECT 
        c.id as customer_id,
        c.customer_number as customer_number,
        c.name as customer_name,
        ia.total_invoices,
        ia.total_invoiced,
        ia.total_paid,
        ia.total_outstanding,
        ia.overdue_amount,
        pd.average_payment_days
      FROM customers c
      INNER JOIN invoice_agg ia ON ia.customer_id = c.id
      LEFT JOIN payment_days pd ON pd.customer_id = c.id
      ORDER BY ia.total_outstanding DESC
    `;

    const result = await pool.query(query, params);

    return result.rows.map((row) => ({
      customerId: row.customer_id,
      customerNumber: row.customer_number,
      customerName: row.customer_name,
      totalInvoices: parseInt(row.total_invoices),
      totalInvoiced: new Decimal(row.total_invoiced || 0).toDecimalPlaces(2).toNumber(),
      totalPaid: new Decimal(row.total_paid || 0).toDecimalPlaces(2).toNumber(),
      totalOutstanding: new Decimal(row.total_outstanding || 0).toDecimalPlaces(2).toNumber(),
      overdueAmount: new Decimal(row.overdue_amount || 0).toDecimalPlaces(2).toNumber(),
      averagePaymentDays: row.average_payment_days
        ? new Decimal(row.average_payment_days).toDecimalPlaces(1).toNumber()
        : undefined,
    }));
  },

  /**
   * PROFIT & LOSS REPORT
   * Comprehensive P&L statement
   */
  async getProfitLossReport(
    pool: Pool,
    options: {
      startDate: Date;
      endDate: Date;
      groupBy: 'day' | 'week' | 'month';
    }
  ): Promise<ProfitLossRow[]> {
    let dateGroup = '';
    switch (options.groupBy) {
      case 'day':
        dateGroup = 'DATE(s.sale_date)';
        break;
      case 'week':
        dateGroup = "DATE_TRUNC('week', s.sale_date)::DATE";
        break;
      case 'month':
        dateGroup = "DATE_TRUNC('month', s.sale_date)::DATE";
        break;
    }

    const query = `
      SELECT 
        ${dateGroup} as period,
        SUM(s.subtotal - s.discount_amount) as revenue,
        SUM(s.total_cost) as cost_of_goods_sold,
        SUM(s.profit) as gross_profit
      FROM sales s
      WHERE DATE(s.sale_date) BETWEEN DATE($1) AND DATE($2)
        AND s.status NOT IN ('VOID', 'REFUNDED')
      GROUP BY ${dateGroup}
      ORDER BY period
    `;

    const result = await pool.query(query, [options.startDate, options.endDate]);

    return result.rows.map((row) => {
      const revenue = new Decimal(row.revenue || 0);
      const cogs = new Decimal(row.cost_of_goods_sold || 0);
      const grossProfit = revenue.minus(cogs);
      const grossProfitMargin = revenue.isZero()
        ? new Decimal(0)
        : grossProfit.dividedBy(revenue).times(100);

      return {
        period: formatDateOnly(row.period) || String(row.period),
        revenue: revenue.toDecimalPlaces(2).toNumber(),
        costOfGoodsSold: cogs.toDecimalPlaces(2).toNumber(),
        grossProfit: grossProfit.toDecimalPlaces(2).toNumber(),
        grossProfitMargin: grossProfitMargin.toDecimalPlaces(2).toNumber(),
      };
    });
  },

  /**
   * DELETED ITEMS REPORT
   * Audit trail of deleted/deactivated products
   */
  async getDeletedItemsReport(
    pool: Pool,
    options: {
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<DeletedItemRow[]> {
    const params: unknown[] = [];
    let dateFilter = '';

    if (options.startDate && options.endDate) {
      dateFilter = 'AND p.updated_at BETWEEN $1 AND $2';
      params.push(options.startDate, options.endDate);
    }

    const query = `
      SELECT 
        p.id as product_id,
        p.name as product_name,
        p.sku,
        p.updated_at as deleted_date,
        p.description,
        COALESCE(SUM(
          CASE 
            WHEN sm.movement_type IN ('GOODS_RECEIPT', 'ADJUSTMENT_IN', 'RETURN', 'TRANSFER_IN', 'OPENING_BALANCE') THEN sm.quantity
            WHEN sm.movement_type IN ('SALE', 'ADJUSTMENT_OUT', 'EXPIRY', 'DAMAGE', 'TRANSFER_OUT') THEN -sm.quantity
            ELSE 0
          END
        ), 0) as final_stock_level
      FROM products p
      LEFT JOIN stock_movements sm ON sm.product_id = p.id
      WHERE p.is_active = false
        ${dateFilter}
      GROUP BY p.id, p.name, p.sku, p.updated_at, p.description
      ORDER BY p.updated_at DESC
    `;

    const result = await pool.query(query, params);

    return result.rows.map((row) => ({
      productId: row.product_id,
      productName: row.product_name,
      sku: row.sku,
      deletedDate: formatDate(row.deleted_date),
      description: row.description,
      finalStockLevel: new Decimal(row.final_stock_level).toDecimalPlaces(3).toNumber(),
    }));
  },

  /**
   * INVENTORY ADJUSTMENTS REPORT
   * Track all inventory adjustments (increases and decreases)
   */
  async getInventoryAdjustmentsReport(
    pool: Pool,
    options: {
      startDate: Date;
      endDate: Date;
      productId?: string;
    }
  ): Promise<InventoryAdjustmentRow[]> {
    const params: unknown[] = [options.startDate, options.endDate];
    let productFilter = '';

    if (options.productId) {
      productFilter = 'AND sm.product_id = $3';
      params.push(options.productId);
    }

    const query = `
      SELECT 
        sm.id as movement_id,
        sm.created_at as movement_date,
        sm.movement_type,
        p.name as product_name,
        p.sku,
        b.batch_number,
        sm.quantity as quantity_change,
        sm.reference_id as reference_number,
        sm.notes,
        sm.created_by_id as performed_by
      FROM stock_movements sm
      INNER JOIN products p ON p.id = sm.product_id
      LEFT JOIN inventory_batches b ON b.id = sm.batch_id
      WHERE sm.movement_type IN ('ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'EXPIRY', 'DAMAGE', 'RETURN', 'TRANSFER_IN', 'TRANSFER_OUT', 'OPENING_BALANCE')
        AND sm.created_at BETWEEN $1 AND $2
        ${productFilter}
      ORDER BY sm.created_at DESC
    `;

    const result = await pool.query(query, params);

    return result.rows.map((row) => ({
      movementId: row.movement_id,
      movementDate: formatDate(row.movement_date),
      movementType: row.movement_type,
      productName: row.product_name,
      sku: row.sku,
      batchNumber: row.batch_number,
      quantityChange: new Decimal(row.quantity_change).toDecimalPlaces(3).toNumber(),
      referenceNumber: row.reference_number,
      notes: row.notes,
      performedBy: row.performed_by,
    }));
  },

  /**
   * PURCHASE ORDER SUMMARY REPORT
   * Track purchase orders by status, supplier, and date range
   */
  async getPurchaseOrderSummary(
    pool: Pool,
    options: {
      startDate?: Date;
      endDate?: Date;
      status?: string;
      supplierId?: string;
    }
  ): Promise<PurchaseOrderSummaryRow[]> {
    const params: unknown[] = [];
    const filters: string[] = [];

    if (options.startDate && options.endDate) {
      params.push(options.startDate, options.endDate);
      filters.push(
        `DATE(po.order_date) BETWEEN DATE($${params.length - 1}) AND DATE($${params.length})`
      );
    }

    if (options.status) {
      params.push(options.status);
      filters.push(`po.status = $${params.length}`);
    }

    if (options.supplierId) {
      params.push(options.supplierId);
      filters.push(`po.supplier_id = $${params.length}`);
    }

    const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

    const query = `
      SELECT 
        po.id,
        po.order_number,
        po.status,
        po.order_date,
        po.expected_delivery_date,
        po.created_at,
        s."SupplierCode" as supplier_number,
        s."CompanyName" as supplier_name,
        s."Email" as supplier_email,
        s."Phone" as supplier_phone,
        COALESCE(po.total_amount, 0) as total_amount,
        COUNT(DISTINCT gr.id) as total_receipts,
        COALESCE(SUM(gri.received_quantity), 0) as total_received,
        po.notes
      FROM purchase_orders po
      INNER JOIN suppliers s ON s."Id" = po.supplier_id
      LEFT JOIN goods_receipts gr ON gr.purchase_order_id = po.id
      LEFT JOIN goods_receipt_items gri ON gri.goods_receipt_id = gr.id
      ${whereClause}
      GROUP BY po.id, po.order_number, po.status, po.order_date, po.expected_delivery_date, 
               po.created_at, s."SupplierCode", s."CompanyName", s."Email", s."Phone", po.total_amount, po.notes
      ORDER BY po.created_at DESC
    `;

    const result = await pool.query(query, params);

    return result.rows.map((row) => ({
      id: row.id,
      poNumber: row.order_number,
      status: row.status,
      orderDate: formatDate(row.order_date),
      expectedDeliveryDate: formatDateOnly(row.expected_delivery_date),
      supplierNumber: row.supplier_number,
      supplierName: row.supplier_name,
      supplierEmail: row.supplier_email,
      supplierPhone: row.supplier_phone,
      totalAmount: new Decimal(row.total_amount || 0).toDecimalPlaces(2).toNumber(),
      totalReceipts: parseInt(row.total_receipts),
      totalReceived: new Decimal(row.total_received || 0).toDecimalPlaces(3).toNumber(),
      notes: row.notes,
      createdAt: formatDate(row.created_at),
    }));
  },

  /**
   * STOCK MOVEMENT ANALYSIS REPORT
   * Analyze stock movements by type, product, or date range
   */
  async getStockMovementAnalysis(
    pool: Pool,
    options: {
      startDate: Date;
      endDate: Date;
      productId?: string;
      movementType?: string;
      groupBy?: 'day' | 'week' | 'month' | 'product' | 'movement_type';
    }
  ): Promise<StockMovementAnalysisRow[]> {
    const params: unknown[] = [options.startDate, options.endDate];
    const filters: string[] = ['sm.created_at BETWEEN $1 AND $2'];

    if (options.productId) {
      params.push(options.productId);
      filters.push(`sm.product_id = $${params.length}`);
    }

    if (options.movementType) {
      params.push(options.movementType);
      filters.push(`sm.movement_type = $${params.length}`);
    }

    const whereClause = filters.join(' AND ');

    let groupByClause = '';
    let selectFields = '';

    switch (options.groupBy) {
      case 'day':
        groupByClause = 'DATE(sm.created_at)';
        selectFields = `DATE(sm.created_at) as period`;
        break;
      case 'week':
        groupByClause = "DATE_TRUNC('week', sm.created_at)";
        selectFields = `DATE_TRUNC('week', sm.created_at) as period`;
        break;
      case 'month':
        groupByClause = "DATE_TRUNC('month', sm.created_at)";
        selectFields = `DATE_TRUNC('month', sm.created_at) as period`;
        break;
      case 'product':
        groupByClause = 'p.id, p.name, p.sku';
        selectFields = `p.id as product_id, p.name as product_name, p.sku`;
        break;
      case 'movement_type':
        groupByClause = 'sm.movement_type';
        selectFields = `sm.movement_type`;
        break;
      default:
        groupByClause = 'sm.movement_type, p.id, p.name, p.sku';
        selectFields = `sm.movement_type, p.id as product_id, p.name as product_name, p.sku`;
    }

    const query = `
      SELECT 
        ${selectFields},
        COUNT(sm.id) as transaction_count,
        SUM(CASE WHEN sm.movement_type IN ('GOODS_RECEIPT', 'ADJUSTMENT_IN', 'RETURN', 'TRANSFER_IN', 'OPENING_BALANCE') THEN sm.quantity ELSE 0 END) as total_in,
        SUM(CASE WHEN sm.movement_type IN ('SALE', 'ADJUSTMENT_OUT', 'DAMAGE', 'EXPIRY', 'TRANSFER_OUT') THEN sm.quantity ELSE 0 END) as total_out,
        SUM(CASE WHEN sm.movement_type IN ('GOODS_RECEIPT', 'ADJUSTMENT_IN', 'RETURN', 'TRANSFER_IN', 'OPENING_BALANCE') THEN sm.quantity ELSE -sm.quantity END) as net_movement
      FROM stock_movements sm
      INNER JOIN products p ON p.id = sm.product_id
      WHERE ${whereClause}
      GROUP BY ${groupByClause}
      ORDER BY ${groupByClause}
    `;

    const result = await pool.query(query, params);

    return result.rows.map((row) => ({
      ...row,
      transactionCount: parseInt(row.transaction_count),
      totalIn: new Decimal(row.total_in || 0).toDecimalPlaces(3).toNumber(),
      totalOut: new Decimal(row.total_out || 0).toDecimalPlaces(3).toNumber(),
      netMovement: new Decimal(row.net_movement || 0).toDecimalPlaces(3).toNumber(),
      period: formatDateOnly(row.period),
    }));
  },

  /**
   * CUSTOMER ACCOUNT STATEMENT REPORT
   * Show customer balance, credit limit, and transaction history
   */
  async getCustomerAccountStatement(
    pool: Pool,
    options: {
      customerId: string;
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<CustomerAccountStatementData> {
    const params: unknown[] = [options.customerId];
    const filters: string[] = ['s.customer_id = $1'];

    if (options.startDate && options.endDate) {
      params.push(options.startDate, options.endDate);
      filters.push(`s.sale_date BETWEEN $${params.length - 1} AND $${params.length}`);
    }

    const whereClause = filters.join(' AND ');

    // Get customer details
    const customerQuery = `
      SELECT 
        c.id,
        c.customer_number,
        c.name,
        c.email,
        c.phone,
        c.credit_limit,
        COALESCE(c.balance, 0) as current_balance,
        c.customer_group_id
      FROM customers c
      WHERE c.id = $1
    `;

    const customerResult = await pool.query(customerQuery, [options.customerId]);

    if (customerResult.rows.length === 0) {
      throw new Error('Customer not found');
    }

    const customer = customerResult.rows[0];

    // Get transaction history with invoice-based balance (invoices track actual payments)
    const transactionsQuery = `
      SELECT 
        s.id as sale_id,
        s.sale_number,
        s.sale_date,
        s.total_amount,
        COALESCE(i."AmountPaid", s.amount_paid) as amount_paid,
        COALESCE(i."OutstandingBalance", s.total_amount - s.amount_paid) as balance_due,
        COALESCE(i."Status", s.status::text) as payment_status,
        array_agg(
          json_build_object(
            'product_name', COALESCE(p.name, si.product_name, 'Custom Item'),
            'quantity', si.quantity,
            'unit_price', si.unit_price,
            'subtotal', si.total_price
          )
        ) as items
      FROM sales s
      LEFT JOIN invoices i ON i."SaleId" = s.id
      LEFT JOIN sale_items si ON si.sale_id = s.id
      LEFT JOIN products p ON p.id = si.product_id
      WHERE ${whereClause}
      GROUP BY s.id, s.sale_number, s.sale_date, s.total_amount, s.amount_paid, s.status,
               i."AmountPaid", i."OutstandingBalance", i."Status"
      ORDER BY s.sale_date DESC
    `;

    const transactionsResult = await pool.query(transactionsQuery, params);

    return {
      customer: {
        id: customer.id,
        customerNumber: customer.customer_number,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        creditLimit: new Decimal(customer.credit_limit || 0).toDecimalPlaces(2).toNumber(),
        currentBalance: new Decimal(customer.current_balance).toDecimalPlaces(2).toNumber(),
        customerGroupId: customer.customer_group_id,
      },
      transactions: transactionsResult.rows.map((row) => ({
        saleId: row.sale_id,
        saleNumber: row.sale_number,
        saleDate: formatDate(row.sale_date),
        totalAmount: new Decimal(row.total_amount).toDecimalPlaces(2).toNumber(),
        amountPaid: new Decimal(row.amount_paid).toDecimalPlaces(2).toNumber(),
        balanceDue: new Decimal(row.balance_due).toDecimalPlaces(2).toNumber(),
        paymentStatus: row.payment_status,
        items: row.items,
      })),
    };
  },

  /**
   * PROFIT MARGIN BY PRODUCT REPORT
   * Calculate profit margins for each product
   */
  async getProfitMarginByProduct(
    pool: Pool,
    options: {
      startDate?: Date;
      endDate?: Date;
      categoryId?: string;
      minMarginPercent?: number;
    }
  ): Promise<ProfitMarginByProductRow[]> {
    const params: unknown[] = [];
    const filters: string[] = [];

    if (options.startDate && options.endDate) {
      params.push(options.startDate, options.endDate);
      filters.push(`s.sale_date BETWEEN $${params.length - 1} AND $${params.length}`);
    }

    if (options.categoryId) {
      params.push(options.categoryId);
      filters.push(`p.category = $${params.length}`);
    }

    const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

    const query = `
      SELECT 
        p.id as product_id,
        p.name as product_name,
        p.sku,
        p.category,
        COUNT(DISTINCT s.id) as total_sales,
        SUM(si.quantity) as total_quantity_sold,
        SUM(si.total_price) as total_revenue,
        SUM(si.unit_cost * si.quantity) as total_cost,
        SUM(si.profit) as total_profit,
        CASE 
          WHEN SUM(si.total_price) > 0 
          THEN ((SUM(si.profit) / SUM(si.total_price)) * 100)
          ELSE 0 
        END as profit_margin_percent
      FROM products p
      LEFT JOIN sale_items si ON si.product_id = p.id
      LEFT JOIN sales s ON s.id = si.sale_id
      ${whereClause}
      GROUP BY p.id, p.name, p.sku, p.category
      HAVING SUM(si.quantity) > 0
      ${options.minMarginPercent !== undefined
        ? (() => {
          params.push(options.minMarginPercent);
          return `AND ((SUM(si.profit) / NULLIF(SUM(si.total_price), 0)) * 100) >= $${params.length}`;
        })()
        : ''
      }
      ORDER BY total_profit DESC
    `;

    const result = await pool.query(query, params);

    return result.rows.map((row) => ({
      productId: row.product_id,
      productName: row.product_name,
      sku: row.sku,
      category: row.category,
      totalSales: parseInt(row.total_sales),
      totalQuantitySold: new Decimal(row.total_quantity_sold || 0).toDecimalPlaces(3).toNumber(),
      totalRevenue: new Decimal(row.total_revenue || 0).toDecimalPlaces(2).toNumber(),
      totalCost: new Decimal(row.total_cost || 0).toDecimalPlaces(2).toNumber(),
      totalProfit: new Decimal(row.total_profit || 0).toDecimalPlaces(2).toNumber(),
      profitMarginPercent: new Decimal(row.profit_margin_percent || 0)
        .toDecimalPlaces(2)
        .toNumber(),
    }));
  },

  /**
   * ENHANCED DAILY CASH FLOW REPORT
   * Track daily cash in/out with separation of sales revenue vs debt collections
   * Bank-grade precision with Decimal.js for all financial calculations
   */
  async getDailyCashFlow(
    pool: Pool,
    options: {
      startDate: Date | string;
      endDate: Date | string;
      paymentMethod?: string;
      includeDebCollections?: boolean;
    }
  ): Promise<DailyCashFlowRow[]> {
    // Convert dates to YYYY-MM-DD strings to avoid timezone issues
    const startDateStr =
      options.startDate instanceof Date
        ? options.startDate.toLocaleDateString('en-CA')
        : options.startDate;
    const endDateStr =
      options.endDate instanceof Date
        ? options.endDate.toLocaleDateString('en-CA')
        : options.endDate;

    try {
      // Enhanced query that separates sales revenue from debt collections
      const query = `
        WITH daily_sales AS (
          -- Fresh sales revenue (new business)
          SELECT 
            DATE(s.sale_date) as transaction_date,
            s.payment_method as payment_method,
            'SALES_REVENUE' as revenue_type,
            COUNT(s.id) as transaction_count,
            SUM(COALESCE(s.amount_paid, 0)) as cash_amount,
            SUM(COALESCE(s.total_amount, 0)) as total_sales,
            SUM(COALESCE(s.total_cost, 0)) as total_cost,
            SUM(COALESCE(s.profit, 0)) as gross_profit,
            SUM(COALESCE(s.total_amount, 0) - COALESCE(s.amount_paid, 0)) as credit_created,
            AVG(COALESCE(s.total_amount, 0)) as average_sale_value
          FROM sales s
          WHERE DATE(s.sale_date) BETWEEN $1::date AND $2::date
            AND s.status NOT IN ('VOID', 'REFUNDED')
            AND s.payment_method IS NOT NULL
            ${options.paymentMethod ? 'AND s.payment_method = $3' : ''}
          GROUP BY DATE(s.sale_date), s.payment_method
        ),
        daily_collections AS (
          -- Debt collections (invoice payments from previous sales)
          SELECT 
            DATE(ip.payment_date) as transaction_date,
            ip.payment_method as payment_method,
            'DEBT_COLLECTION' as revenue_type,
            COUNT(ip.id) as transaction_count,
            SUM(COALESCE(ip.amount, 0)) as cash_amount,
            0 as total_sales,
            0 as total_cost,
            0 as gross_profit,
            0 as credit_created,
            AVG(COALESCE(ip.amount, 0)) as average_collection_value
          FROM invoice_payments ip
          INNER JOIN invoices i ON ip.invoice_id = i."Id"
          WHERE DATE(ip.payment_date) BETWEEN $1::date AND $2::date
            AND ip.payment_method IS NOT NULL
            ${options.paymentMethod ? 'AND ip.payment_method = $3' : ''}
          GROUP BY DATE(ip.payment_date), ip.payment_method
        ),
        combined_cash_flow AS (
          SELECT 
            transaction_date,
            payment_method,
            revenue_type,
            transaction_count,
            cash_amount,
            total_sales,
            total_cost,
            gross_profit,
            credit_created,
            average_sale_value as average_transaction_value
          FROM daily_sales
          UNION ALL
          SELECT 
            transaction_date,
            payment_method,
            revenue_type,
            transaction_count,
            cash_amount,
            total_sales,
            total_cost,
            gross_profit,
            credit_created,
            average_collection_value as average_transaction_value
          FROM daily_collections
        )
        SELECT 
          to_char(transaction_date, 'YYYY-MM-DD') as transaction_date,
          payment_method,
          revenue_type,
          transaction_count,
          cash_amount,
          total_sales,
          total_cost,
          gross_profit,
          credit_created,
          average_transaction_value
        FROM combined_cash_flow
        WHERE transaction_count > 0
        ORDER BY transaction_date DESC, revenue_type, payment_method
      `;

      const params = [startDateStr, endDateStr];
      if (options.paymentMethod) {
        params.push(options.paymentMethod);
      }

      const result = await pool.query(query, params);

      // Handle empty results gracefully
      if (!result.rows || result.rows.length === 0) {
        return [];
      }

      return result.rows.map((row) => ({
        transactionDate: row.transaction_date,
        paymentMethod: row.payment_method,
        revenueType: row.revenue_type,
        transactionCount: parseInt(row.transaction_count || 0),
        cashAmount: new Decimal(row.cash_amount || 0).toDecimalPlaces(2).toNumber(),
        totalSales: new Decimal(row.total_sales || 0).toDecimalPlaces(2).toNumber(),
        totalCost: new Decimal(row.total_cost || 0).toDecimalPlaces(2).toNumber(),
        grossProfit: new Decimal(row.gross_profit || 0).toDecimalPlaces(2).toNumber(),
        creditCreated: new Decimal(row.credit_created || 0).toDecimalPlaces(2).toNumber(),
        averageTransactionValue: new Decimal(row.average_transaction_value || 0)
          .toDecimalPlaces(2)
          .toNumber(),
        // Calculated fields for business intelligence
        profitMargin:
          row.total_sales > 0
            ? new Decimal(row.gross_profit || 0)
              .div(row.total_sales)
              .mul(100)
              .toDecimalPlaces(2)
              .toNumber()
            : 0,
        cashFlowImpact: new Decimal(row.cash_amount || 0).toDecimalPlaces(2).toNumber(),
      }));
    } catch (error) {
      console.error('Error in getDailyCashFlow:', error);
      // Return empty array on error to prevent frontend crash
      return [];
    }
  },

  /**
   * SUPPLIER PAYMENT STATUS REPORT
   * Track outstanding supplier payments
   */
  async getSupplierPaymentStatus(
    pool: Pool,
    options: {
      supplierId?: string;
      status?: 'PAID' | 'PARTIAL' | 'PENDING';
    }
  ): Promise<SupplierPaymentStatusRow[]> {
    const params: unknown[] = [];
    const supplierFilters: string[] = [];
    const invoiceFilters: string[] = ['deleted_at IS NULL'];

    if (options.supplierId) {
      params.push(options.supplierId);
      supplierFilters.push(`s."Id" = $${params.length}`);
    }

    if (options.status) {
      // Map report filter status to supplier_invoices status values
      const statusMap: Record<string, string[]> = {
        PAID: ['Paid'],
        PARTIAL: ['PartiallyPaid'],
        PENDING: ['Unpaid', 'Overdue'],
      };
      const invoiceStatuses = statusMap[options.status] || [options.status];
      params.push(invoiceStatuses);
      invoiceFilters.push(`"Status" = ANY($${params.length})`);
    }

    const supplierWhereClause =
      supplierFilters.length > 0 ? `WHERE ${supplierFilters.join(' AND ')}` : '';
    const invoiceWhereClause =
      invoiceFilters.length > 0 ? `WHERE ${invoiceFilters.join(' AND ')}` : '';

    // Use supplier_invoices as the source of truth for billing/payment amounts.
    // purchase_orders.paid_amount is NOT synced when supplier_payments are recorded;
    // supplier_invoices tracks AmountPaid/OutstandingBalance accurately via triggers.
    const query = `
      SELECT 
        s."Id" as supplier_id,
        s."SupplierCode" as supplier_number,
        s."CompanyName" as supplier_name,
        s."Email" as email,
        s."Phone" as phone,
        COALESCE(po_agg.total_orders, 0) as total_orders,
        COALESCE(inv_agg.total_amount, 0) as total_amount,
        COALESCE(inv_agg.total_paid, 0) as total_paid,
        COALESCE(inv_agg.outstanding_balance, 0) as outstanding_balance,
        COALESCE(po_agg.last_order_date, inv_agg.last_invoice_date) as last_order_date,
        s."DefaultPaymentTerms" as payment_terms
      FROM suppliers s
      LEFT JOIN (
        SELECT supplier_id,
               COUNT(id) as total_orders,
               MAX(order_date) as last_order_date
        FROM purchase_orders
        GROUP BY supplier_id
      ) po_agg ON po_agg.supplier_id = s."Id"
      LEFT JOIN (
        SELECT "SupplierId",
               SUM("TotalAmount") as total_amount,
               SUM("AmountPaid") as total_paid,
               SUM("OutstandingBalance") as outstanding_balance,
               MAX("InvoiceDate") as last_invoice_date
        FROM supplier_invoices
        ${invoiceWhereClause}
        GROUP BY "SupplierId"
      ) inv_agg ON inv_agg."SupplierId" = s."Id"
      ${supplierWhereClause}
      ORDER BY outstanding_balance DESC
    `;

    const result = await pool.query(query, params);

    // Filter out rows with no invoices (no billing activity)
    const filtered = result.rows.filter((row) => new Decimal(row.total_amount || 0).greaterThan(0));

    return filtered.map((row) => ({
      supplierId: row.supplier_id,
      supplierNumber: row.supplier_number,
      supplierName: row.supplier_name,
      email: row.email,
      phone: row.phone,
      totalOrders: parseInt(row.total_orders || 0),
      totalAmount: new Decimal(row.total_amount || 0).toDecimalPlaces(2).toNumber(),
      totalPaid: new Decimal(row.total_paid || 0).toDecimalPlaces(2).toNumber(),
      outstandingBalance: new Decimal(row.outstanding_balance || 0).toDecimalPlaces(2).toNumber(),
      lastOrderDate: formatDate(row.last_order_date),
      paymentTerms: row.payment_terms,
    }));
  },

  /**
   * TOP CUSTOMERS REPORT
   * Rank customers by revenue
   */
  async getTopCustomers(
    pool: Pool,
    options: {
      startDate: Date;
      endDate: Date;
      limit?: number;
      minPurchaseAmount?: number;
      sortBy?: 'REVENUE' | 'ORDERS' | 'PROFIT';
    }
  ): Promise<TopCustomerRow[]> {
    const params: unknown[] = [options.startDate, options.endDate];
    const filters: string[] = ['s.sale_date BETWEEN $1 AND $2'];

    if (options.minPurchaseAmount) {
      params.push(options.minPurchaseAmount);
      filters.push(`s.total_amount >= $${params.length}`);
    }

    const whereClause = filters.join(' AND ');
    let limitClause = '';
    if (options.limit) {
      params.push(options.limit);
      limitClause = `LIMIT $${params.length}`;
    }

    const query = `
      SELECT 
        c.id as customer_id,
        c.customer_number as customer_number,
        c.name as customer_name,
        c.email,
        c.phone,
        COUNT(s.id) as total_purchases,
        SUM(s.total_amount) as total_revenue,
        SUM(s.profit) as total_profit,
        AVG(s.total_amount) as average_purchase_value,
        MAX(s.sale_date) as last_purchase_date,
        COALESCE(c.balance, 0) as outstanding_balance
      FROM customers c
      INNER JOIN sales s ON s.customer_id = c.id
      WHERE ${whereClause}
        AND s.status NOT IN ('VOID', 'REFUNDED')
      GROUP BY c.id, c.customer_number, c.name, c.email, c.phone, c.balance
      ORDER BY ${options.sortBy === 'ORDERS' ? 'total_purchases' : options.sortBy === 'PROFIT' ? 'total_profit' : 'total_revenue'} DESC
      ${limitClause}
    `;

    const result = await pool.query(query, params);

    return result.rows.map((row, index) => ({
      rank: index + 1,
      customerId: row.customer_id,
      customerNumber: row.customer_number,
      customerName: row.customer_name,
      email: row.email,
      phone: row.phone,
      totalPurchases: parseInt(row.total_purchases),
      totalRevenue: new Decimal(row.total_revenue || 0).toDecimalPlaces(2).toNumber(),
      totalProfit: new Decimal(row.total_profit || 0).toDecimalPlaces(2).toNumber(),
      averagePurchaseValue: new Decimal(row.average_purchase_value || 0)
        .toDecimalPlaces(2)
        .toNumber(),
      lastPurchaseDate: formatDate(row.last_purchase_date),
      outstandingBalance: new Decimal(row.outstanding_balance || 0).toDecimalPlaces(2).toNumber(),
    }));
  },

  /**
   * CUSTOMER AGING REPORT
   * Outstanding customer balances by aging periods (0-30, 31-60, 61-90, 90+ days)
   */
  async getCustomerAging(
    pool: Pool,
    options: {
      asOfDate?: Date;
    }
  ): Promise<CustomerAgingRow[]> {
    const asOfDate = options.asOfDate || new Date();
    const asOfDateStr = asOfDate instanceof Date ? asOfDate.toLocaleDateString('en-CA') : asOfDate;

    const query = `
      WITH customer_invoices AS (
        SELECT 
          c.id as customer_id,
          c.customer_number,
          c.name as customer_name,
          c.email,
          c.phone,
          c.credit_limit,
          i."Id" as invoice_id,
          i."InvoiceNumber" as invoice_number,
          i."InvoiceDate" as invoice_date,
          i."DueDate" as due_date,
          i."TotalAmount" as total_amount,
          i."AmountPaid" as amount_paid,
          i."OutstandingBalance" as outstanding_balance,
          EXTRACT(DAY FROM ($1::date - i."DueDate")) as days_overdue
        FROM customers c
        INNER JOIN invoices i ON i."CustomerId" = c.id
        WHERE i."OutstandingBalance" > 0
          AND i."Status" != 'PAID'
      )
      SELECT 
        customer_id,
        customer_number,
        customer_name,
        email,
        phone,
        credit_limit,
        COUNT(invoice_id) as total_invoices,
        SUM(outstanding_balance) as total_outstanding,
        SUM(CASE WHEN days_overdue <= 0 THEN outstanding_balance ELSE 0 END) as current_amount,
        SUM(CASE WHEN days_overdue > 0 AND days_overdue <= 30 THEN outstanding_balance ELSE 0 END) as days_1_30,
        SUM(CASE WHEN days_overdue > 30 AND days_overdue <= 60 THEN outstanding_balance ELSE 0 END) as days_31_60,
        SUM(CASE WHEN days_overdue > 60 AND days_overdue <= 90 THEN outstanding_balance ELSE 0 END) as days_61_90,
        SUM(CASE WHEN days_overdue > 90 THEN outstanding_balance ELSE 0 END) as days_over_90,
        MAX(days_overdue) as max_days_overdue
      FROM customer_invoices
      GROUP BY customer_id, customer_number, customer_name, email, phone, credit_limit
      ORDER BY total_outstanding DESC
    `;

    const result = await pool.query(query, [asOfDateStr]);

    // Map to field names expected by frontend CustomerAgingReport component
    return result.rows.map((row) => {
      const current = new Decimal(row.current_amount || 0).toDecimalPlaces(2).toNumber();
      const days30 = new Decimal(row.days_1_30 || 0).toDecimalPlaces(2).toNumber();
      const days60 = new Decimal(row.days_31_60 || 0).toDecimalPlaces(2).toNumber();
      const days90 = new Decimal(row.days_61_90 || 0).toDecimalPlaces(2).toNumber();
      const over90 = new Decimal(row.days_over_90 || 0).toDecimalPlaces(2).toNumber();
      const totalOutstanding = new Decimal(row.total_outstanding || 0)
        .toDecimalPlaces(2)
        .toNumber();
      // overdueAmount is everything past current (days30 + days60 + days90 + over90)
      const overdueAmount = days30 + days60 + days90 + over90;

      return {
        customerId: row.customer_id,
        customerNumber: row.customer_number,
        customerName: row.customer_name,
        email: row.email,
        phone: row.phone,
        creditLimit: new Decimal(row.credit_limit || 0).toDecimalPlaces(2).toNumber(),
        totalInvoices: parseInt(row.total_invoices || 0),
        totalOutstanding,
        // Field names matching frontend component expectations
        current,
        days30,
        days60,
        days90,
        over90,
        overdueAmount,
        maxDaysOverdue: parseInt(row.max_days_overdue || 0),
      };
    });
  },

  /**
   * STOCK AGING REPORT
   * Show how long inventory has been in stock
   */
  async getStockAging(
    pool: Pool,
    options: {
      categoryId?: string;
      minDaysInStock?: number;
    }
  ): Promise<StockAgingRow[]> {
    const params: unknown[] = [];
    const filters: string[] = ['b.remaining_quantity > 0'];

    if (options.categoryId) {
      params.push(options.categoryId);
      filters.push(`p.category = $${params.length}`);
    }

    if (options.minDaysInStock) {
      params.push(options.minDaysInStock);
      filters.push(`CURRENT_DATE - b.received_date >= $${params.length}`);
    }

    const whereClause = filters.join(' AND ');

    const query = `
      SELECT 
        p.id as product_id,
        p.name as product_name,
        p.sku,
        p.category,
        b.batch_number,
        b.remaining_quantity,
        b.cost_price as unit_cost,
        b.remaining_quantity * b.cost_price as total_value,
        b.received_date,
        CURRENT_DATE - b.received_date as days_in_stock,
        b.expiry_date,
        CASE 
          WHEN b.expiry_date IS NOT NULL THEN b.expiry_date - CURRENT_DATE
          ELSE NULL
        END as days_until_expiry
      FROM inventory_batches b
      INNER JOIN products p ON p.id = b.product_id
      WHERE ${whereClause}
      ORDER BY days_in_stock DESC, total_value DESC
    `;

    const result = await pool.query(query, params);

    return result.rows.map((row) => ({
      productId: row.product_id,
      productName: row.product_name,
      sku: row.sku,
      category: row.category,
      batchNumber: row.batch_number,
      remainingQuantity: new Decimal(row.remaining_quantity).toDecimalPlaces(3).toNumber(),
      unitCost: new Decimal(row.unit_cost).toDecimalPlaces(2).toNumber(),
      totalValue: new Decimal(row.total_value).toDecimalPlaces(2).toNumber(),
      receivedDate: formatDate(row.received_date),
      daysInStock: parseInt(row.days_in_stock),
      expiryDate: formatDateOnly(row.expiry_date),
      daysUntilExpiry: row.days_until_expiry !== null ? parseInt(row.days_until_expiry) : null,
    }));
  },

  /**
   * WASTE & DAMAGE REPORT
   * Track inventory losses
   */
  async getWasteDamageReport(
    pool: Pool,
    options: {
      startDate: Date;
      endDate: Date;
      productId?: string;
      reason?: 'DAMAGE' | 'EXPIRY' | 'THEFT' | 'OTHER';
    }
  ): Promise<WasteDamageRow[]> {
    const params: unknown[] = [options.startDate, options.endDate];
    const filters: string[] = [
      'sm.created_at BETWEEN $1 AND $2',
      "sm.movement_type IN ('DAMAGE', 'EXPIRY')",
    ];

    if (options.productId) {
      params.push(options.productId);
      filters.push(`sm.product_id = $${params.length}`);
    }

    if (options.reason) {
      params.push(options.reason);
      filters.push(`sm.movement_type = $${params.length}`);
    }

    const whereClause = filters.join(' AND ');

    const query = `
      SELECT 
        sm.id as movement_id,
        sm.created_at as loss_date,
        sm.movement_type as loss_type,
        p.id as product_id,
        p.name as product_name,
        p.sku,
        p.category,
        b.batch_number,
        b.expiry_date,
        sm.quantity as quantity_lost,
        sm.unit_cost,
        sm.quantity * sm.unit_cost as total_loss_value,
        sm.notes,
        sm.created_by_id
      FROM stock_movements sm
      INNER JOIN products p ON p.id = sm.product_id
      LEFT JOIN inventory_batches b ON b.id = sm.batch_id
      WHERE ${whereClause}
      ORDER BY sm.created_at DESC
    `;

    const result = await pool.query(query, params);

    return result.rows.map((row) => ({
      movementId: row.movement_id,
      lossDate: formatDate(row.loss_date),
      lossType: row.loss_type,
      productId: row.product_id,
      productName: row.product_name,
      sku: row.sku,
      category: row.category,
      batchNumber: row.batch_number,
      expiryDate: formatDateOnly(row.expiry_date),
      quantityLost: new Decimal(row.quantity_lost || 0).toDecimalPlaces(3).toNumber(),
      unitCost: new Decimal(row.unit_cost || 0).toDecimalPlaces(2).toNumber(),
      totalLossValue: new Decimal(row.total_loss_value || 0).toDecimalPlaces(2).toNumber(),
      notes: row.notes,
      createdBy: row.created_by_id,
    }));
  },

  /**
   * SMART REORDER AI — Inventory Assistant
   * Analyzes sales history, seasonal demand trends, supplier lead times,
   * and demand variability to generate intelligent reorder recommendations
   * with safety stock buffers and lead-time-aware reorder points.
   */
  async getReorderRecommendations(
    pool: Pool,
    options: {
      categoryId?: string;
      daysToAnalyze?: number;
    }
  ): Promise<ReorderRecommendationRow[]> {
    const daysToAnalyze = options.daysToAnalyze || 30;
    const params: unknown[] = [daysToAnalyze];
    const filters: string[] = [];

    if (options.categoryId) {
      params.push(options.categoryId);
      filters.push(`p.category = $${params.length}`);
    }

    const whereClause = filters.length > 0 ? `AND ${filters.join(' AND ')}` : '';

    const query = `
      SELECT 
        p.id as product_id,
        p.name as product_name,
        p.sku,
        p.category,
        pi.reorder_level,
        COALESCE(SUM(b.remaining_quantity), 0) as current_stock,
        -- Total units sold in analysis period
        COALESCE((
          SELECT SUM(si.quantity)
          FROM sale_items si
          INNER JOIN sales s ON s.id = si.sale_id
          WHERE si.product_id = p.id
            AND s.sale_date >= CURRENT_DATE - INTERVAL '1 day' * $1
        ), 0) as units_sold_period,
        -- Average daily sales velocity over full period
        COALESCE((
          SELECT SUM(si.quantity)
          FROM sale_items si
          INNER JOIN sales s ON s.id = si.sale_id
          WHERE si.product_id = p.id
            AND s.sale_date >= CURRENT_DATE - INTERVAL '1 day' * $1
        ) / NULLIF($1, 0), 0) as daily_sales_velocity,
        -- Recent 7-day velocity for trend detection
        COALESCE((
          SELECT SUM(si.quantity)
          FROM sale_items si
          INNER JOIN sales s ON s.id = si.sale_id
          WHERE si.product_id = p.id
            AND s.sale_date >= CURRENT_DATE - INTERVAL '7 days'
        ) / 7.0, 0) as recent_7day_velocity,
        -- Daily sales standard deviation for safety stock
        COALESCE((
          SELECT STDDEV_POP(daily_qty) FROM (
            SELECT COALESCE(SUM(si.quantity), 0) as daily_qty
            FROM generate_series(
              CURRENT_DATE - INTERVAL '1 day' * $1,
              CURRENT_DATE - INTERVAL '1 day',
              INTERVAL '1 day'
            ) AS d(day)
            LEFT JOIN sale_items si ON si.product_id = p.id
            LEFT JOIN sales s ON s.id = si.sale_id AND s.sale_date = d.day::date
            GROUP BY d.day
          ) daily_sales
        ), 0) as sales_std_deviation,
        -- Days until stockout
        CASE 
          WHEN COALESCE((
            SELECT SUM(si.quantity)
            FROM sale_items si
            INNER JOIN sales s ON s.id = si.sale_id
            WHERE si.product_id = p.id
              AND s.sale_date >= CURRENT_DATE - INTERVAL '1 day' * $1
          ) / NULLIF($1, 0), 0) > 0
          THEN COALESCE(SUM(b.remaining_quantity), 0) / (
            SELECT SUM(si.quantity) / NULLIF($1, 0)
            FROM sale_items si
            INNER JOIN sales s ON s.id = si.sale_id
            WHERE si.product_id = p.id
              AND s.sale_date >= CURRENT_DATE - INTERVAL '1 day' * $1
          )
          ELSE 999
        END as days_until_stockout,
        pv.cost_price as unit_cost,
        -- Preferred supplier (most recent) with lead time
        (
          SELECT s."CompanyName"
          FROM suppliers s
          INNER JOIN purchase_orders po ON po.supplier_id = s."Id"
          INNER JOIN goods_receipts gr ON gr.purchase_order_id = po.id
          INNER JOIN goods_receipt_items gri ON gri.goods_receipt_id = gr.id
          WHERE gri.product_id = p.id
          ORDER BY po.order_date DESC
          LIMIT 1
        ) as preferred_supplier,
        -- Supplier lead time from most recent supplier
        COALESCE((
          SELECT s.lead_time_days
          FROM suppliers s
          INNER JOIN purchase_orders po ON po.supplier_id = s."Id"
          INNER JOIN goods_receipts gr ON gr.purchase_order_id = po.id
          INNER JOIN goods_receipt_items gri ON gri.goods_receipt_id = gr.id
          WHERE gri.product_id = p.id
          ORDER BY po.order_date DESC
          LIMIT 1
        ), 7) as lead_time_days,
        -- Actual measured lead time from PO history
        COALESCE((
          SELECT AVG(EXTRACT(EPOCH FROM (gr.received_date - po.order_date)) / 86400)
          FROM purchase_orders po
          INNER JOIN goods_receipts gr ON gr.purchase_order_id = po.id
          INNER JOIN goods_receipt_items gri ON gri.goods_receipt_id = gr.id
          WHERE gri.product_id = p.id
            AND gr.received_date IS NOT NULL
            AND po.order_date IS NOT NULL
        ), NULL) as actual_avg_lead_time
      FROM products p
      LEFT JOIN product_inventory pi ON pi.product_id = p.id
      LEFT JOIN product_valuation pv ON pv.product_id = p.id
      LEFT JOIN inventory_batches b ON b.product_id = p.id AND b.remaining_quantity > 0
      WHERE p.is_active = true
        ${whereClause}
      GROUP BY p.id, p.name, p.sku, p.category, pi.reorder_level, pv.cost_price
      HAVING COALESCE(SUM(b.remaining_quantity), 0) <= pi.reorder_level
        OR (
          CASE 
            WHEN COALESCE((
              SELECT SUM(si.quantity)
              FROM sale_items si
              INNER JOIN sales s ON s.id = si.sale_id
              WHERE si.product_id = p.id
                AND s.sale_date >= CURRENT_DATE - INTERVAL '1 day' * $1
            ) / NULLIF($1, 0), 0) > 0
            THEN COALESCE(SUM(b.remaining_quantity), 0) / (
              SELECT SUM(si.quantity) / NULLIF($1, 0)
              FROM sale_items si
              INNER JOIN sales s ON s.id = si.sale_id
              WHERE si.product_id = p.id
                AND s.sale_date >= CURRENT_DATE - INTERVAL '1 day' * $1
            )
            ELSE 999
          END
        ) <= 14
      ORDER BY days_until_stockout ASC
    `;

    const result = await pool.query(query, params);

    // ── Fetch pre-computed learned data (if any learning cycles have run) ──
    let learnedStats = new Map<string, ProductDemandStats>();
    let seasonalIndexes = new Map<string, number>();
    try {
      learnedStats = await demandForecastRepository.getAllStats(pool);
      if (learnedStats.size > 0) {
        const currentMonth = new Date().getMonth() + 1;
        seasonalIndexes = await demandForecastRepository.getSeasonalityForMonth(pool, currentMonth);
      }
    } catch {
      // Graceful degradation: if tables don't exist yet, continue without learned data
      logger.warn('Demand forecast data unavailable, using live calculations only');
    }

    return result.rows.map((row) => {
      const productId: string = row.product_id;
      const learned = learnedStats.get(productId);
      const seasonalIdx = seasonalIndexes.get(productId) ?? null;
      const dailyVelocity = new Decimal(row.daily_sales_velocity || 0)
        .toDecimalPlaces(2)
        .toNumber();
      const recent7dayVelocity = new Decimal(row.recent_7day_velocity || 0)
        .toDecimalPlaces(2)
        .toNumber();
      const salesStdDev = new Decimal(row.sales_std_deviation || 0).toDecimalPlaces(2).toNumber();
      const daysUntilStockout = new Decimal(row.days_until_stockout).toDecimalPlaces(0).toNumber();

      // Use actual measured lead time if available, otherwise supplier's configured value
      const leadTimeDays = row.actual_avg_lead_time
        ? Math.ceil(new Decimal(row.actual_avg_lead_time).toNumber())
        : new Decimal(row.lead_time_days || 7).toNumber();

      // Seasonal trend: compare recent week vs overall average
      // ratio > 1 = demand increasing, < 1 = demand decreasing
      const trendRatio =
        dailyVelocity > 0
          ? new Decimal(recent7dayVelocity).dividedBy(dailyVelocity).toDecimalPlaces(2).toNumber()
          : 1;

      // Effective velocity: weight recent trend (70% current avg + 30% recent trend)
      const effectiveVelocity =
        dailyVelocity > 0
          ? new Decimal(dailyVelocity)
            .times(0.7)
            .plus(new Decimal(recent7dayVelocity).times(0.3))
            .toDecimalPlaces(2)
            .toNumber()
          : 0;

      // ── Self-Learning Override: use pre-computed stats when available ──
      // When learning_cycles > 0, the demand forecast engine has run at least once
      // and we trust its pre-computed safety stock, reorder point, and trend.
      const useLearned = learned && learned.learningCycles > 0;

      const safetyStock = useLearned
        ? learned.computedSafetyStock
        : salesStdDev > 0
          ? Math.ceil(1.65 * salesStdDev * Math.sqrt(leadTimeDays))
          : 0;

      const currentStock = new Decimal(row.current_stock).toNumber();
      const reorderLevel = new Decimal(row.reorder_level || 0).toNumber();

      const reorderPoint = useLearned
        ? learned.computedReorderPoint
        : Math.ceil(effectiveVelocity * leadTimeDays + safetyStock);

      // ── Seasonal adjustment multiplier ──
      // seasonalIdx > 1 = hot month (order more), < 1 = cool month (order less)
      const seasonalMultiplier = seasonalIdx !== null && seasonalIdx > 0 ? seasonalIdx : 1;

      // Order quantity: cover lead time + review period, minus current stock, plus safety stock
      // Apply seasonal adjustment to account for demand fluctuations
      const reviewPeriod = Math.max(daysToAnalyze, 30);
      let suggestedOrderQty: number;
      if (effectiveVelocity > 0) {
        const baseOrder =
          effectiveVelocity * (leadTimeDays + reviewPeriod) + safetyStock - currentStock;
        suggestedOrderQty = Math.max(Math.ceil(baseOrder * seasonalMultiplier), 0);
      } else if (reorderLevel > 0 && currentStock < reorderLevel) {
        suggestedOrderQty = Math.ceil(reorderLevel - currentStock);
      } else {
        suggestedOrderQty = 0;
      }

      // Priority based on days until stockout relative to lead time
      let priority: string;
      if (currentStock <= 0 && reorderLevel > 0) {
        priority = 'URGENT';
      } else if (daysUntilStockout <= leadTimeDays) {
        priority = 'URGENT';
      } else if (daysUntilStockout <= leadTimeDays * 2) {
        priority = 'HIGH';
      } else {
        priority = 'MEDIUM';
      }

      // Use learned demand trend when available (more accurate from rolling stats)
      const demandTrend = useLearned
        ? learned.demandTrend
        : trendRatio > 1.15
          ? ('INCREASING' as const)
          : trendRatio < 0.85
            ? ('DECREASING' as const)
            : ('STABLE' as const);

      return {
        productId: row.product_id,
        productName: row.product_name,
        sku: row.sku,
        category: row.category,
        reorderLevel: new Decimal(row.reorder_level || 0).toDecimalPlaces(3).toNumber(),
        currentStock: new Decimal(row.current_stock).toDecimalPlaces(3).toNumber(),
        unitsSoldPeriod: new Decimal(row.units_sold_period).toDecimalPlaces(3).toNumber(),
        dailySalesVelocity: dailyVelocity,
        daysUntilStockout: daysUntilStockout > 900 ? null : daysUntilStockout,
        suggestedOrderQuantity: suggestedOrderQty,
        estimatedOrderCost: new Decimal(row.unit_cost || 0)
          .times(suggestedOrderQty)
          .toDecimalPlaces(2)
          .toNumber(),
        preferredSupplier: row.preferred_supplier,
        priority,
        leadTimeDays,
        safetyStock,
        reorderPoint,
        demandTrend,
        trendRatio,
        // Self-learning engine enrichment
        forecastDemand30d: useLearned ? learned.forecast30d : null,
        seasonalIndex: seasonalIdx,
        learningCycles: learned?.learningCycles ?? 0,
      };
    });
  },

  /**
   * SALES BY CATEGORY REPORT
   * Analyze sales performance by product category
   */
  async getSalesByCategory(
    pool: Pool,
    options: {
      startDate: Date | string;
      endDate: Date | string;
    }
  ): Promise<SalesByCategoryRow[]> {
    const startDateStr =
      options.startDate instanceof Date
        ? options.startDate.toLocaleDateString('en-CA')
        : options.startDate;
    const endDateStr =
      options.endDate instanceof Date
        ? options.endDate.toLocaleDateString('en-CA')
        : options.endDate;

    const params: unknown[] = [startDateStr, endDateStr];

    const query = `
      SELECT 
        COALESCE(p.category, 'Uncategorized') as category,
        COUNT(DISTINCT p.id) as product_count,
        SUM(si.quantity) as total_quantity_sold,
        SUM(si.total_price) as total_revenue,
        SUM(si.quantity * si.unit_cost) as total_cost,
        SUM(si.profit) as gross_profit,
        COALESCE(SUM(si.discount_amount), 0) as total_discounts,
        COUNT(DISTINCT s.id) as transaction_count,
        AVG(si.total_price) as average_transaction_value
      FROM sales s
      INNER JOIN sale_items si ON si.sale_id = s.id
      LEFT JOIN products p ON p.id = si.product_id
      WHERE DATE(s.sale_date) BETWEEN $1::date AND $2::date
        AND s.status NOT IN ('VOID', 'REFUNDED')
      GROUP BY COALESCE(p.category, 'Uncategorized')
      ORDER BY total_revenue DESC
    `;

    const result = await pool.query(query, params);

    return result.rows.map((row) => {
      const totalRevenue = new Decimal(row.total_revenue || 0);
      const totalCost = new Decimal(row.total_cost || 0);
      const grossProfit = new Decimal(row.gross_profit || 0);
      const profitMargin = totalRevenue.isZero()
        ? new Decimal(0)
        : grossProfit.dividedBy(totalRevenue).times(100);

      return {
        category: row.category,
        productCount: parseInt(row.product_count),
        totalQuantitySold: new Decimal(row.total_quantity_sold || 0).toDecimalPlaces(2).toNumber(),
        totalRevenue: totalRevenue.toDecimalPlaces(2).toNumber(),
        totalCost: totalCost.toDecimalPlaces(2).toNumber(),
        grossProfit: grossProfit.toDecimalPlaces(2).toNumber(),
        profitMargin: profitMargin.toDecimalPlaces(2).toNumber(),
        totalDiscounts: new Decimal(row.total_discounts || 0).toDecimalPlaces(2).toNumber(),
        transactionCount: parseInt(row.transaction_count),
        averageTransactionValue: new Decimal(row.average_transaction_value || 0)
          .toDecimalPlaces(2)
          .toNumber(),
      };
    });
  },

  /**
   * SALES BY PAYMENT METHOD REPORT
   * Breakdown of sales by payment method
   */
  async getSalesByPaymentMethod(
    pool: Pool,
    options: {
      startDate: Date | string;
      endDate: Date | string;
    }
  ): Promise<SalesByPaymentMethodRow[]> {
    const startDateStr =
      options.startDate instanceof Date
        ? options.startDate.toLocaleDateString('en-CA')
        : options.startDate;
    const endDateStr =
      options.endDate instanceof Date
        ? options.endDate.toLocaleDateString('en-CA')
        : options.endDate;

    const params: unknown[] = [startDateStr, endDateStr];

    const query = `
      WITH payment_totals AS (
        SELECT 
          s.payment_method,
          COUNT(s.id) as transaction_count,
          SUM(s.total_amount) as total_revenue,
          AVG(s.total_amount) as average_transaction_value,
          COALESCE(SUM(s.discount_amount), 0) as total_discounts
        FROM sales s
        WHERE DATE(s.sale_date) BETWEEN $1::date AND $2::date
          AND s.status NOT IN ('VOID', 'REFUNDED')
        GROUP BY s.payment_method
      ),
      grand_total AS (
        SELECT SUM(total_revenue) as grand_total_revenue FROM payment_totals
      )
      SELECT 
        pt.payment_method,
        pt.transaction_count,
        pt.total_revenue,
        pt.average_transaction_value,
        pt.total_discounts,
        (pt.total_revenue / NULLIF(gt.grand_total_revenue, 0) * 100) as percentage_of_total
      FROM payment_totals pt
      CROSS JOIN grand_total gt
      ORDER BY pt.total_revenue DESC
    `;

    const result = await pool.query(query, params);

    return result.rows.map((row) => ({
      paymentMethod: row.payment_method || 'UNKNOWN',
      transactionCount: parseInt(row.transaction_count),
      totalRevenue: new Decimal(row.total_revenue || 0).toDecimalPlaces(2).toNumber(),
      totalDiscounts: new Decimal(row.total_discounts || 0).toDecimalPlaces(2).toNumber(),
      averageTransactionValue: new Decimal(row.average_transaction_value || 0)
        .toDecimalPlaces(2)
        .toNumber(),
      percentageOfTotal: new Decimal(row.percentage_of_total || 0).toDecimalPlaces(2).toNumber(),
    }));
  },

  /**
   * HOURLY SALES ANALYSIS REPORT
   * Analyze sales patterns by hour of day
   */
  async getHourlySalesAnalysis(
    pool: Pool,
    options: {
      startDate: Date | string;
      endDate: Date | string;
    }
  ): Promise<HourlySalesAnalysisRow[]> {
    const startDateStr =
      options.startDate instanceof Date
        ? options.startDate.toLocaleDateString('en-CA')
        : options.startDate;
    const endDateStr =
      options.endDate instanceof Date
        ? options.endDate.toLocaleDateString('en-CA')
        : options.endDate;

    const params: unknown[] = [startDateStr, endDateStr];

    const query = `
      SELECT 
        EXTRACT(HOUR FROM s.sale_date) as hour,
        COUNT(s.id) as transaction_count,
        SUM(s.total_amount) as total_revenue,
        AVG(s.total_amount) as average_transaction_value,
        MODE() WITHIN GROUP (ORDER BY to_char(s.sale_date, 'Day')) as peak_day
      FROM sales s
      WHERE DATE(s.sale_date) BETWEEN $1::date AND $2::date
        AND s.status NOT IN ('VOID', 'REFUNDED')
      GROUP BY EXTRACT(HOUR FROM s.sale_date)
      ORDER BY hour
    `;

    const result = await pool.query(query, params);

    return result.rows.map((row) => ({
      hour: parseInt(row.hour),
      transactionCount: parseInt(row.transaction_count),
      totalRevenue: new Decimal(row.total_revenue || 0).toDecimalPlaces(2).toNumber(),
      averageTransactionValue: new Decimal(row.average_transaction_value || 0)
        .toDecimalPlaces(2)
        .toNumber(),
      peakDay: row.peak_day?.trim(),
    }));
  },

  /**
   * SALES COMPARISON REPORT
   * Compare sales between two periods
   */
  async getSalesComparison(
    pool: Pool,
    options: {
      currentStartDate: Date | string;
      currentEndDate: Date | string;
      previousStartDate: Date | string;
      previousEndDate: Date | string;
      groupBy: 'day' | 'week' | 'month';
    }
  ): Promise<SalesComparisonRow[]> {
    const currentStartStr =
      options.currentStartDate instanceof Date
        ? options.currentStartDate.toLocaleDateString('en-CA')
        : options.currentStartDate;
    const currentEndStr =
      options.currentEndDate instanceof Date
        ? options.currentEndDate.toLocaleDateString('en-CA')
        : options.currentEndDate;
    const previousStartStr =
      options.previousStartDate instanceof Date
        ? options.previousStartDate.toLocaleDateString('en-CA')
        : options.previousStartDate;
    const previousEndStr =
      options.previousEndDate instanceof Date
        ? options.previousEndDate.toLocaleDateString('en-CA')
        : options.previousEndDate;

    const params: unknown[] = [currentStartStr, currentEndStr, previousStartStr, previousEndStr];

    let groupByClause = '';
    let selectClause = '';

    switch (options.groupBy) {
      case 'day':
        selectClause = "to_char(DATE(s.sale_date), 'YYYY-MM-DD')";
        groupByClause = 'DATE(s.sale_date)';
        break;
      case 'week':
        selectClause = "to_char(DATE_TRUNC('week', s.sale_date), 'YYYY-MM-DD')";
        groupByClause = "DATE_TRUNC('week', s.sale_date)";
        break;
      case 'month':
        selectClause = "to_char(DATE_TRUNC('month', s.sale_date), 'YYYY-MM-DD')";
        groupByClause = "DATE_TRUNC('month', s.sale_date)";
        break;
    }

    const query = `
      WITH current_period AS (
        SELECT 
          ${selectClause} as period,
          SUM(s.total_amount) as total_sales,
          COUNT(s.id) as transaction_count
        FROM sales s
        WHERE DATE(s.sale_date) BETWEEN $1::date AND $2::date
          AND s.status NOT IN ('VOID', 'REFUNDED')
        GROUP BY ${groupByClause}
      ),
      previous_period AS (
        SELECT 
          ${selectClause} as period,
          SUM(s.total_amount) as total_sales,
          COUNT(s.id) as transaction_count
        FROM sales s
        WHERE DATE(s.sale_date) BETWEEN $3::date AND $4::date
          AND s.status NOT IN ('VOID', 'REFUNDED')
        GROUP BY ${groupByClause}
      )
      SELECT 
        COALESCE(c.period, p.period) as period,
        COALESCE(c.total_sales, 0) as current_sales,
        COALESCE(p.total_sales, 0) as previous_sales,
        COALESCE(c.total_sales, 0) - COALESCE(p.total_sales, 0) as difference,
        CASE 
          WHEN COALESCE(p.total_sales, 0) = 0 THEN 100
          ELSE ((COALESCE(c.total_sales, 0) - COALESCE(p.total_sales, 0)) / NULLIF(p.total_sales, 0) * 100)
        END as percentage_change,
        COALESCE(c.transaction_count, 0) as current_transactions,
        COALESCE(p.transaction_count, 0) as previous_transactions
      FROM current_period c
      FULL OUTER JOIN previous_period p ON c.period = p.period
      ORDER BY period
    `;

    const result = await pool.query(query, params);

    return result.rows.map((row) => ({
      period: row.period,
      currentSales: new Decimal(row.current_sales || 0).toDecimalPlaces(2).toNumber(),
      previousSales: new Decimal(row.previous_sales || 0).toDecimalPlaces(2).toNumber(),
      difference: new Decimal(row.difference || 0).toDecimalPlaces(2).toNumber(),
      percentageChange: new Decimal(row.percentage_change || 0).toDecimalPlaces(2).toNumber(),
      currentTransactions: parseInt(row.current_transactions),
      previousTransactions: parseInt(row.previous_transactions),
    }));
  },

  /**
   * CUSTOMER PURCHASE HISTORY REPORT
   * Detailed purchase history for a specific customer
   */
  async getCustomerPurchaseHistory(
    pool: Pool,
    options: {
      customerId: string;
      startDate: Date | string;
      endDate: Date | string;
    }
  ): Promise<CustomerPurchaseHistoryRow[]> {
    const startDateStr =
      options.startDate instanceof Date
        ? options.startDate.toLocaleDateString('en-CA')
        : options.startDate;
    const endDateStr =
      options.endDate instanceof Date
        ? options.endDate.toLocaleDateString('en-CA')
        : options.endDate;

    // Determine if input is UUID or customer_number
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      options.customerId
    );

    // If not UUID, look up customer by customer_number first
    let customerUuid = options.customerId;
    if (!isUuid) {
      const customerLookup = await pool.query(
        'SELECT id FROM customers WHERE customer_number = $1',
        [options.customerId]
      );
      if (customerLookup.rows.length === 0) {
        // Return empty array if customer not found
        return [];
      }
      customerUuid = customerLookup.rows[0].id;
    }

    const params: unknown[] = [customerUuid, startDateStr, endDateStr];

    const query = `
      SELECT 
        s.id as sale_id,
        s.sale_number,
        to_char(s.sale_date, 'YYYY-MM-DD HH24:MI:SS') as sale_date,
        s.total_amount,
        COALESCE(i."AmountPaid", s.amount_paid) as amount_paid,
        COALESCE(i."OutstandingBalance", s.total_amount - s.amount_paid) as outstanding_balance,
        s.payment_method,
        COUNT(si.id) as item_count,
        COALESCE(i."Status", s.status::text) as status
      FROM sales s
      LEFT JOIN invoices i ON i."SaleId" = s.id
      LEFT JOIN sale_items si ON si.sale_id = s.id
      WHERE s.customer_id = $1
        AND DATE(s.sale_date) BETWEEN $2::date AND $3::date
      GROUP BY s.id, s.sale_number, s.sale_date, s.total_amount, s.amount_paid,
               s.payment_method, s.status, i."AmountPaid", i."OutstandingBalance", i."Status"
      ORDER BY s.sale_date DESC
    `;

    const result = await pool.query(query, params);

    return result.rows.map((row) => ({
      saleId: row.sale_id,
      saleNumber: row.sale_number,
      saleDate: row.sale_date,
      totalAmount: new Decimal(row.total_amount || 0).toDecimalPlaces(2).toNumber(),
      amountPaid: new Decimal(row.amount_paid || 0).toDecimalPlaces(2).toNumber(),
      outstandingBalance: new Decimal(row.outstanding_balance || 0).toDecimalPlaces(2).toNumber(),
      paymentMethod: row.payment_method,
      itemCount: parseInt(row.item_count),
      status: row.status,
    }));
  },

  /**
   * COMPREHENSIVE BUSINESS POSITION REPORT
   * Daily business health assessment with multiple metrics
   * Includes liquidity, profitability, customer metrics, and risk indicators
   */
  async getBusinessPositionReport(
    pool: Pool,
    options: {
      reportDate: Date | string;
      includeComparisons?: boolean;
      includeForecasts?: boolean;
    }
  ): Promise<BusinessPositionData> {
    const reportDateStr =
      options.reportDate instanceof Date
        ? options.reportDate.toLocaleDateString('en-CA')
        : options.reportDate;

    // Complex multi-CTE query for comprehensive business metrics
    const query = `
      WITH daily_sales_metrics AS (
        -- Today's sales performance
        SELECT 
          COUNT(s.id) as transactions_count,
          COUNT(DISTINCT s.customer_id) as unique_customers,
          SUM(s.total_amount) as total_revenue,
          SUM(s.subtotal - s.discount_amount) as net_revenue,
          SUM(s.total_cost) as total_cost,
          SUM(s.profit) as gross_profit,
          AVG(s.total_amount) as avg_transaction_value,
          SUM(CASE WHEN s.customer_id IS NULL THEN s.total_amount ELSE 0 END) as walk_in_revenue,
          SUM(CASE WHEN s.customer_id IS NOT NULL THEN s.total_amount ELSE 0 END) as customer_revenue,
          SUM(s.amount_paid) as cash_collected,
          SUM(s.total_amount - s.amount_paid) as credit_extended
        FROM sales s
        WHERE DATE(s.sale_date) = $1::date
          AND s.status NOT IN ('VOID', 'REFUNDED')
      ),
      daily_collections AS (
        -- Today's debt collections
        SELECT 
          COUNT(ip.id) as collection_transactions,
          SUM(ip.amount) as total_collections,
          AVG(ip.amount) as avg_collection_value,
          COUNT(DISTINCT i."CustomerId") as paying_customers
        FROM invoice_payments ip
        INNER JOIN invoices i ON ip.invoice_id = i."Id"
        WHERE DATE(ip.payment_date) = $1::date
      ),
      inventory_health AS (
        -- Current inventory position
        SELECT 
          COUNT(DISTINCT p.id) as total_products,
          SUM(CASE WHEN COALESCE(ib.remaining_quantity, 0) <= pi.reorder_level THEN 1 ELSE 0 END) as low_stock_items,
          SUM(CASE WHEN ib.expiry_date <= ($1::date + INTERVAL '30 days') THEN ib.remaining_quantity ELSE 0 END) as expiring_units,
          SUM(ib.remaining_quantity * ib.cost_price) as inventory_value
        FROM products p
        LEFT JOIN product_inventory pi ON pi.product_id = p.id
        LEFT JOIN inventory_batches ib ON p.id = ib.product_id AND ib.remaining_quantity > 0
      ),
      customer_metrics AS (
        -- Customer base health
        SELECT 
          COUNT(c.id) as total_customers,
          COUNT(CASE WHEN c.created_at >= ($1::date - INTERVAL '30 days') THEN 1 END) as new_customers_30d,
          SUM(CASE WHEN c.balance > 0 THEN c.balance ELSE 0 END) as total_receivables,
          COUNT(CASE WHEN c.balance > 0 THEN 1 END) as customers_with_balance,
          AVG(c.balance) as avg_customer_balance
        FROM customers c
      ),
      cash_position AS (
        -- Working capital indicators
        SELECT 
          -- Today's cash flow
          COALESCE(dsm.cash_collected, 0) + COALESCE(dc.total_collections, 0) as total_cash_in,
          COALESCE(dsm.credit_extended, 0) as new_credit_extended,
          -- Outstanding position
          COALESCE(cm.total_receivables, 0) as outstanding_receivables,
          -- Efficiency ratios
          CASE 
            WHEN COALESCE(dsm.net_revenue, 0) > 0 THEN 
              COALESCE(dsm.gross_profit, 0) / COALESCE(dsm.net_revenue, 0) * 100
            ELSE 0
          END as profit_margin_percent,
          CASE 
            WHEN COALESCE(dsm.total_revenue, 0) > 0 THEN
              COALESCE(dsm.cash_collected, 0) / COALESCE(dsm.total_revenue, 0) * 100
            ELSE 0
          END as cash_collection_rate
        FROM daily_sales_metrics dsm
        CROSS JOIN daily_collections dc
        CROSS JOIN customer_metrics cm
      )
      SELECT 
        -- Sales Performance
        dsm.transactions_count,
        dsm.unique_customers,
        dsm.total_revenue,
        dsm.total_cost,
        dsm.gross_profit,
        dsm.avg_transaction_value,
        dsm.walk_in_revenue,
        dsm.customer_revenue,
        dsm.cash_collected as sales_cash_collected,
        dsm.credit_extended,
        
        -- Collections Performance
        dc.collection_transactions,
        dc.total_collections,
        dc.avg_collection_value,
        dc.paying_customers,
        
        -- Inventory Health
        ih.total_products,
        ih.low_stock_items,
        ih.expiring_units,
        ih.inventory_value,
        
        -- Customer Base
        cm.total_customers,
        cm.new_customers_30d,
        cm.total_receivables,
        cm.customers_with_balance,
        cm.avg_customer_balance,
        
        -- Cash Position & Ratios
        cp.total_cash_in,
        cp.new_credit_extended,
        cp.outstanding_receivables,
        cp.profit_margin_percent,
        cp.cash_collection_rate,
        
        -- Risk Indicators
        CASE 
          WHEN cm.total_receivables > (dsm.total_revenue * 30) THEN 'HIGH'
          WHEN cm.total_receivables > (dsm.total_revenue * 15) THEN 'MEDIUM'
          ELSE 'LOW'
        END as receivables_risk,
        
        CASE 
          WHEN ih.low_stock_items > (ih.total_products * 0.2) THEN 'HIGH'
          WHEN ih.low_stock_items > (ih.total_products * 0.1) THEN 'MEDIUM'
          ELSE 'LOW'
        END as inventory_risk,
        
        -- Business Health Score (0-100)
        GREATEST(0, LEAST(100, (
          (CASE WHEN dsm.total_revenue > 0 THEN 25 ELSE 0 END) + -- Revenue generation
          (CASE WHEN cp.profit_margin_percent >= 20 THEN 25 WHEN cp.profit_margin_percent >= 10 THEN 15 ELSE 5 END) + -- Profitability
          (CASE WHEN cp.cash_collection_rate >= 80 THEN 25 WHEN cp.cash_collection_rate >= 60 THEN 15 ELSE 5 END) + -- Collections
          (CASE WHEN ih.low_stock_items <= (ih.total_products * 0.1) THEN 25 WHEN ih.low_stock_items <= (ih.total_products * 0.2) THEN 15 ELSE 5 END) -- Inventory
        ))) as business_health_score
        
      FROM daily_sales_metrics dsm
      CROSS JOIN daily_collections dc
      CROSS JOIN inventory_health ih
      CROSS JOIN customer_metrics cm
      CROSS JOIN cash_position cp
    `;

    const result = await pool.query(query, [reportDateStr]);
    const row = result.rows[0];

    if (!row) {
      return {
        reportDate: reportDateStr,
        businessHealthScore: 0,
        salesPerformance: {
          transactionsCount: 0,
          uniqueCustomers: 0,
          totalRevenue: 0,
          totalCost: 0,
          grossProfit: 0,
          avgTransactionValue: 0,
          walkInRevenue: 0,
          customerRevenue: 0,
          salesCashCollected: 0,
          creditExtended: 0,
        },
        collectionsPerformance: {
          collectionTransactions: 0,
          totalCollections: 0,
          avgCollectionValue: 0,
          payingCustomers: 0,
        },
        inventoryHealth: {
          totalProducts: 0,
          lowStockItems: 0,
          expiringUnits: 0,
          inventoryValue: 0,
        },
        customerMetrics: {
          totalCustomers: 0,
          newCustomers30d: 0,
          totalReceivables: 0,
          customersWithBalance: 0,
          avgCustomerBalance: 0,
        },
        cashPosition: {
          totalCashIn: 0,
          newCreditExtended: 0,
          outstandingReceivables: 0,
          profitMarginPercent: 0,
          cashCollectionRate: 0,
        },
        riskAssessment: {
          receivablesRisk: 'LOW' as const,
          inventoryRisk: 'LOW' as const,
          overallRiskLevel: 'LOW' as const,
        },
      };
    }

    // Return structured business position data with bank-grade precision
    return {
      reportDate: reportDateStr,
      businessHealthScore: parseInt(row.business_health_score || 0),

      salesPerformance: {
        transactionsCount: parseInt(row.transactions_count || 0),
        uniqueCustomers: parseInt(row.unique_customers || 0),
        totalRevenue: new Decimal(row.total_revenue || 0).toDecimalPlaces(2).toNumber(),
        totalCost: new Decimal(row.total_cost || 0).toDecimalPlaces(2).toNumber(),
        grossProfit: new Decimal(row.gross_profit || 0).toDecimalPlaces(2).toNumber(),
        avgTransactionValue: new Decimal(row.avg_transaction_value || 0)
          .toDecimalPlaces(2)
          .toNumber(),
        walkInRevenue: new Decimal(row.walk_in_revenue || 0).toDecimalPlaces(2).toNumber(),
        customerRevenue: new Decimal(row.customer_revenue || 0).toDecimalPlaces(2).toNumber(),
        salesCashCollected: new Decimal(row.sales_cash_collected || 0)
          .toDecimalPlaces(2)
          .toNumber(),
        creditExtended: new Decimal(row.credit_extended || 0).toDecimalPlaces(2).toNumber(),
      },

      collectionsPerformance: {
        collectionTransactions: parseInt(row.collection_transactions || 0),
        totalCollections: new Decimal(row.total_collections || 0).toDecimalPlaces(2).toNumber(),
        avgCollectionValue: new Decimal(row.avg_collection_value || 0)
          .toDecimalPlaces(2)
          .toNumber(),
        payingCustomers: parseInt(row.paying_customers || 0),
      },

      inventoryHealth: {
        totalProducts: parseInt(row.total_products || 0),
        lowStockItems: parseInt(row.low_stock_items || 0),
        expiringUnits: new Decimal(row.expiring_units || 0).toDecimalPlaces(0).toNumber(),
        inventoryValue: new Decimal(row.inventory_value || 0).toDecimalPlaces(2).toNumber(),
      },

      customerMetrics: {
        totalCustomers: parseInt(row.total_customers || 0),
        newCustomers30d: parseInt(row.new_customers_30d || 0),
        totalReceivables: new Decimal(row.total_receivables || 0).toDecimalPlaces(2).toNumber(),
        customersWithBalance: parseInt(row.customers_with_balance || 0),
        avgCustomerBalance: new Decimal(row.avg_customer_balance || 0)
          .toDecimalPlaces(2)
          .toNumber(),
      },

      cashPosition: {
        totalCashIn: new Decimal(row.total_cash_in || 0).toDecimalPlaces(2).toNumber(),
        newCreditExtended: new Decimal(row.new_credit_extended || 0).toDecimalPlaces(2).toNumber(),
        outstandingReceivables: new Decimal(row.outstanding_receivables || 0)
          .toDecimalPlaces(2)
          .toNumber(),
        profitMarginPercent: new Decimal(row.profit_margin_percent || 0)
          .toDecimalPlaces(2)
          .toNumber(),
        cashCollectionRate: new Decimal(row.cash_collection_rate || 0)
          .toDecimalPlaces(2)
          .toNumber(),
      },

      riskAssessment: {
        receivablesRisk: row.receivables_risk || 'LOW',
        inventoryRisk: row.inventory_risk || 'LOW',
        overallRiskLevel: (() => {
          const risks = [row.receivables_risk, row.inventory_risk];
          if (risks.includes('HIGH')) return 'HIGH';
          if (risks.includes('MEDIUM')) return 'MEDIUM';
          return 'LOW';
        })(),
      },
    };
  },

  // ==============================================================================
  // CASH REGISTER SESSION REPORTS
  // ==============================================================================

  /**
   * CASH REGISTER SESSION SUMMARY REPORT
   * Single session details with full movement breakdown (like X-Report/Z-Report)
   */
  async getCashRegisterSessionSummary(
    pool: Pool,
    sessionId: string
  ): Promise<CashRegisterSessionSummaryData | null> {
    try {
      // Determine if input is UUID or session_number
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        sessionId
      );
      const whereClause = isUuid ? 's.id = $1' : 's.session_number = $1';

      // Get session details
      const sessionResult = await pool.query(
        `
        SELECT 
          s.id,
          s.session_number as "sessionNumber",
          r.name as "registerName",
          u.full_name as "cashierName",
          s.status,
          s.opened_at as "openedAt",
          s.closed_at as "closedAt",
          s.opening_float as "openingFloat",
          s.expected_closing as "expectedClosing",
          s.actual_closing as "actualClosing",
          s.variance,
          s.variance_reason as "varianceReason",
          s.payment_summary as "paymentSummary"
        FROM cash_register_sessions s
        LEFT JOIN cash_registers r ON s.register_id = r.id
        LEFT JOIN users u ON s.user_id = u.id
        WHERE ${whereClause}
      `,
        [sessionId]
      );

      if (sessionResult.rows.length === 0) return null;
      const session = sessionResult.rows[0];
      const actualSessionId = session.id; // Use the actual UUID for subsequent queries

      // Get movement summary with breakdown
      const summaryResult = await pool.query(
        `
        SELECT 
          COALESCE(SUM(CASE WHEN movement_type IN ('CASH_IN', 'CASH_IN_FLOAT', 'CASH_IN_PAYMENT', 'CASH_IN_OTHER') THEN amount ELSE 0 END), 0) as total_cash_in,
          COALESCE(SUM(CASE WHEN movement_type IN ('CASH_OUT', 'CASH_OUT_BANK', 'CASH_OUT_EXPENSE', 'CASH_OUT_OTHER') THEN amount ELSE 0 END), 0) as total_cash_out,
          COALESCE(SUM(CASE WHEN movement_type = 'SALE' THEN amount ELSE 0 END), 0) as total_sales,
          COALESCE(SUM(CASE WHEN movement_type = 'REFUND' THEN amount ELSE 0 END), 0) as total_refunds,
          -- Detailed breakdown
          COALESCE(SUM(CASE WHEN movement_type = 'CASH_IN_FLOAT' THEN amount ELSE 0 END), 0) as cash_in_float,
          COALESCE(SUM(CASE WHEN movement_type = 'CASH_IN_PAYMENT' THEN amount ELSE 0 END), 0) as cash_in_payment,
          COALESCE(SUM(CASE WHEN movement_type = 'CASH_IN_OTHER' THEN amount ELSE 0 END), 0) as cash_in_other,
          COALESCE(SUM(CASE WHEN movement_type = 'CASH_OUT_BANK' THEN amount ELSE 0 END), 0) as cash_out_bank,
          COALESCE(SUM(CASE WHEN movement_type = 'CASH_OUT_EXPENSE' THEN amount ELSE 0 END), 0) as cash_out_expense,
          COALESCE(SUM(CASE WHEN movement_type = 'CASH_OUT_OTHER' THEN amount ELSE 0 END), 0) as cash_out_other,
          COUNT(*) as movement_count
        FROM cash_movements
        WHERE session_id = $1
      `,
        [actualSessionId]
      );

      const s = summaryResult.rows[0];
      const totalCashIn = new Decimal(s.total_cash_in || 0);
      const totalCashOut = new Decimal(s.total_cash_out || 0);
      const totalSales = new Decimal(s.total_sales || 0);
      const totalRefunds = new Decimal(s.total_refunds || 0);
      const openingFloat = new Decimal(session.openingFloat || 0);
      const expectedClosing = openingFloat
        .plus(totalCashIn)
        .plus(totalSales)
        .minus(totalCashOut)
        .minus(totalRefunds);
      const netCashFlow = expectedClosing.minus(openingFloat);

      // Get movements list
      const movementsResult = await pool.query(
        `
        SELECT 
          m.id,
          m.movement_type as "movementType",
          m.amount,
          m.reason,
          m.reference_number as "referenceNumber",
          m.created_at as "createdAt",
          u.full_name as "createdByName"
        FROM cash_movements m
        LEFT JOIN users u ON m.created_by = u.id
        WHERE m.session_id = $1
        ORDER BY m.created_at DESC
      `,
        [actualSessionId]
      );

      return {
        reportType: 'CASH_REGISTER_SESSION_SUMMARY',
        generatedAt: new Date().toISOString(),

        session: {
          id: session.id,
          sessionNumber: session.sessionNumber,
          registerName: session.registerName || 'Unknown',
          cashierName: session.cashierName || 'Unknown',
          status: session.status,
          openedAt: session.openedAt?.toISOString(),
          closedAt: session.closedAt?.toISOString() || null,
        },

        summary: {
          openingFloat: openingFloat.toDecimalPlaces(2).toNumber(),
          expectedClosing: expectedClosing.toDecimalPlaces(2).toNumber(),
          actualClosing: session.actualClosing ? parseFloat(session.actualClosing) : null,
          variance: session.variance ? parseFloat(session.variance) : null,
          varianceReason: session.varianceReason,

          totalCashIn: totalCashIn.toDecimalPlaces(2).toNumber(),
          totalCashOut: totalCashOut.toDecimalPlaces(2).toNumber(),
          totalSales: totalSales.toDecimalPlaces(2).toNumber(),
          totalRefunds: totalRefunds.toDecimalPlaces(2).toNumber(),
          netCashFlow: netCashFlow.toDecimalPlaces(2).toNumber(),
          movementCount: parseInt(s.movement_count || 0),

          breakdown: {
            cashInFloat: new Decimal(s.cash_in_float || 0).toDecimalPlaces(2).toNumber(),
            cashInPayment: new Decimal(s.cash_in_payment || 0).toDecimalPlaces(2).toNumber(),
            cashInOther: new Decimal(s.cash_in_other || 0).toDecimalPlaces(2).toNumber(),
            cashOutBank: new Decimal(s.cash_out_bank || 0).toDecimalPlaces(2).toNumber(),
            cashOutExpense: new Decimal(s.cash_out_expense || 0).toDecimalPlaces(2).toNumber(),
            cashOutOther: new Decimal(s.cash_out_other || 0).toDecimalPlaces(2).toNumber(),
          },
        },

        paymentSummary: session.paymentSummary || null,

        movements: movementsResult.rows.map((m) => ({
          id: m.id,
          movementType: m.movementType,
          amount: new Decimal(m.amount || 0).toDecimalPlaces(2).toNumber(),
          reason: m.reason,
          referenceNumber: m.referenceNumber,
          createdAt: m.createdAt?.toISOString(),
          createdByName: m.createdByName,
        })),
      };
    } catch (error) {
      console.error('Error in getCashRegisterSessionSummary:', error);
      return null;
    }
  },

  /**
   * CASH REGISTER MOVEMENT BREAKDOWN REPORT
   * Aggregate movement data across sessions for a date range
   */
  async getCashRegisterMovementBreakdown(
    pool: Pool,
    options: {
      startDate: string;
      endDate: string;
      registerId?: string;
      userId?: string;
    }
  ): Promise<CashRegisterMovementBreakdownData> {
    try {
      const params: unknown[] = [options.startDate, options.endDate];
      let paramIndex = 3;

      let whereClause = 'WHERE DATE(m.created_at) BETWEEN $1::date AND $2::date';
      if (options.registerId) {
        whereClause += ` AND s.register_id = $${paramIndex++}`;
        params.push(options.registerId);
      }
      if (options.userId) {
        whereClause += ` AND s.user_id = $${paramIndex++}`;
        params.push(options.userId);
      }

      // Get totals by movement type
      const typeResult = await pool.query(
        `
        SELECT 
          m.movement_type,
          COUNT(*) as count,
          COALESCE(SUM(m.amount), 0) as total
        FROM cash_movements m
        INNER JOIN cash_register_sessions s ON m.session_id = s.id
        ${whereClause}
        GROUP BY m.movement_type
        ORDER BY m.movement_type
      `,
        params
      );

      // Calculate totals
      let totalCashIn = new Decimal(0);
      let totalCashOut = new Decimal(0);
      let totalSales = new Decimal(0);
      let totalRefunds = new Decimal(0);
      let movementCount = 0;

      const byMovementType: Record<string, { count: number; total: number; percentage: number }> =
        {};
      let grandTotal = new Decimal(0);

      for (const row of typeResult.rows) {
        const amount = new Decimal(row.total || 0);
        grandTotal = grandTotal.plus(amount.abs());
        movementCount += parseInt(row.count);

        if (
          ['CASH_IN', 'CASH_IN_FLOAT', 'CASH_IN_PAYMENT', 'CASH_IN_OTHER'].includes(
            row.movement_type
          )
        ) {
          totalCashIn = totalCashIn.plus(amount);
        } else if (
          ['CASH_OUT', 'CASH_OUT_BANK', 'CASH_OUT_EXPENSE', 'CASH_OUT_OTHER'].includes(
            row.movement_type
          )
        ) {
          totalCashOut = totalCashOut.plus(amount);
        } else if (row.movement_type === 'SALE') {
          totalSales = totalSales.plus(amount);
        } else if (row.movement_type === 'REFUND') {
          totalRefunds = totalRefunds.plus(amount);
        }

        byMovementType[row.movement_type] = {
          count: parseInt(row.count),
          total: amount.toDecimalPlaces(2).toNumber(),
          percentage: 0, // Calculate after we have grand total
        };
      }

      // Calculate percentages
      for (const type of Object.keys(byMovementType)) {
        byMovementType[type].percentage = grandTotal.gt(0)
          ? new Decimal(byMovementType[type].total)
            .div(grandTotal)
            .times(100)
            .toDecimalPlaces(2)
            .toNumber()
          : 0;
      }

      // Get session count
      const sessionResult = await pool.query(
        `
        SELECT COUNT(DISTINCT s.id) as session_count
        FROM cash_register_sessions s
        INNER JOIN cash_movements m ON m.session_id = s.id
        ${whereClause}
      `,
        params
      );

      // Get daily breakdown
      const dailyResult = await pool.query(
        `
        SELECT 
          DATE(m.created_at) as date,
          COALESCE(SUM(CASE WHEN m.movement_type = 'CASH_IN_FLOAT' THEN m.amount ELSE 0 END), 0) as cash_in_float,
          COALESCE(SUM(CASE WHEN m.movement_type = 'CASH_IN_PAYMENT' THEN m.amount ELSE 0 END), 0) as cash_in_payment,
          COALESCE(SUM(CASE WHEN m.movement_type = 'CASH_IN_OTHER' THEN m.amount ELSE 0 END), 0) as cash_in_other,
          COALESCE(SUM(CASE WHEN m.movement_type = 'CASH_OUT_BANK' THEN m.amount ELSE 0 END), 0) as cash_out_bank,
          COALESCE(SUM(CASE WHEN m.movement_type = 'CASH_OUT_EXPENSE' THEN m.amount ELSE 0 END), 0) as cash_out_expense,
          COALESCE(SUM(CASE WHEN m.movement_type = 'CASH_OUT_OTHER' THEN m.amount ELSE 0 END), 0) as cash_out_other,
          COALESCE(SUM(CASE WHEN m.movement_type = 'SALE' THEN m.amount ELSE 0 END), 0) as sales,
          COALESCE(SUM(CASE WHEN m.movement_type = 'REFUND' THEN m.amount ELSE 0 END), 0) as refunds
        FROM cash_movements m
        INNER JOIN cash_register_sessions s ON m.session_id = s.id
        ${whereClause}
        GROUP BY DATE(m.created_at)
        ORDER BY DATE(m.created_at) DESC
      `,
        params
      );

      const netCashFlow = totalCashIn.plus(totalSales).minus(totalCashOut).minus(totalRefunds);

      return {
        reportType: 'CASH_REGISTER_MOVEMENT_BREAKDOWN',
        generatedAt: new Date().toISOString(),
        period: {
          startDate: options.startDate,
          endDate: options.endDate,
        },

        totals: {
          totalCashIn: totalCashIn.toDecimalPlaces(2).toNumber(),
          totalCashOut: totalCashOut.toDecimalPlaces(2).toNumber(),
          totalSales: totalSales.toDecimalPlaces(2).toNumber(),
          totalRefunds: totalRefunds.toDecimalPlaces(2).toNumber(),
          netCashFlow: netCashFlow.toDecimalPlaces(2).toNumber(),
          sessionCount: parseInt(sessionResult.rows[0]?.session_count || 0),
          movementCount,
        },

        byMovementType,

        dailyBreakdown: dailyResult.rows.map((row) => {
          const cashIn = new Decimal(row.cash_in_float || 0)
            .plus(row.cash_in_payment || 0)
            .plus(row.cash_in_other || 0);
          const cashOut = new Decimal(row.cash_out_bank || 0)
            .plus(row.cash_out_expense || 0)
            .plus(row.cash_out_other || 0);
          const netFlow = cashIn
            .plus(row.sales || 0)
            .minus(cashOut)
            .minus(row.refunds || 0);

          return {
            date: row.date?.toLocaleDateString('en-CA'),
            cashInFloat: new Decimal(row.cash_in_float || 0).toDecimalPlaces(2).toNumber(),
            cashInPayment: new Decimal(row.cash_in_payment || 0).toDecimalPlaces(2).toNumber(),
            cashInOther: new Decimal(row.cash_in_other || 0).toDecimalPlaces(2).toNumber(),
            cashOutBank: new Decimal(row.cash_out_bank || 0).toDecimalPlaces(2).toNumber(),
            cashOutExpense: new Decimal(row.cash_out_expense || 0).toDecimalPlaces(2).toNumber(),
            cashOutOther: new Decimal(row.cash_out_other || 0).toDecimalPlaces(2).toNumber(),
            sales: new Decimal(row.sales || 0).toDecimalPlaces(2).toNumber(),
            refunds: new Decimal(row.refunds || 0).toDecimalPlaces(2).toNumber(),
            netFlow: netFlow.toDecimalPlaces(2).toNumber(),
          };
        }),
      };
    } catch (error) {
      console.error('Error in getCashRegisterMovementBreakdown:', error);
      return {
        reportType: 'CASH_REGISTER_MOVEMENT_BREAKDOWN',
        generatedAt: new Date().toISOString(),
        period: { startDate: options.startDate, endDate: options.endDate },
        totals: {
          totalCashIn: 0,
          totalCashOut: 0,
          totalSales: 0,
          totalRefunds: 0,
          netCashFlow: 0,
          sessionCount: 0,
          movementCount: 0,
        },
        byMovementType: {},
        dailyBreakdown: [],
      };
    }
  },

  /**
   * CASH REGISTER SESSION HISTORY REPORT
   * List of sessions with summary stats for a date range
   */
  async getCashRegisterSessionHistory(
    pool: Pool,
    options: {
      startDate: string;
      endDate: string;
      registerId?: string;
      userId?: string;
      status?: 'OPEN' | 'CLOSED' | 'ALL';
    }
  ): Promise<CashRegisterSessionHistoryData> {
    try {
      const params: unknown[] = [options.startDate, options.endDate];
      let paramIndex = 3;

      let whereClause = 'WHERE DATE(s.opened_at) BETWEEN $1::date AND $2::date';
      if (options.registerId) {
        whereClause += ` AND s.register_id = $${paramIndex++}`;
        params.push(options.registerId);
      }
      if (options.userId) {
        whereClause += ` AND s.user_id = $${paramIndex++}`;
        params.push(options.userId);
      }
      if (options.status && options.status !== 'ALL') {
        whereClause += ` AND s.status = $${paramIndex++}`;
        params.push(options.status);
      }

      // Get sessions with movement counts
      const sessionsResult = await pool.query(
        `
        SELECT 
          s.id,
          s.session_number as "sessionNumber",
          r.name as "registerName",
          u.full_name as "cashierName",
          s.status,
          s.opened_at as "openedAt",
          s.closed_at as "closedAt",
          s.opening_float as "openingFloat",
          s.expected_closing as "expectedClosing",
          s.actual_closing as "actualClosing",
          s.variance,
          s.variance_reason as "varianceReason",
          COALESCE((SELECT COUNT(*) FROM cash_movements m WHERE m.session_id = s.id), 0) as movement_count,
          COALESCE((SELECT SUM(m.amount) FROM cash_movements m WHERE m.session_id = s.id AND m.movement_type = 'SALE'), 0) as total_sales
        FROM cash_register_sessions s
        LEFT JOIN cash_registers r ON s.register_id = r.id
        LEFT JOIN users u ON s.user_id = u.id
        ${whereClause}
        ORDER BY s.opened_at DESC
      `,
        params
      );

      // Calculate summary stats
      let totalVariance = new Decimal(0);
      let varianceCount = 0;
      let openCount = 0;
      let closedCount = 0;

      for (const row of sessionsResult.rows) {
        if (row.status === 'OPEN') openCount++;
        if (row.status === 'CLOSED') closedCount++;
        if (row.variance !== null && row.variance !== undefined) {
          totalVariance = totalVariance.plus(row.variance);
          varianceCount++;
        }
      }

      return {
        reportType: 'CASH_REGISTER_SESSION_HISTORY',
        generatedAt: new Date().toISOString(),
        period: {
          startDate: options.startDate,
          endDate: options.endDate,
        },

        summary: {
          totalSessions: sessionsResult.rows.length,
          openSessions: openCount,
          closedSessions: closedCount,
          totalVariance: totalVariance.toDecimalPlaces(2).toNumber(),
          averageVariance:
            varianceCount > 0 ? totalVariance.div(varianceCount).toDecimalPlaces(2).toNumber() : 0,
          sessionsWithVariance: varianceCount,
        },

        sessions: sessionsResult.rows.map((row) => ({
          id: row.id,
          sessionNumber: row.sessionNumber,
          registerName: row.registerName || 'Unknown',
          cashierName: row.cashierName || 'Unknown',
          status: row.status,
          openedAt: row.openedAt?.toISOString(),
          closedAt: row.closedAt?.toISOString() || null,
          openingFloat: new Decimal(row.openingFloat || 0).toDecimalPlaces(2).toNumber(),
          expectedClosing: row.expectedClosing
            ? new Decimal(row.expectedClosing).toDecimalPlaces(2).toNumber()
            : null,
          actualClosing: row.actualClosing
            ? new Decimal(row.actualClosing).toDecimalPlaces(2).toNumber()
            : null,
          variance: row.variance ? new Decimal(row.variance).toDecimalPlaces(2).toNumber() : null,
          varianceReason: row.varianceReason,
          movementCount: parseInt(row.movement_count || 0),
          totalSales: new Decimal(row.total_sales || 0).toDecimalPlaces(2).toNumber(),
        })),
      };
    } catch (error) {
      console.error('Error in getCashRegisterSessionHistory:', error);
      return {
        reportType: 'CASH_REGISTER_SESSION_HISTORY',
        generatedAt: new Date().toISOString(),
        period: { startDate: options.startDate, endDate: options.endDate },
        summary: {
          totalSessions: 0,
          openSessions: 0,
          closedSessions: 0,
          totalVariance: 0,
          averageVariance: 0,
          sessionsWithVariance: 0,
        },
        sessions: [],
      };
    }
  },

  // ── Delivery Notes Report ──
  async getDeliveryNoteReport(
    pool: Pool,
    options: {
      startDate: Date;
      endDate: Date;
      customerId?: string;
      status?: string;
    }
  ): Promise<DeliveryNoteReportRow[]> {
    const params: unknown[] = [options.startDate, options.endDate];
    let filters = '';

    if (options.customerId) {
      params.push(options.customerId);
      filters += ` AND dn.customer_id = $${params.length}`;
    }
    if (options.status) {
      params.push(options.status);
      filters += ` AND dn.status = $${params.length}`;
    }

    const query = `
      SELECT
        dn.id as delivery_note_id,
        dn.delivery_note_number,
        q.quote_number as quotation_number,
        dn.customer_name,
        dn.delivery_date,
        dn.status,
        dn.total_amount,
        COUNT(dnl.id) as line_count,
        dn.driver_name,
        dn.vehicle_number,
        dn.created_at,
        dn.posted_at
      FROM delivery_notes dn
      LEFT JOIN quotations q ON q.id = dn.quotation_id
      LEFT JOIN delivery_note_lines dnl ON dnl.delivery_note_id = dn.id
      WHERE dn.delivery_date BETWEEN DATE($1) AND DATE($2)
        ${filters}
      GROUP BY dn.id, dn.delivery_note_number, q.quote_number, dn.customer_name,
               dn.delivery_date, dn.status, dn.total_amount, dn.driver_name,
               dn.vehicle_number, dn.created_at, dn.posted_at
      ORDER BY dn.delivery_date DESC, dn.created_at DESC
    `;

    const result = await pool.query(query, params);

    return result.rows.map((row) => ({
      deliveryNoteId: row.delivery_note_id,
      deliveryNoteNumber: row.delivery_note_number,
      quotationNumber: row.quotation_number || 'N/A',
      customerName: row.customer_name,
      deliveryDate: formatDateOnly(row.delivery_date),
      status: row.status,
      totalAmount: new Decimal(row.total_amount || 0).toDecimalPlaces(2).toNumber(),
      lineCount: parseInt(row.line_count, 10),
      driverName: row.driver_name,
      vehicleNumber: row.vehicle_number,
      createdAt: formatDate(row.created_at),
      postedAt: formatDate(row.posted_at),
    }));
  },

  // ── Quotation Report ──
  async getQuotationReport(
    pool: Pool,
    options: {
      startDate: Date;
      endDate: Date;
      customerId?: string;
      status?: string;
      quoteType?: string;
    }
  ): Promise<QuotationReportRow[]> {
    const params: unknown[] = [options.startDate, options.endDate];
    let filters = '';

    if (options.customerId) {
      params.push(options.customerId);
      filters += ` AND q.customer_id = $${params.length}`;
    }
    if (options.status) {
      params.push(options.status);
      filters += ` AND q.status::text = $${params.length}`;
    }
    if (options.quoteType) {
      params.push(options.quoteType);
      filters += ` AND q.quote_type::text = $${params.length}`;
    }

    const query = `
      SELECT
        q.id as quotation_id,
        q.quote_number,
        q.customer_name,
        q.quote_type::text as quote_type,
        q.status::text as status,
        q.subtotal,
        q.discount_amount,
        q.tax_amount,
        q.total_amount,
        q.valid_from,
        q.valid_until,
        COUNT(qi.id) as line_count,
        s.sale_number as converted_to_sale,
        i.\"InvoiceNumber\" as converted_to_invoice,
        q.created_at
      FROM quotations q
      LEFT JOIN quotation_items qi ON qi.quotation_id = q.id
      LEFT JOIN sales s ON s.id = q.converted_to_sale_id
      LEFT JOIN invoices i ON i.\"Id\" = q.converted_to_invoice_id
      WHERE q.created_at::date BETWEEN DATE($1) AND DATE($2)
        ${filters}
      GROUP BY q.id, q.quote_number, q.customer_name, q.quote_type, q.status,
               q.subtotal, q.discount_amount, q.tax_amount, q.total_amount,
               q.valid_from, q.valid_until, s.sale_number, i.\"InvoiceNumber\",
               q.created_at
      ORDER BY q.created_at DESC
    `;

    const result = await pool.query(query, params);

    return result.rows.map((row) => ({
      quotationId: row.quotation_id,
      quoteNumber: row.quote_number,
      customerName: row.customer_name,
      quoteType: row.quote_type,
      status: row.status,
      subtotal: new Decimal(row.subtotal || 0).toDecimalPlaces(2).toNumber(),
      discountAmount: new Decimal(row.discount_amount || 0).toDecimalPlaces(2).toNumber(),
      taxAmount: new Decimal(row.tax_amount || 0).toDecimalPlaces(2).toNumber(),
      totalAmount: new Decimal(row.total_amount || 0).toDecimalPlaces(2).toNumber(),
      validFrom: formatDateOnly(row.valid_from),
      validUntil: formatDateOnly(row.valid_until),
      lineCount: parseInt(row.line_count, 10),
      convertedToSale: row.converted_to_sale,
      convertedToInvoice: row.converted_to_invoice,
      createdAt: formatDate(row.created_at),
    }));
  },

  // ── Manual Journal Entry Report ──
  async getManualJournalEntryReport(
    pool: Pool,
    options: {
      startDate: Date;
      endDate: Date;
      status?: string;
    }
  ): Promise<ManualJournalEntryReportRow[]> {
    const params: unknown[] = [options.startDate, options.endDate];
    let filters = '';

    if (options.status) {
      params.push(options.status);
      filters += ` AND mje.status = $${params.length}`;
    }

    const query = `
      SELECT
        mje.id as entry_id,
        mje.entry_number,
        mje.entry_date,
        mje.narration,
        mje.reference,
        mje.total_debit,
        mje.total_credit,
        mje.status,
        COUNT(mjel.id) as line_count,
        mje.created_by,
        mje.created_at
      FROM manual_journal_entries mje
      LEFT JOIN manual_journal_entry_lines mjel ON mjel.journal_entry_id = mje.id
      WHERE mje.entry_date BETWEEN DATE($1) AND DATE($2)
        ${filters}
      GROUP BY mje.id, mje.entry_number, mje.entry_date, mje.narration,
               mje.reference, mje.total_debit, mje.total_credit, mje.status,
               mje.created_by, mje.created_at
      ORDER BY mje.entry_date DESC, mje.created_at DESC
    `;

    const result = await pool.query(query, params);

    return result.rows.map((row) => ({
      entryId: row.entry_id,
      entryNumber: row.entry_number,
      entryDate: formatDateOnly(row.entry_date),
      narration: row.narration,
      reference: row.reference,
      totalDebit: new Decimal(row.total_debit || 0).toDecimalPlaces(2).toNumber(),
      totalCredit: new Decimal(row.total_credit || 0).toDecimalPlaces(2).toNumber(),
      status: row.status,
      lineCount: parseInt(row.line_count, 10),
      createdBy: row.created_by,
      createdAt: formatDate(row.created_at),
    }));
  },

  // ── Bank Transaction Report ──
  async getBankTransactionReport(
    pool: Pool,
    options: {
      startDate: Date;
      endDate: Date;
      bankAccountId?: string;
      type?: string;
      isReconciled?: boolean;
    }
  ): Promise<BankTransactionReportRow[]> {
    const params: unknown[] = [options.startDate, options.endDate];
    let filters = '';

    if (options.bankAccountId) {
      params.push(options.bankAccountId);
      filters += ` AND bt.bank_account_id = $${params.length}`;
    }
    if (options.type) {
      params.push(options.type);
      filters += ` AND bt.type = $${params.length}`;
    }
    if (options.isReconciled !== undefined) {
      params.push(options.isReconciled);
      filters += ` AND bt.is_reconciled = $${params.length}`;
    }

    const query = `
      SELECT
        bt.id as transaction_id,
        bt.transaction_number,
        ba.name as bank_account_name,
        bt.transaction_date,
        bt.type,
        bt.description,
        bt.reference,
        bt.amount,
        bt.running_balance,
        bt.source_type,
        bt.is_reconciled,
        bt.created_at
      FROM bank_transactions bt
      INNER JOIN bank_accounts ba ON ba.id = bt.bank_account_id
      WHERE bt.transaction_date BETWEEN DATE($1) AND DATE($2)
        AND bt.is_reversed = FALSE
        ${filters}
    `;

    const result = await pool.query(query, params);

    return result.rows.map((row) => ({
      transactionId: row.transaction_id,
      transactionNumber: row.transaction_number,
      bankAccountName: row.bank_account_name,
      transactionDate: formatDateOnly(row.transaction_date),
      type: row.type,
      description: row.description,
      reference: row.reference,
      amount: new Decimal(row.amount || 0).toDecimalPlaces(2).toNumber(),
      runningBalance: row.running_balance
        ? new Decimal(row.running_balance).toDecimalPlaces(2).toNumber()
        : null,
      sourceType: row.source_type,
      isReconciled: row.is_reconciled,
      createdAt: formatDate(row.created_at),
    }));
  },
};
