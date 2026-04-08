import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import Layout from '../components/Layout';
import { useSales, useSalesSummary, useSalesSummaryByDate, useSalesByCashier } from '../hooks/useApi';
import { useAuth } from '../hooks/useAuth';
import { formatCurrency } from '../utils/currency';
import Decimal from 'decimal.js';
import { api } from '../utils/api';
import { DatePicker } from '../components/ui/date-picker';
import { printReceipt } from '../lib/print';
import type { ReceiptData } from '../lib/print';
import { DocumentFlowButton } from '../components/shared/DocumentFlowButton';
import { VoidSaleModal } from '../components/sales/VoidSaleModal';
import { RefundSaleModal } from '../components/sales/RefundSaleModal';
import { useBackendPermission } from '../hooks/useBackendPermission';

// ── Local type definitions ──────────────────────────────────────────────

/** Normalized sale row for UI display (financial fields are numbers) */
interface SaleRow {
  id: string;
  saleNumber: string;
  customerId?: string;
  customerName?: string;
  cashierId?: string;
  cashierName?: string;
  soldById?: string;
  soldByName?: string;
  saleDate: string;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  totalCost: number;
  profit: number;
  profitMargin: number;
  amountPaid: number;
  paymentReceived: number;
  changeAmount: number;
  paymentMethod: string;
  status: string;
  notes?: string;
  createdAt: string;
  items?: SaleItemRow[];
  paymentLines?: PaymentLine[];
  /** Raw snake_case aliases used defensively in modal */
  discount_amount?: number | string;
  tax_amount?: number | string;
}

interface SaleItemRow {
  id?: string;
  productId?: string;
  productName?: string;
  product_name?: string;
  quantity: number | string;
  qty?: number | string;
  unitPrice?: number | string;
  unit_price?: number | string;
  price?: number | string;
  subtotal?: number | string;
  totalPrice?: number | string;
  total_price?: number | string;
  discountAmount?: number | string;
  discount_amount?: number | string;
  taxAmount?: number | string;
  totalAmount?: number | string;
  batchNumber?: string;
}

interface PaymentLine {
  paymentMethod?: string;
  payment_method?: string;
  amount: number | string;
  reference?: string;
}

interface CustomerGroup {
  customerId: string;
  customerName: string;
  salesCount: number;
  totalAmount: Decimal;
  totalProfit: Decimal;
  sales: SaleRow[];
}

interface UserGroup {
  userId: string;
  userName: string;
  salesCount: number;
  totalAmount: Decimal;
  totalProfit: Decimal;
  sales: SaleRow[];
}

interface SalesSummary {
  totalAmount?: string;
  total_amount?: string;
  totalProfit?: string;
  total_profit?: string;
  totalSales?: string;
  total_sales?: string;
  totalDiscounts?: string;
  total_discounts?: string;
  creditSalesCount?: number;
  credit_sales_count?: number;
  partialPaymentCount?: number;
  partial_payment_count?: number;
  byPaymentMethod?: Record<string, string | undefined>[];
  by_payment_method?: Record<string, string | undefined>[];
}

interface NormalizedPaymentMethod {
  paymentMethod: string;
  count: number;
  totalAmount: number;
}

interface SalesTableProps {
  sales: SaleRow[];
  onSelectSale: (sale: SaleRow) => void;
  pagination?: { page: number; totalPages: number; total: number; limit: number };
  currentPage: number;
  onPageChange: (page: number) => void;
}

interface CustomerSalesViewProps {
  customers: CustomerGroup[];
  onSelectSale: (sale: SaleRow) => void;
}

interface UserSalesViewProps {
  users: UserGroup[];
  onSelectSale: (sale: SaleRow) => void;
  startDate?: string;
  endDate?: string;
}

interface CreditSalesViewProps {
  sales: SaleRow[];
  onSelectSale: (sale: SaleRow) => void;
}

interface PartialPaymentsViewProps {
  sales: SaleRow[];
  onSelectSale: (sale: SaleRow) => void;
}

interface SaleDetailModalProps {
  sale: SaleRow;
  onClose: () => void;
  onSaleUpdated?: () => void;
}

type TabType = 'overview' | 'by-customer' | 'by-user' | 'invoices' | 'payments' | 'all-sales';
type DateFilterType =
  | 'today'
  | 'yesterday'
  | 'this-week'
  | 'last-week'
  | 'this-month'
  | 'last-month'
  | 'custom';

// Format date string from database (YYYY-MM-DD or ISO) to readable format
function formatDisplayDate(dateString: string | null | undefined): string {
  if (!dateString) return 'N/A';

  // If it's already in YYYY-MM-DD format, return as-is
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return dateString;
  }

  // If it's an ISO string, extract the date part
  if (dateString.includes('T')) {
    return dateString.split('T')[0];
  }

  return dateString;
}

// Format timestamp to display time (HH:MM:SS format)
function formatDisplayTime(timestamp: string | null | undefined): string {
  if (!timestamp) return 'N/A';

  try {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return 'N/A';

    // Format as HH:MM:SS in 24-hour format
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch (error) {
    return 'N/A';
  }
}

// Utility functions for precise date calculations
function getDateRange(filterType: DateFilterType): { start: string; end: string } {
  // Simple date formatting without any timezone manipulation
  const formatDate = (year: number, month: number, day: number): string => {
    const m = String(month).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${year}-${m}-${d}`;
  };

  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1; // getMonth() returns 0-11
  const day = today.getDate();

  let startYear = year,
    startMonth = month,
    startDay = day;
  let endYear = year,
    endMonth = month,
    endDay = day;

  switch (filterType) {
    case 'today':
      // Start and end are today
      break;

    case 'yesterday':
      const yesterday = new Date(year, month - 1, day - 1);
      startYear = endYear = yesterday.getFullYear();
      startMonth = endMonth = yesterday.getMonth() + 1;
      startDay = endDay = yesterday.getDate();
      break;

    case 'this-week':
      // Find Monday of current week
      const currentDay = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
      const daysFromMonday = currentDay === 0 ? 6 : currentDay - 1;
      const monday = new Date(year, month - 1, day - daysFromMonday);
      startYear = monday.getFullYear();
      startMonth = monday.getMonth() + 1;
      startDay = monday.getDate();
      break;

    case 'last-week':
      // Find Monday and Sunday of last week
      const currentWeekDay = today.getDay();
      const daysToLastSunday = currentWeekDay === 0 ? 7 : currentWeekDay;
      const lastSunday = new Date(year, month - 1, day - daysToLastSunday);
      const lastMonday = new Date(year, month - 1, day - daysToLastSunday - 6);

      startYear = lastMonday.getFullYear();
      startMonth = lastMonday.getMonth() + 1;
      startDay = lastMonday.getDate();
      endYear = lastSunday.getFullYear();
      endMonth = lastSunday.getMonth() + 1;
      endDay = lastSunday.getDate();
      break;

    case 'this-month':
      startDay = 1; // First day of current month
      break;

    case 'last-month':
      const lastMonth = new Date(year, month - 2, 1); // month - 2 because getMonth() is 0-based
      const lastDayOfLastMonth = new Date(year, month - 1, 0); // Day 0 = last day of previous month

      startYear = lastMonth.getFullYear();
      startMonth = lastMonth.getMonth() + 1;
      startDay = 1;
      endYear = lastDayOfLastMonth.getFullYear();
      endMonth = lastDayOfLastMonth.getMonth() + 1;
      endDay = lastDayOfLastMonth.getDate();
      break;

    default:
      return { start: '', end: '' };
  }

  return {
    start: formatDate(startYear, startMonth, startDay),
    end: formatDate(endYear, endMonth, endDay),
  };
}

export default function SalesPage() {
  const { user } = useAuth();
  const isCashier = user?.role === 'CASHIER';
  const [activeTab, setActiveTab] = useState<TabType>(isCashier ? 'all-sales' : 'overview');
  const [dateFilter, setDateFilter] = useState<DateFilterType>('this-month');

  // Initialize with this month's date range
  const initialRange = getDateRange('this-month');
  const [startDate, setStartDate] = useState<string>(initialRange.start);
  const [endDate, setEndDate] = useState<string>(initialRange.end);
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSale, setSelectedSale] = useState<SaleRow | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const limit = 50;

  // Handle date filter change
  const handleDateFilterChange = (filter: DateFilterType) => {
    setDateFilter(filter);
    if (filter !== 'custom') {
      const range = getDateRange(filter);
      setStartDate(range.start);
      setEndDate(range.end);
    }
  };

  // Fetch sales data (send dates without timezone conversion)
  const { data: salesData, isLoading: salesLoading, refetch: refetchSales } = useSales(currentPage, limit, {
    startDate: startDate ? startDate : undefined,
    endDate: endDate ? endDate : undefined,
    cashierId: isCashier ? user?.id : undefined,
  });

  // Fetch summary data
  const { data: summaryData, isLoading: summaryLoading } = useSalesSummary(
    startDate ? startDate : undefined,
    endDate ? endDate : undefined
  );

  // Fetch daily sales trend
  const { data: dailyTrendData } = useSalesSummaryByDate('day', {
    startDate: startDate ? startDate : undefined,
    endDate: endDate ? endDate : undefined,
  });

  // Fetch server-side cashier performance (correct totals, not limited by pagination)
  const { data: cashierData } = useSalesByCashier({
    startDate: startDate ? startDate : undefined,
    endDate: endDate ? endDate : undefined,
  });

  // Extract data from API responses
  // useSales now returns { data: [...], pagination: {...} }
  const sales = salesData?.data || [];
  const pagination = salesData?.pagination;

  // useSalesSummary uses default selector which extracts response.data.data (the summary object)
  const summary = summaryData || {};

  // dailyTrendData is already extracted by the hook's selector (response.data.data)
  // So it's the array directly, not wrapped in another data property
  const dailyTrendRaw = Array.isArray(dailyTrendData) ? dailyTrendData : [];

  // Normalize daily trend data (convert snake_case from DB to camelCase)
  const dailyTrend = useMemo(() => {
    return dailyTrendRaw.map((day: Record<string, unknown>) => ({
      period: String(day.period || ''),
      date: String(day.period || ''), // Use period as date
      count: Number(day.transaction_count || 0),
      totalAmount: Number(day.total_revenue || 0),
      totalCost: Number(day.total_cost || 0),
      totalProfit: Number(day.total_profit || 0),
      avgTransaction: Number(day.avg_transaction_value || 0),
    }));
  }, [dailyTrendRaw]);

  // Normalize sales data (convert snake_case from DB to camelCase for UI)
  // Following MANDATORY TypeScript Standards from copilot-instructions.md
  const normalizedSales: SaleRow[] = useMemo(() => {
    return (sales as Record<string, unknown>[]).map((sale) => {
      // Parse all financial fields as numbers (PostgreSQL numeric returns as string)
      const totalAmount = Number(sale.total_amount || sale.totalAmount || 0);
      const totalCost = Number(sale.total_cost || sale.totalCost || 0);
      const profit = Number(sale.profit || 0);
      const subtotal = Number(sale.subtotal || 0);
      const taxAmount = Number(sale.tax_amount || sale.taxAmount || 0);

      return {
        // Dual ID System (per instructions)
        id: String(sale.id || ''), // UUID - keep internal
        saleNumber: String(sale.sale_number || sale.saleNumber || ''), // Business ID - display everywhere

        // Relations
        customerId: String(sale.customer_id || sale.customerId || ''),
        customerName: String(sale.customer_name || sale.customerName || ''),
        cashierId: String(sale.cashier_id || sale.cashierId || ''),
        cashierName: String(sale.cashier_name || sale.cashierName || ''),
        soldById: String(sale.cashier_id || sale.cashierId || ''), // Alias
        soldByName: String(sale.cashier_name || sale.cashierName || ''), // Alias

        // Financial fields (always numbers, never strings)
        totalAmount,
        totalCost,
        profit,
        profitMargin: Number(sale.profit_margin || sale.profitMargin || 0),
        subtotal,
        taxAmount,
        discountAmount: Number(sale.discount_amount || sale.discountAmount || 0),
        amountPaid: Number(sale.amount_paid || sale.amountPaid || 0),
        paymentReceived: Number(sale.amount_paid || sale.amountPaid || sale.paymentReceived || 0),
        changeAmount: Number(sale.change_amount || sale.changeAmount || 0),

        // Metadata
        saleDate: String(sale.sale_date || sale.saleDate || ''),
        createdAt: String(sale.created_at || sale.createdAt || ''),
        paymentMethod: String(sale.payment_method || sale.paymentMethod || '') as
          | 'CASH'
          | 'CARD'
          | 'MOBILE_MONEY'
          | 'CREDIT',
        status: String(sale.status || 'COMPLETED') as 'COMPLETED' | 'PENDING' | 'CANCELLED',
        notes: sale.notes ? String(sale.notes) : undefined,
      };
    });
  }, [sales]);

  // Calculate KPIs
  const kpis = useMemo(() => {
    if (!summary || typeof summary !== 'object') {
      return {
        totalSales: 0,
        totalProfit: 0,
        totalDiscounts: 0,
        salesCount: 0,
        avgSale: 0,
        profitMargin: 0,
        paymentMethods: [] as NormalizedPaymentMethod[],
        creditSalesCount: 0,
        partialPaymentCount: 0,
      };
    }

    const summaryObj = summary as SalesSummary;
    const totalSales = Number(summaryObj.totalAmount || summaryObj.total_amount || 0);
    const totalProfit = Number(summaryObj.totalProfit || summaryObj.total_profit || 0);
    const totalDiscounts = Number(summaryObj.totalDiscounts || summaryObj.total_discounts || 0);
    const salesCount = Number(summaryObj.totalSales || summaryObj.total_sales || 0);
    const avgSale = salesCount > 0 ? new Decimal(totalSales).dividedBy(salesCount).toNumber() : 0;
    const profitMargin =
      totalSales > 0 ? new Decimal(totalProfit).dividedBy(totalSales).times(100).toNumber() : 0;

    // Normalize payment methods data
    const paymentMethodsRaw = summaryObj.byPaymentMethod || summaryObj.by_payment_method || [];
    const paymentMethods: NormalizedPaymentMethod[] = Array.isArray(paymentMethodsRaw)
      ? paymentMethodsRaw.map((pm) => ({
        paymentMethod: String(pm.payment_method || pm.paymentMethod || ''),
        count: Number(pm.count || 0),
        totalAmount: Number(pm.total_amount || pm.totalAmount || 0),
      }))
      : [];

    // Credit sales count from server-side summary (not limited by pagination)
    const creditSalesCount = Number(summaryObj.creditSalesCount || summaryObj.credit_sales_count || 0);
    const partialPaymentCount = Number(summaryObj.partialPaymentCount || summaryObj.partial_payment_count || 0);

    return {
      totalSales,
      totalProfit,
      totalDiscounts,
      salesCount,
      avgSale,
      profitMargin,
      paymentMethods,
      creditSalesCount,
      partialPaymentCount,
    };
  }, [summary]);

  // Filter sales
  const filteredSales = useMemo(() => {
    return normalizedSales.filter((sale) => {
      const matchesPayment =
        paymentMethodFilter === 'ALL' || sale.paymentMethod === paymentMethodFilter;
      const matchesStatus = statusFilter === 'ALL' || sale.status === statusFilter;
      const matchesSearch =
        !searchQuery ||
        sale.saleNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sale.customerName?.toLowerCase().includes(searchQuery.toLowerCase());

      return matchesPayment && matchesStatus && matchesSearch;
    });
  }, [normalizedSales, paymentMethodFilter, statusFilter, searchQuery]);

  // Group sales by customer
  const salesByCustomer = useMemo(() => {
    const grouped = new Map<string, CustomerGroup>();

    filteredSales.forEach((sale) => {
      const customerId = sale.customerId || 'WALK-IN';
      const customerName = sale.customerName || 'Walk-in Customer';

      if (!grouped.has(customerId)) {
        grouped.set(customerId, {
          customerId,
          customerName,
          salesCount: 0,
          totalAmount: new Decimal(0),
          totalProfit: new Decimal(0),
          sales: [],
        });
      }

      const customer = grouped.get(customerId)!;
      customer.salesCount++;
      customer.totalAmount = customer.totalAmount.plus(sale.totalAmount || 0);
      customer.totalProfit = customer.totalProfit.plus(sale.profit || 0);
      customer.sales.push(sale);
    });

    return Array.from(grouped.values()).sort(
      (a, b) => b.totalAmount.toNumber() - a.totalAmount.toNumber()
    );
  }, [filteredSales]);

  // Group sales by user — use SERVER-SIDE aggregation for accurate totals
  // (client-side grouping from paginated data gives wrong totals)
  const salesByUser = useMemo(() => {
    const serverRows = Array.isArray(cashierData) ? cashierData : [];

    // Build a map of paginated sales by cashier for the expandable detail view
    const salesByCashierId = new Map<string, SaleRow[]>();
    filteredSales.forEach((sale) => {
      const uid = sale.cashierId || sale.soldById || 'UNKNOWN';
      if (!salesByCashierId.has(uid)) salesByCashierId.set(uid, []);
      salesByCashierId.get(uid)!.push(sale);
    });

    if (serverRows.length > 0) {
      // Use server-side totals (accurate across all pages)
      return serverRows.map((row: Record<string, unknown>) => ({
        userId: String(row.user_id || ''),
        userName: String(row.cashier_name || 'Unknown User'),
        salesCount: Number(row.total_transactions || 0),
        totalAmount: new Decimal(Number(row.total_revenue || 0)),
        totalProfit: new Decimal(Number(row.total_profit || 0)),
        sales: salesByCashierId.get(String(row.user_id || '')) || [],
      })).sort((a: UserGroup, b: UserGroup) => b.salesCount - a.salesCount);
    }

    // Fallback: client-side grouping if server data not yet loaded
    const grouped = new Map<string, UserGroup>();
    filteredSales.forEach((sale) => {
      const userId = sale.cashierId || sale.soldById || 'UNKNOWN';
      const userName = sale.cashierName || sale.soldByName || 'Unknown User';

      if (!grouped.has(userId)) {
        grouped.set(userId, {
          userId,
          userName,
          salesCount: 0,
          totalAmount: new Decimal(0),
          totalProfit: new Decimal(0),
          sales: [],
        });
      }

      const user = grouped.get(userId)!;
      user.salesCount++;
      user.totalAmount = user.totalAmount.plus(sale.totalAmount || 0);
      user.totalProfit = user.totalProfit.plus(sale.profit || 0);
      user.sales.push(sale);
    });

    return Array.from(grouped.values()).sort((a, b) => b.salesCount - a.salesCount);
  }, [filteredSales, cashierData]);

  // Get credit/invoice sales
  const creditSales = useMemo(() => {
    return filteredSales.filter((sale) => sale.paymentMethod === 'CREDIT');
  }, [filteredSales]);

  // Calculate partial payments
  const partialPayments = useMemo(() => {
    return creditSales.filter((sale) => {
      const paid = new Decimal(sale.paymentReceived || sale.amountPaid || 0);
      const total = new Decimal(sale.totalAmount || 0);
      return paid.greaterThan(0) && paid.lessThan(total);
    });
  }, [creditSales]);

  const tabs = [
    { id: 'overview' as TabType, label: 'Overview', icon: '📊', adminOnly: true },
    {
      id: 'all-sales' as TabType,
      label: isCashier ? 'My Sales' : 'All Sales',
      icon: '📝',
      adminOnly: false,
    },
    { id: 'by-customer' as TabType, label: 'By Customer', icon: '👥', adminOnly: true },
    { id: 'by-user' as TabType, label: 'By Cashier', icon: '🧑‍💼', adminOnly: true },
    { id: 'invoices' as TabType, label: 'Credit Sales', icon: '📄', adminOnly: false },
    { id: 'payments' as TabType, label: 'Partial Payments', icon: '💰', adminOnly: false },
  ].filter((tab) => !isCashier || !tab.adminOnly);

  return (
    <Layout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {isCashier ? 'My Sales' : 'Sales Analytics'}
            </h1>
            <p className="text-gray-600 mt-1">
              {isCashier
                ? 'View your sales transactions'
                : 'Comprehensive sales reporting and insights'}
            </p>
          </div>
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2">
            <span>📥</span>
            Export Report
          </button>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4 space-y-4">
          {/* Date Filter Buttons */}
          <div className="flex flex-wrap gap-2 pb-4 border-b border-gray-200">
            <button
              onClick={() => handleDateFilterChange('today')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${dateFilter === 'today'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
            >
              Today
            </button>
            <button
              onClick={() => handleDateFilterChange('yesterday')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${dateFilter === 'yesterday'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
            >
              Yesterday
            </button>
            <button
              onClick={() => handleDateFilterChange('this-week')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${dateFilter === 'this-week'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
            >
              This Week
            </button>
            <button
              onClick={() => handleDateFilterChange('last-week')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${dateFilter === 'last-week'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
            >
              Last Week
            </button>
            <button
              onClick={() => handleDateFilterChange('this-month')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${dateFilter === 'this-month'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
            >
              This Month
            </button>
            <button
              onClick={() => handleDateFilterChange('last-month')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${dateFilter === 'last-month'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
            >
              Last Month
            </button>
            <button
              onClick={() => handleDateFilterChange('custom')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${dateFilter === 'custom'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
            >
              Custom Range
            </button>
          </div>

          {/* Date inputs and other filters */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-1">
                Start Date
              </label>
              <DatePicker
                value={startDate}
                onChange={(date) => {
                  setStartDate(date);
                  setDateFilter('custom');
                }}
                placeholder="Select start date"
                maxDate={endDate ? new Date(endDate) : undefined}
              />
            </div>
            <div>
              <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-1">
                End Date
              </label>
              <DatePicker
                value={endDate}
                onChange={(date) => {
                  setEndDate(date);
                  setDateFilter('custom');
                }}
                placeholder="Select end date"
                minDate={startDate ? new Date(startDate) : undefined}
              />
            </div>
            <div>
              <label
                htmlFor="paymentMethod"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Payment Method
              </label>
              <select
                id="paymentMethod"
                value={paymentMethodFilter}
                onChange={(e) => setPaymentMethodFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="ALL">All Methods</option>
                <option value="CASH">Cash</option>
                <option value="CARD">Card</option>
                <option value="MOBILE_MONEY">Mobile Money</option>
                <option value="CREDIT">Credit</option>
              </select>
            </div>
            <div>
              <label
                htmlFor="statusFilter"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Status
              </label>
              <select
                id="statusFilter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="ALL">All Status</option>
                <option value="COMPLETED">Completed</option>
                <option value="PENDING">Pending</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
            <div>
              <label htmlFor="searchQuery" className="block text-sm font-medium text-gray-700 mb-1">
                Search
              </label>
              <input
                id="searchQuery"
                type="text"
                placeholder="Sale # or Customer..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {/* KPI Cards - Overview Tab */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg shadow p-6 text-white">
              <div className="text-sm font-medium opacity-90">Total Sales</div>
              <div className="text-3xl font-bold mt-2">{formatCurrency(kpis.totalSales)}</div>
              <div className="text-sm mt-2 opacity-75">{kpis.salesCount} transactions</div>
            </div>
            <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg shadow p-6 text-white">
              <div className="text-sm font-medium opacity-90">Total Profit</div>
              <div className="text-3xl font-bold mt-2">{formatCurrency(kpis.totalProfit)}</div>
              <div className="text-sm mt-2 opacity-75">{kpis.profitMargin.toFixed(2)}% margin</div>
            </div>
            <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg shadow p-6 text-white">
              <div className="text-sm font-medium opacity-90">Average Sale</div>
              <div className="text-3xl font-bold mt-2">{formatCurrency(kpis.avgSale)}</div>
              <div className="text-sm mt-2 opacity-75">Per transaction</div>
            </div>
            <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg shadow p-6 text-white">
              <div className="text-sm font-medium opacity-90">Credit Sales</div>
              <div className="text-3xl font-bold mt-2">{kpis.creditSalesCount}</div>
              <div className="text-sm mt-2 opacity-75">{kpis.partialPaymentCount} partial</div>
            </div>
            <div className="bg-gradient-to-br from-pink-500 to-pink-600 rounded-lg shadow p-6 text-white">
              <div className="text-sm font-medium opacity-90">Total Discounts</div>
              <div className="text-3xl font-bold mt-2">{formatCurrency(kpis.totalDiscounts)}</div>
              <div className="text-sm mt-2 opacity-75">
                {kpis.totalSales > 0
                  ? `${new Decimal(kpis.totalDiscounts).dividedBy(new Decimal(kpis.totalSales).plus(kpis.totalDiscounts)).times(100).toDecimalPlaces(1).toNumber()}% of gross`
                  : 'No sales'}
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="border-b border-gray-200">
            <div className="flex overflow-x-auto">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-6 py-3 sm:py-4 font-medium text-sm transition-colors whitespace-nowrap ${activeTab === tab.id
                    ? 'border-b-2 border-blue-600 text-blue-600 bg-blue-50'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                >
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                  {tab.id === 'invoices' && kpis.creditSalesCount > 0 && (
                    <span className="ml-2 px-2 py-0.5 text-xs font-semibold rounded-full bg-orange-100 text-orange-800">
                      {kpis.creditSalesCount}
                    </span>
                  )}
                  {tab.id === 'payments' && kpis.partialPaymentCount > 0 && (
                    <span className="ml-2 px-2 py-0.5 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                      {kpis.partialPaymentCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="p-6">
            {salesLoading || summaryLoading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                <p className="text-gray-600 mt-4">Loading sales data...</p>
              </div>
            ) : (
              <>
                {/* Overview Tab Content */}
                {activeTab === 'overview' && (
                  <div className="space-y-6">
                    {/* Payment Methods Breakdown */}
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">
                        Payment Methods Breakdown
                      </h3>
                      {kpis.paymentMethods.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          {kpis.paymentMethods.map((pm) => (
                            <div key={pm.paymentMethod} className="bg-gray-50 rounded-lg p-4">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-gray-700">
                                  {pm.paymentMethod}
                                </span>
                                <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded-full">
                                  {pm.count} sales
                                </span>
                              </div>
                              <div className="text-2xl font-bold text-gray-900">
                                {formatCurrency(pm.totalAmount)}
                              </div>
                              <div className="text-sm text-gray-600 mt-1">
                                Avg:{' '}
                                {formatCurrency(
                                  pm.count > 0
                                    ? new Decimal(pm.totalAmount).dividedBy(pm.count).toNumber()
                                    : 0
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="bg-gray-50 rounded-lg p-8 text-center text-gray-500">
                          No sales data available for the selected date range
                        </div>
                      )}
                    </div>

                    {/* Daily Trend */}
                    {dailyTrend.length > 0 && (
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">
                          Daily Sales Trend
                        </h3>
                        <div className="bg-gray-50 rounded-lg p-4 overflow-x-auto">
                          <table className="min-w-full">
                            <thead>
                              <tr className="text-left text-sm text-gray-600">
                                <th className="pb-2">Date</th>
                                <th className="pb-2 text-right">Sales</th>
                                <th className="pb-2 text-right">Amount</th>
                                <th className="pb-2 text-right">Profit</th>
                                <th className="pb-2 text-right">Margin</th>
                              </tr>
                            </thead>
                            <tbody className="text-sm">
                              {dailyTrend.slice(0, 10).map((day, idx) => (
                                <tr key={idx} className="border-t border-gray-200">
                                  <td className="py-2">{day.period}</td>
                                  <td className="py-2 text-right">{day.count}</td>
                                  <td className="py-2 text-right font-medium">
                                    {formatCurrency(day.totalAmount)}
                                  </td>
                                  <td className="py-2 text-right text-green-600">
                                    {formatCurrency(day.totalProfit)}
                                  </td>
                                  <td className="py-2 text-right">
                                    {day.totalAmount > 0
                                      ? new Decimal(day.totalProfit)
                                        .dividedBy(day.totalAmount)
                                        .times(100)
                                        .toFixed(1)
                                      : '0.0'}
                                    %
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* All Sales Tab */}
                {activeTab === 'all-sales' && (
                  <>
                    {filteredSales.length > 0 ? (
                      <SalesTable
                        sales={filteredSales}
                        onSelectSale={setSelectedSale}
                        pagination={pagination}
                        currentPage={currentPage}
                        onPageChange={setCurrentPage}
                      />
                    ) : (
                      <div className="text-center py-12">
                        <p className="text-gray-500 text-lg">
                          No sales found for the selected period
                        </p>
                        <p className="text-gray-400 text-sm mt-2">
                          Try adjusting your date range or filters
                        </p>
                      </div>
                    )}
                  </>
                )}

                {/* By Customer Tab */}
                {activeTab === 'by-customer' && (
                  <>
                    {salesByCustomer.length > 0 ? (
                      <CustomerSalesView
                        customers={salesByCustomer}
                        onSelectSale={setSelectedSale}
                      />
                    ) : (
                      <div className="text-center py-12">
                        <p className="text-gray-500 text-lg">No customer sales found</p>
                        <p className="text-gray-400 text-sm mt-2">
                          Sales will appear here once transactions are recorded
                        </p>
                      </div>
                    )}
                  </>
                )}

                {/* By User Tab */}
                {activeTab === 'by-user' && (
                  <>
                    {salesByUser.length > 0 ? (
                      <UserSalesView users={salesByUser} onSelectSale={setSelectedSale} startDate={startDate} endDate={endDate} />
                    ) : (
                      <div className="text-center py-12">
                        <p className="text-gray-500 text-lg">No cashier sales found</p>
                        <p className="text-gray-400 text-sm mt-2">
                          Sales by cashier will appear here
                        </p>
                      </div>
                    )}
                  </>
                )}

                {/* Credit Sales Tab */}
                {activeTab === 'invoices' && (
                  <>
                    {creditSales.length > 0 ? (
                      <CreditSalesView sales={creditSales} onSelectSale={setSelectedSale} />
                    ) : (
                      <div className="text-center py-12">
                        <p className="text-gray-500 text-lg">No credit sales found</p>
                        <p className="text-gray-400 text-sm mt-2">
                          Credit sales will appear here when payment method is CREDIT
                        </p>
                      </div>
                    )}
                  </>
                )}

                {/* Partial Payments Tab */}
                {activeTab === 'payments' && (
                  <>
                    {partialPayments.length > 0 ? (
                      <PartialPaymentsView sales={partialPayments} onSelectSale={setSelectedSale} />
                    ) : (
                      <div className="text-center py-12">
                        <p className="text-gray-500 text-lg">No partial payments found</p>
                        <p className="text-gray-400 text-sm mt-2">
                          Partial payments will appear here when credit sales are partially paid
                        </p>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* Sale Detail Modal */}
        {selectedSale && (
          <SaleDetailModal
            sale={selectedSale}
            onClose={() => setSelectedSale(null)}
            onSaleUpdated={() => { refetchSales(); }}
          />
        )}
      </div>
    </Layout>
  );
}

// Sales Table Component
function SalesTable({
  sales,
  onSelectSale,
  pagination,
  currentPage,
  onPageChange,
}: SalesTableProps) {
  const hasDiscounts = sales.some((s) => s.discountAmount > 0);

  return (
    <div className="space-y-4">
      {/* Mobile Card View */}
      <div className="block sm:hidden space-y-3 px-2">
        {sales.map((sale: SaleRow) => (
          <div
            key={sale.id}
            className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm active:bg-gray-50"
            onClick={() => onSelectSale(sale)}
          >
            <div className="flex justify-between items-start mb-2">
              <div>
                <div className="text-sm font-semibold text-blue-600">{sale.saleNumber || sale.id.slice(0, 8)}</div>
                <div className="text-xs text-gray-500">{formatDisplayDate(sale.saleDate)} {formatDisplayTime(sale.createdAt)}</div>
              </div>
              <div className="flex gap-1">
                <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${sale.paymentMethod === 'CASH' ? 'bg-green-100 text-green-800' : sale.paymentMethod === 'CARD' ? 'bg-blue-100 text-blue-800' : sale.paymentMethod === 'CREDIT' ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-800'}`}>
                  {sale.paymentMethod}
                </span>
                <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${sale.status === 'COMPLETED' ? 'bg-green-100 text-green-800' : sale.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
                  {sale.status}
                </span>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <div className="text-sm text-gray-700">{sale.customerName || 'Walk-in'}</div>
              <div className="text-right">
                <div className="text-base font-bold text-gray-900">{formatCurrency(sale.totalAmount)}</div>
                <div className="text-xs text-green-600">Profit: {formatCurrency(sale.profit || 0)}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop Table View */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Sale #
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Date
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Time
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Customer
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Cashier
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                Amount
              </th>
              {hasDiscounts && (
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Discount
                </th>
              )}
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                Profit
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Payment
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Status
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sales.map((sale: SaleRow) => (
              <tr
                key={sale.id}
                className="hover:bg-gray-50 cursor-pointer"
                onClick={() => onSelectSale(sale)}
              >
                <td className="px-4 py-3 text-sm font-medium text-blue-600">
                  {sale.saleNumber || sale.id.slice(0, 8)}
                </td>
                <td className="px-4 py-3 text-sm text-gray-900">
                  {formatDisplayDate(sale.saleDate)}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {formatDisplayTime(sale.createdAt)}
                </td>
                <td className="px-4 py-3 text-sm text-gray-900">
                  {sale.customerName || 'Walk-in'}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {sale.soldByName || sale.cashierName || 'N/A'}
                </td>
                <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">
                  {formatCurrency(sale.totalAmount)}
                </td>
                {hasDiscounts && (
                  <td className="px-4 py-3 text-sm text-right font-medium text-red-600">
                    {sale.discountAmount > 0 ? `-${formatCurrency(sale.discountAmount)}` : '-'}
                  </td>
                )}
                <td className="px-4 py-3 text-sm text-right font-medium text-green-600">
                  {formatCurrency(sale.profit || 0)}
                </td>
                <td className="px-4 py-3 text-sm">
                  <span
                    className={`px-2 py-1 text-xs font-semibold rounded-full ${sale.paymentMethod === 'CASH'
                      ? 'bg-green-100 text-green-800'
                      : sale.paymentMethod === 'CARD'
                        ? 'bg-blue-100 text-blue-800'
                        : sale.paymentMethod === 'CREDIT'
                          ? 'bg-orange-100 text-orange-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                  >
                    {sale.paymentMethod}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm">
                  <span
                    className={`px-2 py-1 text-xs font-semibold rounded-full ${sale.status === 'COMPLETED'
                      ? 'bg-green-100 text-green-800'
                      : sale.status === 'PENDING'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-red-100 text-red-800'
                      }`}
                  >
                    {sale.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-right">
                  <button className="text-blue-600 hover:text-blue-800 font-medium">View</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && (
        <div className="flex justify-between items-center mt-4">
          <div className="text-sm text-gray-600">
            Showing {(currentPage - 1) * pagination.limit + 1} to{' '}
            {Math.min(currentPage * pagination.limit, pagination.total)} of {pagination.total} sales
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="px-3 py-1 border border-blue-600 bg-blue-50 text-blue-600 rounded font-medium">
              {currentPage}
            </span>
            <button
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage >= pagination.totalPages}
              className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Customer Sales View Component
function CustomerSalesView({ customers, onSelectSale }: CustomerSalesViewProps) {
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="text-sm text-gray-600 mb-4">
        Showing sales for {customers.length} customers
      </div>

      {customers.map((customer: CustomerGroup) => (
        <div
          key={customer.customerId}
          className="border border-gray-200 rounded-lg overflow-hidden"
        >
          <button
            onClick={() =>
              setExpandedCustomer(
                expandedCustomer === customer.customerId ? null : customer.customerId
              )
            }
            className="w-full bg-gray-50 hover:bg-gray-100 p-4 flex items-center justify-between transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-lg">
                {customer.customerName.charAt(0).toUpperCase()}
              </div>
              <div className="text-left">
                <div className="font-semibold text-gray-900">{customer.customerName}</div>
                <div className="text-sm text-gray-600">{customer.salesCount} sales</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xl font-bold text-gray-900">
                {formatCurrency(customer.totalAmount.toNumber())}
              </div>
              <div className="text-sm text-green-600">
                Profit: {formatCurrency(customer.totalProfit.toNumber())}
              </div>
            </div>
          </button>

          {expandedCustomer === customer.customerId && (
            <div className="p-4 bg-white border-t border-gray-200">
              <table className="min-w-full">
                <thead className="text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="text-left pb-2">Sale #</th>
                    <th className="text-left pb-2">Date</th>
                    <th className="text-left pb-2">Time</th>
                    <th className="text-right pb-2">Amount</th>
                    <th className="text-left pb-2">Payment</th>
                    <th className="text-right pb-2">Actions</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {customer.sales.map((sale: SaleRow) => (
                    <tr key={sale.id} className="border-t border-gray-100">
                      <td className="py-2 font-medium text-blue-600">{sale.saleNumber}</td>
                      <td className="py-2">{formatDisplayDate(sale.saleDate)}</td>
                      <td className="py-2 text-gray-600">{formatDisplayTime(sale.createdAt)}</td>
                      <td className="py-2 text-right font-medium">
                        {formatCurrency(sale.totalAmount)}
                      </td>
                      <td className="py-2">
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">
                          {sale.paymentMethod}
                        </span>
                      </td>
                      <td className="py-2 text-right">
                        <button
                          onClick={() => onSelectSale(sale)}
                          className="text-blue-600 hover:text-blue-800 font-medium"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// User Sales View Component
function UserSalesView({ users, onSelectSale, startDate, endDate }: UserSalesViewProps) {
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [expandedSales, setExpandedSales] = useState<SaleRow[]>([]);
  const [loadingSales, setLoadingSales] = useState(false);

  // Fetch sales for the expanded cashier on-demand
  useEffect(() => {
    if (!expandedUser) {
      setExpandedSales([]);
      return;
    }
    let cancelled = false;
    setLoadingSales(true);
    api.sales.list({ page: 1, limit: 200, cashierId: expandedUser, startDate, endDate })
      .then((resp) => {
        if (cancelled) return;
        const rows = (resp.data?.data ?? []) as Record<string, unknown>[];
        setExpandedSales(rows.map((sale) => ({
          id: String(sale.id || ''),
          saleNumber: String(sale.sale_number || sale.saleNumber || ''),
          saleDate: String(sale.sale_date || sale.saleDate || ''),
          totalAmount: Number(sale.total_amount || sale.totalAmount || 0),
          profit: Number(sale.profit || 0),
          customerName: String(sale.customer_name || sale.customerName || ''),
          paymentMethod: String(sale.payment_method || sale.paymentMethod || ''),
          status: String(sale.status || ''),
          cashierId: String(sale.cashier_id || sale.cashierId || ''),
          cashierName: String(sale.cashier_name || sale.cashierName || ''),
          soldById: String(sale.cashier_id || sale.cashierId || ''),
          soldByName: String(sale.cashier_name || sale.cashierName || ''),
        } as SaleRow)));
      })
      .catch(() => { if (!cancelled) setExpandedSales([]); })
      .finally(() => { if (!cancelled) setLoadingSales(false); });
    return () => { cancelled = true; };
  }, [expandedUser, startDate, endDate]);

  return (
    <div className="space-y-4">
      <div className="text-sm text-gray-600 mb-4">Performance for {users.length} cashiers</div>

      {users.map((user: UserGroup) => (
        <div key={user.userId} className="border border-gray-200 rounded-lg overflow-hidden">
          <button
            onClick={() => setExpandedUser(expandedUser === user.userId ? null : user.userId)}
            className="w-full bg-gray-50 hover:bg-gray-100 p-4 flex items-center justify-between transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-purple-600 text-white rounded-full flex items-center justify-center font-bold text-lg">
                {user.userName.charAt(0).toUpperCase()}
              </div>
              <div className="text-left">
                <div className="font-semibold text-gray-900">{user.userName}</div>
                <div className="text-sm text-gray-600">{user.salesCount} sales</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xl font-bold text-gray-900">
                {formatCurrency(user.totalAmount.toNumber())}
              </div>
              <div className="text-sm text-green-600">
                Profit: {formatCurrency(user.totalProfit.toNumber())}
              </div>
            </div>
          </button>

          {expandedUser === user.userId && (
            <div className="p-4 bg-white border-t border-gray-200">
              {loadingSales ? (
                <div className="text-center py-4 text-gray-500">Loading sales...</div>
              ) : expandedSales.length === 0 ? (
                <div className="text-center py-4 text-gray-400">No sales found</div>
              ) : (
                <table className="min-w-full">
                  <thead className="text-xs text-gray-500 uppercase">
                    <tr>
                      <th className="text-left pb-2">Sale #</th>
                      <th className="text-left pb-2">Customer</th>
                      <th className="text-left pb-2">Date</th>
                      <th className="text-left pb-2">Time</th>
                      <th className="text-right pb-2">Amount</th>
                      <th className="text-right pb-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    {expandedSales.map((sale: SaleRow) => (
                      <tr key={sale.id} className="border-t border-gray-100">
                        <td className="py-2 font-medium text-blue-600">{sale.saleNumber}</td>
                        <td className="py-2">{sale.customerName || 'Walk-in'}</td>
                        <td className="py-2">{formatDisplayDate(sale.saleDate)}</td>
                        <td className="py-2 text-gray-600">{formatDisplayTime(sale.createdAt)}</td>
                        <td className="py-2 text-right font-medium">
                          {formatCurrency(sale.totalAmount)}
                        </td>
                        <td className="py-2 text-right">
                          <button
                            onClick={() => onSelectSale(sale)}
                            className="text-blue-600 hover:text-blue-800 font-medium"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// Credit Sales View Component
function CreditSalesView({ sales, onSelectSale }: CreditSalesViewProps) {
  const totalOutstanding = useMemo(() => {
    return sales.reduce((sum: Decimal, sale: SaleRow) => {
      const total = new Decimal(sale.totalAmount || 0);
      const paid = new Decimal(sale.paymentReceived || sale.amountPaid || 0);
      return sum.plus(total.minus(paid));
    }, new Decimal(0));
  }, [sales]);

  return (
    <div className="space-y-4">
      <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
        <div className="flex justify-between items-center">
          <div>
            <div className="text-sm text-orange-800 font-medium">Total Outstanding</div>
            <div className="text-3xl font-bold text-orange-900 mt-1">
              {formatCurrency(totalOutstanding.toNumber())}
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm text-orange-800">Credit Sales</div>
            <div className="text-2xl font-bold text-orange-900">{sales.length}</div>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Sale #
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Customer
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Date
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Time
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                Total
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                Paid
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                Outstanding
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sales.map((sale: SaleRow) => {
              const total = new Decimal(sale.totalAmount || 0);
              const paid = new Decimal(sale.paymentReceived || sale.amountPaid || 0);
              const outstanding = total.minus(paid);

              return (
                <tr key={sale.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-blue-600">{sale.saleNumber}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{sale.customerName}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {formatDisplayDate(sale.saleDate)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {formatDisplayTime(sale.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-medium">
                    {formatCurrency(total.toNumber())}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-green-600">
                    {formatCurrency(paid.toNumber())}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-bold text-orange-600">
                    {formatCurrency(outstanding.toNumber())}
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    <button
                      onClick={() => onSelectSale(sale)}
                      className="text-blue-600 hover:text-blue-800 font-medium"
                    >
                      View
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Partial Payments View Component
function PartialPaymentsView({ sales, onSelectSale }: PartialPaymentsViewProps) {
  return (
    <div className="space-y-4">
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="text-sm text-yellow-800 font-medium">Partial Payments</div>
        <div className="text-2xl font-bold text-yellow-900 mt-1">{sales.length} Sales</div>
        <div className="text-sm text-yellow-700 mt-1">Require follow-up for remaining balance</div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Sale #
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Customer
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Date
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Time
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                Total
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                Paid
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                Balance
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                % Paid
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sales.map((sale: SaleRow) => {
              const total = new Decimal(sale.totalAmount || 0);
              const paid = new Decimal(sale.paymentReceived || sale.amountPaid || 0);
              const balance = total.minus(paid);
              const percentPaid = total.greaterThan(0)
                ? paid.dividedBy(total).times(100)
                : new Decimal(0);

              return (
                <tr key={sale.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-blue-600">{sale.saleNumber}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{sale.customerName}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {formatDisplayDate(sale.saleDate)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {formatDisplayTime(sale.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-medium">
                    {formatCurrency(total.toNumber())}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-green-600">
                    {formatCurrency(paid.toNumber())}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-bold text-orange-600">
                    {formatCurrency(balance.toNumber())}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <progress value={percentPaid.toNumber()} max="100" className="w-16 h-2" />
                      <span className="text-xs text-gray-600 whitespace-nowrap">
                        {percentPaid.toFixed(0)}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    <button
                      onClick={() => onSelectSale(sale)}
                      className="text-blue-600 hover:text-blue-800 font-medium"
                    >
                      View
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Sale Detail Modal Component with improved accessibility and design
function SaleDetailModal({ sale, onClose, onSaleUpdated }: SaleDetailModalProps) {
  const canVoidSale = useBackendPermission('sales.void');
  const canRefundSale = useBackendPermission('sales.refund');
  const [saleDetails, setSaleDetails] = useState<SaleRow | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  // Handle escape key and focus trap
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    // Focus the modal when it opens
    modalRef.current?.focus();

    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  // Fetch sale details including items when modal opens
  useEffect(() => {
    const fetchSaleDetails = async () => {
      setLoadingDetails(true);
      setError(null);
      try {
        const response = await api.sales.getById(sale.id);
        if (response.data.success) {
          const responseData = response.data.data;
          // Backend returns { sale: {...}, items: [...], paymentLines: [...] }
          // Flatten into a single SaleRow so all fields are accessible at top level
          if (responseData && typeof responseData === 'object' && 'sale' in responseData) {
            const nested = responseData as {
              sale: Record<string, unknown>;
              items?: SaleItemRow[];
              paymentLines?: PaymentLine[];
            };
            setSaleDetails({
              ...nested.sale,
              items: nested.items || [],
              paymentLines: nested.paymentLines || [],
            } as SaleRow);
          } else {
            setSaleDetails(responseData as SaleRow);
          }
        } else {
          setError('Failed to load sale details');
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load sale details');
      } finally {
        setLoadingDetails(false);
      }
    };

    fetchSaleDetails();
  }, [sale.id]);

  const items = saleDetails?.items || [];

  // Click outside to close
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" onClick={handleBackdropClick}>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 transition-opacity" aria-hidden="true" />

      {/* Modal positioning */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="sale-modal-title"
          tabIndex={-1}
          className="relative bg-white w-full max-w-[95vw] sm:max-w-4xl rounded-xl shadow-2xl border border-gray-200 max-h-[90vh] overflow-hidden flex flex-col transform transition-all"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="border-b border-gray-200 px-6 py-4 flex justify-between items-center bg-gray-50 flex-shrink-0">
            <div className="flex items-center space-x-4">
              <div className="h-12 w-12 bg-blue-100 rounded-full flex items-center justify-center">
                <svg
                  className="h-6 w-6 text-blue-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <div>
                <h2 id="sale-modal-title" className="text-xl font-semibold text-gray-900">
                  {sale.saleNumber || `Sale #${sale.id.slice(0, 8)}`}
                </h2>
                <p className="text-sm text-gray-500">
                  {formatDisplayDate(sale.saleDate)} at {formatDisplayTime(sale.createdAt)}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-200 transition-colors"
              aria-label="Close modal"
            >
              <svg
                className="h-6 w-6 text-gray-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                <div className="text-sm text-blue-600 font-medium">Total Amount</div>
                <div className="text-xl font-bold text-blue-900">
                  {formatCurrency(sale.totalAmount || 0)}
                </div>
              </div>
              <div className="bg-green-50 rounded-lg p-4 border border-green-100">
                <div className="text-sm text-green-600 font-medium">Profit</div>
                <div className="text-xl font-bold text-green-900">
                  {formatCurrency(sale.profit || 0)}
                </div>
              </div>
              <div className="bg-purple-50 rounded-lg p-4 border border-purple-100">
                <div className="text-sm text-purple-600 font-medium">Items</div>
                <div className="text-xl font-bold text-purple-900">{items.length}</div>
              </div>
              <div
                className={`rounded-lg p-4 border ${(saleDetails?.status || sale.status) === 'COMPLETED'
                  ? 'bg-green-50 border-green-100'
                  : (saleDetails?.status || sale.status) === 'PENDING'
                    ? 'bg-yellow-50 border-yellow-100'
                    : (saleDetails?.status || sale.status) === 'VOID'
                      ? 'bg-gray-50 border-gray-200'
                      : (saleDetails?.status || sale.status) === 'REFUNDED'
                        ? 'bg-amber-50 border-amber-100'
                        : 'bg-red-50 border-red-100'
                  }`}
              >
                <div
                  className={`text-sm font-medium ${(saleDetails?.status || sale.status) === 'COMPLETED'
                    ? 'text-green-600'
                    : (saleDetails?.status || sale.status) === 'PENDING'
                      ? 'text-yellow-600'
                      : (saleDetails?.status || sale.status) === 'VOID'
                        ? 'text-gray-500'
                        : (saleDetails?.status || sale.status) === 'REFUNDED'
                          ? 'text-amber-600'
                          : 'text-red-600'
                    }`}
                >
                  Status
                </div>
                <div
                  className={`text-xl font-bold ${(saleDetails?.status || sale.status) === 'COMPLETED'
                    ? 'text-green-900'
                    : (saleDetails?.status || sale.status) === 'PENDING'
                      ? 'text-yellow-900'
                      : (saleDetails?.status || sale.status) === 'VOID'
                        ? 'text-gray-700'
                        : (saleDetails?.status || sale.status) === 'REFUNDED'
                          ? 'text-amber-900'
                          : 'text-red-900'
                    }`}
                >
                  {saleDetails?.status || sale.status}
                </div>
              </div>
            </div>

            {/* Sale Info */}
            <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Sale Information</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-500">Customer</span>
                  <span className="font-medium text-gray-900">
                    {sale.customerName || 'Walk-in Customer'}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-500">Cashier</span>
                  <span className="font-medium text-gray-900">
                    {sale.soldByName || sale.cashierName || 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-500">Payment Method</span>
                  <span
                    className={`px-2 py-1 text-xs font-semibold rounded-full ${sale.paymentMethod === 'CASH'
                      ? 'bg-green-100 text-green-800'
                      : sale.paymentMethod === 'CARD'
                        ? 'bg-blue-100 text-blue-800'
                        : sale.paymentMethod === 'MOBILE_MONEY'
                          ? 'bg-purple-100 text-purple-800'
                          : sale.paymentMethod === 'CREDIT'
                            ? 'bg-orange-100 text-orange-800'
                            : 'bg-gray-100 text-gray-800'
                      }`}
                  >
                    {sale.paymentMethod}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-500">Sale ID</span>
                  <span className="font-mono text-sm text-gray-600">{sale.id.slice(0, 8)}...</span>
                </div>
              </div>

              {/* Split Payment Details */}
              {saleDetails?.paymentLines && saleDetails.paymentLines.length > 1 && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="text-sm font-medium text-gray-900 mb-2">
                    Split Payment Breakdown:
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {saleDetails.paymentLines.map((payment: PaymentLine, idx: number) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between gap-2 p-2 bg-gray-50 rounded-lg"
                      >
                        <span
                          className={`px-2 py-1 text-xs font-semibold rounded-full ${(payment.paymentMethod || payment.payment_method) === 'CASH'
                            ? 'bg-green-100 text-green-800'
                            : (payment.paymentMethod || payment.payment_method) === 'CARD'
                              ? 'bg-blue-100 text-blue-800'
                              : (payment.paymentMethod || payment.payment_method) ===
                                'MOBILE_MONEY'
                                ? 'bg-purple-100 text-purple-800'
                                : (payment.paymentMethod || payment.payment_method) === 'CREDIT'
                                  ? 'bg-orange-100 text-orange-800'
                                  : 'bg-gray-100 text-gray-800'
                            }`}
                        >
                          {payment.paymentMethod || payment.payment_method}
                        </span>
                        <span className="text-sm font-medium">
                          {formatCurrency(parseFloat(String(payment.amount || 0)))}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Line Items */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Line Items</h3>

              {loadingDetails ? (
                <div className="text-center py-8">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <p className="text-gray-600 mt-2">Loading items...</p>
                </div>
              ) : error ? (
                <div className="text-red-600 p-4 bg-red-50 rounded-lg border border-red-200">
                  <div className="flex items-center gap-2">
                    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path
                        fillRule="evenodd"
                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                        clipRule="evenodd"
                      />
                    </svg>
                    {error}
                  </div>
                </div>
              ) : items.length === 0 ? (
                <div className="text-gray-500 text-center py-8 bg-gray-50 rounded-lg">
                  <svg
                    className="h-12 w-12 mx-auto text-gray-400 mb-2"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1}
                      d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                    />
                  </svg>
                  No items found for this sale
                </div>
              ) : (
                <div className="overflow-x-auto -mx-4 sm:mx-0">
                  {(() => {
                    const hasAnyDiscount = items.some((item: SaleItemRow) => {
                      const disc = parseFloat(
                        String(item.discountAmount || item.discount_amount || 0)
                      );
                      return disc > 0;
                    });
                    return (
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Product
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Qty
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Unit Price
                            </th>
                            {hasAnyDiscount && (
                              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Discount
                              </th>
                            )}
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Subtotal
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {items.map((item: SaleItemRow, index: number) => {
                            const quantity = parseFloat(String(item.quantity || item.qty || 0));
                            const unitPrice = parseFloat(
                              String(item.unitPrice || item.unit_price || item.price || 0)
                            );
                            const itemDiscount = parseFloat(
                              String(item.discountAmount || item.discount_amount || 0)
                            );
                            // Use stored total_price if available, otherwise compute
                            const subtotal =
                              item.totalPrice || item.total_price
                                ? parseFloat(String(item.totalPrice || item.total_price || 0))
                                : new Decimal(quantity)
                                  .times(unitPrice)
                                  .minus(itemDiscount)
                                  .toNumber();

                            return (
                              <tr key={index} className="hover:bg-gray-50">
                                <td className="px-4 py-3 text-sm text-gray-900">
                                  {item.productName || item.product_name || 'Unknown Product'}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium">
                                  {quantity.toFixed(quantity % 1 === 0 ? 0 : 2)}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-600 text-right">
                                  {formatCurrency(unitPrice)}
                                </td>
                                {hasAnyDiscount && (
                                  <td className="px-4 py-3 text-sm text-right">
                                    {itemDiscount > 0 ? (
                                      <span className="text-red-600 font-medium">
                                        -{formatCurrency(itemDiscount)}
                                      </span>
                                    ) : (
                                      <span className="text-gray-400">—</span>
                                    )}
                                  </td>
                                )}
                                <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">
                                  {formatCurrency(subtotal)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Totals Summary */}
            <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 mt-6">
              <div className="space-y-2">
                {(() => {
                  // Compute effective discount: sale-level OR sum of item-level discounts
                  const saleDiscount = parseFloat(
                    String(sale.discountAmount || sale.discount_amount || 0)
                  );
                  const itemDiscountTotal =
                    saleDiscount > 0
                      ? 0
                      : items.reduce((sum: number, item: SaleItemRow) => {
                        return (
                          sum +
                          parseFloat(String(item.discountAmount || item.discount_amount || 0))
                        );
                      }, 0);
                  const effectiveDiscount = saleDiscount > 0 ? saleDiscount : itemDiscountTotal;
                  // Show pre-discount subtotal when there's a discount
                  const displaySubtotal =
                    effectiveDiscount > 0
                      ? new Decimal(sale.totalAmount || 0).plus(effectiveDiscount).toNumber()
                      : sale.subtotal || sale.totalAmount || 0;

                  return (
                    <>
                      <div className="flex justify-between text-gray-600">
                        <span>Subtotal:</span>
                        <span className="font-medium">{formatCurrency(displaySubtotal)}</span>
                      </div>
                      {effectiveDiscount > 0 && (
                        <div className="flex justify-between text-red-600">
                          <span>Discount:</span>
                          <span className="font-medium">-{formatCurrency(effectiveDiscount)}</span>
                        </div>
                      )}
                    </>
                  );
                })()}
                {(sale.taxAmount || sale.tax_amount) && (
                  <div className="flex justify-between text-gray-600">
                    <span>Tax:</span>
                    <span className="font-medium">
                      {formatCurrency(sale.taxAmount || sale.tax_amount || 0)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-gray-900 text-lg font-bold border-t border-gray-200 pt-3 mt-3">
                  <span>Total:</span>
                  <span className="text-blue-600">{formatCurrency(sale.totalAmount || 0)}</span>
                </div>
                {sale.paymentMethod === 'CASH' && (
                  <>
                    <div className="flex justify-between text-gray-600 border-t border-gray-200 pt-2 mt-2">
                      <span>Amount Tendered:</span>
                      <span className="font-medium">
                        {formatCurrency(sale.paymentReceived || sale.amountPaid || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between text-green-600">
                      <span>Change Given:</span>
                      <span className="font-medium">
                        {formatCurrency(
                          Math.max(
                            0,
                            (sale.paymentReceived || sale.amountPaid || 0) - (sale.totalAmount || 0)
                          )
                        )}
                      </span>
                    </div>
                  </>
                )}
                {sale.paymentMethod === 'CREDIT' && (
                  <>
                    <div className="flex justify-between text-gray-600 border-t border-gray-200 pt-2 mt-2">
                      <span>Amount Paid:</span>
                      <span className="font-medium">
                        {formatCurrency(sale.paymentReceived || sale.amountPaid || 0)}
                      </span>
                    </div>
                    {(() => {
                      const totalAmount = sale.totalAmount || 0;
                      const amountPaid = sale.paymentReceived || sale.amountPaid || 0;
                      const balance = new Decimal(totalAmount).minus(amountPaid).toNumber();

                      if (balance > 0) {
                        return (
                          <div className="flex justify-between text-orange-600 font-semibold">
                            <span>Outstanding Balance:</span>
                            <span>{formatCurrency(balance)}</span>
                          </div>
                        );
                      } else if (balance < 0) {
                        return (
                          <div className="flex justify-between text-blue-600 font-semibold">
                            <span>Overpayment:</span>
                            <span>{formatCurrency(Math.abs(balance))}</span>
                          </div>
                        );
                      } else {
                        return (
                          <div className="flex justify-between text-green-600 font-semibold">
                            <span>Status:</span>
                            <span>✓ Fully Paid</span>
                          </div>
                        );
                      }
                    })()}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 flex flex-col-reverse sm:flex-row justify-between gap-3 flex-shrink-0">
            {/* Left side: Void & Refund actions */}
            <div className="flex flex-col sm:flex-row gap-2">
              {/* Void button — only for COMPLETED sales, requires sales.void permission */}
              {(saleDetails?.status || sale.status) === 'COMPLETED' &&
                canVoidSale && (
                  <button
                    onClick={() => setShowVoidModal(true)}
                    className="w-full sm:w-auto px-4 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 transition-colors font-medium text-sm flex items-center justify-center gap-2"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                    </svg>
                    Void Sale
                  </button>
                )}
              {/* Refund button — for COMPLETED sales, requires sales.refund permission */}
              {(saleDetails?.status || sale.status) === 'COMPLETED' &&
                canRefundSale && (
                  <button
                    onClick={() => setShowRefundModal(true)}
                    className="w-full sm:w-auto px-4 py-2 border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-50 transition-colors font-medium text-sm flex items-center justify-center gap-2"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                    </svg>
                    Refund
                  </button>
                )}
            </div>
            {/* Right side: Document flow, Close, Print */}
            <div className="flex flex-col sm:flex-row gap-2">
              <DocumentFlowButton entityType="SALE" entityId={sale.id} size="sm" />
              <button
                onClick={onClose}
                className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors text-gray-700 font-medium"
              >
                Close
              </button>
              <button
                onClick={() => {
                  const s = saleDetails ?? sale;
                  // Compute effective discount from sale-level or item-level
                  const saleDisc = Number(s.discountAmount || 0);
                  const itemDiscTotal =
                    saleDisc > 0
                      ? 0
                      : (s.items || []).reduce((sum: number, item: SaleItemRow) => {
                        return (
                          sum + parseFloat(String(item.discountAmount || item.discount_amount || 0))
                        );
                      }, 0);
                  const effectiveDisc = saleDisc > 0 ? saleDisc : itemDiscTotal;

                  const receiptData: ReceiptData = {
                    saleNumber: s.saleNumber,
                    saleDate: s.saleDate || s.createdAt,
                    totalAmount: s.totalAmount,
                    subtotal:
                      effectiveDisc > 0
                        ? new Decimal(s.totalAmount || 0).plus(effectiveDisc).toNumber()
                        : s.subtotal,
                    discountAmount: effectiveDisc > 0 ? effectiveDisc : undefined,
                    taxAmount: s.taxAmount,
                    cashierName: s.cashierName || s.soldByName,
                    customerName: s.customerName || 'Walk-in Customer',
                    paymentMethod: s.paymentMethod,
                    amountPaid: s.amountPaid || s.paymentReceived,
                    changeAmount: s.changeAmount,
                    items: s.items?.map((item) => ({
                      name: item.productName || item.product_name || 'Unknown',
                      quantity: Number(item.quantity || item.qty || 0),
                      unitPrice: Number(item.unitPrice || item.unit_price || item.price || 0),
                      subtotal: Number(
                        item.totalPrice || item.total_price || item.subtotal || item.totalAmount || 0
                      ),
                      discountAmount:
                        parseFloat(String(item.discountAmount || item.discount_amount || 0)) ||
                        undefined,
                    })),
                    payments: s.paymentLines?.map((pl) => ({
                      method: pl.paymentMethod || pl.payment_method || 'CASH',
                      amount: Number(pl.amount),
                      reference: pl.reference,
                    })),
                  };
                  printReceipt(receiptData).catch((err) => console.error('Print failed:', err));
                }}
                className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center gap-2"
              >
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a2 2 0 002 2h6a2 2 0 002-2v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a2 2 0 00-2-2H7a2 2 0 00-2 2zm8 0H7v3h6V4zm0 8H7v4h6v-4z"
                    clipRule="evenodd"
                  />
                </svg>
                Print Receipt
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Void Sale Modal */}
      {showVoidModal && (
        <VoidSaleModal
          saleId={sale.id}
          saleNumber={sale.saleNumber || `Sale #${sale.id.slice(0, 8)}`}
          totalAmount={sale.totalAmount}
          onClose={() => setShowVoidModal(false)}
          onSuccess={() => {
            setShowVoidModal(false);
            onSaleUpdated?.();
            onClose();
          }}
        />
      )}

      {/* Refund Sale Modal */}
      {showRefundModal && saleDetails && (
        <RefundSaleModal
          saleId={sale.id}
          saleNumber={sale.saleNumber || `Sale #${sale.id.slice(0, 8)}`}
          totalAmount={sale.totalAmount}
          items={saleDetails.items || []}
          onClose={() => setShowRefundModal(false)}
          onSuccess={() => {
            setShowRefundModal(false);
            onSaleUpdated?.();
            onClose();
          }}
        />
      )}
    </div>
  );
}
