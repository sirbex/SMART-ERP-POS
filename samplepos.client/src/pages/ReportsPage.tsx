// Reports Page - Modern reporting interface with categorized reports
// Enhanced visual design with card-based layout and intuitive filters
//
// 🎯 DYNAMIC ARCHITECTURE: This component automatically adapts to new backend fields
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. Summary Cards: Uses Object.entries(reportData.summary) to render ALL fields
// 2. Data Table: Uses Object.keys() and Object.entries() for dynamic columns/rows
// 3. CSV Export: Automatically includes all fields from first row
// 4. Field Formatting: formatFieldValue() uses keyword detection to format ANY field
// 5. Color Coding: getFieldColorClass() applies semantic colors based on field name
//
// ✨ ADDING NEW FIELDS TO BACKEND:
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. Add field to repository SQL query (e.g., SUM(s.new_field) as newField)
// 2. Add field to service summary calculations
// 3. Frontend automatically renders it with proper formatting
// 4. No ReportsPage.tsx changes needed!
//
// 💡 SUPPORTED FIELD TYPES (Auto-detected by keyword in field name):
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// - Count (PRIORITY): fields ending with orders, suppliers, customers, products, items,
//     transactions, batches, records, movements, entries, receipts, invoices, users, categories
//     or containing 'count' → plain number (NOT currency)
// - Non-monetary (PRIORITY): fields ending with terms, method, status, type, days → plain number
// - Currency: amount, value, cost, price, revenue, profit, discount, sales, payment, balance, total, subtotal
// - Percentage: margin, rate, percentage, change, ratio
// - Quantity: quantity, count, units, items
// - Date: date, time (string or Date object)
// - Boolean: true/false → ✓/✗
// - Numbers: Default locale formatting
// - Strings: Direct display
//
// 🎨 AUTO-COLOR CODING:
// ━━━━━━━━━━━━━━━━━━━━━
// - Discounts: RED (always)
// - Costs/Expenses: ORANGE
// - Revenue/Sales/Income: GREEN
// - Profit: GREEN (positive) / RED (negative)
// - Percentages: GREEN (positive) / RED (negative)
// - IDs (customerNumber, etc.): BLUE background badge
// - Readable IDs (*Number): INDIGO
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { formatCurrency } from '../utils/currency';
import { api } from '../services/api';
import CustomerAgingReport from '../components/reports/CustomerAgingReport';
import { DateRangeFilter } from '../components/ui/DateRangeFilter';

// TIMEZONE STRATEGY: Display dates without conversion
// Backend returns DATE as YYYY-MM-DD string (no timezone)
// Frontend displays as-is without parsing to Date object
const formatDisplayDate = (dateString: string | null | undefined): string => {
  if (!dateString) return 'N/A';

  // If it's an ISO string, extract the date part
  if (dateString.includes('T')) {
    return dateString.split('T')[0];
  }

  return dateString;
};

/**
 * Dynamic field formatting utility
 * Automatically detects field type and applies appropriate formatting
 * Supports: currency, percentages, dates, numbers, strings
 */
const formatFieldValue = (key: string, value: unknown): string => {
  const lowerKey = key.toLowerCase();

  if (value === null || value === undefined) return '-';

  if (typeof value === 'number') {
    // Count-like fields that happen to contain currency keywords (e.g., totalOrders, totalSuppliers)
    // These are entity counts, NOT monetary values — check BEFORE currency detection
    const isCountField = (
      lowerKey.endsWith('orders') ||
      lowerKey.endsWith('suppliers') ||
      lowerKey.endsWith('customers') ||
      lowerKey.endsWith('products') ||
      lowerKey.endsWith('items') ||
      lowerKey.endsWith('transactions') ||
      lowerKey.endsWith('batches') ||
      lowerKey.endsWith('records') ||
      lowerKey.endsWith('movements') ||
      lowerKey.endsWith('entries') ||
      lowerKey.endsWith('receipts') ||
      lowerKey.endsWith('invoices') ||
      lowerKey.endsWith('users') ||
      lowerKey.endsWith('categories') ||
      lowerKey.includes('count') ||
      lowerKey.includes('needingreorder')
    );
    if (isCountField) {
      return value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }

    // Non-monetary numeric fields — velocity, stock levels, lead times, safety stock, forecast
    const isNonMonetaryField = (
      lowerKey.endsWith('terms') ||
      lowerKey.endsWith('method') ||
      lowerKey.endsWith('status') ||
      lowerKey.endsWith('type') ||
      lowerKey.endsWith('days') ||
      lowerKey.includes('velocity') ||
      lowerKey.includes('safetystock') ||
      lowerKey.includes('reorderpoint') ||
      lowerKey.includes('stock') ||
      lowerKey.includes('level') ||
      lowerKey.includes('forecast') ||
      lowerKey.includes('seasonalindex') ||
      lowerKey.includes('learningcycles')
    );
    if (isNonMonetaryField) {
      return value.toLocaleString();
    }

    // Trend ratio — displayed as multiplier (×1.19), not percentage
    if (lowerKey.includes('trendratio') || lowerKey === 'trendRatio') {
      return `×${value.toFixed(2)}`;
    }

    // Quantity/count fields (quantity, count, units, items)
    // Check BEFORE currency — totalQuantity, totalUnitsSold etc. contain 'total' but are NOT currency
    if (
      lowerKey.includes('quantity') ||
      lowerKey.includes('units')
    ) {
      return value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 3 });
    }

    // Currency fields (amount, value, cost, price, revenue, profit, discount, sales, payment, balance)
    if (
      lowerKey.includes('amount') ||
      lowerKey.includes('value') ||
      lowerKey.includes('cost') ||
      lowerKey.includes('price') ||
      lowerKey.includes('revenue') ||
      lowerKey.includes('profit') ||
      lowerKey.includes('discount') ||
      lowerKey.includes('sales') ||
      lowerKey.includes('payment') ||
      lowerKey.includes('balance') ||
      lowerKey.includes('total') ||
      lowerKey.includes('subtotal')
    ) {
      return formatCurrency(value);
    }

    // Percentage fields (margin, rate, percentage, change)
    if (
      lowerKey.includes('margin') ||
      lowerKey.includes('rate') ||
      lowerKey.includes('percentage') ||
      lowerKey.includes('change')
    ) {
      return `${value.toFixed(2)}%`;
    }

    // Default number formatting
    return value.toLocaleString();
  }

  // Date fields
  if (value instanceof Date) {
    return value.toLocaleDateString();
  }

  // String date fields (ISO format or YYYY-MM-DD)
  if (typeof value === 'string' && (lowerKey.includes('date') || lowerKey.includes('time'))) {
    return formatDisplayDate(value);
  }

  // Boolean fields
  if (typeof value === 'boolean') {
    return value ? '✓' : '✗';
  }

  // Default string formatting
  return String(value);
};

/**
 * Get color class for field value based on field type
 * Returns appropriate Tailwind color class for visual distinction
 */
const getFieldColorClass = (key: string, value: unknown): string => {
  const lowerKey = key.toLowerCase();

  // String-based status/priority coloring
  if (typeof value === 'string') {
    const upperVal = value.toUpperCase();
    if (lowerKey === 'priority' || lowerKey === 'urgency') {
      if (upperVal === 'URGENT' || upperVal === 'CRITICAL') return 'text-red-600';
      if (upperVal === 'HIGH') return 'text-orange-600';
      if (upperVal === 'MEDIUM') return 'text-yellow-600';
      return 'text-green-600';
    }
    if (lowerKey === 'demandtrend' || lowerKey === 'trend') {
      if (upperVal === 'INCREASING') return 'text-green-600';
      if (upperVal === 'DECREASING') return 'text-red-600';
      return 'text-gray-600';
    }
    return 'text-gray-900';
  }

  if (typeof value !== 'number') return 'text-gray-900';

  // Count-like fields — neutral color, not monetary
  const isCountField = (
    lowerKey.endsWith('orders') ||
    lowerKey.endsWith('suppliers') ||
    lowerKey.endsWith('customers') ||
    lowerKey.endsWith('products') ||
    lowerKey.endsWith('items') ||
    lowerKey.endsWith('transactions') ||
    lowerKey.endsWith('batches') ||
    lowerKey.endsWith('records') ||
    lowerKey.endsWith('movements') ||
    lowerKey.endsWith('entries') ||
    lowerKey.endsWith('receipts') ||
    lowerKey.endsWith('invoices') ||
    lowerKey.endsWith('users') ||
    lowerKey.endsWith('categories') ||
    lowerKey.includes('count') ||
    lowerKey.includes('needingreorder')
  );
  if (isCountField) {
    return 'text-blue-600';
  }

  // Non-monetary numeric fields (terms, method, status, days, velocity, stock, safety, reorder, forecast)
  const isNonMonetaryField = (
    lowerKey.endsWith('terms') ||
    lowerKey.endsWith('method') ||
    lowerKey.endsWith('status') ||
    lowerKey.endsWith('type') ||
    lowerKey.endsWith('days') ||
    lowerKey.includes('velocity') ||
    lowerKey.includes('safetystock') ||
    lowerKey.includes('reorderpoint') ||
    lowerKey.includes('stock') ||
    lowerKey.includes('level') ||
    lowerKey.includes('trendratio') ||
    lowerKey.includes('forecast') ||
    lowerKey.includes('seasonalindex') ||
    lowerKey.includes('learningcycles')
  );
  if (isNonMonetaryField) {
    return 'text-gray-900';
  }

  // Discount fields - always red
  if (lowerKey.includes('discount')) {
    return 'text-red-600';
  }

  // Cost/expense fields - orange
  if (lowerKey.includes('cost') || lowerKey.includes('expense')) {
    return 'text-orange-600';
  }

  // Profit fields - green if positive, red if negative
  if (lowerKey.includes('profit')) {
    return value >= 0 ? 'text-green-600' : 'text-red-600';
  }

  // Revenue/sales/income fields - green
  if (lowerKey.includes('revenue') || lowerKey.includes('sales') || lowerKey.includes('income')) {
    return 'text-green-600';
  }

  // Percentage fields - green if positive, red if negative
  if (
    lowerKey.includes('margin') ||
    lowerKey.includes('rate') ||
    lowerKey.includes('percentage') ||
    lowerKey.includes('change')
  ) {
    return value >= 0 ? 'text-green-600' : 'text-red-600';
  }

  // Default green for positive monetary values
  if (
    lowerKey.includes('amount') ||
    lowerKey.includes('value') ||
    lowerKey.includes('price') ||
    lowerKey.includes('payment') ||
    lowerKey.includes('balance')
  ) {
    return 'text-green-600';
  }

  return 'text-gray-900';
};

// Report type definitions
type ReportType =
  | 'INVENTORY_VALUATION'
  | 'SALES_REPORT'
  | 'EXPIRING_ITEMS'
  | 'LOW_STOCK'
  | 'BEST_SELLING_PRODUCTS'
  | 'SUPPLIER_COST_ANALYSIS'
  | 'GOODS_RECEIVED'
  | 'PAYMENT_REPORT'
  | 'CUSTOMER_PAYMENTS'
  | 'PROFIT_LOSS'
  | 'DELETED_ITEMS'
  | 'INVENTORY_ADJUSTMENTS'
  | 'PURCHASE_ORDER_SUMMARY'
  | 'STOCK_MOVEMENT_ANALYSIS'
  | 'CUSTOMER_ACCOUNT_STATEMENT'
  | 'PROFIT_MARGIN_BY_PRODUCT'
  | 'DAILY_CASH_FLOW'
  | 'SUPPLIER_PAYMENT_STATUS'
  | 'TOP_CUSTOMERS'
  | 'STOCK_AGING'
  | 'WASTE_DAMAGE_REPORT'
  | 'REORDER_RECOMMENDATIONS'
  | 'SALES_BY_CATEGORY'
  | 'SALES_BY_PAYMENT_METHOD'
  | 'HOURLY_SALES_ANALYSIS'
  | 'SALES_COMPARISON'
  | 'CUSTOMER_PURCHASE_HISTORY'
  | 'SALES_SUMMARY_BY_DATE'
  | 'SALES_DETAILS_REPORT'
  | 'SALES_BY_CASHIER'
  | 'CUSTOMER_AGING_REPORT'
  | 'CASH_REGISTER_SESSION'
  | 'CASH_REGISTER_MOVEMENT_BREAKDOWN'
  | 'CASH_REGISTER_SESSION_HISTORY';

interface ReportOption {
  value: ReportType;
  label: string;
  description: string;
  requiresDateRange: boolean;
  supportsFilters: string[];
  category: 'Sales' | 'Inventory' | 'Financial' | 'Customer' | 'Supplier';
  icon: string;
}

const REPORT_OPTIONS: ReportOption[] = [
  {
    value: 'INVENTORY_VALUATION',
    label: 'Inventory Valuation',
    description: 'Stock value using FIFO, AVCO, or LIFO methods',
    requiresDateRange: false,
    supportsFilters: ['valuationMethod', 'category'],
    category: 'Inventory',
    icon: '📦',
  },
  {
    value: 'SALES_REPORT',
    label: 'Sales Report',
    description: 'Revenue, profit, and transactions by period or category',
    requiresDateRange: true,
    supportsFilters: ['groupBy', 'customer', 'paymentMethod'],
    category: 'Sales',
    icon: '📊',
  },
  {
    value: 'EXPIRING_ITEMS',
    label: 'Expiring Items',
    description: 'Products approaching expiry dates with potential loss',
    requiresDateRange: false,
    supportsFilters: ['daysAhead', 'category'],
    category: 'Inventory',
    icon: '⏰',
  },
  {
    value: 'LOW_STOCK',
    label: 'Low Stock Alert',
    description: 'Products below reorder levels (Critical/Low/Warning)',
    requiresDateRange: false,
    supportsFilters: ['threshold', 'category'],
    category: 'Inventory',
    icon: '⚠️',
  },
  {
    value: 'BEST_SELLING_PRODUCTS',
    label: 'Best Selling Products',
    description: 'Top products by quantity sold or revenue',
    requiresDateRange: true,
    supportsFilters: ['limit', 'category'],
    category: 'Sales',
    icon: '🏆',
  },
  {
    value: 'SUPPLIER_COST_ANALYSIS',
    label: 'Supplier Cost Analysis',
    description: 'Performance metrics, lead times, and costs by supplier',
    requiresDateRange: true,
    supportsFilters: ['supplier'],
    category: 'Supplier',
    icon: '🏭',
  },
  {
    value: 'GOODS_RECEIVED',
    label: 'Goods Received',
    description: 'Detailed goods receipt log with values',
    requiresDateRange: true,
    supportsFilters: ['supplier', 'product'],
    category: 'Inventory',
    icon: '📥',
  },
  {
    value: 'PAYMENT_REPORT',
    label: 'Payment Report',
    description: 'Payment method breakdown with transaction counts',
    requiresDateRange: true,
    supportsFilters: ['paymentMethod'],
    category: 'Financial',
    icon: '💳',
  },
  {
    value: 'CUSTOMER_PAYMENTS',
    label: 'Customer Payments',
    description: 'Outstanding balances, overdue amounts, and payment history',
    requiresDateRange: true,
    supportsFilters: ['customer', 'status'],
    category: 'Customer',
    icon: '💰',
  },
  {
    value: 'PROFIT_LOSS',
    label: 'Profit & Loss',
    description: 'Comprehensive P&L statement with COGS and margins',
    requiresDateRange: true,
    supportsFilters: ['groupBy'],
    category: 'Financial',
    icon: '📈',
  },
  {
    value: 'DELETED_ITEMS',
    label: 'Deleted Items',
    description: 'Audit trail of deactivated products',
    requiresDateRange: false,
    supportsFilters: [],
    category: 'Inventory',
    icon: '🗑️',
  },
  {
    value: 'INVENTORY_ADJUSTMENTS',
    label: 'Inventory Adjustments',
    description: 'Stock movement history with reasons',
    requiresDateRange: true,
    supportsFilters: ['product'],
    category: 'Inventory',
    icon: '🔄',
  },
  {
    value: 'PURCHASE_ORDER_SUMMARY',
    label: 'Purchase Order Summary',
    description: 'PO status, supplier performance, and ordering trends',
    requiresDateRange: true,
    supportsFilters: ['supplier', 'status'],
    category: 'Supplier',
    icon: '📋',
  },
  {
    value: 'STOCK_MOVEMENT_ANALYSIS',
    label: 'Stock Movement Analysis',
    description: 'Detailed stock movements by type (goods receipt, sales, etc.)',
    requiresDateRange: true,
    supportsFilters: ['product', 'movementType'],
    category: 'Inventory',
    icon: '📦',
  },
  {
    value: 'CUSTOMER_ACCOUNT_STATEMENT',
    label: 'Customer Account Statement',
    description: 'Transaction history and balance tracking per customer',
    requiresDateRange: true,
    supportsFilters: ['customer'],
    category: 'Customer',
    icon: '📄',
  },
  {
    value: 'CUSTOMER_AGING_REPORT',
    label: 'Customer Aging Report',
    description: 'Outstanding customer balances by aging periods (0-30, 31-60, 61-90, 90+ days)',
    requiresDateRange: false,
    supportsFilters: [],
    category: 'Customer',
    icon: '📊',
  },
  {
    value: 'PROFIT_MARGIN_BY_PRODUCT',
    label: 'Profit Margin by Product',
    description: 'Product-level profitability analysis with margins',
    requiresDateRange: true,
    supportsFilters: ['category', 'minMargin'],
    category: 'Financial',
    icon: '💹',
  },
  {
    value: 'DAILY_CASH_FLOW',
    label: 'Daily Cash Flow',
    description: 'Cash in/out tracking by payment method',
    requiresDateRange: true,
    supportsFilters: [],
    category: 'Financial',
    icon: '💵',
  },
  {
    value: 'SUPPLIER_PAYMENT_STATUS',
    label: 'Supplier Payment Status',
    description: 'Outstanding supplier payment tracking',
    requiresDateRange: false,
    supportsFilters: ['supplier', 'status'],
    category: 'Supplier',
    icon: '💸',
  },
  {
    value: 'TOP_CUSTOMERS',
    label: 'Top Customers',
    description: 'Customer ranking by revenue, orders, or profit',
    requiresDateRange: true,
    supportsFilters: ['limit', 'sortBy'],
    category: 'Customer',
    icon: '⭐',
  },
  {
    value: 'STOCK_AGING',
    label: 'Stock Aging Report',
    description: 'Inventory aging analysis with days in stock',
    requiresDateRange: false,
    supportsFilters: ['category'],
    category: 'Inventory',
    icon: '📅',
  },
  {
    value: 'WASTE_DAMAGE_REPORT',
    label: 'Waste & Damage Report',
    description: 'Loss tracking by reason (damage, expiry, theft)',
    requiresDateRange: true,
    supportsFilters: ['reason'],
    category: 'Inventory',
    icon: '⚠️',
  },
  {
    value: 'REORDER_RECOMMENDATIONS',
    label: 'Smart Reorder AI',
    description: 'AI inventory assistant: sales velocity, lead times, seasonal trends, safety stock',
    requiresDateRange: false,
    supportsFilters: ['daysToConsider', 'category'],
    category: 'Inventory',
    icon: '🤖',
  },
  {
    value: 'SALES_BY_CATEGORY',
    label: 'Sales by Category',
    description: 'Revenue and profit analysis grouped by product category',
    requiresDateRange: true,
    supportsFilters: [],
    category: 'Sales',
    icon: '📂',
  },
  {
    value: 'SALES_BY_PAYMENT_METHOD',
    label: 'Sales by Payment Method',
    description: 'Payment method breakdown with percentages and totals',
    requiresDateRange: true,
    supportsFilters: [],
    category: 'Sales',
    icon: '💳',
  },
  {
    value: 'HOURLY_SALES_ANALYSIS',
    label: 'Hourly Sales Analysis',
    description: 'Sales patterns by hour of day with peak time identification',
    requiresDateRange: true,
    supportsFilters: [],
    category: 'Sales',
    icon: '🕐',
  },
  {
    value: 'SALES_COMPARISON',
    label: 'Sales Comparison',
    description: 'Period-over-period comparison with growth metrics',
    requiresDateRange: true,
    supportsFilters: ['groupBy'],
    category: 'Sales',
    icon: '📉',
  },
  {
    value: 'CUSTOMER_PURCHASE_HISTORY',
    label: 'Customer Purchase History',
    description: 'Detailed transaction history for individual customers',
    requiresDateRange: true,
    supportsFilters: ['customer'],
    category: 'Customer',
    icon: '🛒',
  },
  {
    value: 'SALES_SUMMARY_BY_DATE',
    label: 'Sales Summary by Date',
    description: 'Temporal sales analysis grouped by day, week, or month',
    requiresDateRange: true,
    supportsFilters: ['groupBy'],
    category: 'Sales',
    icon: '📅',
  },
  {
    value: 'SALES_DETAILS_REPORT',
    label: 'Sales Details Report',
    description: 'Product sales by date showing quantity (in sale UOM), revenue, and profit margin %',
    requiresDateRange: true,
    supportsFilters: ['productId'],
    category: 'Sales',
    icon: '📋',
  },
  {
    value: 'SALES_BY_CASHIER',
    label: 'Sales by Cashier',
    description: 'Sales performance breakdown by user/cashier',
    requiresDateRange: true,
    supportsFilters: ['userId'],
    category: 'Sales',
    icon: '👤',
  },
  {
    value: 'CASH_REGISTER_SESSION',
    label: 'Cash Register Session Summary',
    description: 'Detailed summary of a specific cash register session',
    requiresDateRange: false,
    supportsFilters: ['sessionId'],
    category: 'Financial',
    icon: '🧾',
  },
  {
    value: 'CASH_REGISTER_MOVEMENT_BREAKDOWN',
    label: 'Cash Register Movement Breakdown',
    description: 'Breakdown of cash movements by type (sales, refunds, adjustments)',
    requiresDateRange: true,
    supportsFilters: [],
    category: 'Financial',
    icon: '💰',
  },
  {
    value: 'CASH_REGISTER_SESSION_HISTORY',
    label: 'Cash Register Session History',
    description: 'Historical view of all cash register sessions',
    requiresDateRange: true,
    supportsFilters: ['cashierId'],
    category: 'Financial',
    icon: '📜',
  },
];

// Dynamic report data interface - covers all report types
interface ReportDataSummary {
  totalCashIn?: number;
  overallProfitMargin?: number;
  salesRevenue?: number;
  salesPercent?: number;
  debtCollections?: number;
  collectionsPercent?: number;
  totalDays?: number;
  totalSalesValue?: number;
  grossProfit?: number;
  totalTransactions?: number;
  creditExtended?: number;
  businessInsights?: string | string[];
  [key: string]: unknown;
}

interface ReportDataCustomer {
  customerNumber?: string;
  name?: string;
  email?: string;
  phone?: string;
  creditLimit?: number;
  currentBalance?: number;
}

interface ReportData {
  reportName?: string;
  reportType?: string;
  generatedAt?: string;
  recordCount?: number;
  executionTimeMs?: number;
  summary: ReportDataSummary;
  data: Record<string, unknown>[];
  customer?: ReportDataCustomer;
  transactions?: Record<string, unknown>[];
  [key: string]: unknown;
}

export default function ReportsPage() {
  const [selectedReport, setSelectedReport] = useState<ReportType | null>(null);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filter states
  const [valuationMethod, setValuationMethod] = useState<'FIFO' | 'AVCO' | 'LIFO'>('FIFO');
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month' | 'product' | 'customer' | 'payment_method'>('day');
  const [daysAhead, setDaysAhead] = useState<number>(30);
  const [limit, setLimit] = useState<number>(20);
  const [threshold, setThreshold] = useState<number>(50);
  const [sortBy, setSortBy] = useState<'REVENUE' | 'ORDERS' | 'PROFIT'>('REVENUE');
  const [daysToConsider, setDaysToConsider] = useState<number>(30);
  const [minMargin, setMinMargin] = useState<number>(0);
  const [movementType, setMovementType] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [status, setStatus] = useState<string>('');

  // Sales Comparison specific states
  const [previousStartDate, setPreviousStartDate] = useState<string>('');
  const [previousEndDate, setPreviousEndDate] = useState<string>('');

  // Customer Purchase History specific state
  const [customerId, setCustomerId] = useState<string>('');

  // Cash Register Session specific state
  const [sessionId, setSessionId] = useState<string>('');

  const selectedReportOption = REPORT_OPTIONS.find((r) => r.value === selectedReport);

  const handleGenerateReport = async () => {
    if (!selectedReport) {
      setError('Please select a report type');
      return;
    }

    const reportOption = REPORT_OPTIONS.find((r) => r.value === selectedReport);
    if (reportOption?.requiresDateRange && (!startDate || !endDate)) {
      setError('Please select start and end dates');
      return;
    }

    setIsLoading(true);
    setError(null);
    setReportData(null);

    try {
      // Build request parameters based on report type
      const params: Record<string, string | number | undefined> = {
        reportType: selectedReport,
      };

      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;

      // Add specific filters based on report type
      if (selectedReport === 'INVENTORY_VALUATION') {
        params.valuationMethod = valuationMethod;
      } else if (selectedReport === 'SALES_REPORT' || selectedReport === 'PROFIT_LOSS') {
        params.groupBy = groupBy;
      } else if (selectedReport === 'EXPIRING_ITEMS') {
        params.daysAhead = daysAhead;
      } else if (selectedReport === 'LOW_STOCK') {
        params.threshold = threshold;
      } else if (selectedReport === 'BEST_SELLING_PRODUCTS') {
        params.limit = limit;
      } else if (selectedReport === 'TOP_CUSTOMERS') {
        params.limit = limit;
        params.sortBy = sortBy;
      } else if (selectedReport === 'PROFIT_MARGIN_BY_PRODUCT' && minMargin > 0) {
        params.minMargin = minMargin;
      } else if (selectedReport === 'STOCK_MOVEMENT_ANALYSIS' && movementType) {
        params.movementType = movementType;
      } else if (selectedReport === 'WASTE_DAMAGE_REPORT' && reason) {
        params.reason = reason;
      } else if (selectedReport === 'SUPPLIER_PAYMENT_STATUS' && status) {
        params.status = status;
      } else if (selectedReport === 'REORDER_RECOMMENDATIONS') {
        params.daysToConsider = daysToConsider;
      } else if (selectedReport === 'SALES_COMPARISON') {
        // Sales Comparison requires 4 dates: current period and previous period
        params.currentStartDate = startDate;
        params.currentEndDate = endDate;
        params.previousStartDate = previousStartDate;
        params.previousEndDate = previousEndDate;
        params.groupBy = groupBy;
      } else if (selectedReport === 'CUSTOMER_PURCHASE_HISTORY') {
        // Customer Purchase History requires customer ID
        params.customerId = customerId;
      } else if (selectedReport === 'CUSTOMER_ACCOUNT_STATEMENT') {
        // Customer Account Statement requires customer number (CUST-0001)
        params.customerNumber = customerId; // Using customerId state variable for customer number input
      } else if (selectedReport === 'SALES_SUMMARY_BY_DATE') {
        // Sales Summary by Date - requires groupBy
        params.groupBy = groupBy;
      } else if (selectedReport === 'CASH_REGISTER_SESSION') {
        // Cash Register Session requires session ID
        params.sessionId = sessionId;
      }

      const { data: result } = await api.post('/reports/generate', params);

      setReportData(result.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate report');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportPDF = async () => {
    if (!selectedReport) {
      alert('Please select a report type first');
      return;
    }

    const reportOption = REPORT_OPTIONS.find((r) => r.value === selectedReport);
    if (reportOption?.requiresDateRange && (!startDate || !endDate)) {
      alert('Please select start and end dates');
      return;
    }

    try {
      const token = localStorage.getItem('auth_token');

      // Map report types to their API endpoints
      const reportEndpointMap: Record<string, string> = {
        'SALES_DETAILS_REPORT': 'sales-details',
        'SALES_BY_CASHIER': 'sales-by-cashier',
        'SALES_SUMMARY_BY_DATE': 'sales-summary-by-date',
        'INVENTORY_VALUATION': 'inventory-valuation',
        'LOW_STOCK': 'low-stock',
        'EXPIRING_ITEMS': 'expiring-items',
        'BEST_SELLING_PRODUCTS': 'best-selling',
        'PAYMENT_REPORT': 'payments',
        'PROFIT_LOSS': 'profit-loss',
        'TOP_CUSTOMERS': 'top-customers',
        'SALES_REPORT': 'sales',
        'GOODS_RECEIVED': 'goods-received',
        'SUPPLIER_COST_ANALYSIS': 'supplier-cost-analysis',
        'CUSTOMER_PAYMENTS': 'customer-payments',
        'DAILY_CASH_FLOW': 'daily-cash-flow',
        'PURCHASE_ORDER_SUMMARY': 'purchase-order-summary',
        'STOCK_MOVEMENT_ANALYSIS': 'stock-movement-analysis',
        'PROFIT_MARGIN_BY_PRODUCT': 'profit-margin',
        'SUPPLIER_PAYMENT_STATUS': 'supplier-payment-status',
        'STOCK_AGING': 'stock-aging',
        'WASTE_DAMAGE_REPORT': 'waste-damage',
        'DELETED_ITEMS': 'deleted-items',
        'INVENTORY_ADJUSTMENTS': 'inventory-adjustments',
        'CUSTOMER_ACCOUNT_STATEMENT': 'customer-account-statement',
        'REORDER_RECOMMENDATIONS': 'reorder-recommendations',
        'SALES_BY_CATEGORY': 'sales-by-category',
        'SALES_BY_PAYMENT_METHOD': 'sales-by-payment-method',
        'HOURLY_SALES_ANALYSIS': 'hourly-sales-analysis',
        'SALES_COMPARISON': 'sales-comparison',
        'CUSTOMER_PURCHASE_HISTORY': 'customer-purchase-history',
        'CUSTOMER_AGING_REPORT': 'customer-aging',
        'CASH_REGISTER_MOVEMENT_BREAKDOWN': 'cash-register/movement-breakdown',
        'CASH_REGISTER_SESSION_HISTORY': 'cash-register/session-history',
      };

      const endpoint = reportEndpointMap[selectedReport];
      if (!endpoint) {
        alert('PDF export not yet available for this report');
        return;
      }

      // Build query parameters
      const params = new URLSearchParams();
      params.append('format', 'pdf');

      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);

      // Add report-specific parameters
      if (selectedReport === 'INVENTORY_VALUATION' && valuationMethod) {
        params.append('valuation_method', valuationMethod);
      } else if (selectedReport === 'SALES_SUMMARY_BY_DATE' && groupBy) {
        params.append('group_by', groupBy);
      } else if (selectedReport === 'PROFIT_LOSS' && groupBy) {
        params.append('group_by', groupBy);
      } else if (selectedReport === 'EXPIRING_ITEMS') {
        params.append('days_threshold', daysAhead.toString());
      } else if (selectedReport === 'LOW_STOCK') {
        params.append('threshold_percentage', threshold.toString());
      } else if (selectedReport === 'BEST_SELLING_PRODUCTS') {
        params.append('limit', limit.toString());
      } else if (selectedReport === 'TOP_CUSTOMERS') {
        params.append('limit', limit.toString());
        if (sortBy) params.append('sort_by', sortBy);
      } else if (selectedReport === 'CUSTOMER_ACCOUNT_STATEMENT' && customerId) {
        params.append('customer_number', customerId);
      } else if (selectedReport === 'CUSTOMER_PURCHASE_HISTORY' && customerId) {
        params.append('customer_id', customerId);
      } else if (selectedReport === 'SALES_COMPARISON') {
        // Sales Comparison needs different date parameters - override the default ones
        params.delete('start_date');
        params.delete('end_date');
        params.append('current_start_date', startDate);
        params.append('current_end_date', endDate);
        params.append('previous_start_date', previousStartDate);
        params.append('previous_end_date', previousEndDate);
        if (groupBy) params.append('group_by', groupBy);
      }

      // Use relative URL to go through Vite proxy (avoids CORS issues)
      const url = `/api/reports/${endpoint}?${params.toString()}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        // Try to parse error as JSON
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to generate PDF');
        } else {
          throw new Error(`Failed to generate PDF: ${response.statusText}`);
        }
      }

      // Verify we got a PDF
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/pdf')) {
        throw new Error('Server did not return a PDF file. Please try again.');
      }

      // Download the PDF
      const blob = await response.blob();

      console.log('PDF Blob Info:', {
        size: blob.size,
        type: blob.type,
        reportType: selectedReport
      });

      if (blob.size === 0) {
        throw new Error('Received empty PDF file from server');
      }

      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `${selectedReport.toLowerCase()}-${new Date().toLocaleDateString('en-CA')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);

    } catch (err: unknown) {
      console.error('PDF export error:', err);
      alert(err instanceof Error ? err.message : 'Failed to export PDF. Please try again.');
    }
  };

  /**
   * Export report data to CSV format
   * DYNAMIC: Automatically includes ALL fields from backend response
   * No manual field mapping required - new backend fields appear automatically
   */
  const handleExportCSV = () => {
    if (!reportData?.data) return;

    // Dynamic CSV export - automatically includes all fields from first row
    const headers = Object.keys(reportData.data[0] || {});
    const csvContent =
      headers.join(',') +
      '\n' +
      reportData.data
        .map((row: Record<string, unknown>) =>
          headers.map((header) => JSON.stringify(row[header] || '')).join(',')
        )
        .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedReport}_${new Date().toLocaleDateString('en-CA')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderFilterOptions = () => {
    if (!selectedReportOption) return null;

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Date Range Filters */}
        {selectedReportOption.requiresDateRange && (
          <div className="col-span-full">
            <DateRangeFilter
              startDate={startDate}
              endDate={endDate}
              onStartDateChange={setStartDate}
              onEndDateChange={setEndDate}
              defaultPreset="THIS_MONTH"
            />
          </div>
        )}

        {/* Valuation Method */}
        {selectedReportOption.supportsFilters.includes('valuationMethod') && (
          <div>
            <label htmlFor="valuationMethod" className="block text-sm font-semibold text-gray-700 mb-2">
              💼 Valuation Method
            </label>
            <select
              id="valuationMethod"
              value={valuationMethod}
              onChange={(e) => setValuationMethod(e.target.value as 'FIFO' | 'AVCO' | 'LIFO')}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
              aria-label="Valuation method"
            >
              <option value="FIFO">FIFO (First In First Out)</option>
              <option value="AVCO">AVCO (Average Cost)</option>
              <option value="LIFO">LIFO (Last In First Out)</option>
            </select>
          </div>
        )}

        {/* Group By */}
        {selectedReportOption.supportsFilters.includes('groupBy') && (
          <div>
            <label htmlFor="groupBy" className="block text-sm font-semibold text-gray-700 mb-2">
              📊 Group By
            </label>
            <select
              id="groupBy"
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as 'day' | 'week' | 'month' | 'product' | 'customer' | 'payment_method')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Group by"
            >
              <option value="day">Day</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
              {selectedReport === 'SALES_REPORT' && (
                <>
                  <option value="product">Product</option>
                  <option value="customer">Customer</option>
                  <option value="payment_method">Payment Method</option>
                </>
              )}
            </select>
          </div>
        )}

        {/* Days Ahead */}
        {selectedReportOption.supportsFilters.includes('daysAhead') && (
          <div>
            <label htmlFor="daysAhead" className="block text-sm font-semibold text-gray-700 mb-2">
              Days Ahead
            </label>
            <input
              id="daysAhead"
              type="number"
              value={daysAhead}
              onChange={(e) => setDaysAhead(parseInt(e.target.value))}
              min="1"
              max="365"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Days ahead"
            />
          </div>
        )}

        {/* Limit */}
        {selectedReportOption.supportsFilters.includes('limit') && (
          <div>
            <label htmlFor="limit" className="block text-sm font-semibold text-gray-700 mb-2">
              Limit (Top N)
            </label>
            <input
              id="limit"
              type="number"
              value={limit}
              onChange={(e) => setLimit(parseInt(e.target.value))}
              min="1"
              max="100"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Limit top N products"
            />
          </div>
        )}

        {/* Threshold */}
        {selectedReportOption.supportsFilters.includes('threshold') && (
          <div>
            <label htmlFor="threshold" className="block text-sm font-semibold text-gray-700 mb-2">
              Threshold (%)
            </label>
            <input
              id="threshold"
              type="number"
              value={threshold}
              onChange={(e) => setThreshold(parseInt(e.target.value))}
              min="1"
              max="100"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Stock threshold percentage"
            />
          </div>
        )}

        {/* Sort By */}
        {selectedReportOption.supportsFilters.includes('sortBy') && (
          <div>
            <label htmlFor="sortBy" className="block text-sm font-semibold text-gray-700 mb-2">
              Sort By
            </label>
            <select
              id="sortBy"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'REVENUE' | 'ORDERS' | 'PROFIT')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Sort by"
            >
              <option value="REVENUE">Revenue</option>
              <option value="ORDERS">Orders</option>
              <option value="PROFIT">Profit</option>
            </select>
          </div>
        )}

        {/* Days To Consider */}
        {selectedReportOption.supportsFilters.includes('daysToConsider') && (
          <div>
            <label htmlFor="daysToConsider" className="block text-sm font-semibold text-gray-700 mb-2">
              Days to Consider
            </label>
            <input
              id="daysToConsider"
              type="number"
              value={daysToConsider}
              onChange={(e) => setDaysToConsider(parseInt(e.target.value))}
              min="7"
              max="365"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Days to consider for reorder"
            />
          </div>
        )}

        {/* Min Margin */}
        {selectedReportOption.supportsFilters.includes('minMargin') && (
          <div>
            <label htmlFor="minMargin" className="block text-sm font-semibold text-gray-700 mb-2">
              Min Margin (%)
            </label>
            <input
              id="minMargin"
              type="number"
              value={minMargin}
              onChange={(e) => setMinMargin(parseFloat(e.target.value))}
              min="0"
              max="100"
              step="0.1"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Minimum profit margin"
            />
          </div>
        )}

        {/* Movement Type */}
        {selectedReportOption.supportsFilters.includes('movementType') && (
          <div>
            <label htmlFor="movementType" className="block text-sm font-semibold text-gray-700 mb-2">
              Movement Type
            </label>
            <select
              id="movementType"
              value={movementType}
              onChange={(e) => setMovementType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Movement type"
            >
              <option value="">All Types</option>
              <option value="GOODS_RECEIPT">Goods Receipt</option>
              <option value="SALE">Sale</option>
              <option value="ADJUSTMENT_IN">Adjustment In</option>
              <option value="ADJUSTMENT_OUT">Adjustment Out</option>
              <option value="TRANSFER_IN">Transfer In</option>
              <option value="TRANSFER_OUT">Transfer Out</option>
              <option value="RETURN">Return</option>
              <option value="DAMAGE">Damage</option>
              <option value="EXPIRY">Expiry</option>
            </select>
          </div>
        )}

        {/* Reason (for Waste/Damage) */}
        {selectedReportOption.supportsFilters.includes('reason') && (
          <div>
            <label htmlFor="reason" className="block text-sm font-semibold text-gray-700 mb-2">
              Reason
            </label>
            <select
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Reason for waste/damage"
            >
              <option value="">All Reasons</option>
              <option value="DAMAGE">Damage</option>
              <option value="EXPIRY">Expiry</option>
              <option value="THEFT">Theft</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
        )}

        {/* Status */}
        {selectedReportOption.supportsFilters.includes('status') && (
          <div>
            <label htmlFor="status" className="block text-sm font-semibold text-gray-700 mb-2">
              Status
            </label>
            <select
              id="status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Payment status"
            >
              <option value="">All Status</option>
              <option value="PENDING">Pending</option>
              <option value="PAID">Paid</option>
              <option value="PARTIAL">Partial</option>
            </select>
          </div>
        )}

        {/* Sales Comparison - Previous Period Dates */}
        {selectedReport === 'SALES_COMPARISON' && (
          <div className="col-span-full">
            <DateRangeFilter
              startDate={previousStartDate}
              endDate={previousEndDate}
              onStartDateChange={setPreviousStartDate}
              onEndDateChange={setPreviousEndDate}
              label="Previous Period"
              defaultPreset="LAST_MONTH"
            />
          </div>
        )}

        {/* Customer Purchase History - Customer ID */}
        {selectedReport === 'CUSTOMER_PURCHASE_HISTORY' && (
          <div>
            <label htmlFor="customerId" className="block text-sm font-semibold text-gray-700 mb-2">
              Customer Number
            </label>
            <input
              id="customerId"
              type="text"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              placeholder="CUST-0001"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              aria-label="Customer Number"
            />
            <p className="text-xs text-gray-500 mt-1">Enter customer number (e.g., CUST-0001)</p>
          </div>
        )}

        {/* Customer Account Statement - Customer Number */}
        {selectedReport === 'CUSTOMER_ACCOUNT_STATEMENT' && (
          <div>
            <label htmlFor="customerId" className="block text-sm font-semibold text-gray-700 mb-2">
              Customer Number
            </label>
            <input
              id="customerId"
              type="text"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value.toUpperCase())}
              placeholder="CUST-0001"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm uppercase"
              aria-label="Customer Number"
            />
            <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Available: CUST-0001, CUST-0002, CUST-0003, CUST-0004, CUST-0006
            </p>
          </div>
        )}

        {/* Cash Register Session - Session ID */}
        {selectedReport === 'CASH_REGISTER_SESSION' && (
          <div>
            <label htmlFor="sessionId" className="block text-sm font-semibold text-gray-700 mb-2">
              Session Number
            </label>
            <input
              id="sessionId"
              type="text"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value.toUpperCase())}
              placeholder="REG-2026-0001"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm uppercase"
              aria-label="Session Number"
            />
            <p className="text-xs text-gray-500 mt-1">Enter session number (e.g., REG-2026-0001)</p>
          </div>
        )}
      </div>
    );
  };

  const renderReportData = () => {
    if (!reportData) return null;

    return (
      <div className="space-y-6">
        {/* Report Header - Enhanced */}
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white p-6 rounded-xl shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-bold mb-2 flex items-center gap-2">
                {selectedReportOption?.icon} {reportData.reportName}
              </h3>
              <p className="text-blue-100 text-sm">
                Generated: {reportData.generatedAt?.includes('T') ? `${formatDisplayDate(reportData.generatedAt)} ${reportData.generatedAt.split('T')[1].substring(0, 8)}` : formatDisplayDate(reportData.generatedAt)}
              </p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold">{reportData.recordCount}</div>
              <div className="text-blue-100 text-sm">Records</div>
              <div className="text-blue-100 text-xs mt-1">{reportData.executionTimeMs}ms</div>
            </div>
          </div>
        </div>

        {/* Daily Cash Flow - Mobile-Optimized Summary */}
        {reportData.reportType === 'DAILY_CASH_FLOW' && reportData.summary ? (
          <div className="space-y-4">
            {/* Key Metrics Overview */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
              <div className="bg-gradient-to-r from-green-500 to-green-600 px-4 sm:px-6 py-3">
                <h4 className="text-base sm:text-lg font-semibold text-white">💰 Cash Flow Overview</h4>
              </div>
              <div className="p-4 sm:p-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Total Cash In</p>
                    <p className="text-2xl sm:text-3xl font-bold text-green-600">{formatCurrency(reportData.summary.totalCashIn ?? 0)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Profit Margin</p>
                    <p className="text-2xl sm:text-3xl font-bold text-blue-600">{reportData.summary.overallProfitMargin?.toFixed(1)}%</p>
                  </div>
                </div>

                {/* Revenue Split Visualization */}
                <div className="mt-6">
                  <p className="text-sm font-medium text-gray-700 mb-3">Revenue Composition</p>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                        <span className="text-sm text-gray-600">Sales Revenue</span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-gray-900">{formatCurrency(reportData.summary.salesRevenue ?? 0)}</div>
                        <div className="text-xs text-gray-500">{reportData.summary.salesPercent?.toFixed(1)}%</div>
                      </div>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2 relative">
                      <div className={`absolute left-0 top-0 bg-green-500 h-2 rounded-full transition-all duration-300 ${(reportData.summary.salesPercent || 0) >= 90 ? 'w-11/12' :
                        (reportData.summary.salesPercent || 0) >= 75 ? 'w-3/4' :
                          (reportData.summary.salesPercent || 0) >= 50 ? 'w-1/2' :
                            (reportData.summary.salesPercent || 0) >= 25 ? 'w-1/4' : 'w-1/12'
                        }`}></div>
                    </div>

                    <div className="flex items-center justify-between mt-3">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                        <span className="text-sm text-gray-600">Collections</span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-gray-900">{formatCurrency(reportData.summary.debtCollections ?? 0)}</div>
                        <div className="text-xs text-gray-500">{reportData.summary.collectionsPercent?.toFixed(1)}%</div>
                      </div>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2 relative">
                      <div className={`absolute left-0 top-0 bg-blue-500 h-2 rounded-full transition-all duration-300 ${(reportData.summary.collectionsPercent || 0) >= 90 ? 'w-11/12' :
                        (reportData.summary.collectionsPercent || 0) >= 75 ? 'w-3/4' :
                          (reportData.summary.collectionsPercent || 0) >= 50 ? 'w-1/2' :
                            (reportData.summary.collectionsPercent || 0) >= 25 ? 'w-1/4' : 'w-1/12'
                        }`}></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Performance Details - Collapsible */}
            <details className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
              <summary className="bg-gradient-to-r from-blue-500 to-blue-600 px-4 sm:px-6 py-3 cursor-pointer">
                <h4 className="text-base sm:text-lg font-semibold text-white inline">📊 Performance Details</h4>
              </summary>
              <div className="p-4 sm:p-6">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Days Analyzed</p>
                    <p className="text-lg font-bold text-gray-900">{reportData.summary.totalDays}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Total Sales</p>
                    <p className="text-lg font-bold text-green-600">{formatCurrency(reportData.summary.totalSalesValue ?? 0)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Gross Profit</p>
                    <p className="text-lg font-bold text-green-600">{formatCurrency(reportData.summary.grossProfit ?? 0)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Transactions</p>
                    <p className="text-lg font-bold text-blue-600">{reportData.summary.totalTransactions}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Credit Extended</p>
                    <p className="text-lg font-bold text-orange-600">{formatCurrency(reportData.summary.creditExtended ?? 0)}</p>
                  </div>
                </div>
              </div>
            </details>

            {/* Business Insights */}
            {reportData.summary.businessInsights && (
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
                <div className="bg-gradient-to-r from-purple-500 to-purple-600 px-4 sm:px-6 py-3">
                  <h4 className="text-base sm:text-lg font-semibold text-white">🎯 Business Insights</h4>
                </div>
                <div className="p-4 sm:p-6">
                  <div className="space-y-2">
                    {reportData.summary.businessInsights && typeof reportData.summary.businessInsights === 'string' ?
                      reportData.summary.businessInsights.split(',').map((insight: string, idx: number) => (
                        <div key={idx} className="flex items-start gap-2">
                          <span className="text-green-500 mt-1">✓</span>
                          <span className="text-sm text-gray-700">{insight.trim()}</span>
                        </div>
                      )) :
                      Array.isArray(reportData.summary.businessInsights) ?
                        reportData.summary.businessInsights.map((insight: string, idx: number) => (
                          <div key={idx} className="flex items-start gap-2">
                            <span className="text-green-500 mt-1">✓</span>
                            <span className="text-sm text-gray-700">{insight}</span>
                          </div>
                        )) :
                        <div className="flex items-start gap-2">
                          <span className="text-blue-500 mt-1">ℹ</span>
                          <span className="text-sm text-gray-700">No business insights available</span>
                        </div>
                    }
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Standard Summary Statistics for Other Reports */
          reportData.summary && (
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
              <div className="bg-gradient-to-r from-purple-500 to-purple-600 px-4 sm:px-6 py-3">
                <h4 className="text-base sm:text-lg font-semibold text-white">📊 Summary Statistics</h4>
              </div>
              <div className="p-4 sm:p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                  {Object.entries(reportData.summary).map(([key, value]) => (
                    <div key={key} className="bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 rounded-lg p-3 sm:p-4 hover:shadow-md transition-shadow">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1 sm:mb-2">
                        {key.replace(/([A-Z])/g, ' $1').trim().replace(/^\w/, c => c.toUpperCase())}
                      </p>
                      <p className={`text-xl sm:text-2xl font-bold break-words ${getFieldColorClass(key, value)}`}>
                        {formatFieldValue(key, value)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )
        )}

        {/* Customer Account Statement - Special Layout */}
        {reportData.reportType === 'CUSTOMER_ACCOUNT_STATEMENT' && reportData.customer && (
          <div className="space-y-4 sm:space-y-6">
            {/* Customer Information Card */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
              <div className="bg-gradient-to-r from-indigo-500 to-indigo-600 px-4 sm:px-6 py-3">
                <h4 className="text-base sm:text-lg font-semibold text-white">👤 Customer Information</h4>
              </div>
              <div className="p-4 sm:p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Customer Number</p>
                    <p className="text-base sm:text-lg font-bold text-blue-600 bg-blue-50 px-2 sm:px-3 py-1.5 sm:py-2 rounded break-all">{reportData.customer.customerNumber}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Name</p>
                    <p className="text-base sm:text-lg font-semibold text-gray-900 break-words">{reportData.customer.name}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Email</p>
                    <p className="text-xs sm:text-sm text-gray-700 break-all">{reportData.customer.email || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Phone</p>
                    <p className="text-xs sm:text-sm text-gray-700">{reportData.customer.phone || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Credit Limit</p>
                    <p className="text-base sm:text-lg font-semibold text-gray-900">{formatCurrency(reportData.customer.creditLimit ?? 0)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Current Balance</p>
                    <p className={`text-base sm:text-lg font-bold ${(reportData.customer.currentBalance ?? 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {formatCurrency(reportData.customer.currentBalance ?? 0)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Transactions Table */}
            {reportData.transactions && reportData.transactions.length > 0 ? (
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
                <div className="bg-gradient-to-r from-green-500 to-green-600 px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <h4 className="text-base sm:text-lg font-semibold text-white">📋 Transaction History</h4>
                  <span className="text-green-100 text-xs sm:text-sm">{reportData.transactions.length} transactions</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-full">
                    <thead className="bg-gray-100 border-b-2 border-gray-300">
                      <tr>
                        <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider whitespace-nowrap">Sale Number</th>
                        <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider whitespace-nowrap">Date</th>
                        <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider whitespace-nowrap">Total Amount</th>
                        <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider whitespace-nowrap">Amount Paid</th>
                        <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider whitespace-nowrap">Balance Due</th>
                        <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider whitespace-nowrap">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {reportData.transactions.map((transaction: Record<string, unknown>, idx: number) => (
                        <tr key={idx} className="hover:bg-blue-50 transition-colors">
                          <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm">
                            <span className="font-semibold text-indigo-600">{String(transaction.saleNumber ?? '')}</span>
                          </td>
                          <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm text-gray-900 whitespace-nowrap">
                            {formatDisplayDate(transaction.saleDate as string | undefined)}
                          </td>
                          <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm">
                            <span className="font-semibold text-gray-900">{formatCurrency(Number(transaction.totalAmount ?? 0))}</span>
                          </td>
                          <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm">
                            <span className="font-semibold text-green-600">{formatCurrency(Number(transaction.amountPaid ?? 0))}</span>
                          </td>
                          <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm">
                            <span className={`font-bold ${Number(transaction.balanceDue ?? 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                              {formatCurrency(Number(transaction.balanceDue ?? 0))}
                            </span>
                          </td>
                          <td className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm">
                            <span className={`px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs font-semibold whitespace-nowrap ${transaction.paymentStatus === 'PAID'
                              ? 'bg-green-100 text-green-800'
                              : transaction.paymentStatus === 'PARTIAL'
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-red-100 text-red-800'
                              }`}>
                              {String(transaction.paymentStatus ?? '')}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 sm:p-8 text-center">
                <p className="text-gray-500 text-sm sm:text-lg">No transactions found for this customer in the selected period.</p>
              </div>
            )}
          </div>
        )}

        {/* Customer Aging Report - Special Handling (No API call needed, component fetches own data) */}
        {selectedReport === 'CUSTOMER_AGING_REPORT' && (
          <div className="space-y-6">
            {/* Back Button */}
            <button
              onClick={() => {
                setSelectedReport(null);
                setError(null);
              }}
              className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-white rounded-lg transition-colors"
            >
              ← Back to Reports
            </button>

            <CustomerAgingReport />
          </div>
        )}

        {/* Daily Cash Flow - Mobile-Optimized Data Cards */}
        {reportData.reportType === 'DAILY_CASH_FLOW' && reportData.data && reportData.data.length > 0 ? (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
            <div className="bg-gradient-to-r from-green-500 to-green-600 px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <h4 className="text-base sm:text-lg font-semibold text-white">📋 Daily Transactions</h4>
              <span className="text-green-100 text-xs sm:text-sm">{reportData.data.length} entries</span>
            </div>

            {/* Mobile Card View */}
            <div className="block sm:hidden p-4 space-y-4">
              {reportData.data.map((row: Record<string, unknown>, idx: number) => (
                <div key={idx} className="border border-gray-200 rounded-lg p-4 bg-gradient-to-r from-gray-50 to-white">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="font-semibold text-gray-900">{formatDisplayDate(row.transactionDate as string | undefined)}</div>
                      <div className="text-sm text-gray-600 mt-1">{String(row.paymentMethod ?? '')}</div>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-xs font-medium ${row.revenueType === 'SALES_REVENUE'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-blue-100 text-blue-800'
                      }`}>
                      {row.revenueType === 'SALES_REVENUE' ? '💵 Sales' : '💳 Collection'}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-3">
                    <div>
                      <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Cash Amount</div>
                      <div className="text-lg font-bold text-green-600">{formatCurrency(Number(row.cashAmount ?? 0))}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Transactions</div>
                      <div className="text-lg font-bold text-blue-600">{String(row.transactionCount ?? '')}</div>
                    </div>
                  </div>

                  {row.revenueType === 'SALES_REVENUE' && (
                    <div className="grid grid-cols-2 gap-4 pt-3 border-t border-gray-200">
                      <div>
                        <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Gross Profit</div>
                        <div className="text-sm font-semibold text-green-600">{formatCurrency(Number(row.grossProfit ?? 0))}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Profit Margin</div>
                        <div className="text-sm font-semibold text-blue-600">{typeof row.profitMargin === 'number' ? row.profitMargin.toFixed(2) : '0.00'}%</div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop Table View */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full min-w-full">
                <thead className="bg-gray-100 border-b-2 border-gray-300">
                  <tr>
                    {Object.keys(reportData.data[0]).map((header) => (
                      <th
                        key={header}
                        className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider whitespace-nowrap"
                      >
                        {header.replace(/([A-Z])/g, ' $1').trim().replace(/^\w/, c => c.toUpperCase())}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {reportData.data.slice(0, 100).map((row: Record<string, unknown>, idx: number) => (
                    <tr key={idx} className="hover:bg-blue-50 transition-colors">
                      {Object.entries(row).map(([key, value], colIdx) => (
                        <td key={colIdx} className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm whitespace-nowrap">
                          <span className={`font-semibold ${getFieldColorClass(key, value)}`}>
                            {formatFieldValue(key, value)}
                          </span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {reportData.data.length > 100 && (
              <div className="bg-yellow-50 border-t border-yellow-200 p-4 text-center">
                <p className="text-sm text-yellow-800 font-medium">
                  ⚠️ Showing first 100 of {reportData.data.length} records. Export to CSV or PDF to see all data.
                </p>
              </div>
            )}
          </div>
        ) : (
          /* Standard Data Table for Other Reports */
          reportData.data && reportData.data.length > 0 && (
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
              <div className="bg-gradient-to-r from-green-500 to-green-600 px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <h4 className="text-base sm:text-lg font-semibold text-white">📋 Detailed Data</h4>
                <span className="text-green-100 text-xs sm:text-sm">{reportData.data.length} rows</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-full">
                  <thead className="bg-gray-100 border-b-2 border-gray-300">
                    <tr>
                      {Object.keys(reportData.data[0])
                        .filter(header => {
                          // Skip UUID fields if we have readable ID alternatives
                          if (header === 'customerId' && reportData.data[0].customerNumber) return false;
                          if (header === 'customer_id' && reportData.data[0].customer_name) return false;
                          if (header === 'supplierId' && reportData.data[0].supplierNumber) return false;
                          if (header === 'supplier_id' && reportData.data[0].supplier_name) return false;
                          if (header === 'goodsReceiptId' && reportData.data[0].goodsReceiptNumber) return false;
                          if (header === 'saleId' && reportData.data[0].saleNumber) return false;
                          if (header === 'sale_id' && reportData.data[0].sale_number) return false;
                          if (header === 'productId' && reportData.data[0].productName) return false;
                          if (header === 'product_id' && (reportData.data[0].product_name || reportData.data[0].productName)) return false;
                          if (header === 'batchId' && reportData.data[0].batchNumber) return false;
                          if (header === 'batch_id' && reportData.data[0].batch_number) return false;
                          if (header === 'movementId') return false; // Stock movement IDs are internal
                          if (header === 'movement_id') return false; // Stock movement IDs are internal
                          if (header === 'id' && (reportData.data[0].orderNumber || reportData.data[0].poNumber)) return false;
                          return true;
                        })
                        .map((header) => (
                          <th
                            key={header}
                            className="px-3 sm:px-6 py-3 sm:py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider whitespace-nowrap"
                          >
                            {header.replace(/([A-Z])/g, ' $1').trim().replace(/^\w/, c => c.toUpperCase())}
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {reportData.data.slice(0, 100).map((row: Record<string, unknown>, idx: number) => (
                      <tr key={idx} className="hover:bg-blue-50 transition-colors">
                        {Object.entries(row)
                          .filter(([key]) => {
                            // Skip UUID fields if we have readable ID alternatives
                            if (key === 'customerId' && row.customerNumber) return false;
                            if (key === 'customer_id' && row.customer_name) return false;
                            if (key === 'supplierId' && row.supplierNumber) return false;
                            if (key === 'supplier_id' && row.supplier_name) return false;
                            if (key === 'goodsReceiptId' && row.goodsReceiptNumber) return false;
                            if (key === 'saleId' && row.saleNumber) return false;
                            if (key === 'sale_id' && row.sale_number) return false;
                            if (key === 'productId' && row.productName) return false;
                            if (key === 'product_id' && (row.product_name || row.productName)) return false;
                            if (key === 'batchId' && row.batchNumber) return false;
                            if (key === 'batch_id' && row.batch_number) return false;
                            if (key === 'movementId') return false; // Stock movement IDs are internal
                            if (key === 'movement_id') return false; // Stock movement IDs are internal
                            if (key === 'id' && (row.orderNumber || row.poNumber)) return false;
                            return true;
                          })
                          .map(([key, value], colIdx) => {
                            // Special formatting for specific field types
                            const isNumber = key === 'customerNumber' || key === 'supplierNumber';
                            const isReadableId = key.toLowerCase().includes('number') && typeof value === 'string';

                            return (
                              <td key={colIdx} className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm whitespace-nowrap">
                                {isNumber ? (
                                  <span className="font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded text-xs sm:text-sm">
                                    {String(value || '-')}
                                  </span>
                                ) : isReadableId ? (
                                  <span className="font-semibold text-indigo-600">
                                    {String(value || '-')}
                                  </span>
                                ) : (
                                  <span className={`font-semibold ${getFieldColorClass(key, value)}`}>
                                    {formatFieldValue(key, value)}
                                  </span>
                                )}
                              </td>
                            );
                          })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {reportData.data.length > 100 && (
                <div className="bg-yellow-50 border-t border-yellow-200 p-4 text-center">
                  <p className="text-sm text-yellow-800 font-medium">
                    ⚠️ Showing first 100 of {reportData.data.length} records. Export to CSV or PDF to see all data.
                  </p>
                </div>
              )}
            </div>
          )
        )}

        {/* Export Buttons - Enhanced */}
        <div className="flex flex-wrap gap-4">
          <button
            onClick={handleExportPDF}
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-red-600 to-red-700 text-white font-semibold rounded-lg hover:from-red-700 hover:to-red-800 focus:outline-none focus:ring-4 focus:ring-red-300 shadow-lg hover:shadow-xl transition-all"
          >
            <span className="text-xl">📄</span>
            Export PDF
          </button>
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-green-600 to-green-700 text-white font-semibold rounded-lg hover:from-green-700 hover:to-green-800 focus:outline-none focus:ring-4 focus:ring-green-300 shadow-lg hover:shadow-xl transition-all"
          >
            <span className="text-xl">📊</span>
            Export CSV
          </button>
          <button
            onClick={() => {
              setReportData(null);
              setSelectedReport(null);
            }}
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-gray-600 to-gray-700 text-white font-semibold rounded-lg hover:from-gray-700 hover:to-gray-800 focus:outline-none focus:ring-4 focus:ring-gray-300 shadow-lg hover:shadow-xl transition-all"
          >
            <span className="text-xl">🔄</span>
            New Report
          </button>
        </div>
      </div>
    );
  };

  // Group reports by category
  const groupedReports = REPORT_OPTIONS.reduce((acc, report) => {
    if (!acc[report.category]) {
      acc[report.category] = [];
    }
    acc[report.category].push(report);
    return acc;
  }, {} as Record<string, ReportOption[]>);

  const categoryColors = {
    Sales: 'from-blue-500 to-blue-600',
    Inventory: 'from-green-500 to-green-600',
    Financial: 'from-purple-500 to-purple-600',
    Customer: 'from-orange-500 to-orange-600',
    Supplier: 'from-indigo-500 to-indigo-600',
  };

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 lg:py-8 max-w-7xl">
          {/* Header */}
          <div className="mb-6 sm:mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2">📊 Reports & Analytics</h1>
              <p className="text-sm sm:text-base text-gray-600">Generate comprehensive reports across sales, inventory, and financial metrics</p>
            </div>
            <Link to="/reports/expenses">
              <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg shadow-md hover:shadow-lg transition-all flex items-center gap-2">
                💰 Expense Reports
              </button>
            </Link>
          </div>

          {/* Report Selection - Categorized Cards */}
          {!selectedReport && (
            <div className="space-y-6 sm:space-y-8">
              {Object.entries(groupedReports).map(([category, reports]) => (
                <div key={category} className="space-y-3 sm:space-y-4">
                  {/* Category Header */}
                  <div className={`inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full bg-gradient-to-r ${categoryColors[category as keyof typeof categoryColors]} text-white font-semibold shadow-lg text-sm sm:text-base`}>
                    <span className="text-base sm:text-lg">{category}</span>
                    <span className="text-xs sm:text-sm opacity-90">({reports.length})</span>
                  </div>

                  {/* Report Cards Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                    {reports.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => setSelectedReport(option.value)}
                        className="group relative bg-white p-4 sm:p-6 rounded-xl border-2 border-gray-200 hover:border-blue-400 hover:shadow-xl transition-all duration-200 text-left"
                      >
                        {/* Icon Badge */}
                        <div className="absolute -top-2 sm:-top-3 -right-2 sm:-right-3 w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-xl sm:text-2xl shadow-lg group-hover:scale-110 transition-transform">
                          {option.icon}
                        </div>

                        <div className="pr-6 sm:pr-8">
                          <h3 className="font-bold text-gray-900 mb-1 sm:mb-2 text-base sm:text-lg group-hover:text-blue-600 transition-colors">
                            {option.label}
                          </h3>
                          <p className="text-xs sm:text-sm text-gray-600 mb-2 sm:mb-3 line-clamp-2">
                            {option.description}
                          </p>

                          {/* Badges */}
                          <div className="flex flex-wrap gap-1.5 sm:gap-2">
                            {option.requiresDateRange && (
                              <span className="inline-flex items-center text-xs bg-blue-100 text-blue-700 px-2 py-0.5 sm:py-1 rounded-full font-medium">
                                📅 Date Range
                              </span>
                            )}
                            {option.supportsFilters.length > 0 && (
                              <span className="inline-flex items-center text-xs bg-green-100 text-green-700 px-2 py-0.5 sm:py-1 rounded-full font-medium">
                                🎯 {option.supportsFilters.length} Filters
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Hover Arrow */}
                        <div className="absolute bottom-3 sm:bottom-4 right-3 sm:right-4 text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">
                          →
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Selected Report Configuration */}
          {selectedReport && !reportData && (
            <form
              className="space-y-4 sm:space-y-6"
              onSubmit={(e) => {
                e.preventDefault();
                if (!isLoading) handleGenerateReport();
              }}
            >
              {/* Back Button & Report Title */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedReport(null);
                    setError(null);
                  }}
                  className="flex items-center gap-2 px-3 sm:px-4 py-2 text-sm sm:text-base text-gray-600 hover:text-gray-900 hover:bg-white rounded-lg transition-colors self-start"
                >
                  ← Back
                </button>
                <div className="flex-1">
                  <h2 className="text-2xl font-bold text-gray-900">
                    {selectedReportOption?.icon} {selectedReportOption?.label}
                  </h2>
                  <p className="text-gray-600 text-sm">{selectedReportOption?.description}</p>
                </div>
              </div>

              {/* Filter Card */}
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
                <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-6 py-4">
                  <h3 className="text-xl font-semibold text-white">⚙️ Report Parameters</h3>
                </div>
                <div className="p-6">
                  {renderFilterOptions()}
                </div>
              </div>

              {/* Generate Button */}
              <div className="flex gap-4">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 flex items-center justify-center gap-3 px-8 py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white text-lg font-semibold rounded-xl hover:from-blue-700 hover:to-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transition-all"
                >
                  {isLoading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Generating Report...
                    </>
                  ) : (
                    <>
                      🚀 Generate Report
                    </>
                  )}
                </button>
              </div>

              {/* Error Message */}
              {error && (
                <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className="text-red-500 text-xl">⚠️</span>
                    <div>
                      <p className="font-semibold text-red-800">Error</p>
                      <p className="text-sm text-red-700">{error}</p>
                    </div>
                  </div>
                </div>
              )}
            </form>
          )}

          {/* Report Results */}
          {reportData && (
            <div className="space-y-6">
              {/* Back to Configuration */}
              <button
                onClick={() => {
                  setReportData(null);
                  setError(null);
                }}
                className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-white rounded-lg transition-colors"
              >
                ← Back to Configuration
              </button>

              {renderReportData()}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}


