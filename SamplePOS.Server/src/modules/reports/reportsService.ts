// Reports Service - Business logic and orchestration
// Coordinates report generation with audit logging

import { Pool } from 'pg';
import { reportsRepository } from './reportsRepository.js';
import { systemSettingsService } from '../system-settings/systemSettingsService.js';
import { SystemSettings } from '../../../../shared/types/systemSettings.js';
import Decimal from 'decimal.js';

// Configure Decimal for financial precision
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

/**
 * Interface for system settings context included in all reports
 */
interface ReportSystemContext {
  businessName: string;
  currencyCode: string;
  currencySymbol: string;
  dateFormat: string;
  timeFormat: string;
  timezone: string;
  taxEnabled: boolean;
  taxName: string;
  defaultTaxRate: number;
}

/**
 * Helper to get system settings context for reports
 */
async function getSystemContext(pool: Pool): Promise<ReportSystemContext> {
  const settings = await systemSettingsService.getSettings(pool);
  return {
    businessName: settings.businessName,
    currencyCode: settings.currencyCode,
    currencySymbol: settings.currencySymbol,
    dateFormat: settings.dateFormat,
    timeFormat: settings.timeFormat,
    timezone: settings.timezone,
    taxEnabled: settings.taxEnabled,
    taxName: settings.taxName,
    defaultTaxRate: settings.defaultTaxRate,
  };
}

/**
 * Format currency value according to system settings
 */
function formatCurrency(amount: number, currencySymbol: string): string {
  return `${currencySymbol}${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Format date according to system settings date format
 */
function formatDate(date: Date | string, dateFormat: string): string {
  const d = typeof date === 'string' ? new Date(date) : date;

  // Common date format patterns
  const formatters: Record<string, Intl.DateTimeFormatOptions> = {
    'DD/MM/YYYY': { day: '2-digit', month: '2-digit', year: 'numeric' },
    'MM/DD/YYYY': { month: '2-digit', day: '2-digit', year: 'numeric' },
    'YYYY-MM-DD': { year: 'numeric', month: '2-digit', day: '2-digit' },
    'DD-MM-YYYY': { day: '2-digit', month: '2-digit', year: 'numeric' },
    'MMM DD, YYYY': { month: 'short', day: '2-digit', year: 'numeric' },
  };

  const options = formatters[dateFormat] || formatters['DD/MM/YYYY'];
  return d.toLocaleDateString('en-US', options);
}

export const reportsService = {
  /**
   * Get current system settings for report formatting
   * Returns currency, date format, business name, and tax configuration
   */
  async getSystemSettings(pool: Pool): Promise<ReportSystemContext> {
    return getSystemContext(pool);
  },

  /**
   * Generate Inventory Valuation Report with audit logging
   * @param pool - Database connection pool
   * @param options - Report parameters (date, category, method, format, user)
   * @returns Report data with summary and execution metrics
   * 
   * Valuation Methods:
   * - **FIFO** (First In First Out): Values using oldest cost layers
   * - **AVCO** (Average Cost): Weighted average across all layers
   * - **LIFO** (Last In First Out): Values using newest cost layers (rare)
   * 
   * Report Structure:
   * - Per-product inventory line items
   * - quantity_on_hand: Current stock level
   * - unit_cost: Per-unit cost based on valuation method
   * - total_value: quantity * unit_cost
   * - Summary: Total items, total value, total quantity
   * 
   * Use Cases:
   * - Financial statements (Balance Sheet - Current Assets)
   * - Insurance valuation
   * - Tax reporting (year-end inventory value)
   * - Stock audits and reconciliation
   * 
   * Performance:
   * - Execution time logged for monitoring
   * - Category filter reduces dataset for large inventories
   * - as_of_date enables historical valuation snapshots
   * 
   * Audit Trail:
   * - Logs to report_runs table (BR-RPT-001)
   * - Records: user, parameters, execution time, row count
   * - Enables compliance reporting and query optimization
   */
  async generateInventoryValuation(
    pool: Pool,
    options: {
      asOfDate?: Date;
      categoryId?: string;
      valuationMethod?: 'FIFO' | 'AVCO' | 'LIFO';
      format?: 'json' | 'pdf' | 'csv';
      userId?: string;
    }
  ) {
    const startTime = Date.now();

    // Get system settings for report formatting
    const systemContext = await getSystemContext(pool);

    const data = await reportsRepository.getInventoryValuation(pool, {
      asOfDate: options.asOfDate,
      categoryId: options.categoryId,
      valuationMethod: options.valuationMethod,
    });

    // Calculate summary
    const totalValue = data.reduce((sum, item) => new Decimal(sum).plus(item.totalValue), new Decimal(0));
    const totalQuantity = data.reduce((sum, item) => new Decimal(sum).plus(item.quantityOnHand), new Decimal(0));
    const totalPotentialRevenue = data.reduce((sum, item) => new Decimal(sum).plus(item.potentialRevenue), new Decimal(0));
    const totalPotentialProfit = data.reduce((sum, item) => new Decimal(sum).plus(item.potentialProfit), new Decimal(0));

    const executionTime = Date.now() - startTime;

    // Log report run
    await reportsRepository.logReportRun(pool, {
      reportType: 'INVENTORY_VALUATION',
      reportName: 'Inventory Valuation Report',
      parameters: { asOfDate: options.asOfDate, categoryId: options.categoryId, valuationMethod: options.valuationMethod },
      generatedById: options.userId || null,
      recordCount: data.length,
      fileFormat: options.format || 'json',
      executionTimeMs: executionTime,
    });

    return {
      reportType: 'INVENTORY_VALUATION' as const,
      reportName: 'Inventory Valuation Report',
      generatedAt: new Date().toLocaleString("en-US", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }),
      systemSettings: systemContext,
      parameters: options,
      data,
      summary: {
        totalItems: data.length,
        totalValue: totalValue.toDecimalPlaces(2).toNumber(),
        totalValueFormatted: formatCurrency(totalValue.toDecimalPlaces(2).toNumber(), systemContext.currencySymbol),
        totalQuantity: totalQuantity.toDecimalPlaces(3).toNumber(),
        totalPotentialRevenue: totalPotentialRevenue.toDecimalPlaces(2).toNumber(),
        totalPotentialRevenueFormatted: formatCurrency(totalPotentialRevenue.toDecimalPlaces(2).toNumber(), systemContext.currencySymbol),
        totalPotentialProfit: totalPotentialProfit.toDecimalPlaces(2).toNumber(),
        totalPotentialProfitFormatted: formatCurrency(totalPotentialProfit.toDecimalPlaces(2).toNumber(), systemContext.currencySymbol),
        overallMargin: totalPotentialRevenue.greaterThan(0)
          ? totalPotentialProfit.dividedBy(totalPotentialRevenue).times(100).toDecimalPlaces(2).toNumber()
          : 0,
        valuationMethod: options.valuationMethod || 'FIFO',
      },
      recordCount: data.length,
      executionTimeMs: executionTime,
    };
  },

  /**
   * Generate Sales Report with grouping and profit analysis
   * @param pool - Database connection pool
   * @param options - Report parameters (date range, groupBy, customer, format, user)
   * @returns Sales data grouped by selected dimension with profit metrics
   * 
   * Grouping Dimensions:
   * - **day**: Daily sales totals (trend analysis)
   * - **week**: Weekly aggregation (performance tracking)
   * - **month**: Monthly summaries (financial reporting)
   * - **product**: Best sellers and profitability by product
   * - **customer**: Customer purchase patterns and value
   * - **payment_method**: Payment preference analysis
   * 
   * Metrics Calculated:
   * - totalSales: Revenue (sum of sale.total_amount)
   * - totalCost: COGS (sum of sale_items.unit_cost * quantity)
   * - grossProfit: totalSales - totalCost
   * - profitMargin: (grossProfit / totalSales) * 100
   * - transactionCount: Number of sales
   * - averageTransactionValue: totalSales / transactionCount
   * 
   * Use Cases:
   * - Daily/weekly/monthly sales tracking
   * - Product performance analysis (ABC classification)
   * - Customer segmentation (VIP identification)
   * - Payment method trends (cash vs card vs mobile)
   * - Profit center analysis
   * 
   * Performance:
   * - Date range filtering for fast queries
   * - Customer filter for account statements
   * - Execution time monitoring via report_runs
   * 
   * Precision: Uses Decimal.js for financial calculations
   */
  async generateSalesReport(
    pool: Pool,
    options: {
      startDate: Date;
      endDate: Date;
      groupBy?: 'day' | 'week' | 'month' | 'product' | 'customer' | 'payment_method';
      customerId?: string;
      format?: 'json' | 'pdf' | 'csv';
      userId?: string;
    }
  ) {
    const startTime = Date.now();

    // Get system settings for report formatting
    const systemContext = await getSystemContext(pool);

    const data = await reportsRepository.getSalesReport(pool, {
      startDate: options.startDate,
      endDate: options.endDate,
      groupBy: options.groupBy,
      customerId: options.customerId,
    });

    // Calculate summary
    const totalSales = data.reduce((sum, item) => new Decimal(sum).plus(item.totalSales), new Decimal(0));
    const totalDiscounts = data.reduce((sum, item) => new Decimal(sum).plus(item.totalDiscounts || 0), new Decimal(0));
    const netRevenue = data.reduce((sum, item) => new Decimal(sum).plus(item.netRevenue), new Decimal(0));
    const totalCost = data.reduce((sum, item) => new Decimal(sum).plus(item.totalCost), new Decimal(0));
    const grossProfit = netRevenue.minus(totalCost);
    const totalTransactions = data.reduce((sum, item) => sum + item.transactionCount, 0);
    const averageDiscountRate = totalSales.isZero() ? new Decimal(0) : totalDiscounts.dividedBy(totalSales).times(100);

    const executionTime = Date.now() - startTime;

    await reportsRepository.logReportRun(pool, {
      reportType: 'SALES_REPORT',
      reportName: 'Sales Report',
      parameters: options,
      generatedById: options.userId || null,
      startDate: options.startDate,
      endDate: options.endDate,
      recordCount: data.length,
      fileFormat: options.format || 'json',
      executionTimeMs: executionTime,
    });

    return {
      reportType: 'SALES_REPORT' as const,
      reportName: 'Sales Report',
      generatedAt: new Date().toLocaleString("en-US", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }),
      systemSettings: systemContext,
      parameters: options,
      data,
      summary: {
        totalSales: totalSales.toDecimalPlaces(2).toNumber(),
        totalSalesFormatted: formatCurrency(totalSales.toDecimalPlaces(2).toNumber(), systemContext.currencySymbol),
        totalDiscounts: totalDiscounts.toDecimalPlaces(2).toNumber(),
        netRevenue: netRevenue.toDecimalPlaces(2).toNumber(),
        netRevenueFormatted: formatCurrency(netRevenue.toDecimalPlaces(2).toNumber(), systemContext.currencySymbol),
        totalCost: totalCost.toDecimalPlaces(2).toNumber(),
        grossProfit: grossProfit.toDecimalPlaces(2).toNumber(),
        grossProfitFormatted: formatCurrency(grossProfit.toDecimalPlaces(2).toNumber(), systemContext.currencySymbol),
        profitMargin: netRevenue.isZero() ? 0 : grossProfit.dividedBy(netRevenue).times(100).toDecimalPlaces(2).toNumber(),
        averageDiscountRate: averageDiscountRate.toDecimalPlaces(2).toNumber(),
        totalTransactions,
      },
      recordCount: data.length,
      executionTimeMs: executionTime,
    };
  },

  /**
   * Generate Expiring Items Report
   */
  async generateExpiringItems(
    pool: Pool,
    options: {
      daysAhead: number;
      categoryId?: string;
      format?: 'json' | 'pdf' | 'csv';
      userId?: string;
    }
  ) {
    const startTime = Date.now();

    const data = await reportsRepository.getExpiringItems(pool, {
      daysAhead: options.daysAhead,
      categoryId: options.categoryId,
    });

    // Calculate summary
    const totalPotentialLoss = data.reduce((sum, item) => new Decimal(sum).plus(item.potentialLoss), new Decimal(0));
    const totalQuantity = data.reduce((sum, item) => new Decimal(sum).plus(item.quantityRemaining), new Decimal(0));

    const executionTime = Date.now() - startTime;

    await reportsRepository.logReportRun(pool, {
      reportType: 'EXPIRING_ITEMS',
      reportName: 'Expiring Items Report',
      parameters: options,
      generatedById: options.userId || null,
      recordCount: data.length,
      fileFormat: options.format || 'json',
      executionTimeMs: executionTime,
    });

    return {
      reportType: 'EXPIRING_ITEMS' as const,
      reportName: 'Expiring Items Report',
      generatedAt: new Date().toLocaleString("en-US", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }),
      parameters: options,
      data,
      summary: {
        totalItems: data.length,
        totalQuantityAtRisk: totalQuantity.toDecimalPlaces(3).toNumber(),
        totalPotentialLoss: totalPotentialLoss.toDecimalPlaces(2).toNumber(),
      },
      recordCount: data.length,
      executionTimeMs: executionTime,
    };
  },

  /**
   * Generate Low Stock Report
   */
  async generateLowStock(
    pool: Pool,
    options: {
      threshold?: number;
      categoryId?: string;
      format?: 'json' | 'pdf' | 'csv';
      userId?: string;
    }
  ) {
    const startTime = Date.now();

    const data = await reportsRepository.getLowStockItems(pool, {
      threshold: options.threshold,
      categoryId: options.categoryId,
    });

    // Count by status
    const critical = data.filter(item => item.status === 'CRITICAL').length;
    const low = data.filter(item => item.status === 'LOW').length;
    const warning = data.filter(item => item.status === 'WARNING').length;

    const executionTime = Date.now() - startTime;

    await reportsRepository.logReportRun(pool, {
      reportType: 'LOW_STOCK',
      reportName: 'Low Stock Report',
      parameters: options,
      generatedById: options.userId || null,
      recordCount: data.length,
      fileFormat: options.format || 'json',
      executionTimeMs: executionTime,
    });

    return {
      reportType: 'LOW_STOCK' as const,
      reportName: 'Low Stock Report',
      generatedAt: new Date().toLocaleString("en-US", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }),
      parameters: options,
      data,
      summary: {
        totalItems: data.length,
        criticalCount: critical,
        lowCount: low,
        warningCount: warning,
      },
      recordCount: data.length,
      executionTimeMs: executionTime,
    };
  },

  /**
   * Generate Best Selling Products Report
   */
  async generateBestSelling(
    pool: Pool,
    options: {
      startDate: Date;
      endDate: Date;
      limit: number;
      categoryId?: string;
      format?: 'json' | 'pdf' | 'csv';
      userId?: string;
    }
  ) {
    const startTime = Date.now();

    const data = await reportsRepository.getBestSellingProducts(pool, {
      startDate: options.startDate,
      endDate: options.endDate,
      limit: options.limit,
      categoryId: options.categoryId,
    });

    // Calculate summary
    const totalRevenue = data.reduce((sum, item) => new Decimal(sum).plus(item.totalRevenue), new Decimal(0));
    const totalProfit = data.reduce((sum, item) => new Decimal(sum).plus(item.grossProfit), new Decimal(0));
    const totalQuantity = data.reduce((sum, item) => new Decimal(sum).plus(item.quantitySold), new Decimal(0));

    const executionTime = Date.now() - startTime;

    await reportsRepository.logReportRun(pool, {
      reportType: 'BEST_SELLING_PRODUCTS',
      reportName: 'Best Selling Products',
      parameters: options,
      generatedById: options.userId || null,
      startDate: options.startDate,
      endDate: options.endDate,
      recordCount: data.length,
      fileFormat: options.format || 'json',
      executionTimeMs: executionTime,
    });

    return {
      reportType: 'BEST_SELLING_PRODUCTS' as const,
      reportName: 'Best Selling Products',
      generatedAt: new Date().toLocaleString("en-US", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }),
      parameters: options,
      data,
      summary: {
        totalProducts: data.length,
        totalRevenue: totalRevenue.toDecimalPlaces(2).toNumber(),
        totalProfit: totalProfit.toDecimalPlaces(2).toNumber(),
        totalQuantitySold: totalQuantity.toDecimalPlaces(3).toNumber(),
      },
      recordCount: data.length,
      executionTimeMs: executionTime,
    };
  },

  /**
   * Generate Supplier Cost Analysis Report
   */
  async generateSupplierCostAnalysis(
    pool: Pool,
    options: {
      startDate: Date;
      endDate: Date;
      supplierId?: string;
      format?: 'json' | 'pdf' | 'csv';
      userId?: string;
    }
  ) {
    const startTime = Date.now();

    const data = await reportsRepository.getSupplierCostAnalysis(pool, {
      startDate: options.startDate,
      endDate: options.endDate,
      supplierId: options.supplierId,
    });

    // Calculate summary
    const totalPurchaseValue = data.reduce((sum, item) => new Decimal(sum).plus(item.totalPurchaseValue), new Decimal(0));
    const totalPOs = data.reduce((sum, item) => sum + item.totalPurchaseOrders, 0);

    const executionTime = Date.now() - startTime;

    await reportsRepository.logReportRun(pool, {
      reportType: 'SUPPLIER_COST_ANALYSIS',
      reportName: 'Supplier Cost Analysis',
      parameters: options,
      generatedById: options.userId || null,
      startDate: options.startDate,
      endDate: options.endDate,
      recordCount: data.length,
      fileFormat: options.format || 'json',
      executionTimeMs: executionTime,
    });

    return {
      reportType: 'SUPPLIER_COST_ANALYSIS' as const,
      reportName: 'Supplier Cost Analysis',
      generatedAt: new Date().toLocaleString("en-US", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }),
      parameters: options,
      data,
      summary: {
        totalSuppliers: data.length,
        totalPurchaseOrders: totalPOs,
        totalPurchaseValue: totalPurchaseValue.toDecimalPlaces(2).toNumber(),
      },
      recordCount: data.length,
      executionTimeMs: executionTime,
    };
  },

  /**
   * Generate Goods Received Report
   */
  async generateGoodsReceived(
    pool: Pool,
    options: {
      startDate: Date;
      endDate: Date;
      supplierId?: string;
      productId?: string;
      format?: 'json' | 'pdf' | 'csv';
      userId?: string;
    }
  ) {
    const startTime = Date.now();

    const data = await reportsRepository.getGoodsReceivedReport(pool, {
      startDate: options.startDate,
      endDate: options.endDate,
      supplierId: options.supplierId,
      productId: options.productId,
    });

    // Calculate summary
    const totalValue = data.reduce((sum, item) => new Decimal(sum).plus(item.totalValue), new Decimal(0));

    const executionTime = Date.now() - startTime;

    await reportsRepository.logReportRun(pool, {
      reportType: 'GOODS_RECEIVED',
      reportName: 'Goods Received Report',
      parameters: options,
      generatedById: options.userId || null,
      startDate: options.startDate,
      endDate: options.endDate,
      recordCount: data.length,
      fileFormat: options.format || 'json',
      executionTimeMs: executionTime,
    });

    return {
      reportType: 'GOODS_RECEIVED' as const,
      reportName: 'Goods Received Report',
      generatedAt: new Date().toLocaleString("en-US", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }),
      parameters: options,
      data,
      summary: {
        totalReceipts: data.length,
        totalValue: totalValue.toDecimalPlaces(2).toNumber(),
      },
      recordCount: data.length,
      executionTimeMs: executionTime,
    };
  },

  /**
   * Generate Payment Report
   */
  async generatePaymentReport(
    pool: Pool,
    options: {
      startDate: Date;
      endDate: Date;
      paymentMethod?: string;
      format?: 'json' | 'pdf' | 'csv';
      userId?: string;
    }
  ) {
    const startTime = Date.now();

    const data = await reportsRepository.getPaymentReport(pool, {
      startDate: options.startDate,
      endDate: options.endDate,
      paymentMethod: options.paymentMethod,
    });

    // Calculate summary
    const totalAmount = data.reduce((sum, item) => new Decimal(sum).plus(item.totalAmount), new Decimal(0));
    const totalTransactions = data.reduce((sum, item) => sum + item.transactionCount, 0);

    const executionTime = Date.now() - startTime;

    await reportsRepository.logReportRun(pool, {
      reportType: 'PAYMENT_REPORT',
      reportName: 'Payment Report',
      parameters: options,
      generatedById: options.userId || null,
      startDate: options.startDate,
      endDate: options.endDate,
      recordCount: data.length,
      fileFormat: options.format || 'json',
      executionTimeMs: executionTime,
    });

    return {
      reportType: 'PAYMENT_REPORT' as const,
      reportName: 'Payment Report',
      generatedAt: new Date().toLocaleString("en-US", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }),
      parameters: options,
      data,
      summary: {
        totalAmount: totalAmount.toDecimalPlaces(2).toNumber(),
        totalTransactions,
        paymentMethods: data.length,
      },
      recordCount: data.length,
      executionTimeMs: executionTime,
    };
  },

  /**
   * Generate Customer Payments Report
   */
  async generateCustomerPayments(
    pool: Pool,
    options: {
      startDate: Date;
      endDate: Date;
      customerId?: string;
      status?: string;
      format?: 'json' | 'pdf' | 'csv';
      userId?: string;
    }
  ) {
    const startTime = Date.now();

    const data = await reportsRepository.getCustomerPaymentsReport(pool, {
      startDate: options.startDate,
      endDate: options.endDate,
      customerId: options.customerId,
      status: options.status,
    });

    // Calculate summary
    const totalInvoiced = data.reduce((sum, item) => new Decimal(sum).plus(item.totalInvoiced), new Decimal(0));
    const totalPaid = data.reduce((sum, item) => new Decimal(sum).plus(item.totalPaid), new Decimal(0));
    const totalOutstanding = data.reduce((sum, item) => new Decimal(sum).plus(item.totalOutstanding), new Decimal(0));
    const totalOverdue = data.reduce((sum, item) => new Decimal(sum).plus(item.overdueAmount), new Decimal(0));
    const totalDeposited = data.reduce((sum, item) => new Decimal(sum).plus(item.totalDeposited || 0), new Decimal(0));
    const totalDepositAvailable = data.reduce((sum, item) => new Decimal(sum).plus(item.depositAvailable || 0), new Decimal(0));

    const executionTime = Date.now() - startTime;

    await reportsRepository.logReportRun(pool, {
      reportType: 'CUSTOMER_PAYMENTS',
      reportName: 'Customer Payments Report',
      parameters: options,
      generatedById: options.userId || null,
      startDate: options.startDate,
      endDate: options.endDate,
      recordCount: data.length,
      fileFormat: options.format || 'json',
      executionTimeMs: executionTime,
    });

    return {
      reportType: 'CUSTOMER_PAYMENTS' as const,
      reportName: 'Customer Payments Report',
      generatedAt: new Date().toLocaleString("en-US", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }),
      parameters: options,
      data,
      summary: {
        totalCustomers: data.length,
        totalInvoiced: totalInvoiced.toDecimalPlaces(2).toNumber(),
        totalPaid: totalPaid.toDecimalPlaces(2).toNumber(),
        totalOutstanding: totalOutstanding.toDecimalPlaces(2).toNumber(),
        totalOverdue: totalOverdue.toDecimalPlaces(2).toNumber(),
        totalDeposited: totalDeposited.toDecimalPlaces(2).toNumber(),
        depositAvailable: totalDepositAvailable.toDecimalPlaces(2).toNumber(),
      },
      recordCount: data.length,
      executionTimeMs: executionTime,
    };
  },

  /**
   * Generate Profit & Loss Report
   */
  async generateProfitLoss(
    pool: Pool,
    options: {
      startDate: Date;
      endDate: Date;
      groupBy: 'day' | 'week' | 'month';
      format?: 'json' | 'pdf' | 'csv';
      userId?: string;
    }
  ) {
    const startTime = Date.now();

    const data = await reportsRepository.getProfitLossReport(pool, {
      startDate: options.startDate,
      endDate: options.endDate,
      groupBy: options.groupBy,
    });

    // Calculate summary
    const totalRevenue = data.reduce((sum, item) => new Decimal(sum).plus(item.revenue), new Decimal(0));
    const totalCOGS = data.reduce((sum, item) => new Decimal(sum).plus(item.costOfGoodsSold), new Decimal(0));
    const totalGrossProfit = totalRevenue.minus(totalCOGS);

    const executionTime = Date.now() - startTime;

    await reportsRepository.logReportRun(pool, {
      reportType: 'PROFIT_LOSS',
      reportName: 'Profit & Loss Report',
      parameters: options,
      generatedById: options.userId || null,
      startDate: options.startDate,
      endDate: options.endDate,
      recordCount: data.length,
      fileFormat: options.format || 'json',
      executionTimeMs: executionTime,
    });

    return {
      reportType: 'PROFIT_LOSS' as const,
      reportName: 'Profit & Loss Report',
      generatedAt: new Date().toLocaleString("en-US", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }),
      parameters: options,
      data,
      summary: {
        totalRevenue: totalRevenue.toDecimalPlaces(2).toNumber(),
        totalCOGS: totalCOGS.toDecimalPlaces(2).toNumber(),
        grossProfit: totalGrossProfit.toDecimalPlaces(2).toNumber(),
        grossProfitMargin: totalRevenue.isZero() ? 0 : totalGrossProfit.dividedBy(totalRevenue).times(100).toDecimalPlaces(2).toNumber(),
      },
      recordCount: data.length,
      executionTimeMs: executionTime,
    };
  },

  /**
   * Generate Deleted Items Report
   */
  async generateDeletedItems(
    pool: Pool,
    options: {
      startDate?: Date;
      endDate?: Date;
      format?: 'json' | 'pdf' | 'csv';
      userId?: string;
    }
  ) {
    const startTime = Date.now();

    const data = await reportsRepository.getDeletedItemsReport(pool, {
      startDate: options.startDate,
      endDate: options.endDate,
    });

    const executionTime = Date.now() - startTime;

    await reportsRepository.logReportRun(pool, {
      reportType: 'DELETED_ITEMS',
      reportName: 'Deleted Items Report',
      parameters: options,
      generatedById: options.userId || null,
      startDate: options.startDate || null,
      endDate: options.endDate || null,
      recordCount: data.length,
      fileFormat: options.format || 'json',
      executionTimeMs: executionTime,
    });

    return {
      reportType: 'DELETED_ITEMS' as const,
      reportName: 'Deleted Items Report',
      generatedAt: new Date().toLocaleString("en-US", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }),
      parameters: options,
      data,
      summary: {
        totalDeletedItems: data.length,
      },
      recordCount: data.length,
      executionTimeMs: executionTime,
    };
  },

  /**
   * Generate Inventory Adjustments Report
   */
  async generateInventoryAdjustments(
    pool: Pool,
    options: {
      startDate: Date;
      endDate: Date;
      productId?: string;
      format?: 'json' | 'pdf' | 'csv';
      userId?: string;
    }
  ) {
    const startTime = Date.now();

    const data = await reportsRepository.getInventoryAdjustmentsReport(pool, {
      startDate: options.startDate,
      endDate: options.endDate,
      productId: options.productId,
    });

    // Calculate summary
    const totalAdjustmentsIn = data
      .filter(item => ['ADJUSTMENT_IN', 'RETURN_FROM_CUSTOMER'].includes(item.movementType))
      .reduce((sum, item) => new Decimal(sum).plus(Math.abs(item.quantityChange)), new Decimal(0));

    const totalAdjustmentsOut = data
      .filter(item => ['ADJUSTMENT_OUT', 'WASTE', 'DAMAGE', 'RETURN_TO_SUPPLIER'].includes(item.movementType))
      .reduce((sum, item) => new Decimal(sum).plus(Math.abs(item.quantityChange)), new Decimal(0));

    const executionTime = Date.now() - startTime;

    await reportsRepository.logReportRun(pool, {
      reportType: 'INVENTORY_ADJUSTMENTS',
      reportName: 'Inventory Adjustments Report',
      parameters: options,
      generatedById: options.userId || null,
      startDate: options.startDate,
      endDate: options.endDate,
      recordCount: data.length,
      fileFormat: options.format || 'json',
      executionTimeMs: executionTime,
    });

    return {
      reportType: 'INVENTORY_ADJUSTMENTS' as const,
      reportName: 'Inventory Adjustments Report',
      generatedAt: new Date().toLocaleString("en-US", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }),
      parameters: options,
      data,
      summary: {
        totalAdjustments: data.length,
        totalAdjustmentsIn: totalAdjustmentsIn.toDecimalPlaces(3).toNumber(),
        totalAdjustmentsOut: totalAdjustmentsOut.toDecimalPlaces(3).toNumber(),
      },
      recordCount: data.length,
      executionTimeMs: executionTime,
    };
  },

  /**
   * Generate Purchase Order Summary Report
   */
  async generatePurchaseOrderSummary(
    pool: Pool,
    options: {
      startDate?: Date;
      endDate?: Date;
      status?: string;
      supplierId?: string;
      format?: 'json' | 'pdf' | 'csv';
      userId?: string;
    }
  ) {
    const startTime = Date.now();

    const data = await reportsRepository.getPurchaseOrderSummary(pool, options);

    const summary = {
      totalOrders: data.length,
      totalAmount: data.reduce((sum, po) => new Decimal(sum).plus(po.totalAmount || 0), new Decimal(0)).toDecimalPlaces(2).toNumber(),
      totalReceipts: data.reduce((sum, po) => sum + (po.totalReceipts || 0), 0),
      totalReceived: data.reduce((sum, po) => new Decimal(sum).plus(po.totalReceived || 0), new Decimal(0)).toDecimalPlaces(3).toNumber(),
    };

    const executionTime = Date.now() - startTime;

    await reportsRepository.logReportRun(pool, {
      reportType: 'PURCHASE_ORDER_SUMMARY',
      reportName: 'Purchase Order Summary Report',
      parameters: options,
      generatedById: options.userId || null,
      startDate: options.startDate || null,
      endDate: options.endDate || null,
      recordCount: data.length,
      fileFormat: options.format || 'json',
      executionTimeMs: executionTime,
    });

    return {
      reportType: 'PURCHASE_ORDER_SUMMARY' as const,
      reportName: 'Purchase Order Summary Report',
      generatedAt: new Date().toLocaleString("en-US", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }),
      parameters: options,
      data,
      summary,
      recordCount: data.length,
      executionTimeMs: executionTime,
    };
  },

  /**
   * Generate Stock Movement Analysis Report
   */
  async generateStockMovementAnalysis(
    pool: Pool,
    options: {
      startDate: Date;
      endDate: Date;
      productId?: string;
      movementType?: string;
      groupBy?: 'day' | 'week' | 'month' | 'product' | 'movement_type';
      format?: 'json' | 'pdf' | 'csv';
      userId?: string;
    }
  ) {
    const startTime = Date.now();

    const data = await reportsRepository.getStockMovementAnalysis(pool, options);

    const summary = {
      totalTransactions: data.reduce((sum, item) => sum + item.transactionCount, 0),
      totalIn: data.reduce((sum, item) => new Decimal(sum).plus(item.totalIn), new Decimal(0)).toDecimalPlaces(3).toNumber(),
      totalOut: data.reduce((sum, item) => new Decimal(sum).plus(item.totalOut), new Decimal(0)).toDecimalPlaces(3).toNumber(),
      netMovement: data.reduce((sum, item) => new Decimal(sum).plus(item.netMovement), new Decimal(0)).toDecimalPlaces(3).toNumber(),
    };

    const executionTime = Date.now() - startTime;

    await reportsRepository.logReportRun(pool, {
      reportType: 'STOCK_MOVEMENT_ANALYSIS',
      reportName: 'Stock Movement Analysis Report',
      parameters: options,
      generatedById: options.userId || null,
      startDate: options.startDate,
      endDate: options.endDate,
      recordCount: data.length,
      fileFormat: options.format || 'json',
      executionTimeMs: executionTime,
    });

    return {
      reportType: 'STOCK_MOVEMENT_ANALYSIS' as const,
      reportName: 'Stock Movement Analysis Report',
      generatedAt: new Date().toLocaleString("en-US", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }),
      parameters: options,
      data,
      summary,
      recordCount: data.length,
      executionTimeMs: executionTime,
    };
  },

  /**
   * Generate Customer Account Statement Report
   */
  async generateCustomerAccountStatement(
    pool: Pool,
    options: {
      customerId: string;
      startDate?: Date;
      endDate?: Date;
      format?: 'json' | 'pdf' | 'csv';
      userId?: string;
    }
  ) {
    const startTime = Date.now();

    const data = await reportsRepository.getCustomerAccountStatement(pool, options);

    const summary = {
      totalTransactions: data.transactions.length,
      totalSales: data.transactions.reduce((sum: Decimal, t) => new Decimal(sum).plus(t.totalAmount), new Decimal(0)).toDecimalPlaces(2).toNumber(),
      totalPaid: data.transactions.reduce((sum: Decimal, t) => new Decimal(sum).plus(t.amountPaid), new Decimal(0)).toDecimalPlaces(2).toNumber(),
      totalOutstanding: data.transactions.reduce((sum: Decimal, t) => new Decimal(sum).plus(t.balanceDue), new Decimal(0)).toDecimalPlaces(2).toNumber(),
    };

    const executionTime = Date.now() - startTime;

    await reportsRepository.logReportRun(pool, {
      reportType: 'CUSTOMER_ACCOUNT_STATEMENT',
      reportName: 'Customer Account Statement',
      parameters: options,
      generatedById: options.userId || null,
      startDate: options.startDate || null,
      endDate: options.endDate || null,
      recordCount: data.transactions.length,
      fileFormat: options.format || 'json',
      executionTimeMs: executionTime,
    });

    return {
      reportType: 'CUSTOMER_ACCOUNT_STATEMENT' as const,
      reportName: 'Customer Account Statement',
      generatedAt: new Date().toLocaleString("en-US", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }),
      parameters: options,
      data,
      summary,
      recordCount: data.transactions.length,
      executionTimeMs: executionTime,
    };
  },

  /**
   * Generate Profit Margin by Product Report
   */
  async generateProfitMarginByProduct(
    pool: Pool,
    options: {
      startDate?: Date;
      endDate?: Date;
      categoryId?: string;
      minMargin?: number;
      format?: 'json' | 'pdf' | 'csv';
      userId?: string;
    }
  ) {
    const startTime = Date.now();

    const data = await reportsRepository.getProfitMarginByProduct(pool, options);

    const summary = {
      totalProducts: data.length,
      totalRevenue: data.reduce((sum, p) => new Decimal(sum).plus(p.totalRevenue), new Decimal(0)).toDecimalPlaces(2).toNumber(),
      totalCost: data.reduce((sum, p) => new Decimal(sum).plus(p.totalCost), new Decimal(0)).toDecimalPlaces(2).toNumber(),
      totalProfit: data.reduce((sum, p) => new Decimal(sum).plus(p.totalProfit), new Decimal(0)).toDecimalPlaces(2).toNumber(),
      averageMarginPercent: data.length > 0
        ? data.reduce((sum, p) => sum.plus(p.profitMarginPercent), new Decimal(0)).dividedBy(data.length).toDecimalPlaces(2).toNumber()
        : 0,
    };

    const executionTime = Date.now() - startTime;

    await reportsRepository.logReportRun(pool, {
      reportType: 'PROFIT_MARGIN_BY_PRODUCT',
      reportName: 'Profit Margin by Product Report',
      parameters: options,
      generatedById: options.userId || null,
      startDate: options.startDate || null,
      endDate: options.endDate || null,
      recordCount: data.length,
      fileFormat: options.format || 'json',
      executionTimeMs: executionTime,
    });

    return {
      reportType: 'PROFIT_MARGIN_BY_PRODUCT' as const,
      reportName: 'Profit Margin by Product Report',
      generatedAt: new Date().toLocaleString("en-US", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }),
      parameters: options,
      data,
      summary,
      recordCount: data.length,
      executionTimeMs: executionTime,
    };
  },

  /**
   * Generate Enhanced Daily Cash Flow Report
   * Separates sales revenue from debt collections with bank-grade precision
   */
  async generateDailyCashFlow(
    pool: Pool,
    options: {
      startDate: Date;
      endDate: Date;
      paymentMethod?: string;
      format?: 'json' | 'pdf' | 'csv';
      userId?: string;
    }
  ) {
    const startTime = Date.now();

    const data = await reportsRepository.getDailyCashFlow(pool, {
      ...options,
      includeDebCollections: true
    });

    // Separate sales revenue from debt collections and deposit receipts for advanced analysis
    const salesRevenue = data.filter(d => d.revenueType === 'SALES_REVENUE');
    const debtCollections = data.filter(d => d.revenueType === 'DEBT_COLLECTION');
    const depositReceipts = data.filter(d => d.revenueType === 'DEPOSIT_RECEIPT');

    // Calculate metrics with bank-grade precision
    const salesRevenueTotal = salesRevenue.reduce((sum, d) => new Decimal(sum).plus(d.cashAmount), new Decimal(0));
    const debtCollectionsTotal = debtCollections.reduce((sum, d) => new Decimal(sum).plus(d.cashAmount), new Decimal(0));
    const depositReceiptsTotal = depositReceipts.reduce((sum, d) => new Decimal(sum).plus(d.cashAmount), new Decimal(0));
    const totalCashFlow = salesRevenueTotal.plus(debtCollectionsTotal).plus(depositReceiptsTotal);
    const totalSalesValue = salesRevenue.reduce((sum, d) => new Decimal(sum).plus(d.totalSales), new Decimal(0));
    const totalProfit = salesRevenue.reduce((sum, d) => new Decimal(sum).plus(d.grossProfit), new Decimal(0));
    const totalCreditExtended = salesRevenue.reduce((sum, d) => new Decimal(sum).plus(d.creditCreated), new Decimal(0));

    // Flat summary structure to match frontend expectations
    const summary = {
      totalDays: [...new Set(data.map(d => d.transactionDate))].length,

      // Sales Revenue Metrics (flattened for frontend)
      salesRevenue: salesRevenueTotal.toDecimalPlaces(2).toNumber(),
      salesTransactionCount: salesRevenue.reduce((sum, d) => sum + d.transactionCount, 0),
      totalSalesValue: totalSalesValue.toDecimalPlaces(2).toNumber(),
      grossProfit: totalProfit.toDecimalPlaces(2).toNumber(),
      overallProfitMargin: totalSalesValue.isZero() ? 0 : totalProfit.div(totalSalesValue).mul(100).toDecimalPlaces(2).toNumber(),

      // Debt Collections Metrics (flattened for frontend)
      debtCollections: debtCollectionsTotal.toDecimalPlaces(2).toNumber(),
      collectionsTransactionCount: debtCollections.reduce((sum, d) => sum + d.transactionCount, 0),

      // Customer Deposit Receipts (advance payments received)
      depositReceipts: depositReceiptsTotal.toDecimalPlaces(2).toNumber(),
      depositsTransactionCount: depositReceipts.reduce((sum, d) => sum + d.transactionCount, 0),

      // Combined Metrics
      totalCashIn: totalCashFlow.toDecimalPlaces(2).toNumber(),
      totalTransactions: data.reduce((sum, d) => sum + d.transactionCount, 0),

      // Revenue Composition (completely flattened for frontend)
      salesPercent: totalCashFlow.isZero() ? 0 : salesRevenueTotal.div(totalCashFlow).mul(100).toDecimalPlaces(1).toNumber(),
      collectionsPercent: totalCashFlow.isZero() ? 0 : debtCollectionsTotal.div(totalCashFlow).mul(100).toDecimalPlaces(1).toNumber(),
      depositsPercent: totalCashFlow.isZero() ? 0 : depositReceiptsTotal.div(totalCashFlow).mul(100).toDecimalPlaces(1).toNumber(),
      salesAmount: salesRevenueTotal.toDecimalPlaces(2).toNumber(),
      collectionsAmount: debtCollectionsTotal.toDecimalPlaces(2).toNumber(),
      depositsAmount: depositReceiptsTotal.toDecimalPlaces(2).toNumber(),

      // Working Capital Impact
      creditExtended: totalCreditExtended.toDecimalPlaces(2).toNumber(),

      // Business Intelligence Insights
      businessInsights: [
        ...(salesRevenueTotal.greaterThan(debtCollectionsTotal) ? ['Strong new business growth - sales exceed collections'] : []),
        ...(debtCollectionsTotal.greaterThan(salesRevenueTotal) ? ['Focus on debt recovery - collections exceed new sales'] : []),
        ...(totalProfit.div(totalSalesValue.isZero() ? new Decimal(1) : totalSalesValue).mul(100).greaterThan(20) ? ['Healthy profit margins (>20%)'] : []),
        ...(data.length > 0 && totalCashFlow.greaterThan(0) ? ['Positive overall cash flow'] : []),
        ...(depositReceiptsTotal.greaterThan(0) ? [`Customer deposits received: ${depositReceiptsTotal.toDecimalPlaces(2).toNumber()}`] : []),
      ]
    };

    const executionTime = Date.now() - startTime;

    await reportsRepository.logReportRun(pool, {
      reportType: 'DAILY_CASH_FLOW',
      reportName: 'Daily Cash Flow Report',
      parameters: options,
      generatedById: options.userId || null,
      startDate: options.startDate,
      endDate: options.endDate,
      recordCount: data.length,
      fileFormat: options.format || 'json',
      executionTimeMs: executionTime,
    });

    return {
      reportType: 'DAILY_CASH_FLOW' as const,
      reportName: 'Daily Cash Flow Report',
      generatedAt: new Date().toLocaleString("en-US", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }),
      parameters: options,
      data,
      summary,
      recordCount: data.length,
      executionTimeMs: executionTime,
    };
  },

  /**
   * Generate Supplier Payment Status Report
   */
  async generateSupplierPaymentStatus(
    pool: Pool,
    options: {
      supplierId?: string;
      status?: 'PAID' | 'PARTIAL' | 'PENDING';
      format?: 'json' | 'pdf' | 'csv';
      userId?: string;
    }
  ) {
    const startTime = Date.now();

    const data = await reportsRepository.getSupplierPaymentStatus(pool, options);

    const summary = {
      totalSuppliers: data.length,
      totalAmount: data.reduce((sum, s) => new Decimal(sum).plus(s.totalAmount), new Decimal(0)).toDecimalPlaces(2).toNumber(),
      totalPaid: data.reduce((sum, s) => new Decimal(sum).plus(s.totalPaid), new Decimal(0)).toDecimalPlaces(2).toNumber(),
      totalOutstanding: data.reduce((sum, s) => new Decimal(sum).plus(s.outstandingBalance), new Decimal(0)).toDecimalPlaces(2).toNumber(),
    };

    const executionTime = Date.now() - startTime;

    await reportsRepository.logReportRun(pool, {
      reportType: 'SUPPLIER_PAYMENT_STATUS',
      reportName: 'Supplier Payment Status Report',
      parameters: options,
      generatedById: options.userId || null,
      startDate: null,
      endDate: null,
      recordCount: data.length,
      fileFormat: options.format || 'json',
      executionTimeMs: executionTime,
    });

    return {
      reportType: 'SUPPLIER_PAYMENT_STATUS' as const,
      reportName: 'Supplier Payment Status Report',
      generatedAt: new Date().toLocaleString("en-US", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }),
      parameters: options,
      data,
      summary,
      recordCount: data.length,
      executionTimeMs: executionTime,
    };
  },

  /**
   * Generate Top Customers Report
   */
  async generateTopCustomers(
    pool: Pool,
    options: {
      startDate: Date;
      endDate: Date;
      limit?: number;
      sortBy?: 'REVENUE' | 'ORDERS' | 'PROFIT';
      format?: 'json' | 'pdf' | 'csv';
      userId?: string;
    }
  ) {
    const startTime = Date.now();

    const data = await reportsRepository.getTopCustomers(pool, options);

    const summary = {
      totalCustomers: data.length,
      totalRevenue: data.reduce((sum, c) => new Decimal(sum).plus(c.totalRevenue), new Decimal(0)).toDecimalPlaces(2).toNumber(),
      totalPurchases: data.reduce((sum, c) => sum + c.totalPurchases, 0),
      averageOrderValue: data.length > 0
        ? new Decimal(data.reduce((sum, c) => new Decimal(sum).plus(c.totalRevenue), new Decimal(0))).div(data.reduce((sum, c) => sum + c.totalPurchases, 0)).toDecimalPlaces(2).toNumber()
        : 0,
    };

    const executionTime = Date.now() - startTime;

    await reportsRepository.logReportRun(pool, {
      reportType: 'TOP_CUSTOMERS',
      reportName: 'Top Customers Report',
      parameters: options,
      generatedById: options.userId || null,
      startDate: options.startDate,
      endDate: options.endDate,
      recordCount: data.length,
      fileFormat: options.format || 'json',
      executionTimeMs: executionTime,
    });

    return {
      reportType: 'TOP_CUSTOMERS' as const,
      reportName: 'Top Customers Report',
      generatedAt: new Date().toLocaleString("en-US", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }),
      parameters: options,
      data,
      summary,
      recordCount: data.length,
      executionTimeMs: executionTime,
    };
  },

  /**
   * Generate Customer Aging Report
   */
  async generateCustomerAging(
    pool: Pool,
    options: {
      asOfDate?: Date;
      format?: 'json' | 'pdf' | 'csv';
      userId?: string;
    }
  ) {
    const startTime = Date.now();

    const data = await reportsRepository.getCustomerAging(pool, {
      asOfDate: options.asOfDate,
    });

    const summary = {
      totalCustomers: data.length,
      totalOutstanding: data.reduce((sum, c) => new Decimal(sum).plus(c.totalOutstanding), new Decimal(0)).toDecimalPlaces(2).toNumber(),
      current: data.reduce((sum, c) => new Decimal(sum).plus(c.current), new Decimal(0)).toDecimalPlaces(2).toNumber(),
      days30: data.reduce((sum, c) => new Decimal(sum).plus(c.days30), new Decimal(0)).toDecimalPlaces(2).toNumber(),
      days60: data.reduce((sum, c) => new Decimal(sum).plus(c.days60), new Decimal(0)).toDecimalPlaces(2).toNumber(),
      days90: data.reduce((sum, c) => new Decimal(sum).plus(c.days90), new Decimal(0)).toDecimalPlaces(2).toNumber(),
      over90: data.reduce((sum, c) => new Decimal(sum).plus(c.over90), new Decimal(0)).toDecimalPlaces(2).toNumber(),
      overdueAmount: data.reduce((sum, c) => new Decimal(sum).plus(c.overdueAmount), new Decimal(0)).toDecimalPlaces(2).toNumber(),
    };

    const executionTime = Date.now() - startTime;

    await reportsRepository.logReportRun(pool, {
      reportType: 'CUSTOMER_AGING',
      reportName: 'Customer Aging Report',
      parameters: options,
      generatedById: options.userId || null,
      startDate: null,
      endDate: null,
      recordCount: data.length,
      fileFormat: options.format || 'json',
      executionTimeMs: executionTime,
    });

    return {
      reportType: 'CUSTOMER_AGING' as const,
      reportName: 'Customer Aging Report',
      generatedAt: new Date().toLocaleString("en-US", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }),
      parameters: options,
      data,
      summary,
      recordCount: data.length,
      executionTimeMs: executionTime,
    };
  },

  /**
   * Generate Stock Aging Report
   */
  async generateStockAging(
    pool: Pool,
    options: {
      asOfDate?: Date;
      categoryId?: string;
      format?: 'json' | 'pdf' | 'csv';
      userId?: string;
    }
  ) {
    const startTime = Date.now();

    const data = await reportsRepository.getStockAging(pool, options);

    const summary = {
      totalBatches: data.length,
      totalValue: data.reduce((sum, b) => new Decimal(sum).plus(b.totalValue), new Decimal(0)).toDecimalPlaces(2).toNumber(),
      averageDaysInStock: data.length > 0
        ? Math.round(data.reduce((sum, b) => sum + b.daysInStock, 0) / data.length)
        : 0,
      oldestBatchDays: data.length > 0 ? Math.max(...data.map(b => b.daysInStock)) : 0,
    };

    const executionTime = Date.now() - startTime;

    await reportsRepository.logReportRun(pool, {
      reportType: 'STOCK_AGING',
      reportName: 'Stock Aging Report',
      parameters: options,
      generatedById: options.userId || null,
      startDate: null,
      endDate: null,
      recordCount: data.length,
      fileFormat: options.format || 'json',
      executionTimeMs: executionTime,
    });

    return {
      reportType: 'STOCK_AGING' as const,
      reportName: 'Stock Aging Report',
      generatedAt: new Date().toLocaleString("en-US", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }),
      parameters: options,
      data,
      summary,
      recordCount: data.length,
      executionTimeMs: executionTime,
    };
  },

  /**
   * Generate Waste & Damage Report
   */
  async generateWasteDamageReport(
    pool: Pool,
    options: {
      startDate: Date;
      endDate: Date;
      productId?: string;
      format?: 'json' | 'pdf' | 'csv';
      userId?: string;
    }
  ) {
    const startTime = Date.now();

    const data = await reportsRepository.getWasteDamageReport(pool, options);

    const summary = {
      totalLossEvents: data.length,
      totalQuantityLost: data.reduce((sum, l) => new Decimal(sum).plus(l.quantityLost), new Decimal(0)).toDecimalPlaces(3).toNumber(),
      totalLossValue: data.reduce((sum, l) => new Decimal(sum).plus(l.totalLossValue), new Decimal(0)).toDecimalPlaces(2).toNumber(),
      damageCount: data.filter(l => l.lossType === 'DAMAGE').length,
      expiryCount: data.filter(l => l.lossType === 'EXPIRY').length,
    };

    const executionTime = Date.now() - startTime;

    await reportsRepository.logReportRun(pool, {
      reportType: 'WASTE_DAMAGE_REPORT',
      reportName: 'Waste & Damage Report',
      parameters: options,
      generatedById: options.userId || null,
      startDate: options.startDate,
      endDate: options.endDate,
      recordCount: data.length,
      fileFormat: options.format || 'json',
      executionTimeMs: executionTime,
    });

    return {
      reportType: 'WASTE_DAMAGE_REPORT' as const,
      reportName: 'Waste & Damage Report',
      generatedAt: new Date().toLocaleString("en-US", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }),
      parameters: options,
      data,
      summary,
      recordCount: data.length,
      executionTimeMs: executionTime,
    };
  },

  /**
   * Generate Reorder Recommendations Report
   */
  async generateReorderRecommendations(
    pool: Pool,
    options: {
      categoryId?: string;
      daysToConsider?: number;
      format?: 'json' | 'pdf' | 'csv';
      userId?: string;
    }
  ) {
    const startTime = Date.now();

    const data = await reportsRepository.getReorderRecommendations(pool, {
      categoryId: options.categoryId,
      daysToAnalyze: options.daysToConsider,
    });

    const summary = {
      totalProductsNeedingReorder: data.length,
      urgentCount: data.filter(p => p.priority === 'URGENT').length,
      highCount: data.filter(p => p.priority === 'HIGH').length,
      mediumCount: data.filter(p => p.priority === 'MEDIUM').length,
      totalEstimatedCost: data.reduce((sum, p) => new Decimal(sum).plus(p.estimatedOrderCost), new Decimal(0)).toDecimalPlaces(2).toNumber(),
      trendingUp: data.filter(p => p.demandTrend === 'INCREASING').length,
      trendingDown: data.filter(p => p.demandTrend === 'DECREASING').length,
      avgLeadTimeDays: data.length > 0
        ? new Decimal(data.reduce((sum, p) => sum + p.leadTimeDays, 0)).dividedBy(data.length).toDecimalPlaces(1).toNumber()
        : 0,
    };

    const executionTime = Date.now() - startTime;

    await reportsRepository.logReportRun(pool, {
      reportType: 'REORDER_RECOMMENDATIONS',
      reportName: 'Reorder Recommendations Report',
      parameters: options,
      generatedById: options.userId || null,
      startDate: null,
      endDate: null,
      recordCount: data.length,
      fileFormat: options.format || 'json',
      executionTimeMs: executionTime,
    });

    return {
      reportType: 'REORDER_RECOMMENDATIONS' as const,
      reportName: 'Reorder Recommendations Report',
      generatedAt: new Date().toLocaleString("en-US", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }),
      parameters: options,
      data,
      summary,
      recordCount: data.length,
      executionTimeMs: executionTime,
    };
  },

  /**
   * Generate Sales by Category Report
   */
  async generateSalesByCategory(
    pool: Pool,
    options: {
      startDate: Date;
      endDate: Date;
      format?: 'pdf' | 'csv' | 'json';
      userId?: string;
    }
  ) {
    const startTime = Date.now();
    const data = await reportsRepository.getSalesByCategory(pool, options);
    const executionTime = Date.now() - startTime;

    const summary = {
      totalCategories: data.length,
      totalRevenue: data.reduce((sum: Decimal, item) => sum.plus(item.totalRevenue), new Decimal(0)).toDecimalPlaces(2).toNumber(),
      totalProfit: data.reduce((sum: Decimal, item) => sum.plus(item.grossProfit), new Decimal(0)).toDecimalPlaces(2).toNumber(),
      totalTransactions: data.reduce((sum, item) => sum + item.transactionCount, 0),
      topCategory: data.length > 0 ? data[0].category : null,
    };

    // Audit logging handled by controller layer

    return {
      reportType: 'SALES_BY_CATEGORY' as const,
      reportName: 'Sales by Category Report',
      generatedAt: new Date().toLocaleString("en-US", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }),
      parameters: options,
      data,
      summary,
      recordCount: data.length,
      executionTimeMs: executionTime,
    };
  },

  /**
   * Generate Sales by Payment Method Report
   */
  async generateSalesByPaymentMethod(
    pool: Pool,
    options: {
      startDate: Date;
      endDate: Date;
      format?: 'pdf' | 'csv' | 'json';
      userId?: string;
    }
  ) {
    const startTime = Date.now();
    const data = await reportsRepository.getSalesByPaymentMethod(pool, options);
    const executionTime = Date.now() - startTime;

    const summary = {
      totalPaymentMethods: data.length,
      totalRevenue: data.reduce((sum: Decimal, item) => sum.plus(item.totalRevenue), new Decimal(0)).toDecimalPlaces(2).toNumber(),
      totalTransactions: data.reduce((sum, item) => sum + item.transactionCount, 0),
      topPaymentMethod: data.length > 0 ? data[0].paymentMethod : null,
    };

    // Audit logging handled by controller layer

    return {
      reportType: 'SALES_BY_PAYMENT_METHOD' as const,
      reportName: 'Sales by Payment Method Report',
      generatedAt: new Date().toLocaleString("en-US", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }),
      parameters: options,
      data,
      summary,
      recordCount: data.length,
      executionTimeMs: executionTime,
    };
  },

  /**
   * Generate Hourly Sales Analysis Report
   */
  async generateHourlySalesAnalysis(
    pool: Pool,
    options: {
      startDate: Date;
      endDate: Date;
      format?: 'pdf' | 'csv' | 'json';
      userId?: string;
    }
  ) {
    const startTime = Date.now();
    const data = await reportsRepository.getHourlySalesAnalysis(pool, options);
    const executionTime = Date.now() - startTime;

    const peakHour = data.length > 0 ? data.reduce((max, item) =>
      item.totalRevenue > max.totalRevenue ? item : max
    ) : null;

    const summary = {
      totalHours: data.length,
      totalRevenue: data.reduce((sum: Decimal, item) => sum.plus(item.totalRevenue), new Decimal(0)).toDecimalPlaces(2).toNumber(),
      totalTransactions: data.reduce((sum, item) => sum + item.transactionCount, 0),
      peakHour: peakHour?.hour,
      peakHourRevenue: peakHour?.totalRevenue || 0,
    };

    // Audit logging handled by controller layer

    return {
      reportType: 'HOURLY_SALES_ANALYSIS' as const,
      reportName: 'Hourly Sales Analysis Report',
      generatedAt: new Date().toLocaleString("en-US", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }),
      parameters: options,
      data,
      summary,
      recordCount: data.length,
      executionTimeMs: executionTime,
    };
  },

  /**
   * Generate Sales Comparison Report
   */
  async generateSalesComparison(
    pool: Pool,
    options: {
      currentStartDate: Date;
      currentEndDate: Date;
      previousStartDate: Date;
      previousEndDate: Date;
      groupBy: 'day' | 'week' | 'month';
      format?: 'pdf' | 'csv' | 'json';
      userId?: string;
    }
  ) {
    const startTime = Date.now();
    const data = await reportsRepository.getSalesComparison(pool, options);
    const executionTime = Date.now() - startTime;

    const totalCurrentSales = data.reduce((sum: Decimal, item) => sum.plus(item.currentSales), new Decimal(0));
    const totalPreviousSales = data.reduce((sum: Decimal, item) => sum.plus(item.previousSales), new Decimal(0));
    const overallChange = totalPreviousSales.isZero() ? new Decimal(100) :
      totalCurrentSales.minus(totalPreviousSales).dividedBy(totalPreviousSales).times(100);

    const summary = {
      totalPeriods: data.length,
      currentPeriodSales: totalCurrentSales.toDecimalPlaces(2).toNumber(),
      previousPeriodSales: totalPreviousSales.toDecimalPlaces(2).toNumber(),
      totalDifference: totalCurrentSales.minus(totalPreviousSales).toDecimalPlaces(2).toNumber(),
      overallPercentageChange: overallChange.toDecimalPlaces(2).toNumber(),
    };

    // Audit logging handled by controller layer

    return {
      reportType: 'SALES_COMPARISON' as const,
      reportName: 'Sales Comparison Report',
      generatedAt: new Date().toLocaleString("en-US", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }),
      parameters: options,
      data,
      summary,
      recordCount: data.length,
      executionTimeMs: executionTime,
    };
  },

  /**
   * Generate Customer Purchase History Report
   */
  async generateCustomerPurchaseHistory(
    pool: Pool,
    options: {
      customerId: string;
      startDate: Date;
      endDate: Date;
      format?: 'pdf' | 'csv' | 'json';
      userId?: string;
    }
  ) {
    const startTime = Date.now();
    const data = await reportsRepository.getCustomerPurchaseHistory(pool, options);
    const executionTime = Date.now() - startTime;

    const summary = {
      totalPurchases: data.length,
      totalSpent: data.reduce((sum: Decimal, item) => sum.plus(item.totalAmount), new Decimal(0)).toDecimalPlaces(2).toNumber(),
      totalPaid: data.reduce((sum: Decimal, item) => sum.plus(item.amountPaid), new Decimal(0)).toDecimalPlaces(2).toNumber(),
      totalOutstanding: data.reduce((sum: Decimal, item) => sum.plus(item.outstandingBalance), new Decimal(0)).toDecimalPlaces(2).toNumber(),
      averagePurchaseValue: data.length > 0 ?
        data.reduce((sum: Decimal, item) => sum.plus(item.totalAmount), new Decimal(0)).dividedBy(data.length).toDecimalPlaces(2).toNumber() : 0,
    };

    // Audit logging handled by controller layer

    return {
      reportType: 'CUSTOMER_PURCHASE_HISTORY' as const,
      reportName: 'Customer Purchase History Report',
      generatedAt: new Date().toLocaleString("en-US", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }),
      parameters: options,
      data,
      summary,
      recordCount: data.length,
      executionTimeMs: executionTime,
    };
  },

  /**
   * Generate Comprehensive Business Position Report
   * Advanced business health assessment with bank-grade precision
   */
  async generateBusinessPositionReport(
    pool: Pool,
    options: {
      reportDate: Date;
      includeComparisons?: boolean;
      includeForecasts?: boolean;
      format?: 'json' | 'pdf' | 'csv';
      userId?: string;
    }
  ) {
    const startTime = Date.now();

    const data = await reportsRepository.getBusinessPositionReport(pool, {
      reportDate: options.reportDate,
      includeComparisons: options.includeComparisons,
      includeForecasts: options.includeForecasts,
    });

    // Advanced business intelligence calculations with bank-grade precision
    const enhancedAnalysis = {
      // Liquidity Ratios (Bank-grade analysis)
      liquidityMetrics: {
        currentRatio: data.cashPosition.totalCashIn > 0 ?
          new Decimal(data.cashPosition.totalCashIn)
            .div(Math.max(data.cashPosition.newCreditExtended, 1))
            .toDecimalPlaces(2).toNumber() : 0,
        quickRatio: data.cashPosition.totalCashIn > 0 ?
          new Decimal(data.cashPosition.totalCashIn)
            .div(Math.max(data.cashPosition.outstandingReceivables, 1))
            .toDecimalPlaces(2).toNumber() : 0,
        cashTurnoverRatio: data.salesPerformance.totalRevenue > 0 ?
          new Decimal(data.cashPosition.totalCashIn)
            .div(data.salesPerformance.totalRevenue)
            .toDecimalPlaces(2).toNumber() : 0,
      },

      // Profitability Analysis
      profitabilityMetrics: {
        grossProfitMargin: data.cashPosition.profitMarginPercent,
        netProfitRatio: data.salesPerformance.totalRevenue > 0 ?
          new Decimal(data.salesPerformance.grossProfit)
            .div(data.salesPerformance.totalRevenue)
            .mul(100).toDecimalPlaces(2).toNumber() : 0,
        returnOnSales: data.salesPerformance.totalRevenue > 0 ?
          new Decimal(data.salesPerformance.grossProfit)
            .div(data.salesPerformance.totalRevenue)
            .mul(100).toDecimalPlaces(2).toNumber() : 0,
      },

      // Efficiency Metrics
      efficiencyMetrics: {
        assetTurnover: data.inventoryHealth.inventoryValue > 0 ?
          new Decimal(data.salesPerformance.totalRevenue)
            .div(data.inventoryHealth.inventoryValue)
            .toDecimalPlaces(2).toNumber() : 0,
        inventoryTurnover: data.inventoryHealth.inventoryValue > 0 ?
          new Decimal(data.salesPerformance.totalCost)
            .div(data.inventoryHealth.inventoryValue)
            .toDecimalPlaces(2).toNumber() : 0,
        receivablesToSalesRatio: data.salesPerformance.totalRevenue > 0 ?
          new Decimal(data.customerMetrics.totalReceivables)
            .div(data.salesPerformance.totalRevenue)
            .mul(100).toDecimalPlaces(2).toNumber() : 0,
      },

      // Customer Analytics
      customerInsights: {
        customerRetentionIndicator: data.customerMetrics.totalCustomers > 0 ?
          new Decimal(data.salesPerformance.uniqueCustomers)
            .div(data.customerMetrics.totalCustomers)
            .mul(100).toDecimalPlaces(2).toNumber() : 0,
        averageCustomerValue: data.salesPerformance.uniqueCustomers > 0 ?
          new Decimal(data.salesPerformance.totalRevenue)
            .div(data.salesPerformance.uniqueCustomers)
            .toDecimalPlaces(2).toNumber() : 0,
        creditUtilizationRate: data.customerMetrics.totalCustomers > 0 ?
          new Decimal(data.customerMetrics.customersWithBalance)
            .div(data.customerMetrics.totalCustomers)
            .mul(100).toDecimalPlaces(2).toNumber() : 0,
      },

      // Risk Assessment (Advanced)
      riskMetrics: {
        concentrationRisk: data.salesPerformance.customerRevenue > 0 ?
          new Decimal(data.salesPerformance.customerRevenue)
            .div(data.salesPerformance.totalRevenue)
            .mul(100).toDecimalPlaces(2).toNumber() : 0,
        badDebtRisk: data.customerMetrics.totalReceivables > 0 ?
          new Decimal(data.customerMetrics.totalReceivables)
            .div(Math.max(data.salesPerformance.totalRevenue * 30, 1)) // 30 days of sales
            .mul(100).toDecimalPlaces(2).toNumber() : 0,
        inventoryObsolescenceRisk: data.inventoryHealth.totalProducts > 0 ?
          new Decimal(data.inventoryHealth.lowStockItems + data.inventoryHealth.expiringUnits)
            .div(data.inventoryHealth.totalProducts)
            .mul(100).toDecimalPlaces(2).toNumber() : 0,
      },

      // Performance Benchmarks
      performanceBenchmarks: {
        dailyRevenueTarget: 10000, // Configurable business target
        profitMarginTarget: 25,    // Configurable business target
        inventoryTurnoverTarget: 12, // Configurable business target
        collectionEfficiencyTarget: 85, // Configurable business target
      },

      // Recommendations (AI-driven insights)
      recommendations: (() => {
        const recommendations = [];

        if (data.cashPosition.cashCollectionRate < 70) {
          recommendations.push({
            priority: 'HIGH',
            category: 'CASH_FLOW',
            message: 'Cash collection rate is below 70%. Consider tightening credit terms or implementing automated collection processes.',
            impact: 'FINANCIAL'
          });
        }

        if (data.cashPosition.profitMarginPercent < 15) {
          recommendations.push({
            priority: 'HIGH',
            category: 'PROFITABILITY',
            message: 'Profit margin is below 15%. Review pricing strategy and cost management.',
            impact: 'PROFITABILITY'
          });
        }

        if (data.inventoryHealth.lowStockItems > data.inventoryHealth.totalProducts * 0.2) {
          recommendations.push({
            priority: 'MEDIUM',
            category: 'INVENTORY',
            message: 'Over 20% of products are low stock. Review reorder points and supplier lead times.',
            impact: 'OPERATIONAL'
          });
        }

        if (data.customerMetrics.newCustomers30d < data.customerMetrics.totalCustomers * 0.1) {
          recommendations.push({
            priority: 'MEDIUM',
            category: 'GROWTH',
            message: 'Customer acquisition rate is low. Consider marketing initiatives to attract new customers.',
            impact: 'GROWTH'
          });
        }

        if (data.riskAssessment.overallRiskLevel === 'HIGH') {
          recommendations.push({
            priority: 'URGENT',
            category: 'RISK_MANAGEMENT',
            message: 'Overall business risk is HIGH. Immediate attention required for risk mitigation.',
            impact: 'STRATEGIC'
          });
        }

        return recommendations;
      })(),
    };

    const executionTime = Date.now() - startTime;

    // Log report generation
    await reportsRepository.logReportRun(pool, {
      reportType: 'BUSINESS_POSITION',
      reportName: 'Comprehensive Business Position Report',
      parameters: options,
      generatedById: options.userId || null,
      startDate: options.reportDate,
      endDate: options.reportDate,
      recordCount: 1,
      fileFormat: options.format || 'json',
      executionTimeMs: executionTime,
    });

    return {
      reportType: 'BUSINESS_POSITION' as const,
      reportName: 'Comprehensive Business Position Report',
      generatedAt: new Date().toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      }),
      parameters: options,
      data: {
        ...data,
        enhancedAnalysis,
      },
      summary: {
        businessHealthScore: data.businessHealthScore,
        overallRiskLevel: data.riskAssessment.overallRiskLevel,
        keyMetrics: {
          totalRevenue: data.salesPerformance.totalRevenue,
          grossProfit: data.salesPerformance.grossProfit,
          totalCashIn: data.cashPosition.totalCashIn,
          outstandingReceivables: data.cashPosition.outstandingReceivables,
          inventoryValue: data.inventoryHealth.inventoryValue,
        },
        criticalAlerts: enhancedAnalysis.recommendations.filter(r => r.priority === 'URGENT' || r.priority === 'HIGH').length,
      },
      recordCount: 1,
      executionTimeMs: executionTime,
    };
  },
};



