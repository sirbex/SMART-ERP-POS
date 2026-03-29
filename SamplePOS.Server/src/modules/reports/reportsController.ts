// Reports Controller - HTTP endpoints for report generation
// Handles parameter validation, authentication, and response formatting

/// <reference path="../../types/express.d.ts" />
import { Request, Response } from 'express';
import { Pool } from 'pg';
import Decimal from 'decimal.js';
import { reportsService } from './reportsService.js';
import { ValidationError, NotFoundError } from '../../middleware/errorHandler.js';
import { reportsRepository } from './reportsRepository.js';
import { InventoryValuationRow, GoodsReceivedRow } from './reportTypes.js';
import logger from '../../utils/logger.js';
import {
  ReportPDFGenerator,
  PDFTableColumn,
  formatCurrencyPDF,
  formatQuantityPDF,
  formatDatePDF,
  PDFColors,
} from '../../utils/pdfGenerator.js';

// Helper to get company name from system settings for PDF generation
async function getCompanyName(pool: Pool): Promise<string> {
  try {
    const settings = await reportsService.getSystemSettings(pool);
    return settings.businessName || 'SMART ERP';
  } catch {
    return 'SMART ERP';
  }
}

// Utility function to ensure end date includes the full day
function adjustEndDate(dateString: string): Date {
  const date = new Date(dateString);
  // Set time to 23:59:59.999 to include the entire end date
  date.setHours(23, 59, 59, 999);
  return date;
}

// Utility function to format dates in a simplified, human-readable format
function formatDateTime(date: Date = new Date()): string {
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

// Utility function to format date only (no time)
function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

import {
  InventoryValuationParamsSchema,
  SalesReportParamsSchema,
  ExpiringItemsParamsSchema,
  LowStockParamsSchema,
  BestSellingProductsParamsSchema,
  SupplierCostAnalysisParamsSchema,
  GoodsReceivedParamsSchema,
  PaymentReportParamsSchema,
  CustomerPaymentsParamsSchema,
  ProfitLossParamsSchema,
  DeletedItemsParamsSchema,
  InventoryAdjustmentsParamsSchema,
  PurchaseOrderSummaryParamsSchema,
  StockMovementAnalysisParamsSchema,
  CustomerAccountStatementParamsSchema,
  ProfitMarginByProductParamsSchema,
  DailyCashFlowParamsSchema,
  SupplierPaymentStatusParamsSchema,
  TopCustomersParamsSchema,
  StockAgingParamsSchema,
  WasteDamageParamsSchema,
  ReorderRecommendationsParamsSchema,
  SalesByCategoryParamsSchema,
  SalesByPaymentMethodParamsSchema,
  HourlySalesAnalysisParamsSchema,
  SalesComparisonParamsSchema,
  CustomerPurchaseHistoryParamsSchema,
  BusinessPositionParamsSchema,
  DeliveryNoteReportParamsSchema,
  QuotationReportParamsSchema,
  ManualJournalEntryReportParamsSchema,
  BankTransactionReportParamsSchema,
} from '../../../../shared/zod/reports.js';
import { z } from 'zod';

// Zod schemas for unvalidated report handlers
const SalesSummaryByDateQuerySchema = z.object({
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  group_by: z.enum(['day', 'week', 'month']).optional().default('day'),
  format: z.string().optional(),
});
const SalesDetailsQuerySchema = z.object({
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  product_id: z.string().optional(),
  format: z.string().optional(),
});
const SalesByCashierQuerySchema = z.object({
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  user_id: z.string().optional(),
  format: z.string().optional(),
});
const CashRegisterDateRangeSchema = z.object({
  startDate: z.string().min(1, 'startDate is required'),
  endDate: z.string().min(1, 'endDate is required'),
  registerId: z.string().optional(),
  userId: z.string().optional(),
});
const CashRegisterSessionHistorySchema = CashRegisterDateRangeSchema.extend({
  status: z.enum(['OPEN', 'CLOSED', 'ALL']).optional().default('ALL'),
});

// Helper to convert ISO datetime string to Date object
function parseDate(dateString: string | undefined): Date | undefined {
  return dateString ? new Date(dateString) : undefined;
}

export const reportsController = {
  /**
   * Get current system settings for report formatting
   * GET /api/reports/system-settings
   * Returns currency, date format, business name, and tax configuration
   */
  async getSystemSettings(req: Request, res: Response, pool: Pool) {
    const settings = await reportsService.getSystemSettings(pool);

    res.json({
      success: true,
      data: settings,
    });
  },

  /**
   * Generate Inventory Valuation Report
   * GET /api/reports/inventory-valuation
   */
  async getInventoryValuation(req: Request, res: Response, pool: Pool) {
    const params = InventoryValuationParamsSchema.parse(req.query);
    const userId = req.user?.id;

    const report = await reportsService.generateInventoryValuation(pool, {
      asOfDate: parseDate(params.as_of_date),
      categoryId: params.category_id,
      valuationMethod: params.valuation_method,
      format: params.format,
      userId,
    });

    // PDF export
    if (params.format === 'pdf') {
      const companyName = await getCompanyName(pool);
      const pdfGen = new ReportPDFGenerator(companyName);
      const doc = pdfGen.getDocument();

      const date = new Date().toLocaleDateString('en-CA');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="inventory-valuation-${date}.pdf"`
      );
      doc.pipe(res);

      const asOfDate = params.as_of_date ? formatDatePDF(new Date(params.as_of_date)) : 'Current';
      const method = params.valuation_method || 'FIFO';

      pdfGen.addHeader({
        companyName,
        title: 'Inventory Valuation Report',
        subtitle: `As of ${asOfDate} - Valuation Method: ${method}`,
        generatedAt: formatDateTime(),
      });

      pdfGen.addSummaryCards([
        {
          label: 'Total Value',
          value: formatCurrencyPDF(report.summary.totalValue),
          color: PDFColors.success,
        },
        {
          label: 'Total Items',
          value: String(report.summary.totalItems),
          color: PDFColors.primary,
        },
        {
          label: 'Total Quantity',
          value: formatQuantityPDF(report.summary.totalQuantity),
          color: PDFColors.info,
        },
        { label: 'Valuation Method', value: method, color: PDFColors.secondary },
      ]);

      const columns: PDFTableColumn[] = [
        { header: 'Product', key: 'productName', width: 0.3 },
        { header: 'SKU', key: 'sku', width: 0.18 },
        { header: 'Category', key: 'category', width: 0.15 },
        { header: 'Qty on Hand', key: 'quantityOnHand', width: 0.12, align: 'right' },
        { header: 'Unit Cost', key: 'unitCost', width: 0.12, align: 'right' },
        { header: 'Total Value', key: 'totalValue', width: 0.13, align: 'right' },
      ];

      // Format the data for the PDF
      const formattedData = (report.data as InventoryValuationRow[]).map((item) => ({
        ...item,
        unitCost: formatCurrencyPDF(item.unitCost),
        totalValue: formatCurrencyPDF(item.totalValue),
      }));

      pdfGen.addTable(columns, formattedData);
      pdfGen.end();
      return;
    }

    logger.info('Inventory valuation report generated', {
      userId,
      recordCount: report.recordCount,
      executionTime: report.executionTimeMs,
    });

    res.json({ success: true, data: report });
  },

  /**
   * Generate Sales Report
   * GET /api/reports/sales
   */
  async getSalesReport(req: Request, res: Response, pool: Pool) {
    const params = SalesReportParamsSchema.parse(req.query);
    const userId = req.user?.id;

    const report = await reportsService.generateSalesReport(pool, {
      startDate: new Date(params.start_date),
      endDate: adjustEndDate(params.end_date),
      groupBy: params.group_by,
      customerId: params.customer_id,
      format: params.format,
      userId,
    });

    // PDF export
    if (params.format === 'pdf') {
      const companyName = await getCompanyName(pool);
      const pdfGen = new ReportPDFGenerator(companyName);
      const doc = pdfGen.getDocument();

      const date = new Date().toLocaleDateString('en-CA');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="sales-report-${date}.pdf"`);
      doc.pipe(res);

      const startDate = formatDatePDF(new Date(params.start_date));
      const endDate = formatDatePDF(new Date(params.end_date));

      pdfGen.addHeader({
        companyName,
        title: 'Sales Report',
        subtitle: `${startDate} - ${endDate}`,
        generatedAt: formatDateTime(),
      });

      pdfGen.addSummaryCards([
        {
          label: 'Total Sales',
          value: formatCurrencyPDF(report.summary.totalSales),
          color: PDFColors.success,
        },
        {
          label: 'Net Revenue',
          value: formatCurrencyPDF(report.summary.netRevenue),
          color: PDFColors.primary,
        },
        {
          label: 'Gross Profit',
          value: formatCurrencyPDF(report.summary.grossProfit),
          color: PDFColors.info,
        },
        {
          label: 'Transactions',
          value: String(report.summary.totalTransactions),
          color: PDFColors.secondary,
        },
      ]);

      const columns: PDFTableColumn[] = [
        { header: 'Period', key: 'period', width: 0.2 },
        {
          header: 'Total Sales',
          key: 'totalSales',
          width: 0.16,
          align: 'right',
          format: (v) => formatCurrencyPDF(v),
        },
        {
          header: 'Discounts',
          key: 'totalDiscounts',
          width: 0.14,
          align: 'right',
          format: (v) => formatCurrencyPDF(v),
        },
        {
          header: 'Net Revenue',
          key: 'netRevenue',
          width: 0.16,
          align: 'right',
          format: (v) => formatCurrencyPDF(v),
        },
        {
          header: 'Gross Profit',
          key: 'grossProfit',
          width: 0.16,
          align: 'right',
          format: (v) => formatCurrencyPDF(v),
        },
        {
          header: 'Margin %',
          key: 'profitMargin',
          width: 0.1,
          align: 'right',
          format: (v) => `${Number(v).toFixed(1)}%`,
        },
        { header: 'Count', key: 'transactionCount', width: 0.08, align: 'right' },
      ];

      pdfGen.addTable(columns, report.data);
      pdfGen.end();
      return;
    }

    logger.info('Sales report generated', {
      userId,
      startDate: params.start_date,
      endDate: params.end_date,
      recordCount: report.recordCount,
    });

    res.json({ success: true, data: report });
  },

  /**
   * Generate Expiring Items Report
   * GET /api/reports/expiring-items
   */
  async getExpiringItems(req: Request, res: Response, pool: Pool) {
    const params = ExpiringItemsParamsSchema.parse(req.query);
    const userId = req.user?.id;

    const report = await reportsService.generateExpiringItems(pool, {
      daysAhead: params.days_threshold,
      categoryId: params.category_id,
      format: params.format,
      userId,
    });

    // PDF export
    if (params.format === 'pdf') {
      const companyName = await getCompanyName(pool);
      const pdfGen = new ReportPDFGenerator(companyName);
      const doc = pdfGen.getDocument();

      const date = new Date().toLocaleDateString('en-CA');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="expiring-items-${date}.pdf"`);
      doc.pipe(res);

      const days = params.days_threshold || 30;

      pdfGen.addHeader({
        companyName,
        title: 'Expiring Items Report',
        subtitle: `Items Expiring Within ${days} Days`,
        generatedAt: formatDateTime(),
      });

      pdfGen.addSummaryCards([
        {
          label: 'Total Expiring Items',
          value: String(report.summary.totalItems),
          color: PDFColors.warning,
        },
        {
          label: 'Total Qty at Risk',
          value: formatQuantityPDF(report.summary.totalQuantityAtRisk || 0),
          color: PDFColors.danger,
        },
        {
          label: 'Potential Loss',
          value: formatCurrencyPDF(report.summary.totalPotentialLoss || 0),
          color: PDFColors.danger,
        },
        { label: 'Days Threshold', value: String(days), color: PDFColors.info },
      ]);

      const columns: PDFTableColumn[] = [
        { header: 'Product', key: 'productName', width: 0.22 },
        { header: 'SKU', key: 'sku', width: 0.12 },
        { header: 'Batch', key: 'batchNumber', width: 0.12 },
        { header: 'Expiry Date', key: 'expiryDate', width: 0.12 },
        { header: 'Days Left', key: 'daysUntilExpiry', width: 0.1, align: 'right' },
        { header: 'Quantity', key: 'quantity', width: 0.1, align: 'right' },
        {
          header: 'Unit Cost',
          key: 'unitCost',
          width: 0.11,
          align: 'right',
          format: (v) => formatCurrencyPDF(v),
        },
        {
          header: 'Total Value',
          key: 'totalValue',
          width: 0.11,
          align: 'right',
          format: (v) => formatCurrencyPDF(v),
        },
      ];

      pdfGen.addTable(columns, report.data);
      pdfGen.end();
      return;
    }

    logger.info('Expiring items report generated', {
      userId,
      daysAhead: params.days_threshold,
      recordCount: report.recordCount,
    });

    res.json({ success: true, data: report });
  },

  /**
   * Generate Low Stock Report
   * GET /api/reports/low-stock
   */
  async getLowStock(req: Request, res: Response, pool: Pool) {
    const params = LowStockParamsSchema.parse(req.query);
    const userId = req.user?.id;

    const report = await reportsService.generateLowStock(pool, {
      threshold: params.threshold_percentage,
      categoryId: params.category_id,
      format: params.format,
      userId,
    });

    // PDF export
    if (params.format === 'pdf') {
      const companyName = await getCompanyName(pool);
      const pdfGen = new ReportPDFGenerator(companyName);
      const doc = pdfGen.getDocument();

      const date = new Date().toLocaleDateString('en-CA');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="low-stock-${date}.pdf"`);
      doc.pipe(res);

      const threshold = params.threshold_percentage || 20;

      pdfGen.addHeader({
        companyName,
        title: 'Low Stock Report',
        subtitle: `Items Below ${threshold}% of Reorder Level`,
        generatedAt: formatDateTime(),
      });

      pdfGen.addSummaryCards([
        {
          label: 'Total Low Stock Items',
          value: String(report.summary.totalItems),
          color: PDFColors.warning,
        },
        {
          label: 'Critical Items',
          value: String(report.summary.criticalCount || 0),
          color: PDFColors.danger,
        },
        {
          label: 'Low Stock Items',
          value: String(report.summary.lowCount || 0),
          color: PDFColors.warning,
        },
        { label: 'Threshold', value: `${threshold}%`, color: PDFColors.info },
      ]);

      const columns: PDFTableColumn[] = [
        { header: 'Product', key: 'productName', width: 0.3 },
        { header: 'SKU', key: 'sku', width: 0.2 },
        { header: 'Current Stock', key: 'currentStock', width: 0.18, align: 'right' },
        { header: 'Reorder Level', key: 'reorderLevel', width: 0.18, align: 'right' },
        {
          header: 'Status',
          key: 'status',
          width: 0.14,
          format: (v) => (v != null ? String(v) : 'N/A'),
        },
      ];

      pdfGen.addTable(columns, report.data);
      pdfGen.end();
      return;
    }

    logger.info('Low stock report generated', {
      userId,
      threshold: params.threshold_percentage,
      recordCount: report.recordCount,
    });

    res.json({ success: true, data: report });
  },

  /**
   * Generate Best Selling Products Report
   * GET /api/reports/best-selling
   */
  async getBestSelling(req: Request, res: Response, pool: Pool) {
    const params = BestSellingProductsParamsSchema.parse(req.query);
    const userId = req.user?.id;

    const report = await reportsService.generateBestSelling(pool, {
      startDate: new Date(params.start_date),
      endDate: adjustEndDate(params.end_date),
      limit: params.limit || 10,
      categoryId: params.category_id,
      format: params.format,
      userId,
    });

    // PDF export
    if (params.format === 'pdf') {
      const companyName = await getCompanyName(pool);
      const pdfGen = new ReportPDFGenerator(companyName);
      const doc = pdfGen.getDocument();

      const date = new Date().toLocaleDateString('en-CA');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="best-selling-${date}.pdf"`);
      doc.pipe(res);

      const startDate = formatDatePDF(new Date(params.start_date));
      const endDate = formatDatePDF(new Date(params.end_date));

      pdfGen.addHeader({
        companyName,
        title: 'Best Selling Products Report',
        subtitle: `Top ${params.limit || 10} Products - ${startDate} to ${endDate}`,
        generatedAt: formatDateTime(),
      });

      pdfGen.addSummaryCards([
        {
          label: 'Total Products',
          value: String(report.summary.totalProducts),
          color: PDFColors.primary,
        },
        {
          label: 'Total Revenue',
          value: formatCurrencyPDF(report.summary.totalRevenue || 0),
          color: PDFColors.success,
        },
        {
          label: 'Total Units Sold',
          value: formatQuantityPDF(report.summary.totalQuantitySold || 0),
          color: PDFColors.info,
        },
        {
          label: 'Total Profit',
          value: formatCurrencyPDF(report.summary.totalProfit || 0),
          color: PDFColors.secondary,
        },
      ]);

      const columns: PDFTableColumn[] = [
        { header: 'Rank', key: 'rank', width: 0.08 },
        { header: 'Product', key: 'productName', width: 0.25 },
        { header: 'SKU', key: 'sku', width: 0.12 },
        { header: 'Units Sold', key: 'unitsSold', width: 0.12, align: 'right' },
        {
          header: 'Revenue',
          key: 'totalRevenue',
          width: 0.13,
          align: 'right',
          format: (v) => formatCurrencyPDF(v),
        },
        {
          header: 'Profit',
          key: 'profit',
          width: 0.13,
          align: 'right',
          format: (v) => formatCurrencyPDF(v),
        },
        {
          header: 'Margin %',
          key: 'profitMargin',
          width: 0.09,
          align: 'right',
          format: (v) => v + '%',
        },
        {
          header: 'Avg Price',
          key: 'avgPrice',
          width: 0.08,
          align: 'right',
          format: (v) => formatCurrencyPDF(v),
        },
      ];

      pdfGen.addTable(columns, report.data);
      pdfGen.end();
      return;
    }

    logger.info('Best selling products report generated', {
      userId,
      startDate: params.start_date,
      endDate: params.end_date,
      recordCount: report.recordCount,
    });

    res.json({ success: true, data: report });
  },

  /**
   * Generate Supplier Cost Analysis Report
   * GET /api/reports/supplier-cost-analysis
   */
  async getSupplierCostAnalysis(req: Request, res: Response, pool: Pool) {
    const params = SupplierCostAnalysisParamsSchema.parse(req.query);
    const userId = req.user?.id;

    const report = await reportsService.generateSupplierCostAnalysis(pool, {
      startDate: new Date(params.start_date),
      endDate: adjustEndDate(params.end_date),
      supplierId: params.supplier_id,
      format: params.format,
      userId,
    });

    // PDF export
    if (params.format === 'pdf') {
      const companyName = await getCompanyName(pool);
      const pdfGen = new ReportPDFGenerator(companyName);
      const doc = pdfGen.getDocument();

      const date = new Date().toLocaleDateString('en-CA');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="supplier-cost-analysis-${date}.pdf"`
      );
      doc.pipe(res);

      const startDate = formatDatePDF(new Date(params.start_date));
      const endDate = formatDatePDF(new Date(params.end_date));

      pdfGen.addHeader({
        companyName,
        title: 'Supplier Cost Analysis Report',
        subtitle: `${startDate} to ${endDate}`,
        generatedAt: formatDateTime(),
      });

      pdfGen.addSummaryCards([
        {
          label: 'Total Suppliers',
          value: String(report.summary.totalSuppliers || 0),
          color: PDFColors.primary,
        },
        {
          label: 'Total Purchase Value',
          value: formatCurrencyPDF(report.summary.totalPurchaseValue || 0),
          color: PDFColors.success,
        },
        {
          label: 'Total Orders',
          value: String(report.summary.totalPurchaseOrders || 0),
          color: PDFColors.info,
        },
        {
          label: 'Avg Order Value',
          value: formatCurrencyPDF(
            report.summary.totalPurchaseOrders
              ? (report.summary.totalPurchaseValue || 0) / report.summary.totalPurchaseOrders
              : 0
          ),
          color: PDFColors.secondary,
        },
      ]);

      const columns: PDFTableColumn[] = [
        { header: 'Supplier', key: 'supplierName', width: 0.25 },
        { header: 'Orders', key: 'orderCount', width: 0.12, align: 'right' },
        {
          header: 'Total Cost',
          key: 'totalCost',
          width: 0.18,
          align: 'right',
          format: (v) => formatCurrencyPDF(v),
        },
        {
          header: 'Avg Cost',
          key: 'avgCost',
          width: 0.15,
          align: 'right',
          format: (v) => formatCurrencyPDF(v),
        },
        { header: 'Products', key: 'productCount', width: 0.12, align: 'right' },
        {
          header: '% of Total',
          key: 'percentOfTotal',
          width: 0.18,
          align: 'right',
          format: (v) => `${Number(v).toFixed(1)}%`,
        },
      ];

      pdfGen.addTable(columns, report.data);
      pdfGen.end();
      return;
    }

    logger.info('Supplier cost analysis report generated', {
      userId,
      startDate: params.start_date,
      endDate: params.end_date,
      recordCount: report.recordCount,
    });

    res.json({ success: true, data: report });
  },

  /**
   * Generate Goods Received Report
   * GET /api/reports/goods-received
   */
  async getGoodsReceived(req: Request, res: Response, pool: Pool) {
    const params = GoodsReceivedParamsSchema.parse(req.query);
    const userId = req.user?.id;

    const report = await reportsService.generateGoodsReceived(pool, {
      startDate: new Date(params.start_date),
      endDate: new Date(params.end_date),
      supplierId: params.supplier_id,
      productId: params.product_id,
      format: params.format,
      userId,
    });

    // PDF export
    if (params.format === 'pdf') {
      const companyName = await getCompanyName(pool);
      const pdfGen = new ReportPDFGenerator(companyName);
      const doc = pdfGen.getDocument();

      const date = new Date().toLocaleDateString('en-CA');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="goods-received-${date}.pdf"`);
      doc.pipe(res);

      const startDate = formatDatePDF(new Date(params.start_date));
      const endDate = formatDatePDF(new Date(params.end_date));

      pdfGen.addHeader({
        companyName,
        title: 'Goods Received Report',
        subtitle: `${startDate} to ${endDate}`,
        generatedAt: formatDateTime(),
      });

      // Calculate additional summary info
      const grData = report.data as GoodsReceivedRow[];
      const totalItems = grData.reduce((sum: number, r) => sum + (Number(r.itemsCount) || 0), 0);
      const uniqueSuppliers = new Set(grData.map((r) => r.supplierName)).size;

      pdfGen.addSummaryCards([
        {
          label: 'Total Receipts',
          value: String(report.summary.totalReceipts || 0),
          color: PDFColors.primary,
        },
        {
          label: 'Total Value',
          value: formatCurrencyPDF(report.summary.totalValue || 0),
          color: PDFColors.success,
        },
        { label: 'Total Items', value: String(totalItems), color: PDFColors.info },
        { label: 'Suppliers', value: String(uniqueSuppliers), color: PDFColors.secondary },
      ]);

      const columns: PDFTableColumn[] = [
        { header: 'Date', key: 'receivedDate', width: 0.14 },
        { header: 'GR #', key: 'goodsReceiptNumber', width: 0.14 },
        { header: 'PO #', key: 'purchaseOrderNumber', width: 0.14 },
        { header: 'Supplier', key: 'supplierName', width: 0.24 },
        { header: 'Items', key: 'itemsCount', width: 0.1, align: 'right' },
        {
          header: 'Total Value',
          key: 'totalValue',
          width: 0.24,
          align: 'right',
          format: (v) => formatCurrencyPDF(v),
        },
      ];

      pdfGen.addTable(columns, report.data);
      pdfGen.end();
      return;
    }

    logger.info('Goods received report generated', {
      userId,
      startDate: params.start_date,
      endDate: params.end_date,
      recordCount: report.recordCount,
    });

    res.json({ success: true, data: report });
  },

  /**
   * Generate Payment Report
   * GET /api/reports/payments
   */
  async getPaymentReport(req: Request, res: Response, pool: Pool) {
    const params = PaymentReportParamsSchema.parse(req.query);
    const userId = req.user?.id;

    const report = await reportsService.generatePaymentReport(pool, {
      startDate: new Date(params.start_date),
      endDate: new Date(params.end_date),
      paymentMethod: params.payment_method,
      format: params.format,
      userId,
    });

    // PDF export
    if (params.format === 'pdf') {
      const companyName = await getCompanyName(pool);
      const pdfGen = new ReportPDFGenerator(companyName);
      const doc = pdfGen.getDocument();

      const date = new Date().toLocaleDateString('en-CA');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="payment-report-${date}.pdf"`);
      doc.pipe(res);

      const startDate = formatDatePDF(new Date(params.start_date));
      const endDate = formatDatePDF(new Date(params.end_date));

      pdfGen.addHeader({
        companyName,
        title: 'Payment Methods Report',
        subtitle: `${startDate} to ${endDate}`,
        generatedAt: formatDateTime(),
      });

      pdfGen.addSummaryCards([
        {
          label: 'Total Amount',
          value: formatCurrencyPDF(report.summary.totalAmount || 0),
          color: PDFColors.success,
        },
        {
          label: 'Total Transactions',
          value: String(report.summary.totalTransactions || 0),
          color: PDFColors.primary,
        },
        { label: 'Payment Methods', value: String(report.data.length), color: PDFColors.info },
        { label: 'Period', value: `${startDate} to ${endDate}`, color: PDFColors.secondary },
      ]);

      const columns: PDFTableColumn[] = [
        { header: 'Payment Method', key: 'paymentMethod', width: 0.25 },
        { header: 'Transactions', key: 'transactionCount', width: 0.15, align: 'right' },
        {
          header: 'Total Amount',
          key: 'totalAmount',
          width: 0.2,
          align: 'right',
          format: (v) => formatCurrencyPDF(v),
        },
        {
          header: 'Avg Amount',
          key: 'avgAmount',
          width: 0.2,
          align: 'right',
          format: (v) => formatCurrencyPDF(v),
        },
        {
          header: '% of Total',
          key: 'percentageOfTotal',
          width: 0.2,
          align: 'right',
          format: (v) => v + '%',
        },
      ];

      pdfGen.addTable(columns, report.data);
      pdfGen.end();
      return;
    }

    logger.info('Payment report generated', {
      userId,
      startDate: params.start_date,
      endDate: params.end_date,
      recordCount: report.recordCount,
    });

    res.json({ success: true, data: report });
  },

  /**
   * Generate Customer Payments Report
   * GET /api/reports/customer-payments
   */
  async getCustomerPayments(req: Request, res: Response, pool: Pool) {
    const params = CustomerPaymentsParamsSchema.parse(req.query);
    const userId = req.user?.id;

    const report = await reportsService.generateCustomerPayments(pool, {
      startDate: new Date(params.start_date),
      endDate: new Date(params.end_date),
      customerId: params.customer_id,
      status: params.status,
      format: params.format,
      userId,
    });

    // PDF export
    if (params.format === 'pdf') {
      const companyName = await getCompanyName(pool);
      const pdfGen = new ReportPDFGenerator(companyName);
      const doc = pdfGen.getDocument();

      const date = new Date().toLocaleDateString('en-CA');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="customer-payments-${date}.pdf"`);
      doc.pipe(res);

      const startDate = formatDatePDF(new Date(params.start_date));
      const endDate = formatDatePDF(new Date(params.end_date));

      pdfGen.addHeader({
        companyName,
        title: 'Customer Payments Report',
        subtitle: `${startDate} to ${endDate}`,
        generatedAt: formatDateTime(),
      });

      pdfGen.addSummaryCards([
        {
          label: 'Total Customers',
          value: String(report.summary.totalCustomers || 0),
          color: PDFColors.primary,
        },
        {
          label: 'Total Invoiced',
          value: formatCurrencyPDF(report.summary.totalInvoiced || 0),
          color: PDFColors.info,
        },
        {
          label: 'Total Paid',
          value: formatCurrencyPDF(report.summary.totalPaid || 0),
          color: PDFColors.success,
        },
        {
          label: 'Outstanding',
          value: formatCurrencyPDF(report.summary.totalOutstanding || 0),
          color: PDFColors.danger,
        },
      ]);

      const columns: PDFTableColumn[] = [
        { header: 'Customer', key: 'customerName', width: 0.24 },
        { header: 'Invoices', key: 'totalInvoices', width: 0.12, align: 'right' },
        {
          header: 'Invoiced',
          key: 'totalInvoiced',
          width: 0.18,
          align: 'right',
          format: (v) => formatCurrencyPDF(v),
        },
        {
          header: 'Paid',
          key: 'totalPaid',
          width: 0.18,
          align: 'right',
          format: (v) => formatCurrencyPDF(v),
        },
        {
          header: 'Outstanding',
          key: 'totalOutstanding',
          width: 0.16,
          align: 'right',
          format: (v) => formatCurrencyPDF(v),
        },
        {
          header: 'Overdue',
          key: 'overdueAmount',
          width: 0.12,
          align: 'right',
          format: (v) => formatCurrencyPDF(v),
        },
      ];

      pdfGen.addTable(columns, report.data);
      pdfGen.end();
      return;
    }

    logger.info('Customer payments report generated', {
      userId,
      startDate: params.start_date,
      endDate: params.end_date,
      recordCount: report.recordCount,
    });

    res.json({ success: true, data: report });
  },

  /**
   * Generate Profit & Loss Report
   * GET /api/reports/profit-loss
   */
  async getProfitLoss(req: Request, res: Response, pool: Pool) {
    const params = ProfitLossParamsSchema.parse(req.query);
    const userId = req.user?.id;

    const report = await reportsService.generateProfitLoss(pool, {
      startDate: new Date(params.start_date),
      endDate: new Date(params.end_date),
      groupBy: params.group_by,
      format: params.format,
      userId,
    });

    // PDF export
    if (params.format === 'pdf') {
      const companyName = await getCompanyName(pool);
      const pdfGen = new ReportPDFGenerator(companyName);
      const doc = pdfGen.getDocument();

      const date = new Date().toLocaleDateString('en-CA');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="profit-loss-${date}.pdf"`);
      doc.pipe(res);

      const startDate = formatDatePDF(new Date(params.start_date));
      const endDate = formatDatePDF(new Date(params.end_date));

      pdfGen.addHeader({
        companyName,
        title: 'Profit & Loss Report',
        subtitle: `${startDate} to ${endDate}`,
        generatedAt: formatDateTime(),
      });

      pdfGen.addSummaryCards([
        {
          label: 'Total Revenue',
          value: formatCurrencyPDF(report.summary.totalRevenue || 0),
          color: PDFColors.success,
        },
        {
          label: 'Total COGS',
          value: formatCurrencyPDF(report.summary.totalCOGS || 0),
          color: PDFColors.danger,
        },
        {
          label: 'Gross Profit',
          value: formatCurrencyPDF(report.summary.grossProfit || 0),
          color: PDFColors.primary,
        },
        {
          label: 'Profit Margin',
          value: `${report.summary.grossProfitMargin || 0}%`,
          color: PDFColors.info,
        },
      ]);

      const columns: PDFTableColumn[] = [
        { header: 'Period', key: 'period', width: 0.2 },
        {
          header: 'Revenue',
          key: 'revenue',
          width: 0.2,
          align: 'right',
          format: (v) => formatCurrencyPDF(v),
        },
        {
          header: 'COGS',
          key: 'costOfGoodsSold',
          width: 0.2,
          align: 'right',
          format: (v) => formatCurrencyPDF(v),
        },
        {
          header: 'Gross Profit',
          key: 'grossProfit',
          width: 0.2,
          align: 'right',
          format: (v) => formatCurrencyPDF(v),
        },
        {
          header: 'Margin %',
          key: 'grossProfitMargin',
          width: 0.2,
          align: 'right',
          format: (v) => (v !== undefined && v !== null ? Number(v).toFixed(2) + '%' : '0%'),
        },
      ];

      pdfGen.addTable(columns, report.data);
      pdfGen.end();
      return;
    }

    logger.info('Profit & loss report generated', {
      userId,
      startDate: params.start_date,
      endDate: params.end_date,
      recordCount: report.recordCount,
    });

    res.json({ success: true, data: report });
  },

  /**
   * Generate Deleted Items Report
   * GET /api/reports/deleted-items
   */
  async getDeletedItems(req: Request, res: Response, pool: Pool) {
    const params = DeletedItemsParamsSchema.parse(req.query);
    const userId = req.user?.id;

    const report = await reportsService.generateDeletedItems(pool, {
      startDate: parseDate(params.start_date),
      endDate: parseDate(params.end_date),
      format: params.format,
      userId,
    });

    // PDF export
    if (params.format === 'pdf') {
      const companyName = await getCompanyName(pool);
      const pdfGen = new ReportPDFGenerator(companyName);
      const doc = pdfGen.getDocument();

      const date = new Date().toLocaleDateString('en-CA');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="deleted-items-${date}.pdf"`);
      doc.pipe(res);

      const startDate = params.start_date
        ? formatDatePDF(new Date(params.start_date))
        : 'Beginning';
      const endDate = params.end_date ? formatDatePDF(new Date(params.end_date)) : 'Today';

      pdfGen.addHeader({
        companyName,
        title: 'Deleted Items Report',
        subtitle: `${startDate} to ${endDate}`,
        generatedAt: formatDateTime(),
      });

      pdfGen.addSummaryCards([
        {
          label: 'Total Deleted Items',
          value: String(report.summary.totalDeletedItems || 0),
          color: PDFColors.danger,
        },
      ]);

      const columns: PDFTableColumn[] = [
        { header: 'Date', key: 'deletedAt', width: 0.15 },
        { header: 'Product', key: 'productName', width: 0.25 },
        { header: 'SKU', key: 'sku', width: 0.12 },
        { header: 'Quantity', key: 'quantity', width: 0.12, align: 'right' },
        {
          header: 'Value',
          key: 'value',
          width: 0.15,
          align: 'right',
          format: (v) => formatCurrencyPDF(v),
        },
        { header: 'Reason', key: 'reason', width: 0.21 },
      ];

      pdfGen.addTable(columns, report.data);
      pdfGen.end();
      return;
    }

    logger.info('Deleted items report generated', {
      userId,
      startDate: params.start_date,
      endDate: params.end_date,
      recordCount: report.recordCount,
    });

    res.json({ success: true, data: report });
  },

  /**
   * Generate Inventory Adjustments Report
   * GET /api/reports/inventory-adjustments
   */
  async getInventoryAdjustments(req: Request, res: Response, pool: Pool) {
    const params = InventoryAdjustmentsParamsSchema.parse(req.query);
    const userId = req.user?.id;

    const report = await reportsService.generateInventoryAdjustments(pool, {
      startDate: new Date(params.start_date),
      endDate: new Date(params.end_date),
      productId: params.product_id,
      format: params.format,
      userId,
    });

    // PDF export
    if (params.format === 'pdf') {
      const companyName = await getCompanyName(pool);
      const pdfGen = new ReportPDFGenerator(companyName);
      const doc = pdfGen.getDocument();

      const date = new Date().toLocaleDateString('en-CA');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="inventory-adjustments-${date}.pdf"`
      );
      doc.pipe(res);

      const startDate = formatDatePDF(new Date(params.start_date));
      const endDate = formatDatePDF(new Date(params.end_date));

      pdfGen.addHeader({
        companyName,
        title: 'Inventory Adjustments Report',
        subtitle: `${startDate} to ${endDate}`,
        generatedAt: formatDateTime(),
      });

      pdfGen.addSummaryCards([
        {
          label: 'Total Adjustments',
          value: String(report.summary.totalAdjustments || 0),
          color: PDFColors.primary,
        },
        {
          label: 'Qty Increased',
          value: String(report.summary.totalAdjustmentsIn || 0),
          color: PDFColors.success,
        },
        {
          label: 'Qty Decreased',
          value: String(report.summary.totalAdjustmentsOut || 0),
          color: PDFColors.danger,
        },
        {
          label: 'Net Change',
          value: String(
            (report.summary.totalAdjustmentsIn || 0) - (report.summary.totalAdjustmentsOut || 0)
          ),
          color: PDFColors.info,
        },
      ]);

      const columns: PDFTableColumn[] = [
        { header: 'Date', key: 'adjustmentDate', width: 0.12 },
        { header: 'Product', key: 'productName', width: 0.22 },
        { header: 'SKU', key: 'sku', width: 0.12 },
        { header: 'Qty Change', key: 'quantityChange', width: 0.12, align: 'right' },
        { header: 'Type', key: 'adjustmentType', width: 0.12 },
        { header: 'Reason', key: 'reason', width: 0.18 },
        { header: 'User', key: 'userName', width: 0.12 },
      ];

      pdfGen.addTable(columns, report.data);
      pdfGen.end();
      return;
    }

    logger.info('Inventory adjustments report generated', {
      userId,
      startDate: params.start_date,
      endDate: params.end_date,
      recordCount: report.recordCount,
    });

    res.json({ success: true, data: report });
  },

  /**
   * Generate Purchase Order Summary Report
   * GET /api/reports/purchase-order-summary
   */
  async getPurchaseOrderSummary(req: Request, res: Response, pool: Pool) {
    const params = PurchaseOrderSummaryParamsSchema.parse(req.query);
    const userId = req.user?.id;

    const report = await reportsService.generatePurchaseOrderSummary(pool, {
      startDate: parseDate(params.start_date),
      endDate: parseDate(params.end_date),
      status: params.status,
      supplierId: params.supplier_id,
      format: params.format,
      userId,
    });

    // PDF export
    if (params.format === 'pdf') {
      const companyName = await getCompanyName(pool);
      const pdfGen = new ReportPDFGenerator(companyName);
      const doc = pdfGen.getDocument();

      const date = new Date().toLocaleDateString('en-CA');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="purchase-orders-${date}.pdf"`);
      doc.pipe(res);

      const startDate = params.start_date
        ? formatDatePDF(new Date(params.start_date))
        : 'Beginning';
      const endDate = params.end_date ? formatDatePDF(new Date(params.end_date)) : 'Today';

      pdfGen.addHeader({
        companyName,
        title: 'Purchase Order Summary Report',
        subtitle: `${startDate} to ${endDate}`,
        generatedAt: formatDateTime(),
      });

      pdfGen.addSummaryCards([
        {
          label: 'Total Orders',
          value: String(report.summary.totalOrders || 0),
          color: PDFColors.primary,
        },
        {
          label: 'Total Amount',
          value: formatCurrencyPDF(report.summary.totalAmount || 0),
          color: PDFColors.success,
        },
        {
          label: 'Total Receipts',
          value: String(report.summary.totalReceipts || 0),
          color: PDFColors.warning,
        },
        {
          label: 'Qty Received',
          value: String(report.summary.totalReceived || 0),
          color: PDFColors.info,
        },
      ]);

      const columns: PDFTableColumn[] = [
        { header: 'PO #', key: 'poNumber', width: 0.14 },
        { header: 'Date', key: 'orderDate', width: 0.14 },
        { header: 'Supplier', key: 'supplierName', width: 0.24 },
        {
          header: 'Total',
          key: 'totalAmount',
          width: 0.18,
          align: 'right',
          format: (v) => formatCurrencyPDF(v),
        },
        { header: 'Receipts', key: 'totalReceipts', width: 0.12, align: 'right' },
        { header: 'Status', key: 'status', width: 0.18 },
      ];

      pdfGen.addTable(columns, report.data);
      pdfGen.end();
      return;
    }

    logger.info('Purchase order summary report generated', {
      userId,
      recordCount: report.recordCount,
    });

    res.json({ success: true, data: report });
  },

  /**
   * Generate Stock Movement Analysis Report
   * GET /api/reports/stock-movement-analysis
   */
  async getStockMovementAnalysis(req: Request, res: Response, pool: Pool) {
    const params = StockMovementAnalysisParamsSchema.parse(req.query);
    const userId = req.user?.id;

    const report = await reportsService.generateStockMovementAnalysis(pool, {
      startDate: new Date(params.start_date),
      endDate: new Date(params.end_date),
      productId: params.product_id,
      movementType: params.movement_type,
      format: params.format,
      userId,
    });

    // PDF export
    if (params.format === 'pdf') {
      const companyName = await getCompanyName(pool);
      const pdfGen = new ReportPDFGenerator(companyName);
      const doc = pdfGen.getDocument();

      const date = new Date().toLocaleDateString('en-CA');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="stock-movements-${date}.pdf"`);
      doc.pipe(res);

      const startDate = formatDatePDF(new Date(params.start_date));
      const endDate = formatDatePDF(new Date(params.end_date));

      pdfGen.addHeader({
        companyName,
        title: 'Stock Movement Analysis Report',
        subtitle: `${startDate} to ${endDate}`,
        generatedAt: formatDateTime(),
      });

      pdfGen.addSummaryCards([
        {
          label: 'Total Transactions',
          value: String(report.summary.totalTransactions || 0),
          color: PDFColors.primary,
        },
        { label: 'Stock In', value: String(report.summary.totalIn || 0), color: PDFColors.success },
        {
          label: 'Stock Out',
          value: String(report.summary.totalOut || 0),
          color: PDFColors.danger,
        },
        {
          label: 'Net Movement',
          value: String(report.summary.netMovement || 0),
          color: PDFColors.info,
        },
      ]);

      const columns: PDFTableColumn[] = [
        { header: 'Movement Type', key: 'movement_type', width: 0.25 },
        { header: 'Product', key: 'product_name', width: 0.3 },
        { header: 'SKU', key: 'sku', width: 0.15 },
        { header: 'In', key: 'totalIn', width: 0.1, align: 'right' },
        { header: 'Out', key: 'totalOut', width: 0.1, align: 'right' },
        { header: 'Net', key: 'netMovement', width: 0.1, align: 'right' },
      ];

      pdfGen.addTable(columns, report.data);
      pdfGen.end();
      return;
    }

    logger.info('Stock movement analysis report generated', {
      userId,
      recordCount: report.recordCount,
    });

    res.json({ success: true, data: report });
  },

  /**
   * Generate Customer Account Statement Report
   * GET /api/reports/customer-account-statement
   */
  async getCustomerAccountStatement(req: Request, res: Response, pool: Pool) {
    const params = CustomerAccountStatementParamsSchema.parse(req.query);
    const userId = req.user?.id;

    // Lookup customer by customer_number to get the UUID
    const customerResult = await pool.query('SELECT id FROM customers WHERE customer_number = $1', [
      params.customer_number,
    ]);

    if (customerResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: `Customer not found: ${params.customer_number}`,
      });
    }

    const customerId = customerResult.rows[0].id;

    const report = await reportsService.generateCustomerAccountStatement(pool, {
      customerId: customerId,
      startDate: parseDate(params.start_date),
      endDate: parseDate(params.end_date),
      format: params.format,
      userId,
    });

    // PDF export
    if (params.format === 'pdf') {
      const companyName = await getCompanyName(pool);
      const pdfGen = new ReportPDFGenerator(companyName);
      const doc = pdfGen.getDocument();

      const date = new Date().toLocaleDateString('en-CA');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="customer-statement-${params.customer_number}-${date}.pdf"`
      );
      doc.pipe(res);

      const customerName = report.data.customer.name || 'Unknown Customer';
      const startDate = params.start_date
        ? formatDatePDF(new Date(params.start_date as string))
        : 'Beginning';
      const endDate = params.end_date
        ? formatDatePDF(new Date(params.end_date as string))
        : 'Today';

      pdfGen.addHeader({
        companyName,
        title: 'Customer Account Statement',
        subtitle: `${customerName} (${params.customer_number}) - ${startDate} to ${endDate}`,
        generatedAt: formatDateTime(),
      });

      pdfGen.addSummaryCards([
        {
          label: 'Total Sales',
          value: formatCurrencyPDF(report.summary.totalSales || 0),
          color: PDFColors.info,
        },
        {
          label: 'Total Paid',
          value: formatCurrencyPDF(report.summary.totalPaid || 0),
          color: PDFColors.success,
        },
        {
          label: 'Outstanding',
          value: formatCurrencyPDF(report.summary.totalOutstanding || 0),
          color: PDFColors.danger,
        },
        {
          label: 'Transactions',
          value: String(report.summary.totalTransactions || 0),
          color: PDFColors.primary,
        },
      ]);

      const columns: PDFTableColumn[] = [
        { header: 'Date', key: 'saleDate', width: 0.15 },
        { header: 'Invoice #', key: 'saleNumber', width: 0.2 },
        {
          header: 'Total',
          key: 'totalAmount',
          width: 0.15,
          align: 'right',
          format: (v) => formatCurrencyPDF(v as number),
        },
        {
          header: 'Paid',
          key: 'amountPaid',
          width: 0.15,
          align: 'right',
          format: (v) => formatCurrencyPDF(v as number),
        },
        {
          header: 'Balance',
          key: 'balanceDue',
          width: 0.15,
          align: 'right',
          format: (v) => formatCurrencyPDF(v as number),
        },
        { header: 'Status', key: 'paymentStatus', width: 0.2 },
      ];

      pdfGen.addTable(columns, report.data.transactions);
      pdfGen.end();
      return;
    }

    logger.info('Customer account statement generated', {
      userId,
      customerNumber: params.customer_number,
      customerId: customerId,
      recordCount: report.recordCount,
    });

    res.json({ success: true, data: report });
  },

  /**
   * Generate Profit Margin by Product Report
   * GET /api/reports/profit-margin
   */
  async getProfitMarginByProduct(req: Request, res: Response, pool: Pool) {
    const params = ProfitMarginByProductParamsSchema.parse(req.query);
    const userId = req.user?.id;

    const report = await reportsService.generateProfitMarginByProduct(pool, {
      startDate: parseDate(params.start_date),
      endDate: parseDate(params.end_date),
      categoryId: params.category_id,
      minMargin: params.min_margin,
      format: params.format,
      userId,
    });

    // PDF export
    if (params.format === 'pdf') {
      const companyName = await getCompanyName(pool);
      const pdfGen = new ReportPDFGenerator(companyName);
      const doc = pdfGen.getDocument();

      const date = new Date().toLocaleDateString('en-CA');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="profit-margin-${date}.pdf"`);
      doc.pipe(res);

      const startDate = params.start_date ? formatDatePDF(new Date(params.start_date)) : 'All Time';
      const endDate = params.end_date ? formatDatePDF(new Date(params.end_date)) : 'Present';

      pdfGen.addHeader({
        companyName,
        title: 'Profit Margin by Product Report',
        subtitle: `${startDate} to ${endDate}`,
        generatedAt: formatDateTime(),
      });

      pdfGen.addSummaryCards([
        {
          label: 'Products',
          value: String(report.summary.totalProducts || 0),
          color: PDFColors.primary,
        },
        {
          label: 'Avg Margin',
          value: `${(report.summary.averageMarginPercent || 0).toFixed(1)}%`,
          color: PDFColors.success,
        },
        {
          label: 'Total Revenue',
          value: formatCurrencyPDF(report.summary.totalRevenue || 0),
          color: PDFColors.info,
        },
        {
          label: 'Total Profit',
          value: formatCurrencyPDF(report.summary.totalProfit || 0),
          color: PDFColors.secondary,
        },
      ]);

      const columns: PDFTableColumn[] = [
        { header: 'Product', key: 'productName', width: 0.25 },
        { header: 'Category', key: 'category', width: 0.15 },
        { header: 'Units Sold', key: 'totalQuantitySold', width: 0.12, align: 'right' },
        {
          header: 'Revenue',
          key: 'totalRevenue',
          width: 0.16,
          align: 'right',
          format: (v) => formatCurrencyPDF(v),
        },
        {
          header: 'Cost',
          key: 'totalCost',
          width: 0.16,
          align: 'right',
          format: (v) => formatCurrencyPDF(v),
        },
        {
          header: 'Margin %',
          key: 'profitMarginPercent',
          width: 0.16,
          align: 'right',
          format: (v) =>
            v !== undefined && v !== null && !isNaN(Number(v)) ? `${Number(v).toFixed(1)}%` : '0%',
        },
      ];

      pdfGen.addTable(columns, report.data);
      pdfGen.end();
      return;
    }

    logger.info('Profit margin by product report generated', {
      userId,
      recordCount: report.recordCount,
    });

    res.json({ success: true, data: report });
  },

  /**
   * Generate Daily Cash Flow Report
   * GET /api/reports/daily-cash-flow
   */
  async getDailyCashFlow(req: Request, res: Response, pool: Pool) {
    const params = DailyCashFlowParamsSchema.parse(req.query);
    const userId = req.user?.id;

    const report = await reportsService.generateDailyCashFlow(pool, {
      startDate: new Date(params.start_date),
      endDate: new Date(params.end_date),
      format: params.format,
      userId,
    });

    // PDF export
    if (params.format === 'pdf') {
      const companyName = await getCompanyName(pool);
      const pdfGen = new ReportPDFGenerator(companyName);
      const doc = pdfGen.getDocument();

      const date = new Date().toLocaleDateString('en-CA');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="daily-cash-flow-${date}.pdf"`);
      doc.pipe(res);

      const startDate = formatDatePDF(new Date(params.start_date));
      const endDate = formatDatePDF(new Date(params.end_date));

      pdfGen.addHeader({
        companyName,
        title: 'Daily Cash Flow Report',
        subtitle: `${startDate} to ${endDate}`,
        generatedAt: formatDateTime(),
      });

      pdfGen.addSummaryCards([
        {
          label: 'Sales Revenue',
          value: formatCurrencyPDF(report.summary.salesRevenue || 0),
          color: PDFColors.success,
        },
        {
          label: 'Debt Collections',
          value: formatCurrencyPDF(report.summary.debtCollections || 0),
          color: PDFColors.info,
        },
        {
          label: 'Total Cash In',
          value: formatCurrencyPDF(report.summary.totalCashIn || 0),
          color: PDFColors.primary,
        },
        { label: 'Days', value: String(report.summary.totalDays || 0), color: PDFColors.secondary },
      ]);

      const columns: PDFTableColumn[] = [
        { header: 'Date', key: 'transactionDate', width: 0.14 },
        {
          header: 'Type',
          key: 'revenueType',
          width: 0.16,
          format: (v) => (v === 'SALES_REVENUE' ? 'Sales' : 'Collection'),
        },
        { header: 'Payment Method', key: 'paymentMethod', width: 0.16 },
        {
          header: 'Cash Amount',
          key: 'cashAmount',
          width: 0.16,
          align: 'right',
          format: (v) => formatCurrencyPDF(v),
        },
        {
          header: 'Gross Profit',
          key: 'grossProfit',
          width: 0.16,
          align: 'right',
          format: (v) => formatCurrencyPDF(v),
        },
        { header: 'Txns', key: 'transactionCount', width: 0.1, align: 'right' },
        {
          header: 'Margin',
          key: 'profitMargin',
          width: 0.12,
          align: 'right',
          format: (v) => (v !== undefined && v !== null ? Number(v).toFixed(1) + '%' : '0%'),
        },
      ];

      pdfGen.addTable(columns, report.data);
      pdfGen.end();
      return;
    }

    logger.info('Daily cash flow report generated', {
      userId,
      recordCount: report.recordCount,
    });

    res.json({ success: true, data: report });
  },

  /**
   * Generate Supplier Payment Status Report
   * GET /api/reports/supplier-payment-status
   */
  async getSupplierPaymentStatus(req: Request, res: Response, pool: Pool) {
    const params = SupplierPaymentStatusParamsSchema.parse(req.query);
    const userId = req.user?.id;

    const report = await reportsService.generateSupplierPaymentStatus(pool, {
      supplierId: params.supplier_id,
      status: params.status,
      format: params.format,
      userId,
    });

    // PDF export
    if (params.format === 'pdf') {
      const companyName = await getCompanyName(pool);
      const pdfGen = new ReportPDFGenerator(companyName);
      const doc = pdfGen.getDocument();

      const date = new Date().toLocaleDateString('en-CA');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="supplier-payment-status-${date}.pdf"`
      );
      doc.pipe(res);

      pdfGen.addHeader({
        companyName,
        title: 'Supplier Payment Status Report',
        subtitle: 'Current Payment Status by Supplier',
        generatedAt: formatDateTime(),
      });

      pdfGen.addSummaryCards([
        {
          label: 'Total Suppliers',
          value: String(report.summary.totalSuppliers || 0),
          color: PDFColors.primary,
        },
        {
          label: 'Total Amount',
          value: formatCurrencyPDF(report.summary.totalAmount || 0),
          color: PDFColors.info,
        },
        {
          label: 'Total Paid',
          value: formatCurrencyPDF(report.summary.totalPaid || 0),
          color: PDFColors.success,
        },
        {
          label: 'Outstanding',
          value: formatCurrencyPDF(report.summary.totalOutstanding || 0),
          color: PDFColors.danger,
        },
      ]);

      const columns: PDFTableColumn[] = [
        { header: 'Supplier', key: 'supplierName', width: 0.28 },
        { header: 'Orders', key: 'totalOrders', width: 0.12, align: 'right' },
        {
          header: 'Total Amount',
          key: 'totalAmount',
          width: 0.2,
          align: 'right',
          format: (v) => formatCurrencyPDF(v),
        },
        {
          header: 'Paid',
          key: 'totalPaid',
          width: 0.2,
          align: 'right',
          format: (v) => formatCurrencyPDF(v),
        },
        {
          header: 'Outstanding',
          key: 'outstandingBalance',
          width: 0.2,
          align: 'right',
          format: (v) => formatCurrencyPDF(v),
        },
      ];

      pdfGen.addTable(columns, report.data);
      pdfGen.end();
      return;
    }

    logger.info('Supplier payment status report generated', {
      userId,
      recordCount: report.recordCount,
    });

    res.json({ success: true, data: report });
  },

  /**
   * Generate Top Customers Report
   * GET /api/reports/top-customers
   */
  async getTopCustomers(req: Request, res: Response, pool: Pool) {
    const params = TopCustomersParamsSchema.parse(req.query);
    const userId = req.user?.id;

    const report = await reportsService.generateTopCustomers(pool, {
      startDate: new Date(params.start_date),
      endDate: new Date(params.end_date),
      limit: params.limit,
      sortBy: params.sort_by,
      format: params.format,
      userId,
    });

    // PDF export
    if (params.format === 'pdf') {
      const companyName = await getCompanyName(pool);
      const pdfGen = new ReportPDFGenerator(companyName);
      const doc = pdfGen.getDocument();

      const date = new Date().toLocaleDateString('en-CA');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="top-customers-${date}.pdf"`);
      doc.pipe(res);

      const startDate = formatDatePDF(new Date(params.start_date));
      const endDate = formatDatePDF(new Date(params.end_date));

      pdfGen.addHeader({
        companyName,
        title: 'Top Customers Report',
        subtitle: `Top ${params.limit || 10} Customers - ${startDate} to ${endDate}`,
        generatedAt: formatDateTime(),
      });

      pdfGen.addSummaryCards([
        { label: 'Total Customers', value: String(report.data.length), color: PDFColors.primary },
        {
          label: 'Total Revenue',
          value: formatCurrencyPDF(report.summary.totalRevenue || 0),
          color: PDFColors.success,
        },
        {
          label: 'Total Purchases',
          value: String(report.summary.totalPurchases || 0),
          color: PDFColors.info,
        },
        {
          label: 'Avg Order Value',
          value: formatCurrencyPDF(report.summary.averageOrderValue || 0),
          color: PDFColors.secondary,
        },
      ]);

      const columns: PDFTableColumn[] = [
        { header: 'Rank', key: 'rank', width: 0.08 },
        { header: 'Customer Name', key: 'customerName', width: 0.22 },
        { header: 'Purchases', key: 'totalPurchases', width: 0.12, align: 'right' },
        {
          header: 'Revenue',
          key: 'totalRevenue',
          width: 0.15,
          align: 'right',
          format: (v) => formatCurrencyPDF(v),
        },
        {
          header: 'Avg Purchase',
          key: 'avgPurchase',
          width: 0.13,
          align: 'right',
          format: (v) => formatCurrencyPDF(v),
        },
        { header: 'Last Purchase', key: 'lastPurchaseDate', width: 0.15 },
        {
          header: 'Balance',
          key: 'currentBalance',
          width: 0.15,
          align: 'right',
          format: (v) => formatCurrencyPDF(v),
        },
      ];

      pdfGen.addTable(columns, report.data);
      pdfGen.end();
      return;
    }

    logger.info('Top customers report generated', {
      userId,
      recordCount: report.recordCount,
    });

    res.json({ success: true, data: report });
  },

  /**
   * Generate Customer Aging Report
   * GET /api/reports/customer-aging
   */
  async getCustomerAging(req: Request, res: Response, pool: Pool) {
    const userId = req.user?.id;
    const format = (req.query.format as string) || 'json';

    const report = await reportsService.generateCustomerAging(pool, {
      asOfDate: new Date(),
      format: format as 'json' | 'pdf' | 'csv',
      userId,
    });

    // PDF export
    if (format === 'pdf') {
      const companyName = await getCompanyName(pool);
      const pdfGen = new ReportPDFGenerator(companyName);
      const doc = pdfGen.getDocument();

      const date = new Date().toLocaleDateString('en-CA');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="customer-aging-${date}.pdf"`);
      doc.pipe(res);

      pdfGen.addHeader({
        companyName,
        title: 'Customer Aging Report',
        subtitle: `As of ${formatDateTime()}`,
        generatedAt: formatDateTime(),
      });

      pdfGen.addSummaryCards([
        {
          label: 'Total Customers',
          value: String(report.summary.totalCustomers || 0),
          color: PDFColors.primary,
        },
        {
          label: 'Total Outstanding',
          value: formatCurrencyPDF(report.summary.totalOutstanding || 0),
          color: PDFColors.danger,
        },
        {
          label: 'Current',
          value: formatCurrencyPDF(report.summary.current || 0),
          color: PDFColors.success,
        },
        {
          label: '90+ Days',
          value: formatCurrencyPDF(report.summary.over90 || 0),
          color: PDFColors.warning,
        },
      ]);

      const columns: PDFTableColumn[] = [
        { header: 'Customer', key: 'customerName', width: 0.2 },
        {
          header: 'Current',
          key: 'current',
          width: 0.13,
          align: 'right',
          format: (v) => formatCurrencyPDF(v),
        },
        {
          header: '1-30',
          key: 'days30',
          width: 0.13,
          align: 'right',
          format: (v) => formatCurrencyPDF(v),
        },
        {
          header: '31-60',
          key: 'days60',
          width: 0.13,
          align: 'right',
          format: (v) => formatCurrencyPDF(v),
        },
        {
          header: '61-90',
          key: 'days90',
          width: 0.13,
          align: 'right',
          format: (v) => formatCurrencyPDF(v),
        },
        {
          header: '90+',
          key: 'over90',
          width: 0.13,
          align: 'right',
          format: (v) => formatCurrencyPDF(v),
        },
        {
          header: 'Total',
          key: 'totalOutstanding',
          width: 0.15,
          align: 'right',
          format: (v) => formatCurrencyPDF(v),
        },
      ];

      pdfGen.addTable(columns, report.data);
      pdfGen.end();
      return;
    }

    logger.info('Customer aging report generated', {
      userId,
      recordCount: report.recordCount,
    });

    res.json({ success: true, data: report });
  },

  /**
   * Generate Stock Aging Report
   * GET /api/reports/stock-aging
   */
  async getStockAging(req: Request, res: Response, pool: Pool) {
    const params = StockAgingParamsSchema.parse(req.query);
    const userId = req.user?.id;

    const report = await reportsService.generateStockAging(pool, {
      asOfDate: params.as_of_date ? new Date(params.as_of_date) : undefined,
      categoryId: params.category_id,
      format: params.format,
      userId,
    });

    // PDF export
    if (params.format === 'pdf') {
      const companyName = await getCompanyName(pool);
      const pdfGen = new ReportPDFGenerator(companyName);
      const doc = pdfGen.getDocument();

      const date = new Date().toLocaleDateString('en-CA');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="stock-aging-${date}.pdf"`);
      doc.pipe(res);

      pdfGen.addHeader({
        companyName,
        title: 'Stock Aging Report',
        subtitle: params.as_of_date
          ? `As of ${formatDatePDF(new Date(params.as_of_date))}`
          : 'Current Stock',
        generatedAt: formatDateTime(),
      });

      pdfGen.addSummaryCards([
        {
          label: 'Total Batches',
          value: String(report.summary.totalBatches),
          color: PDFColors.primary,
        },
        {
          label: 'Total Value',
          value: formatCurrencyPDF(report.summary.totalValue),
          color: PDFColors.success,
        },
        {
          label: 'Avg Days in Stock',
          value: String(report.summary.averageDaysInStock),
          color: PDFColors.info,
        },
        {
          label: 'Oldest Batch',
          value: `${report.summary.oldestBatchDays} days`,
          color: PDFColors.warning,
        },
      ]);

      const columns: PDFTableColumn[] = [
        { header: 'Product', key: 'productName', width: 0.22 },
        { header: 'SKU', key: 'sku', width: 0.14 },
        { header: 'Batch', key: 'batchNumber', width: 0.16 },
        { header: 'Qty', key: 'remainingQuantity', width: 0.08, align: 'right' },
        {
          header: 'Value',
          key: 'totalValue',
          width: 0.14,
          align: 'right',
          format: (v) => formatCurrencyPDF(v),
        },
        { header: 'Days', key: 'daysInStock', width: 0.08, align: 'right' },
        { header: 'Expiry', key: 'expiryDate', width: 0.1 },
        {
          header: 'Days Left',
          key: 'daysUntilExpiry',
          width: 0.08,
          align: 'right',
          format: (v) => (v !== null ? String(v) : '-'),
        },
      ];

      pdfGen.addTable(columns, report.data);
      pdfGen.end();
      return;
    }

    logger.info('Stock aging report generated', {
      userId,
      recordCount: report.recordCount,
    });

    res.json({ success: true, data: report });
  },

  /**
   * Generate Waste & Damage Report
   * GET /api/reports/waste-damage
   */
  async getWasteDamage(req: Request, res: Response, pool: Pool) {
    const params = WasteDamageParamsSchema.parse(req.query);
    const userId = req.user?.id;

    const report = await reportsService.generateWasteDamageReport(pool, {
      startDate: new Date(params.start_date),
      endDate: new Date(params.end_date),
      reason: params.reason,
      format: params.format,
      userId,
    });

    // PDF export
    if (params.format === 'pdf') {
      const companyName = await getCompanyName(pool);
      const pdfGen = new ReportPDFGenerator(companyName);
      const doc = pdfGen.getDocument();

      const date = new Date().toLocaleDateString('en-CA');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="waste-damage-${date}.pdf"`);
      doc.pipe(res);

      const startDate = formatDatePDF(new Date(params.start_date));
      const endDate = formatDatePDF(new Date(params.end_date));

      pdfGen.addHeader({
        companyName,
        title: 'Waste & Damage Report',
        subtitle: `${startDate} to ${endDate}`,
        generatedAt: formatDateTime(),
      });

      pdfGen.addSummaryCards([
        {
          label: 'Total Events',
          value: String(report.summary.totalLossEvents),
          color: PDFColors.primary,
        },
        {
          label: 'Total Qty Lost',
          value: String(report.summary.totalQuantityLost),
          color: PDFColors.danger,
        },
        {
          label: 'Total Loss Value',
          value: formatCurrencyPDF(report.summary.totalLossValue),
          color: PDFColors.danger,
        },
        {
          label: 'Damage / Expiry',
          value: `${report.summary.damageCount} / ${report.summary.expiryCount}`,
          color: PDFColors.warning,
        },
      ]);

      const columns: PDFTableColumn[] = [
        { header: 'Date', key: 'lossDate', width: 0.12 },
        { header: 'Type', key: 'lossType', width: 0.1 },
        { header: 'Product', key: 'productName', width: 0.22 },
        { header: 'Batch', key: 'batchNumber', width: 0.14 },
        { header: 'Qty Lost', key: 'quantityLost', width: 0.1, align: 'right' },
        {
          header: 'Unit Cost',
          key: 'unitCost',
          width: 0.14,
          align: 'right',
          format: (v) => formatCurrencyPDF(v),
        },
        {
          header: 'Loss Value',
          key: 'totalLossValue',
          width: 0.18,
          align: 'right',
          format: (v) => formatCurrencyPDF(v),
        },
      ];

      pdfGen.addTable(columns, report.data);
      pdfGen.end();
      return;
    }

    logger.info('Waste & damage report generated', {
      userId,
      recordCount: report.recordCount,
    });

    res.json({ success: true, data: report });
  },

  /**
   * Generate Reorder Recommendations Report
   * GET /api/reports/reorder-recommendations
   */
  async getReorderRecommendations(req: Request, res: Response, pool: Pool) {
    const params = ReorderRecommendationsParamsSchema.parse(req.query);
    const userId = req.user?.id;

    const report = await reportsService.generateReorderRecommendations(pool, {
      categoryId: params.category_id,
      daysToConsider: params.days_to_consider,
      format: params.format,
      userId,
    });

    // PDF export
    if (params.format === 'pdf') {
      const companyName = await getCompanyName(pool);
      const pdfGen = new ReportPDFGenerator(companyName);
      const doc = pdfGen.getDocument();

      const date = new Date().toLocaleDateString('en-CA');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="reorder-recommendations-${date}.pdf"`
      );
      doc.pipe(res);

      pdfGen.addHeader({
        companyName,
        title: 'Smart Reorder AI Report',
        subtitle: `Analysis Period: ${params.days_to_consider || 30} Days | Lead Time Aware`,
        generatedAt: formatDateTime(),
      });

      pdfGen.addSummaryCards([
        {
          label: 'Products to Reorder',
          value: String(report.summary.totalProductsNeedingReorder),
          color: PDFColors.warning,
        },
        {
          label: 'Urgent Items',
          value: String(report.summary.urgentCount),
          color: PDFColors.danger,
        },
        {
          label: 'Est. Order Value',
          value: formatCurrencyPDF(report.summary.totalEstimatedCost),
          color: PDFColors.primary,
        },
        {
          label: 'Demand Trending Up',
          value: String(report.summary.trendingUp),
          color: PDFColors.info,
        },
      ]);

      const columns: PDFTableColumn[] = [
        { header: 'Product', key: 'productName', width: 0.18 },
        { header: 'Stock', key: 'currentStock', width: 0.07, align: 'right' },
        { header: 'Daily Avg', key: 'dailySalesVelocity', width: 0.08, align: 'right' },
        {
          header: 'Days Left',
          key: 'daysUntilStockout',
          width: 0.08,
          align: 'right',
          format: (v) => (v !== null ? String(v) : '-'),
        },
        {
          header: 'Lead Time',
          key: 'leadTimeDays',
          width: 0.08,
          align: 'right',
          format: (v) => `${v}d`,
        },
        { header: 'Safety', key: 'safetyStock', width: 0.07, align: 'right' },
        { header: 'Order Qty', key: 'suggestedOrderQuantity', width: 0.08, align: 'right' },
        { header: 'Trend', key: 'demandTrend', width: 0.1 },
        { header: 'Priority', key: 'priority', width: 0.08 },
        { header: 'Supplier', key: 'preferredSupplier', width: 0.18 },
      ];

      pdfGen.addTable(columns, report.data);
      pdfGen.end();
      return;
    }

    logger.info('Reorder recommendations report generated', {
      userId,
      recordCount: report.recordCount,
    });

    res.json({ success: true, data: report });
  },

  /**
   * Get list of available report types
   * GET /api/reports/types
   */
  async getReportTypes(req: Request, res: Response) {
    const reportTypes = [
      {
        id: 'inventory-valuation',
        name: 'Inventory Valuation',
        description: 'Current inventory value with FIFO/AVCO/LIFO methods',
        category: 'INVENTORY',
        parameters: ['as_of_date', 'category_id', 'valuation_method'],
      },
      {
        id: 'sales',
        name: 'Sales Report',
        description: 'Sales analysis grouped by various dimensions',
        category: 'SALES',
        parameters: ['start_date', 'end_date', 'group_by', 'customer_id'],
      },
      {
        id: 'expiring-items',
        name: 'Expiring Items',
        description: 'Items approaching or past expiry date',
        category: 'INVENTORY',
        parameters: ['days_threshold', 'category_id'],
      },
      {
        id: 'low-stock',
        name: 'Low Stock Alert',
        description: 'Items below reorder level',
        category: 'INVENTORY',
        parameters: ['threshold_percentage', 'category_id'],
      },
      {
        id: 'best-selling',
        name: 'Best Selling Products',
        description: 'Top selling products by quantity or revenue',
        category: 'SALES',
        parameters: ['start_date', 'end_date', 'limit', 'category_id'],
      },
      {
        id: 'supplier-cost-analysis',
        name: 'Supplier Cost Analysis',
        description: 'Supplier performance and cost metrics',
        category: 'PURCHASING',
        parameters: ['start_date', 'end_date', 'supplier_id'],
      },
      {
        id: 'goods-received',
        name: 'Goods Received',
        description: 'Detailed log of goods receipts',
        category: 'PURCHASING',
        parameters: ['start_date', 'end_date', 'supplier_id', 'product_id'],
      },
      {
        id: 'payments',
        name: 'Payment Report',
        description: 'Payment analysis by method',
        category: 'FINANCIAL',
        parameters: ['start_date', 'end_date', 'payment_method'],
      },
      {
        id: 'customer-payments',
        name: 'Customer Payments',
        description: 'Customer payment history and outstanding balances',
        category: 'FINANCIAL',
        parameters: ['start_date', 'end_date', 'customer_id', 'status'],
      },
      {
        id: 'profit-loss',
        name: 'Profit & Loss',
        description: 'Revenue, costs, and profitability analysis',
        category: 'FINANCIAL',
        parameters: ['start_date', 'end_date', 'group_by'],
      },
      {
        id: 'deleted-items',
        name: 'Deleted Items',
        description: 'Audit trail of deleted products',
        category: 'AUDIT',
        parameters: ['start_date', 'end_date'],
      },
      {
        id: 'inventory-adjustments',
        name: 'Inventory Adjustments',
        description: 'Stock adjustments and movements',
        category: 'INVENTORY',
        parameters: ['start_date', 'end_date', 'product_id'],
      },
      {
        id: 'purchase-order-summary',
        name: 'Purchase Order Summary',
        description: 'Overview of purchase orders by status and supplier',
        category: 'PURCHASING',
        parameters: ['start_date', 'end_date', 'status', 'supplier_id'],
      },
      {
        id: 'stock-movement-analysis',
        name: 'Stock Movement Analysis',
        description: 'Detailed analysis of stock movements and trends',
        category: 'INVENTORY',
        parameters: ['start_date', 'end_date', 'product_id', 'movement_type', 'group_by'],
      },
      {
        id: 'customer-account-statement',
        name: 'Customer Account Statement',
        description: 'Detailed customer account history and balances',
        category: 'FINANCIAL',
        parameters: ['customer_id', 'start_date', 'end_date'],
      },
      {
        id: 'profit-margin',
        name: 'Profit Margin by Product',
        description: 'Product-level profitability analysis',
        category: 'FINANCIAL',
        parameters: ['start_date', 'end_date', 'category_id', 'min_margin_percent'],
      },
      {
        id: 'daily-cash-flow',
        name: 'Daily Cash Flow',
        description: 'Daily cash in and out tracking',
        category: 'FINANCIAL',
        parameters: ['start_date', 'end_date', 'payment_method'],
      },
      {
        id: 'supplier-payment-status',
        name: 'Supplier Payment Status',
        description: 'Outstanding supplier payments and balances',
        category: 'PURCHASING',
        parameters: ['supplier_id', 'status'],
      },
      {
        id: 'top-customers',
        name: 'Top Customers',
        description: 'Customer ranking by revenue and purchases',
        category: 'SALES',
        parameters: ['start_date', 'end_date', 'limit', 'min_purchase_amount'],
      },
      {
        id: 'stock-aging',
        name: 'Stock Aging',
        description: 'Inventory aging analysis',
        category: 'INVENTORY',
        parameters: ['category_id', 'min_days_in_stock'],
      },
      {
        id: 'waste-damage',
        name: 'Waste & Damage',
        description: 'Track inventory losses from damage and expiry',
        category: 'AUDIT',
        parameters: ['start_date', 'end_date', 'product_id'],
      },
      {
        id: 'reorder-recommendations',
        name: 'Reorder Recommendations',
        description: 'Smart reorder suggestions based on sales velocity',
        category: 'INVENTORY',
        parameters: ['category_id', 'days_to_analyze'],
      },
      {
        id: 'delivery-notes',
        name: 'Delivery Notes',
        description: 'Delivery note listing with fulfillment status',
        category: 'SALES',
        parameters: ['start_date', 'end_date', 'customer_id', 'status'],
      },
      {
        id: 'quotations',
        name: 'Quotations',
        description: 'Quotation summary with conversion tracking',
        category: 'SALES',
        parameters: ['start_date', 'end_date', 'customer_id', 'status', 'quote_type'],
      },
      {
        id: 'manual-journal-entries',
        name: 'Manual Journal Entries',
        description: 'Manual journal entry audit log',
        category: 'FINANCIAL',
        parameters: ['start_date', 'end_date', 'status'],
      },
      {
        id: 'bank-transactions',
        name: 'Bank Transactions',
        description: 'Bank transaction listing with reconciliation status',
        category: 'FINANCIAL',
        parameters: ['start_date', 'end_date', 'bank_account_id', 'type', 'is_reconciled'],
      },
    ];

    res.json({ success: true, data: reportTypes });
  },

  /**
   * Generate Sales by Category Report
   * GET /api/reports/sales-by-category
   */
  async getSalesByCategory(req: Request, res: Response, pool: Pool) {
    const params = SalesByCategoryParamsSchema.parse(req.query);
    const userId = req.user?.id;

    const report = await reportsService.generateSalesByCategory(pool, {
      startDate: new Date(params.start_date),
      endDate: new Date(params.end_date),
      format: params.format,
      userId,
    });

    // PDF export
    if (params.format === 'pdf') {
      const companyName = await getCompanyName(pool);
      const pdfGen = new ReportPDFGenerator(companyName);
      const doc = pdfGen.getDocument();

      const date = new Date().toLocaleDateString('en-CA');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="sales-by-category-${date}.pdf"`);
      doc.pipe(res);

      const startDate = params.start_date
        ? formatDatePDF(new Date(params.start_date as string))
        : 'All Time';
      const endDate = params.end_date
        ? formatDatePDF(new Date(params.end_date as string))
        : 'Present';

      pdfGen.addHeader({
        companyName,
        title: 'Sales by Category Report',
        subtitle: `Category breakdown - ${startDate} to ${endDate}`,
        generatedAt: formatDateTime(),
      });

      pdfGen.addSummaryCards([
        {
          label: 'Total Categories',
          value: String(report.summary.totalCategories || 0),
          color: PDFColors.primary,
        },
        {
          label: 'Total Revenue',
          value: formatCurrencyPDF(report.summary.totalRevenue || 0),
          color: PDFColors.success,
        },
        {
          label: 'Total Profit',
          value: formatCurrencyPDF(report.summary.totalProfit || 0),
          color: PDFColors.secondary,
        },
        {
          label: 'Transactions',
          value: String(report.summary.totalTransactions || 0),
          color: PDFColors.info,
        },
      ]);

      const columns: PDFTableColumn[] = [
        { header: 'Category', key: 'category', width: 0.22 },
        { header: 'Products', key: 'productCount', width: 0.09, align: 'right' },
        { header: 'Qty Sold', key: 'totalQuantitySold', width: 0.09, align: 'right' },
        {
          header: 'Revenue',
          key: 'totalRevenue',
          width: 0.13,
          align: 'right',
          format: (v) => formatCurrencyPDF(v as number),
        },
        {
          header: 'Cost',
          key: 'totalCost',
          width: 0.12,
          align: 'right',
          format: (v) => formatCurrencyPDF(v as number),
        },
        {
          header: 'Gross Profit',
          key: 'grossProfit',
          width: 0.12,
          align: 'right',
          format: (v) => formatCurrencyPDF(v as number),
        },
        {
          header: 'Margin %',
          key: 'profitMargin',
          width: 0.09,
          align: 'right',
          format: (v) => String(v) + '%',
        },
        { header: 'Trans.', key: 'transactionCount', width: 0.08, align: 'right' },
        {
          header: 'Avg Trans.',
          key: 'averageTransactionValue',
          width: 0.06,
          align: 'right',
          format: (v) => formatCurrencyPDF(v as number),
        },
      ];

      // Ensure numeric values are passed raw; pdfGenerator will format using column formatters
      pdfGen.addTable(columns, report.data);
      pdfGen.end();
      return;
    }

    logger.info('Sales by category report generated', {
      userId,
      recordCount: report.recordCount,
    });

    res.json({ success: true, data: report });
  },

  /**
   * Generate Sales by Payment Method Report
   * GET /api/reports/sales-by-payment-method
   */
  async getSalesByPaymentMethod(req: Request, res: Response, pool: Pool) {
    const params = SalesByPaymentMethodParamsSchema.parse(req.query);
    const userId = req.user?.id;

    const report = await reportsService.generateSalesByPaymentMethod(pool, {
      startDate: new Date(params.start_date),
      endDate: new Date(params.end_date),
      format: params.format,
      userId,
    });

    // PDF export
    if (params.format === 'pdf') {
      const companyName = await getCompanyName(pool);
      const pdfGen = new ReportPDFGenerator(companyName);
      const doc = pdfGen.getDocument();

      const date = new Date().toLocaleDateString('en-CA');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="sales-by-payment-method-${date}.pdf"`
      );
      doc.pipe(res);

      const startDate = params.start_date
        ? formatDatePDF(new Date(params.start_date as string))
        : 'All Time';
      const endDate = params.end_date
        ? formatDatePDF(new Date(params.end_date as string))
        : 'Present';

      pdfGen.addHeader({
        companyName,
        title: 'Sales by Payment Method Report',
        subtitle: `Payment breakdown - ${startDate} to ${endDate}`,
        generatedAt: formatDateTime(),
      });

      pdfGen.addSummaryCards([
        {
          label: 'Payment Methods',
          value: String(report.summary.totalPaymentMethods || 0),
          color: PDFColors.primary,
        },
        {
          label: 'Total Revenue',
          value: formatCurrencyPDF(report.summary.totalRevenue || 0),
          color: PDFColors.success,
        },
        {
          label: 'Transactions',
          value: String(report.summary.totalTransactions || 0),
          color: PDFColors.info,
        },
        {
          label: 'Top Method',
          value: String(report.summary.topPaymentMethod || 'N/A'),
          color: PDFColors.secondary,
        },
      ]);

      const columns: PDFTableColumn[] = [
        { header: 'Payment Method', key: 'paymentMethod', width: 0.3 },
        { header: 'Transactions', key: 'transactionCount', width: 0.15, align: 'right' },
        {
          header: 'Total Revenue',
          key: 'totalRevenue',
          width: 0.2,
          align: 'right',
          format: (v) => formatCurrencyPDF(v as number),
        },
        {
          header: 'Avg Amount',
          key: 'averageAmount',
          width: 0.2,
          align: 'right',
          format: (v) => formatCurrencyPDF(v as number),
        },
        {
          header: '% of Total',
          key: 'percentageOfTotal',
          width: 0.15,
          align: 'right',
          format: (v) => String(v) + '%',
        },
      ];

      pdfGen.addTable(columns, report.data);
      pdfGen.end();
      return;
    }

    logger.info('Sales by payment method report generated', {
      userId,
      recordCount: report.recordCount,
    });

    res.json({ success: true, data: report });
  },

  /**
   * Generate Hourly Sales Analysis Report
   * GET /api/reports/hourly-sales-analysis
   */
  async getHourlySalesAnalysis(req: Request, res: Response, pool: Pool) {
    const params = HourlySalesAnalysisParamsSchema.parse(req.query);
    const userId = req.user?.id;

    const report = await reportsService.generateHourlySalesAnalysis(pool, {
      startDate: new Date(params.start_date),
      endDate: new Date(params.end_date),
      format: params.format,
      userId,
    });

    // PDF export
    if (params.format === 'pdf') {
      const companyName = await getCompanyName(pool);
      const pdfGen = new ReportPDFGenerator(companyName);
      const doc = pdfGen.getDocument();

      const date = new Date().toLocaleDateString('en-CA');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="hourly-sales-${date}.pdf"`);
      doc.pipe(res);

      const startDate = formatDatePDF(new Date(params.start_date));
      const endDate = formatDatePDF(new Date(params.end_date));

      pdfGen.addHeader({
        companyName,
        title: 'Hourly Sales Analysis Report',
        subtitle: `${startDate} to ${endDate}`,
        generatedAt: formatDateTime(),
      });

      pdfGen.addSummaryCards([
        {
          label: 'Peak Hour',
          value: String(report.summary.peakHour || 'N/A'),
          color: PDFColors.primary,
        },
        {
          label: 'Peak Revenue',
          value: formatCurrencyPDF(report.summary.peakHourRevenue || 0),
          color: PDFColors.success,
        },
        {
          label: 'Total Revenue',
          value: formatCurrencyPDF(report.summary.totalRevenue || 0),
          color: PDFColors.info,
        },
        {
          label: 'Avg/Hour',
          value: formatCurrencyPDF(
            report.summary.totalHours
              ? (report.summary.totalRevenue || 0) / report.summary.totalHours
              : 0
          ),
          color: PDFColors.secondary,
        },
      ]);

      const columns: PDFTableColumn[] = [
        { header: 'Hour', key: 'hour', width: 0.15 },
        { header: 'Transactions', key: 'transactionCount', width: 0.17, align: 'right' },
        {
          header: 'Revenue',
          key: 'totalRevenue',
          width: 0.22,
          align: 'right',
          format: (v) => formatCurrencyPDF(v),
        },
        {
          header: 'Avg Transaction',
          key: 'avgTransaction',
          width: 0.22,
          align: 'right',
          format: (v) => formatCurrencyPDF(v),
        },
        {
          header: '% of Total',
          key: 'percentOfTotal',
          width: 0.24,
          align: 'right',
          format: (v) => `${Number(v).toFixed(1)}%`,
        },
      ];

      pdfGen.addTable(columns, report.data);
      pdfGen.end();
      return;
    }

    logger.info('Hourly sales analysis report generated', {
      userId,
      recordCount: report.recordCount,
    });

    res.json({ success: true, data: report });
  },

  /**
   * Generate Sales Comparison Report
   * GET /api/reports/sales-comparison
   */
  async getSalesComparison(req: Request, res: Response, pool: Pool) {
    const params = SalesComparisonParamsSchema.parse(req.query);
    const userId = req.user?.id;

    const report = await reportsService.generateSalesComparison(pool, {
      currentStartDate: new Date(params.current_start_date),
      currentEndDate: new Date(params.current_end_date),
      previousStartDate: new Date(params.previous_start_date),
      previousEndDate: new Date(params.previous_end_date),
      groupBy: params.group_by,
      format: params.format,
      userId,
    });

    // PDF export
    if (params.format === 'pdf') {
      const companyName = await getCompanyName(pool);
      const pdfGen = new ReportPDFGenerator(companyName);
      const doc = pdfGen.getDocument();

      const date = new Date().toLocaleDateString('en-CA');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="sales-comparison-${date}.pdf"`);
      doc.pipe(res);

      const currentStart = formatDatePDF(new Date(params.current_start_date));
      const currentEnd = formatDatePDF(new Date(params.current_end_date));

      pdfGen.addHeader({
        companyName,
        title: 'Sales Comparison Report',
        subtitle: `Comparing periods ending ${currentEnd}`,
        generatedAt: formatDateTime(),
      });

      pdfGen.addSummaryCards([
        {
          label: 'Current Revenue',
          value: formatCurrencyPDF(report.summary.currentPeriodSales || 0),
          color: PDFColors.primary,
        },
        {
          label: 'Previous Revenue',
          value: formatCurrencyPDF(report.summary.previousPeriodSales || 0),
          color: PDFColors.secondary,
        },
        {
          label: 'Change',
          value: `${(report.summary.overallPercentageChange || 0).toFixed(1)}%`,
          color:
            (report.summary.overallPercentageChange || 0) >= 0
              ? PDFColors.success
              : PDFColors.danger,
        },
        {
          label: 'Growth',
          value: formatCurrencyPDF(report.summary.totalDifference || 0),
          color: PDFColors.info,
        },
      ]);

      const columns: PDFTableColumn[] = [
        { header: 'Period', key: 'period', width: 0.18 },
        {
          header: 'Current',
          key: 'currentSales',
          width: 0.2,
          align: 'right',
          format: (v) => formatCurrencyPDF(v),
        },
        {
          header: 'Previous',
          key: 'previousSales',
          width: 0.2,
          align: 'right',
          format: (v) => formatCurrencyPDF(v),
        },
        {
          header: 'Change',
          key: 'difference',
          width: 0.2,
          align: 'right',
          format: (v) => formatCurrencyPDF(v),
        },
        {
          header: '% Change',
          key: 'percentageChange',
          width: 0.22,
          align: 'right',
          format: (v) => `${Number(v || 0).toFixed(1)}%`,
        },
      ];

      pdfGen.addTable(columns, report.data);
      pdfGen.end();
      return;
    }

    logger.info('Sales comparison report generated', {
      userId,
      recordCount: report.recordCount,
    });

    res.json({ success: true, data: report });
  },

  /**
   * Generate Customer Purchase History Report
   * GET /api/reports/customer-purchase-history
   */
  async getCustomerPurchaseHistory(req: Request, res: Response, pool: Pool) {
    const params = CustomerPurchaseHistoryParamsSchema.parse(req.query);
    const userId = req.user?.id;

    const report = await reportsService.generateCustomerPurchaseHistory(pool, {
      customerId: params.customer_id,
      startDate: new Date(params.start_date),
      endDate: new Date(params.end_date),
      format: params.format,
      userId,
    });

    // PDF export
    if (params.format === 'pdf') {
      const companyName = await getCompanyName(pool);
      const pdfGen = new ReportPDFGenerator(companyName);
      const doc = pdfGen.getDocument();

      const date = new Date().toLocaleDateString('en-CA');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="customer-history-${date}.pdf"`);
      doc.pipe(res);

      const startDate = formatDatePDF(new Date(params.start_date));
      const endDate = formatDatePDF(new Date(params.end_date));
      const customerName =
        Array.isArray(report.data) && report.data.length > 0
          ? report.data[0]?.customerName || params.customer_id
          : params.customer_id;

      pdfGen.addHeader({
        companyName,
        title: 'Customer Purchase History',
        subtitle: `${customerName} - ${startDate} to ${endDate}`,
        generatedAt: formatDateTime(),
      });

      pdfGen.addSummaryCards([
        {
          label: 'Total Purchases',
          value: String(report.summary.totalPurchases || 0),
          color: PDFColors.primary,
        },
        {
          label: 'Total Spent',
          value: formatCurrencyPDF(report.summary.totalSpent || 0),
          color: PDFColors.success,
        },
        {
          label: 'Avg Order',
          value: formatCurrencyPDF(report.summary.averagePurchaseValue || 0),
          color: PDFColors.info,
        },
        {
          label: 'Outstanding',
          value: formatCurrencyPDF(report.summary.totalOutstanding || 0),
          color: PDFColors.secondary,
        },
      ]);

      const columns: PDFTableColumn[] = [
        { header: 'Date', key: 'saleDate', width: 0.14 },
        { header: 'Invoice #', key: 'saleNumber', width: 0.16 },
        { header: 'Items', key: 'itemCount', width: 0.1, align: 'right' },
        {
          header: 'Subtotal',
          key: 'subtotal',
          width: 0.16,
          align: 'right',
          format: (v) => formatCurrencyPDF(v),
        },
        {
          header: 'Total',
          key: 'totalAmount',
          width: 0.16,
          align: 'right',
          format: (v) => formatCurrencyPDF(v),
        },
        { header: 'Payment', key: 'paymentMethod', width: 0.14 },
        { header: 'Status', key: 'status', width: 0.14 },
      ];

      pdfGen.addTable(columns, report.data || []);
      pdfGen.end();
      return;
    }

    logger.info('Customer purchase history report generated', {
      userId,
      customerId: params.customer_id,
      recordCount: report.recordCount,
    });

    res.json({ success: true, data: report });
  },

  /**
   * Generate Sales Summary by Date Report
   * GET /api/reports/sales-summary-by-date
   */
  async getSalesSummaryByDateReport(req: Request, res: Response, pool: Pool) {
    const {
      start_date,
      end_date,
      group_by: groupBy,
      format,
    } = SalesSummaryByDateQuerySchema.parse(req.query);
    const userId = req.user?.id;

    const filters: Record<string, string | number | Date | undefined> = {};
    if (start_date) filters.startDate = new Date(start_date);
    if (end_date) filters.endDate = adjustEndDate(end_date);

    // Import salesService
    const { salesService } = await import('../sales/salesService.js');
    const result = await salesService.getSalesSummaryByDate(
      pool,
      groupBy as 'day' | 'week' | 'month',
      filters
    );

    // Calculate summary using Decimal.js for precision
    // NOTE: Repository returns snake_case field names from PostgreSQL
    const summary =
      result.length > 0
        ? {
          totalRevenue: result
            .reduce(
              (sum: Decimal, item: Record<string, unknown>) => sum.plus(item.total_revenue || 0),
              new Decimal(0)
            )
            .toDecimalPlaces(2)
            .toNumber(),
          totalProfit: result
            .reduce(
              (sum: Decimal, item: Record<string, unknown>) => sum.plus(item.total_profit || 0),
              new Decimal(0)
            )
            .toDecimalPlaces(2)
            .toNumber(),
          totalTransactions: result.reduce(
            (sum: number, item: Record<string, unknown>) =>
              sum + parseInt(String(item.transaction_count ?? '0'), 10),
            0
          ),
          averageRevenue:
            result.length > 0
              ? result
                .reduce(
                  (sum: Decimal, item: Record<string, unknown>) =>
                    sum.plus(Number(item.total_revenue) || 0),
                  new Decimal(0)
                )
                .dividedBy(result.length)
                .toDecimalPlaces(2)
                .toNumber()
              : 0,
          periodCount: result.length,
        }
        : {
          totalRevenue: 0,
          totalProfit: 0,
          totalTransactions: 0,
          averageRevenue: 0,
          periodCount: 0,
        };

    // PDF export
    if (format === 'pdf') {
      const companyName = await getCompanyName(pool);
      const pdfGen = new ReportPDFGenerator(companyName);
      const doc = pdfGen.getDocument();

      const date = new Date().toLocaleDateString('en-CA');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="sales-summary-${groupBy}-${date}.pdf"`
      );
      doc.pipe(res);

      const startDate = start_date ? formatDatePDF(new Date(start_date as string)) : 'All Time';
      const endDate = end_date ? formatDatePDF(new Date(end_date as string)) : 'Present';

      pdfGen.addHeader({
        companyName,
        title: 'Sales Summary by Date',
        subtitle: `Grouped by ${groupBy.toUpperCase()} - ${startDate} to ${endDate}`,
        generatedAt: formatDateTime(),
      });

      pdfGen.addSummaryCards([
        {
          label: 'Total Revenue',
          value: formatCurrencyPDF(summary.totalRevenue),
          color: PDFColors.success,
        },
        {
          label: 'Total Profit',
          value: formatCurrencyPDF(summary.totalProfit),
          color: PDFColors.primary,
        },
        {
          label: 'Total Transactions',
          value: String(summary.totalTransactions),
          color: PDFColors.info,
        },
        {
          label: 'Avg Transaction',
          value: formatCurrencyPDF(summary.averageRevenue),
          color: PDFColors.secondary,
        },
      ]);

      const columns: PDFTableColumn[] = [
        { header: 'Period', key: 'period', width: 0.2 },
        { header: 'Transactions', key: 'transactionCount', width: 0.13 },
        {
          header: 'Revenue',
          key: 'totalRevenue',
          width: 0.15,
          align: 'right',
          format: (v) => formatCurrencyPDF(v),
        },
        {
          header: 'Cost',
          key: 'totalCost',
          width: 0.15,
          align: 'right',
          format: (v) => formatCurrencyPDF(v),
        },
        {
          header: 'Profit',
          key: 'totalProfit',
          width: 0.15,
          align: 'right',
          format: (v) => formatCurrencyPDF(v),
        },
        {
          header: 'Margin %',
          key: 'profitMarginPercentage',
          width: 0.12,
          align: 'right',
          format: (v) => v + '%',
        },
        {
          header: 'Avg Trans. Value',
          key: 'avgTransactionValue',
          width: 0.1,
          align: 'right',
          format: (v) => formatCurrencyPDF(v),
        },
      ];

      pdfGen.addTable(columns, result);
      pdfGen.end();
      return;
    }

    // JSON response
    const report = {
      reportType: 'SALES_SUMMARY_BY_DATE',
      reportName: 'Sales Summary by Date',
      generatedAt: formatDateTime(),
      generatedBy: userId,
      parameters: { groupBy, ...filters, format },
      data: result,
      recordCount: result.length,
      executionTimeMs: 0,
      summary,
    };

    logger.info('Sales summary by date report generated', {
      userId,
      groupBy,
      recordCount: report.recordCount,
    });

    res.json({ success: true, data: report });
  },

  /**
   * Generate Sales Details Report
   * GET /api/reports/sales-details
   */
  async getSalesDetailsReport(req: Request, res: Response, pool: Pool) {
    const { start_date, end_date, product_id, format } = SalesDetailsQuerySchema.parse(req.query);
    const userId = req.user?.id;

    const filters: Record<string, string | number | Date | undefined> = {};
    if (start_date) filters.startDate = new Date(start_date);
    if (end_date) filters.endDate = adjustEndDate(end_date);
    if (product_id) filters.productId = product_id;

    // Import salesService
    const { salesService } = await import('../sales/salesService.js');
    const result = await salesService.getSalesDetailsReport(pool, filters);

    const summary =
      result.length > 0
        ? {
          totalQuantity: result
            .reduce(
              (sum: Decimal, item: Record<string, unknown>) => sum.plus(item.total_quantity || 0),
              new Decimal(0)
            )
            .toDecimalPlaces(3)
            .toNumber(),
          totalRevenue: result
            .reduce(
              (sum: Decimal, item: Record<string, unknown>) => sum.plus(item.total_revenue || 0),
              new Decimal(0)
            )
            .toDecimalPlaces(2)
            .toNumber(),
          avgProfitMargin:
            result.length > 0
              ? result
                .reduce(
                  (sum: Decimal, item: Record<string, unknown>) =>
                    sum.plus(item.profit_margin_percent || 0),
                  new Decimal(0)
                )
                .dividedBy(result.length)
                .toDecimalPlaces(2)
                .toNumber() + '%'
              : '0%',
          uniqueProducts: new Set(
            result.map((item: Record<string, unknown>) => item.product_name)
          ).size,
          transactionCount: result.reduce(
            (sum: number, item: Record<string, unknown>) =>
              sum + parseInt(String(item.transaction_count ?? '0'), 10),
            0
          ),
        }
        : {};

    // Handle PDF format
    if (format === 'pdf') {
      const companyName = await getCompanyName(pool);
      const pdfGen = new ReportPDFGenerator(companyName);
      const doc = pdfGen.getDocument();

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="sales-details-${new Date().toISOString().slice(0, 10)}.pdf"`
      );
      doc.pipe(res);

      // Header
      pdfGen.addHeader({
        companyName,
        title: 'Sales Details Report',
        subtitle: `Product Sales by Date - ${filters.startDate ? formatDatePDF(filters.startDate as Date) : 'All'} to ${filters.endDate ? formatDatePDF(filters.endDate as Date) : 'All'}`,
        generatedAt: formatDateTime(),
      });

      // Summary cards
      pdfGen.addSummaryCards([
        {
          label: 'Total Revenue',
          value: formatCurrencyPDF(summary.totalRevenue || 0),
          color: PDFColors.success,
        },
        {
          label: 'Total Quantity',
          value: formatQuantityPDF(summary.totalQuantity || 0),
          color: PDFColors.info,
        },
        {
          label: 'Avg Profit Margin',
          value: summary.avgProfitMargin || '0%',
          color: PDFColors.primary,
        },
        {
          label: 'Transactions',
          value: String(summary.transactionCount || 0),
          color: PDFColors.secondary,
        },
      ]);

      // Table
      const columns: PDFTableColumn[] = [
        { header: 'Date', key: 'sale_date', width: 0.12, align: 'left' },
        { header: 'Product', key: 'product_name', width: 0.22, align: 'left' },
        { header: 'SKU', key: 'sku', width: 0.12, align: 'left' },
        { header: 'UOM', key: 'unit_of_measure', width: 0.08, align: 'center' },
        {
          header: 'Qty',
          key: 'total_quantity',
          width: 0.11,
          align: 'right',
          format: (v) => formatQuantityPDF(v),
        },
        {
          header: 'Avg Price',
          key: 'avg_unit_price',
          width: 0.11,
          align: 'right',
          format: (v) => formatCurrencyPDF(v),
        },
        {
          header: 'Revenue',
          key: 'total_revenue',
          width: 0.12,
          align: 'right',
          format: (v) => formatCurrencyPDF(v),
        },
        {
          header: 'Margin %',
          key: 'profit_margin_percent',
          width: 0.12,
          align: 'right',
          format: (v) => v + '%',
        },
      ];

      pdfGen.addTable(columns, result);
      pdfGen.end();
      return;
    }

    // JSON response
    const report = {
      reportType: 'SALES_DETAILS_REPORT',
      reportName: 'Sales Details Report',
      generatedAt: formatDateTime(),
      generatedBy: userId,
      parameters: { ...filters, format },
      data: result,
      recordCount: result.length,
      executionTimeMs: 0,
      summary,
    };

    logger.info('Sales details report generated', {
      userId,
      recordCount: report.recordCount,
    });

    res.json({ success: true, data: report });
  },

  /**
   * Generate Sales by Cashier Report
   * GET /api/reports/sales-by-cashier
   */
  async getSalesByCashierReport(req: Request, res: Response, pool: Pool) {
    const { start_date, end_date, user_id, format } = SalesByCashierQuerySchema.parse(req.query);
    const userId = req.user?.id;

    const filters: Record<string, string | number | Date | undefined> = {};
    if (start_date) filters.startDate = new Date(start_date);
    if (end_date) filters.endDate = adjustEndDate(end_date);
    if (user_id) filters.userId = user_id;

    // Import salesService
    const { salesService } = await import('../sales/salesService.js');
    const result = await salesService.getSalesByCashier(pool, filters);

    // Calculate summary using Decimal.js
    // NOTE: Repository returns snake_case field names from PostgreSQL
    const summary =
      result.length > 0
        ? {
          totalTransactions: result.reduce(
            (sum: number, item: Record<string, unknown>) =>
              sum + parseInt(String(item.total_transactions ?? '0'), 10),
            0
          ),
          totalRevenue: result
            .reduce(
              (sum: Decimal, item: Record<string, unknown>) =>
                sum.plus(Number(item.total_revenue) || 0),
              new Decimal(0)
            )
            .toDecimalPlaces(2)
            .toNumber(),
          totalProfit: result
            .reduce(
              (sum: Decimal, item: Record<string, unknown>) =>
                sum.plus(Number(item.total_profit) || 0),
              new Decimal(0)
            )
            .toDecimalPlaces(2)
            .toNumber(),
          averageTransactionValue:
            result.length > 0
              ? result
                .reduce(
                  (sum: Decimal, item: Record<string, unknown>) =>
                    sum.plus(Number(item.avg_transaction_value) || 0),
                  new Decimal(0)
                )
                .dividedBy(result.length)
                .toDecimalPlaces(2)
                .toNumber()
              : 0,
          totalCashiers: result.length,
        }
        : {
          totalTransactions: 0,
          totalRevenue: 0,
          totalProfit: 0,
          averageTransactionValue: 0,
          totalCashiers: 0,
        };

    // PDF export
    if (format === 'pdf') {
      const companyName = await getCompanyName(pool);
      const pdfGen = new ReportPDFGenerator(companyName);
      const doc = pdfGen.getDocument();

      const date = new Date().toLocaleDateString('en-CA');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="sales-by-cashier-${date}.pdf"`);
      doc.pipe(res);

      const startDate = start_date ? formatDatePDF(new Date(start_date as string)) : 'All Time';
      const endDate = end_date ? formatDatePDF(new Date(end_date as string)) : 'Present';

      pdfGen.addHeader({
        companyName,
        title: 'Sales by Cashier Report',
        subtitle: `Performance Overview - ${startDate} to ${endDate}`,
        generatedAt: formatDateTime(),
      });

      pdfGen.addSummaryCards([
        {
          label: 'Total Revenue',
          value: formatCurrencyPDF(summary.totalRevenue),
          color: PDFColors.success,
        },
        {
          label: 'Total Transactions',
          value: String(summary.totalTransactions),
          color: PDFColors.info,
        },
        { label: 'Total Cashiers', value: String(summary.totalCashiers), color: PDFColors.primary },
        {
          label: 'Avg Revenue/Cashier',
          value: formatCurrencyPDF(summary.totalRevenue / summary.totalCashiers || 0),
          color: PDFColors.secondary,
        },
      ]);

      const columns: PDFTableColumn[] = [
        { header: 'Cashier', key: 'fullName', width: 0.15 },
        { header: 'Email', key: 'email', width: 0.12 },
        { header: 'Role', key: 'role', width: 0.1 },
        { header: 'Trans.', key: 'totalTransactions', width: 0.08 },
        {
          header: 'Revenue',
          key: 'totalRevenue',
          width: 0.12,
          align: 'right',
          format: (v) => formatCurrencyPDF(v),
        },
        {
          header: 'Cost',
          key: 'totalCost',
          width: 0.12,
          align: 'right',
          format: (v) => formatCurrencyPDF(v),
        },
        {
          header: 'Profit',
          key: 'totalProfit',
          width: 0.12,
          align: 'right',
          format: (v) => formatCurrencyPDF(v),
        },
        {
          header: 'Margin %',
          key: 'profitMargin',
          width: 0.1,
          align: 'right',
          format: (v) => v + '%',
        },
        {
          header: 'Avg Trans.',
          key: 'avgTransactionValue',
          width: 0.09,
          align: 'right',
          format: (v) => formatCurrencyPDF(v),
        },
      ];

      pdfGen.addTable(columns, result);
      pdfGen.end();
      return;
    }

    // JSON response
    const report = {
      reportType: 'SALES_BY_CASHIER',
      reportName: 'Sales by Cashier',
      generatedAt: formatDateTime(),
      generatedBy: userId,
      parameters: { ...filters, format },
      data: result,
      recordCount: result.length,
      executionTimeMs: 0,
      summary,
    };

    logger.info('Sales by cashier report generated', {
      userId,
      recordCount: report.recordCount,
    });

    res.json({ success: true, data: report });
  },

  /**
   * Unified Report Generation Dispatcher
   * POST /api/reports/generate
   * Routes to appropriate report controller based on reportType
   */
  async generateReport(req: Request, res: Response, pool: Pool) {
    const { reportType, ...params } = req.body;

    if (!reportType) {
      return res.status(400).json({
        success: false,
        error: 'Report type is required',
      });
    }

    // Create a proxy request object with custom query and params properties
    let queryParams: Record<string, unknown> = {};
    const requestParams: Record<string, string> = { ...req.params };
    const modifiedReq = new Proxy(req, {
      get(target, prop, receiver) {
        if (prop === 'query') {
          return queryParams;
        }
        if (prop === 'params') {
          return requestParams;
        }
        return Reflect.get(target, prop, receiver);
      },
    }) as unknown as Request;

    // Route to appropriate controller based on reportType
    switch (reportType) {
      case 'INVENTORY_VALUATION':
        queryParams = {
          as_of_date: params.asOfDate,
          category_id: params.categoryId,
          valuation_method: params.valuationMethod,
          format: params.format,
        };
        return await reportsController.getInventoryValuation(modifiedReq, res, pool);

      case 'SALES_REPORT':
        queryParams = {
          start_date: params.startDate,
          end_date: params.endDate,
          group_by: params.groupBy,
          customer_id: params.customerId,
          format: params.format,
        };
        return await reportsController.getSalesReport(modifiedReq, res, pool);

      case 'EXPIRING_ITEMS':
        queryParams = {
          days_threshold: params.daysAhead,
          category_id: params.categoryId,
          format: params.format,
        };
        return await reportsController.getExpiringItems(modifiedReq, res, pool);

      case 'LOW_STOCK':
        queryParams = {
          threshold_percentage: params.threshold,
          category_id: params.categoryId,
          format: params.format,
        };
        return await reportsController.getLowStock(modifiedReq, res, pool);

      case 'BEST_SELLING_PRODUCTS':
        queryParams = {
          start_date: params.startDate,
          end_date: params.endDate,
          limit: params.limit,
          category_id: params.categoryId,
          format: params.format,
        };
        return await reportsController.getBestSelling(modifiedReq, res, pool);

      case 'SUPPLIER_COST_ANALYSIS':
        queryParams = {
          start_date: params.startDate,
          end_date: params.endDate,
          supplier_id: params.supplierId,
          format: params.format,
        };
        return await reportsController.getSupplierCostAnalysis(modifiedReq, res, pool);

      case 'GOODS_RECEIVED':
        queryParams = {
          start_date: params.startDate,
          end_date: params.endDate,
          supplier_id: params.supplierId,
          product_id: params.productId,
          format: params.format,
        };
        return await reportsController.getGoodsReceived(modifiedReq, res, pool);

      case 'PAYMENT_REPORT':
        queryParams = {
          start_date: params.startDate,
          end_date: params.endDate,
          payment_method: params.paymentMethod,
          format: params.format,
        };
        return await reportsController.getPaymentReport(modifiedReq, res, pool);

      case 'CUSTOMER_PAYMENTS':
        queryParams = {
          start_date: params.startDate,
          end_date: params.endDate,
          customer_id: params.customerId,
          status: params.status,
          format: params.format,
        };
        return await reportsController.getCustomerPayments(modifiedReq, res, pool);

      case 'PROFIT_LOSS':
        queryParams = {
          start_date: params.startDate,
          end_date: params.endDate,
          group_by: params.groupBy,
          format: params.format,
        };
        return await reportsController.getProfitLoss(modifiedReq, res, pool);

      case 'DELETED_ITEMS':
        queryParams = {
          start_date: params.startDate,
          end_date: params.endDate,
          format: params.format,
        };
        return await reportsController.getDeletedItems(modifiedReq, res, pool);

      case 'INVENTORY_ADJUSTMENTS':
        queryParams = {
          start_date: params.startDate,
          end_date: params.endDate,
          product_id: params.productId,
          format: params.format,
        };
        return await reportsController.getInventoryAdjustments(modifiedReq, res, pool);

      case 'PURCHASE_ORDER_SUMMARY':
        queryParams = {
          start_date: params.startDate,
          end_date: params.endDate,
          status: params.status,
          supplier_id: params.supplierId,
          format: params.format,
        };
        return await reportsController.getPurchaseOrderSummary(modifiedReq, res, pool);

      case 'STOCK_MOVEMENT_ANALYSIS':
        queryParams = {
          start_date: params.startDate,
          end_date: params.endDate,
          product_id: params.productId,
          movement_type: params.movementType,
          format: params.format,
        };
        return await reportsController.getStockMovementAnalysis(modifiedReq, res, pool);

      case 'CUSTOMER_ACCOUNT_STATEMENT':
        queryParams = {
          customer_number: params.customerNumber,
          start_date: params.startDate,
          end_date: params.endDate,
          format: params.format || 'json',
        };
        return await reportsController.getCustomerAccountStatement(modifiedReq, res, pool);

      case 'PROFIT_MARGIN_BY_PRODUCT':
        queryParams = {
          start_date: params.startDate,
          end_date: params.endDate,
          category_id: params.categoryId,
          min_margin: params.minMargin,
          format: params.format,
        };
        return await reportsController.getProfitMarginByProduct(modifiedReq, res, pool);

      case 'DAILY_CASH_FLOW':
        queryParams = {
          start_date: params.startDate,
          end_date: params.endDate,
          format: params.format,
        };
        return await reportsController.getDailyCashFlow(modifiedReq, res, pool);

      case 'SUPPLIER_PAYMENT_STATUS':
        queryParams = {
          supplier_id: params.supplierId,
          status: params.status,
          format: params.format,
        };
        return await reportsController.getSupplierPaymentStatus(modifiedReq, res, pool);

      case 'TOP_CUSTOMERS':
        queryParams = {
          start_date: params.startDate,
          end_date: params.endDate,
          limit: params.limit,
          sort_by: params.sortBy,
          format: params.format,
        };
        return await reportsController.getTopCustomers(modifiedReq, res, pool);

      case 'CUSTOMER_AGING_REPORT':
        queryParams = {
          format: params.format,
        };
        return await reportsController.getCustomerAging(modifiedReq, res, pool);

      case 'STOCK_AGING':
        queryParams = {
          as_of_date: params.asOfDate,
          category_id: params.categoryId,
          format: params.format,
        };
        return await reportsController.getStockAging(modifiedReq, res, pool);

      case 'WASTE_DAMAGE_REPORT':
        queryParams = {
          start_date: params.startDate,
          end_date: params.endDate,
          reason: params.reason,
          format: params.format || 'json',
        };
        return await reportsController.getWasteDamage(modifiedReq, res, pool);

      case 'REORDER_RECOMMENDATIONS':
        queryParams = {
          category_id: params.categoryId,
          days_to_consider: params.daysToConsider,
          format: params.format,
        };
        return await reportsController.getReorderRecommendations(modifiedReq, res, pool);

      case 'SALES_BY_CATEGORY':
        queryParams = {
          start_date: params.startDate,
          end_date: params.endDate,
          format: params.format,
        };
        return await reportsController.getSalesByCategory(modifiedReq, res, pool);

      case 'SALES_BY_PAYMENT_METHOD':
        queryParams = {
          start_date: params.startDate,
          end_date: params.endDate,
          format: params.format,
        };
        return await reportsController.getSalesByPaymentMethod(modifiedReq, res, pool);

      case 'HOURLY_SALES_ANALYSIS':
        queryParams = {
          start_date: params.startDate,
          end_date: params.endDate,
          format: params.format,
        };
        return await reportsController.getHourlySalesAnalysis(modifiedReq, res, pool);

      case 'SALES_COMPARISON':
        queryParams = {
          current_start_date: params.currentStartDate,
          current_end_date: params.currentEndDate,
          previous_start_date: params.previousStartDate,
          previous_end_date: params.previousEndDate,
          group_by: params.groupBy,
          format: params.format,
        };
        return await reportsController.getSalesComparison(modifiedReq, res, pool);

      case 'CUSTOMER_PURCHASE_HISTORY':
        queryParams = {
          customer_id: params.customerId,
          start_date: params.startDate,
          end_date: params.endDate,
          format: params.format,
        };
        return await reportsController.getCustomerPurchaseHistory(modifiedReq, res, pool);

      case 'SALES_SUMMARY_BY_DATE':
        queryParams = {
          start_date: params.startDate,
          end_date: params.endDate,
          group_by: params.groupBy || 'day',
          format: params.format,
        };
        return await reportsController.getSalesSummaryByDateReport(modifiedReq, res, pool);

      case 'SALES_DETAILS_REPORT':
        queryParams = {
          start_date: params.startDate,
          end_date: params.endDate,
          product_id: params.productId,
          customer_id: params.customerId,
          format: params.format,
        };
        return await reportsController.getSalesDetailsReport(modifiedReq, res, pool);

      case 'SALES_BY_CASHIER':
        queryParams = {
          start_date: params.startDate,
          end_date: params.endDate,
          user_id: params.userId,
          format: params.format,
        };
        return await reportsController.getSalesByCashierReport(modifiedReq, res, pool);

      case 'BUSINESS_POSITION':
        queryParams = {
          report_date: params.reportDate,
          include_comparisons: params.includeComparisons,
          include_forecasts: params.includeForecasts,
          format: params.format,
        };
        return await reportsController.getBusinessPositionReport(modifiedReq, res, pool);

      case 'CASH_REGISTER_SESSION':
        // Special case: session ID comes from params, set it in request params
        requestParams.sessionId = params.sessionId;
        return await reportsController.getCashRegisterSessionSummary(modifiedReq, res, pool);

      case 'CASH_REGISTER_MOVEMENT_BREAKDOWN':
        queryParams = {
          startDate: params.startDate,
          endDate: params.endDate,
          format: params.format,
        };
        return await reportsController.getCashRegisterMovementBreakdown(modifiedReq, res, pool);

      case 'CASH_REGISTER_SESSION_HISTORY':
        queryParams = {
          startDate: params.startDate,
          endDate: params.endDate,
          userId: params.cashierId,
          format: params.format,
        };
        return await reportsController.getCashRegisterSessionHistory(modifiedReq, res, pool);

      case 'DELIVERY_NOTES':
        queryParams = {
          start_date: params.startDate,
          end_date: params.endDate,
          customer_id: params.customerId,
          status: params.status,
          format: params.format,
        };
        return await reportsController.getDeliveryNoteReport(modifiedReq, res, pool);

      case 'QUOTATIONS':
        queryParams = {
          start_date: params.startDate,
          end_date: params.endDate,
          customer_id: params.customerId,
          status: params.status,
          quote_type: params.quoteType,
          format: params.format,
        };
        return await reportsController.getQuotationReport(modifiedReq, res, pool);

      case 'MANUAL_JOURNAL_ENTRIES':
        queryParams = {
          start_date: params.startDate,
          end_date: params.endDate,
          status: params.status,
          format: params.format,
        };
        return await reportsController.getManualJournalEntryReport(modifiedReq, res, pool);

      case 'BANK_TRANSACTIONS':
        queryParams = {
          start_date: params.startDate,
          end_date: params.endDate,
          bank_account_id: params.bankAccountId,
          type: params.type,
          is_reconciled: params.isReconciled,
          format: params.format,
        };
        return await reportsController.getBankTransactionReport(modifiedReq, res, pool);

      default:
        return res.status(400).json({
          success: false,
          error: `Unknown report type: ${reportType}`,
        });
    }
  },

  /**
   * Generate Comprehensive Business Position Report
   * GET /api/reports/business-position
   */
  async getBusinessPositionReport(req: Request, res: Response, pool: Pool) {
    const reportDate = req.query.report_date
      ? new Date(req.query.report_date as string)
      : new Date();
    const includeComparisons = req.query.include_comparisons === 'true';
    const includeForecasts = req.query.include_forecasts === 'true';
    const format = (req.query.format as string) || 'json';
    const userId = req.user?.id;

    const report = await reportsService.generateBusinessPositionReport(pool, {
      reportDate,
      includeComparisons,
      includeForecasts,
      format: format as 'json' | 'pdf' | 'csv',
      userId,
    });

    // PDF export handling
    if (format === 'pdf') {
      const companyName = await getCompanyName(pool);
      const pdfGen = new ReportPDFGenerator(companyName);
      const doc = pdfGen.getDocument();

      const date = reportDate.toLocaleDateString('en-CA');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="business-position-${date}.pdf"`);
      doc.pipe(res);

      pdfGen.addHeader({
        companyName,
        title: 'Business Position Report',
        subtitle: `Comprehensive Business Health Assessment - ${formatDate(reportDate)}`,
        generatedAt: formatDateTime(),
      });

      // Business Health Score Section
      pdfGen.addSummaryCards([
        {
          label: 'Business Health Score',
          value: `${report.data.businessHealthScore}/100`,
          color:
            report.data.businessHealthScore >= 80
              ? PDFColors.success
              : report.data.businessHealthScore >= 60
                ? PDFColors.warning
                : PDFColors.danger,
        },
        {
          label: 'Total Revenue',
          value: formatCurrencyPDF(report.data.salesPerformance.totalRevenue),
          color: PDFColors.primary,
        },
        {
          label: 'Gross Profit',
          value: formatCurrencyPDF(report.data.salesPerformance.grossProfit),
          color: PDFColors.success,
        },
        {
          label: 'Cash Position',
          value: formatCurrencyPDF(report.data.cashPosition.totalCashIn),
          color: PDFColors.info,
        },
      ]);

      // Sales Performance Section
      pdfGen.addSectionHeading('Sales Performance');

      const salesColumns: PDFTableColumn[] = [
        { header: 'Metric', key: 'metric', width: 0.6 },
        { header: 'Value', key: 'value', width: 0.4, align: 'right' },
      ];

      const salesData = [
        {
          metric: 'Total Transactions',
          value: String(report.data.salesPerformance.transactionsCount),
        },
        { metric: 'Unique Customers', value: String(report.data.salesPerformance.uniqueCustomers) },
        {
          metric: 'Average Transaction',
          value: formatCurrencyPDF(report.data.salesPerformance.avgTransactionValue),
        },
        {
          metric: 'Walk-in Revenue',
          value: formatCurrencyPDF(report.data.salesPerformance.walkInRevenue),
        },
        {
          metric: 'Customer Revenue',
          value: formatCurrencyPDF(report.data.salesPerformance.customerRevenue),
        },
      ];

      pdfGen.addTable(salesColumns, salesData);

      // Collections Performance Section
      pdfGen.addSectionHeading('Collections Performance');

      const collectionsData = [
        {
          metric: 'Collection Transactions',
          value: String(report.data.collectionsPerformance.collectionTransactions),
        },
        {
          metric: 'Total Collections',
          value: formatCurrencyPDF(report.data.collectionsPerformance.totalCollections),
        },
        {
          metric: 'Average Collection',
          value: formatCurrencyPDF(report.data.collectionsPerformance.avgCollectionValue),
        },
        {
          metric: 'Paying Customers',
          value: String(report.data.collectionsPerformance.payingCustomers),
        },
      ];

      pdfGen.addTable(salesColumns, collectionsData);

      // Risk Assessment Section
      pdfGen.addSectionHeading('Risk Assessment');

      const riskData = [
        { metric: 'Receivables Risk', value: report.data.riskAssessment.receivablesRisk },
        { metric: 'Inventory Risk', value: report.data.riskAssessment.inventoryRisk },
        { metric: 'Overall Risk Level', value: report.data.riskAssessment.overallRiskLevel },
      ];

      pdfGen.addTable(salesColumns, riskData);

      // Recommendations Section
      if (report.data.enhancedAnalysis.recommendations.length > 0) {
        pdfGen.addSectionHeading('Business Recommendations');

        const recommendationsColumns: PDFTableColumn[] = [
          { header: 'Priority', key: 'priority', width: 0.15 },
          { header: 'Category', key: 'category', width: 0.2 },
          { header: 'Recommendation', key: 'message', width: 0.45 },
          { header: 'Impact', key: 'impact', width: 0.2 },
        ];

        pdfGen.addTable(recommendationsColumns, report.data.enhancedAnalysis.recommendations);
      }

      pdfGen.end();
      return;
    }

    logger.info('Business position report generated', {
      userId,
      businessHealthScore: report.data.businessHealthScore,
      reportDate: reportDate.toLocaleDateString('en-CA'),
    });

    res.json({ success: true, data: report });
  },

  // ===========================================================================
  // CASH REGISTER SESSION REPORTS
  // ===========================================================================

  /**
   * Get Cash Register Session Summary Report
   * GET /api/reports/cash-register/session/:sessionId
   *
   * Returns detailed session summary with movement breakdown
   */
  async getCashRegisterSessionSummary(req: Request, res: Response, pool: Pool) {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Session ID is required',
      });
    }

    const report = await reportsRepository.getCashRegisterSessionSummary(pool, sessionId);

    if (!report) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
      });
    }

    logger.info('Cash register session summary generated', {
      userId: req.user?.id,
      sessionId,
      sessionNumber: report.session.sessionNumber,
    });

    res.json({ success: true, data: report });
  },

  /**
   * Get Cash Register Movement Breakdown Report
   * GET /api/reports/cash-register/movement-breakdown
   * Query params: startDate, endDate, registerId?, userId?
   *
   * Returns aggregate movement data across sessions for a date range
   */
  async getCashRegisterMovementBreakdown(req: Request, res: Response, pool: Pool) {
    const {
      startDate,
      endDate,
      registerId,
      userId: filterUserId,
    } = CashRegisterDateRangeSchema.parse(req.query);

    const report = await reportsRepository.getCashRegisterMovementBreakdown(pool, {
      startDate,
      endDate,
      registerId,
      userId: filterUserId,
    });

    logger.info('Cash register movement breakdown generated', {
      userId: req.user?.id,
      startDate,
      endDate,
      sessionCount: report.totals.sessionCount,
      movementCount: report.totals.movementCount,
    });

    res.json({ success: true, data: report });
  },

  /**
   * Get Cash Register Session History Report
   * GET /api/reports/cash-register/session-history
   * Query params: startDate, endDate, registerId?, userId?, status?
   *
   * Returns list of sessions with summary stats for a date range
   */
  async getCashRegisterSessionHistory(req: Request, res: Response, pool: Pool) {
    const {
      startDate,
      endDate,
      registerId,
      userId: filterUserId,
      status,
    } = CashRegisterSessionHistorySchema.parse(req.query);

    const report = await reportsRepository.getCashRegisterSessionHistory(pool, {
      startDate,
      endDate,
      registerId,
      userId: filterUserId,
      status,
    });

    logger.info('Cash register session history generated', {
      userId: req.user?.id,
      startDate,
      endDate,
      totalSessions: report.summary.totalSessions,
    });

    res.json({ success: true, data: report });
  },

  // ── Delivery Notes Report ──
  async getDeliveryNoteReport(req: Request, res: Response, pool: Pool) {
    const params = DeliveryNoteReportParamsSchema.parse(req.query);
    const userId = req.user?.id;

    const report = await reportsService.generateDeliveryNoteReport(pool, {
      startDate: new Date(params.start_date),
      endDate: adjustEndDate(params.end_date),
      customerId: params.customer_id,
      status: params.status,
      format: params.format,
      userId,
    });

    if (params.format === 'pdf') {
      const companyName = await getCompanyName(pool);
      const pdfGen = new ReportPDFGenerator(companyName);
      const doc = pdfGen.getDocument();

      const date = new Date().toLocaleDateString('en-CA');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="delivery-notes-${date}.pdf"`);
      doc.pipe(res);

      pdfGen.addHeader({
        companyName,
        title: 'Delivery Notes Report',
        subtitle: `${params.start_date} to ${params.end_date}`,
        generatedAt: formatDateTime(),
      });

      pdfGen.addSummaryCards([
        { label: 'Total DNs', value: String(report.summary.totalDeliveryNotes), color: PDFColors.primary },
        { label: 'Total Value', value: formatCurrencyPDF(report.summary.totalValue), color: PDFColors.success },
        { label: 'Posted', value: String(report.summary.postedCount), color: PDFColors.info },
        { label: 'Draft', value: String(report.summary.draftCount), color: PDFColors.warning },
      ]);

      const columns: PDFTableColumn[] = [
        { header: 'DN Number', key: 'deliveryNoteNumber', width: 0.15 },
        { header: 'Customer', key: 'customerName', width: 0.2 },
        { header: 'Date', key: 'deliveryDate', width: 0.1 },
        { header: 'Status', key: 'status', width: 0.1 },
        { header: 'Lines', key: 'lineCount', width: 0.07, align: 'right' },
        { header: 'Total', key: 'totalAmount', width: 0.13, align: 'right', format: (v) => formatCurrencyPDF(v as number) },
        { header: 'Quote', key: 'quotationNumber', width: 0.12 },
        { header: 'Driver', key: 'driverName', width: 0.13 },
      ];

      pdfGen.addTable(columns, report.data);
      pdfGen.end();
      return;
    }

    logger.info('Delivery notes report generated', { userId, recordCount: report.recordCount });
    res.json({ success: true, data: report });
  },

  // ── Quotation Report ──
  async getQuotationReport(req: Request, res: Response, pool: Pool) {
    const params = QuotationReportParamsSchema.parse(req.query);
    const userId = req.user?.id;

    const report = await reportsService.generateQuotationReport(pool, {
      startDate: new Date(params.start_date),
      endDate: adjustEndDate(params.end_date),
      customerId: params.customer_id,
      status: params.status,
      quoteType: params.quote_type,
      format: params.format,
      userId,
    });

    if (params.format === 'pdf') {
      const companyName = await getCompanyName(pool);
      const pdfGen = new ReportPDFGenerator(companyName);
      const doc = pdfGen.getDocument();

      const date = new Date().toLocaleDateString('en-CA');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="quotations-${date}.pdf"`);
      doc.pipe(res);

      pdfGen.addHeader({
        companyName,
        title: 'Quotation Report',
        subtitle: `${params.start_date} to ${params.end_date}`,
        generatedAt: formatDateTime(),
      });

      pdfGen.addSummaryCards([
        { label: 'Total Quotes', value: String(report.summary.totalQuotations), color: PDFColors.primary },
        { label: 'Total Value', value: formatCurrencyPDF(report.summary.totalValue), color: PDFColors.success },
        { label: 'Converted', value: String(report.summary.convertedCount), color: PDFColors.info },
        { label: 'Conversion Rate', value: `${report.summary.conversionRate}%`, color: PDFColors.secondary },
      ]);

      const columns: PDFTableColumn[] = [
        { header: 'Quote #', key: 'quoteNumber', width: 0.14 },
        { header: 'Customer', key: 'customerName', width: 0.2 },
        { header: 'Type', key: 'quoteType', width: 0.08 },
        { header: 'Status', key: 'status', width: 0.1 },
        { header: 'Subtotal', key: 'subtotal', width: 0.12, align: 'right', format: (v) => formatCurrencyPDF(v as number) },
        { header: 'Tax', key: 'taxAmount', width: 0.1, align: 'right', format: (v) => formatCurrencyPDF(v as number) },
        { header: 'Total', key: 'totalAmount', width: 0.13, align: 'right', format: (v) => formatCurrencyPDF(v as number) },
        { header: 'Valid Until', key: 'validUntil', width: 0.13 },
      ];

      pdfGen.addTable(columns, report.data);
      pdfGen.end();
      return;
    }

    logger.info('Quotation report generated', { userId, recordCount: report.recordCount });
    res.json({ success: true, data: report });
  },

  // ── Manual Journal Entry Report ──
  async getManualJournalEntryReport(req: Request, res: Response, pool: Pool) {
    const params = ManualJournalEntryReportParamsSchema.parse(req.query);
    const userId = req.user?.id;

    const report = await reportsService.generateManualJournalEntryReport(pool, {
      startDate: new Date(params.start_date),
      endDate: adjustEndDate(params.end_date),
      status: params.status,
      format: params.format,
      userId,
    });

    if (params.format === 'pdf') {
      const companyName = await getCompanyName(pool);
      const pdfGen = new ReportPDFGenerator(companyName);
      const doc = pdfGen.getDocument();

      const date = new Date().toLocaleDateString('en-CA');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="journal-entries-${date}.pdf"`);
      doc.pipe(res);

      pdfGen.addHeader({
        companyName,
        title: 'Manual Journal Entries Report',
        subtitle: `${params.start_date} to ${params.end_date}`,
        generatedAt: formatDateTime(),
      });

      pdfGen.addSummaryCards([
        { label: 'Total Entries', value: String(report.summary.totalEntries), color: PDFColors.primary },
        { label: 'Total Debit', value: formatCurrencyPDF(report.summary.totalDebit), color: PDFColors.success },
        { label: 'Total Credit', value: formatCurrencyPDF(report.summary.totalCredit), color: PDFColors.info },
        { label: 'Reversed', value: String(report.summary.reversedCount), color: PDFColors.warning },
      ]);

      const columns: PDFTableColumn[] = [
        { header: 'Entry #', key: 'entryNumber', width: 0.12 },
        { header: 'Date', key: 'entryDate', width: 0.1 },
        { header: 'Narration', key: 'narration', width: 0.28 },
        { header: 'Reference', key: 'reference', width: 0.1 },
        { header: 'Debit', key: 'totalDebit', width: 0.12, align: 'right', format: (v) => formatCurrencyPDF(v as number) },
        { header: 'Credit', key: 'totalCredit', width: 0.12, align: 'right', format: (v) => formatCurrencyPDF(v as number) },
        { header: 'Status', key: 'status', width: 0.08 },
        { header: 'Lines', key: 'lineCount', width: 0.08, align: 'right' },
      ];

      pdfGen.addTable(columns, report.data);
      pdfGen.end();
      return;
    }

    logger.info('Manual journal entries report generated', { userId, recordCount: report.recordCount });
    res.json({ success: true, data: report });
  },

  // ── Bank Transaction Report ──
  async getBankTransactionReport(req: Request, res: Response, pool: Pool) {
    const params = BankTransactionReportParamsSchema.parse(req.query);
    const userId = req.user?.id;

    const report = await reportsService.generateBankTransactionReport(pool, {
      startDate: new Date(params.start_date),
      endDate: adjustEndDate(params.end_date),
      bankAccountId: params.bank_account_id,
      type: params.type,
      isReconciled: params.is_reconciled === 'true' ? true : params.is_reconciled === 'false' ? false : undefined,
      format: params.format,
      userId,
    });

    if (params.format === 'pdf') {
      const companyName = await getCompanyName(pool);
      const pdfGen = new ReportPDFGenerator(companyName);
      const doc = pdfGen.getDocument();

      const date = new Date().toLocaleDateString('en-CA');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="bank-transactions-${date}.pdf"`);
      doc.pipe(res);

      pdfGen.addHeader({
        companyName,
        title: 'Bank Transactions Report',
        subtitle: `${params.start_date} to ${params.end_date}`,
        generatedAt: formatDateTime(),
      });

      pdfGen.addSummaryCards([
        { label: 'Transactions', value: String(report.summary.totalTransactions), color: PDFColors.primary },
        { label: 'Total Deposits', value: formatCurrencyPDF(report.summary.totalDeposits), color: PDFColors.success },
        { label: 'Total Withdrawals', value: formatCurrencyPDF(report.summary.totalWithdrawals), color: PDFColors.danger },
        { label: 'Net Flow', value: formatCurrencyPDF(report.summary.netFlow), color: PDFColors.info },
      ]);

      const columns: PDFTableColumn[] = [
        { header: 'Txn #', key: 'transactionNumber', width: 0.12 },
        { header: 'Account', key: 'bankAccountName', width: 0.15 },
        { header: 'Date', key: 'transactionDate', width: 0.1 },
        { header: 'Type', key: 'type', width: 0.1 },
        { header: 'Description', key: 'description', width: 0.2 },
        { header: 'Amount', key: 'amount', width: 0.13, align: 'right', format: (v) => formatCurrencyPDF(v as number) },
        { header: 'Balance', key: 'runningBalance', width: 0.12, align: 'right', format: (v) => v != null ? formatCurrencyPDF(v as number) : '—' },
        { header: 'Recon', key: 'isReconciled', width: 0.08, format: (v) => v ? 'Yes' : 'No' },
      ];

      pdfGen.addTable(columns, report.data);
      pdfGen.end();
      return;
    }

    logger.info('Bank transactions report generated', { userId, recordCount: report.recordCount });
    res.json({ success: true, data: report });
  },
};
