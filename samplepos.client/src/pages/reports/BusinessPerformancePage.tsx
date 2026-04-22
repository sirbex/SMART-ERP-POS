import React, { useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingCart,
  Receipt,
  BarChart3,
  Wallet,
  Package,
  CreditCard,
  Landmark,
} from 'lucide-react';
import Layout from '../../components/Layout';
import { DateRangeFilter } from '../../components/ui/DateRangeFilter';
import { ResponsiveTableWrapper } from '../../components/ui/ResponsiveTableWrapper';
import { formatCurrency } from '../../utils/currency';
import { useBusinessPerformance } from '../../hooks/useApi';

// ---------------------------------------------------------------------------
// Types matching the new ledger-based API response
// ---------------------------------------------------------------------------

interface MoneyInEntry {
  accountCode: string;
  accountName: string;
  transactionCount: number;
  totalAmount: number;
}

interface RevenueByCategoryEntry {
  categoryName: string;
  transactionCount: number;
  unitsSold: number;
  totalRevenue: number;
  totalCogs: number;
  grossProfit: number;
  grossMarginPct: number;
}

interface CostAndStockEntry {
  accountCode: string;
  accountName: string;
  entryCount: number;
  totalAmount: number;
}

interface ExpenseByAccountEntry {
  accountCode: string;
  accountName: string;
  entryCount: number;
  totalAmount: number;
  pctOfTotal: number;
}

interface SupplierPaymentByAccountEntry {
  fundingAccountCode: string;
  fundingAccountName: string;
  supplierName: string;
  paymentCount: number;
  totalPaid: number;
}

interface CustomerDepositSummary {
  totalDeposited: number;
  totalCleared: number;
  depositCount: number;
  clearingCount: number;
  outstandingLiability: number;
  activeDepositCount: number;
  customersWithDeposits: number;
}

interface BusinessSummary {
  totalRevenue: number;
  totalCogs: number;
  grossProfit: number;
  grossMarginPct: number;
  totalExpenses: number;
  totalStockAdjustments: number;
  totalSupplierPayments: number;
  netProfit: number;
  netMarginPct: number;
  saleCount: number;
}

interface BusinessPerformanceData {
  summary: BusinessSummary;
  moneyIn: MoneyInEntry[];
  revenueByCategory: RevenueByCategoryEntry[];
  costAndStock: CostAndStockEntry[];
  expensesByAccount: ExpenseByAccountEntry[];
  supplierPaymentsByAccount?: SupplierPaymentByAccountEntry[];
  customerDeposits?: CustomerDepositSummary;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const PAYMENT_METHODS = [
  { value: '', label: 'All Methods' },
  { value: 'CASH', label: 'Cash' },
  { value: 'CREDIT', label: 'Credit (A/R)' },
  { value: 'MOBILE_MONEY', label: 'Mobile Money' },
  { value: 'CARD', label: 'Card' },
];

const SECTION_OPTIONS = [
  { value: 'ALL', label: 'All Sections' },
  { value: 'MONEY_IN', label: '1 — Money In' },
  { value: 'REVENUE', label: '2 — Revenue by Category' },
  { value: 'COST_STOCK', label: '3 — Cost & Stock Impact' },
  { value: 'EXPENSES', label: '4 — Expenses by Account' },
  { value: 'NET_POSITION', label: '5 — Net Business Position' },
];

type SectionKey = 'ALL' | 'MONEY_IN' | 'REVENUE' | 'COST_STOCK' | 'EXPENSES' | 'NET_POSITION';

const BusinessPerformancePage: React.FC = () => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [includeStockAdj, setIncludeStockAdj] = useState(true);
  const [includeExpenses, setIncludeExpenses] = useState(true);
  const [visibleSection, setVisibleSection] = useState<SectionKey>('ALL');

  const showSection = (key: SectionKey) => visibleSection === 'ALL' || visibleSection === key;

  const { data, isLoading, error } = useBusinessPerformance({
    startDate,
    endDate,
    paymentMethod: paymentMethod || undefined,
    includeStockAdjustments: includeStockAdj,
    includeExpenses,
  });
  const report = data as BusinessPerformanceData | undefined;

  // Summary cards
  const summaryCards = report?.summary
    ? [
      {
        label: 'Total Revenue',
        value: formatCurrency(report.summary.totalRevenue),
        icon: ShoppingCart,
        color: 'text-blue-600',
        bg: 'bg-blue-50',
      },
      {
        label: 'COGS',
        value: formatCurrency(report.summary.totalCogs),
        icon: Receipt,
        color: 'text-orange-600',
        bg: 'bg-orange-50',
      },
      {
        label: 'Gross Profit',
        value: formatCurrency(report.summary.grossProfit),
        icon: report.summary.grossProfit >= 0 ? TrendingUp : TrendingDown,
        color: report.summary.grossProfit >= 0 ? 'text-green-600' : 'text-red-600',
        bg: report.summary.grossProfit >= 0 ? 'bg-green-50' : 'bg-red-50',
        sub: `${report.summary.grossMarginPct.toFixed(1)}% margin`,
      },
      {
        label: 'Expenses',
        value: formatCurrency(report.summary.totalExpenses),
        icon: DollarSign,
        color: 'text-red-600',
        bg: 'bg-red-50',
      },
      {
        label: 'Net Profit',
        value: formatCurrency(report.summary.netProfit),
        icon: report.summary.netProfit >= 0 ? TrendingUp : TrendingDown,
        color: report.summary.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600',
        bg: report.summary.netProfit >= 0 ? 'bg-emerald-50' : 'bg-red-50',
        sub: `${report.summary.netMarginPct.toFixed(1)}% net margin`,
      },
      {
        label: 'Sale Transactions',
        value: report.summary.saleCount.toLocaleString(),
        icon: BarChart3,
        color: 'text-indigo-600',
        bg: 'bg-indigo-50',
      },
    ]
    : [];

  return (
    <Layout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Management P&amp;L by Category
          </h1>
          <p className="text-gray-500 mt-1">
            Ledger-based report — where did money come from, and where did it go?
          </p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg border shadow-sm p-4 space-y-4">
          <DateRangeFilter
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            defaultPreset="THIS_MONTH"
          />
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Section
              </label>
              <select
                value={visibleSection}
                onChange={(e) => setVisibleSection(e.target.value as SectionKey)}
                className="border rounded-md px-3 py-1.5 text-sm bg-white"
              >
                {SECTION_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Payment Method
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="border rounded-md px-3 py-1.5 text-sm bg-white"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={includeStockAdj}
                onChange={(e) => setIncludeStockAdj(e.target.checked)}
                className="rounded border-gray-300"
              />
              Include Stock Adjustments
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={includeExpenses}
                onChange={(e) => setIncludeExpenses(e.target.checked)}
                className="rounded border-gray-300"
              />
              Include Expenses
            </label>
          </div>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="text-center py-12 text-gray-500">Loading report…</div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
            <p className="text-sm text-red-700">
              {error instanceof Error ? error.message : 'Failed to load report'}
            </p>
          </div>
        )}

        {report && !isLoading && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {summaryCards.map((card) => (
                <div key={card.label} className={`${card.bg} rounded-lg p-4 border`}>
                  <div className="flex items-center gap-2 mb-1">
                    <card.icon className={`h-4 w-4 ${card.color}`} />
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                      {card.label}
                    </span>
                  </div>
                  <div className={`text-lg font-bold ${card.color}`}>{card.value}</div>
                  {card.sub && (
                    <div className="text-xs text-gray-500 mt-0.5">{card.sub}</div>
                  )}
                </div>
              ))}
            </div>

            {/* ── Section 1: Money In ── */}
            {showSection('MONEY_IN') && (
              <div className="bg-white rounded-lg border shadow-sm">
                <div className="px-6 py-4 border-b">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-5 w-5 text-blue-600" />
                    <h2 className="text-lg font-semibold text-gray-900">
                      Section 1 — Money In
                    </h2>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    How sales settled — Cash vs Accounts Receivable vs other asset accounts
                  </p>
                </div>
                <div className="overflow-x-auto">
                  {report.moneyIn.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      No settlement entries for this period
                    </div>
                  ) : (
                    <ResponsiveTableWrapper>
                      <table className="min-w-full">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                              Account
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                              Name
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                              Transactions
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                              Amount
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {report.moneyIn.map((row) => (
                            <tr key={row.accountCode} className="hover:bg-gray-50">
                              <td className="px-4 py-3 text-sm font-mono text-gray-600">
                                {row.accountCode}
                              </td>
                              <td className="px-4 py-3 text-sm font-medium text-gray-900">
                                {row.accountName}
                              </td>
                              <td className="px-4 py-3 text-sm text-right text-gray-600">
                                {row.transactionCount}
                              </td>
                              <td className="px-4 py-3 text-sm text-right text-blue-700 font-semibold">
                                {formatCurrency(row.totalAmount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                          <tr className="font-bold">
                            <td colSpan={2} className="px-4 py-3 text-sm text-gray-900">
                              TOTAL MONEY IN
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-gray-600">
                              {report.moneyIn.reduce((s, r) => s + r.transactionCount, 0)}
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-blue-700">
                              {formatCurrency(
                                report.moneyIn.reduce((s, r) => s + r.totalAmount, 0)
                              )}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </ResponsiveTableWrapper>
                  )}
                </div>
              </div>

            )}

            {/* ── Section 2: Revenue by Product Category ── */}
            {showSection('REVENUE') && (
              <div className="bg-white rounded-lg border shadow-sm">
                <div className="px-6 py-4 border-b">
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="h-5 w-5 text-green-600" />
                    <h2 className="text-lg font-semibold text-gray-900">
                      Section 2 — Revenue by Product Category
                    </h2>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    GL revenue allocated proportionally to product categories
                  </p>
                </div>
                <div className="overflow-x-auto">
                  {report.revenueByCategory.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      No revenue data for this period
                    </div>
                  ) : (
                    <ResponsiveTableWrapper>
                      <table className="min-w-full">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                              Category
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                              Revenue
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                              COGS
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                              Gross Profit
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                              Margin %
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                              Txns
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                              Units
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {report.revenueByCategory.map((row) => (
                            <tr key={row.categoryName} className="hover:bg-gray-50">
                              <td className="px-4 py-3 text-sm font-medium text-gray-900">
                                {row.categoryName}
                              </td>
                              <td className="px-4 py-3 text-sm text-right text-green-700 font-semibold">
                                {formatCurrency(row.totalRevenue)}
                              </td>
                              <td className="px-4 py-3 text-sm text-right text-orange-600">
                                {formatCurrency(row.totalCogs)}
                              </td>
                              <td
                                className={`px-4 py-3 text-sm text-right font-semibold ${row.grossProfit >= 0 ? 'text-green-700' : 'text-red-600'
                                  }`}
                              >
                                {formatCurrency(row.grossProfit)}
                              </td>
                              <td className="px-4 py-3 text-sm text-right">
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${row.grossMarginPct >= 30
                                    ? 'bg-green-100 text-green-800'
                                    : row.grossMarginPct >= 15
                                      ? 'bg-yellow-100 text-yellow-800'
                                      : 'bg-red-100 text-red-800'
                                    }`}
                                >
                                  {row.grossMarginPct.toFixed(1)}%
                                </span>
                              </td>
                              <td className="px-4 py-3 text-sm text-right text-gray-600">
                                {row.transactionCount}
                              </td>
                              <td className="px-4 py-3 text-sm text-right text-gray-600">
                                {row.unitsSold.toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                          <tr className="font-bold">
                            <td className="px-4 py-3 text-sm text-gray-900">TOTAL</td>
                            <td className="px-4 py-3 text-sm text-right text-green-700">
                              {formatCurrency(report.summary.totalRevenue)}
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-orange-600">
                              {formatCurrency(report.summary.totalCogs)}
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-green-700">
                              {formatCurrency(report.summary.grossProfit)}
                            </td>
                            <td className="px-4 py-3 text-sm text-right">
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                {report.summary.grossMarginPct.toFixed(1)}%
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-gray-600">
                              {report.summary.saleCount}
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-gray-600">
                              {report.revenueByCategory
                                .reduce((s, r) => s + r.unitsSold, 0)
                                .toLocaleString()}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </ResponsiveTableWrapper>
                  )}
                </div>
              </div>

            )}

            {/* ── Section 3: Cost & Stock Impact ── */}
            {showSection('COST_STOCK') && (
              <div className="bg-white rounded-lg border shadow-sm">
                <div className="px-6 py-4 border-b">
                  <div className="flex items-center gap-2">
                    <Package className="h-5 w-5 text-orange-600" />
                    <h2 className="text-lg font-semibold text-gray-900">
                      Section 3 — Cost &amp; Stock Impact
                    </h2>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    COGS, shrinkage, damage, expiry, and stock adjustments from GL
                  </p>
                </div>
                <div className="overflow-x-auto">
                  {report.costAndStock.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      No cost / stock entries for this period
                    </div>
                  ) : (
                    <ResponsiveTableWrapper>
                      <table className="min-w-full">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                              Account
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                              Name
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                              Entries
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                              Amount
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {report.costAndStock.map((row) => (
                            <tr key={row.accountCode} className="hover:bg-gray-50">
                              <td className="px-4 py-3 text-sm font-mono text-gray-600">
                                {row.accountCode}
                              </td>
                              <td className="px-4 py-3 text-sm font-medium text-gray-900">
                                {row.accountName}
                              </td>
                              <td className="px-4 py-3 text-sm text-right text-gray-600">
                                {row.entryCount}
                              </td>
                              <td className="px-4 py-3 text-sm text-right text-orange-700 font-semibold">
                                {formatCurrency(row.totalAmount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                          <tr className="font-bold">
                            <td colSpan={2} className="px-4 py-3 text-sm text-gray-900">
                              TOTAL COST &amp; STOCK
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-gray-600">
                              {report.costAndStock.reduce((s, r) => s + r.entryCount, 0)}
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-orange-700">
                              {formatCurrency(
                                report.costAndStock.reduce((s, r) => s + r.totalAmount, 0)
                              )}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </ResponsiveTableWrapper>
                  )}
                </div>
              </div>

            )}

            {/* ── Section 4: Expenses by GL Account ── */}
            {includeExpenses && showSection('EXPENSES') && (
              <div className="bg-white rounded-lg border shadow-sm">
                <div className="px-6 py-4 border-b">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-red-600" />
                    <h2 className="text-lg font-semibold text-gray-900">
                      Section 4 — Expenses by Account
                    </h2>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    Operating &amp; financial expenses from GL (6xxx/7xxx accounts)
                  </p>
                </div>
                <div className="overflow-x-auto">
                  {report.expensesByAccount.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      No expense entries for this period
                    </div>
                  ) : (
                    <ResponsiveTableWrapper>
                      <table className="min-w-full">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                              Account
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                              Name
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                              Amount
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                              % of Total
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                              Entries
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {report.expensesByAccount.map((row) => (
                            <tr key={row.accountCode} className="hover:bg-gray-50">
                              <td className="px-4 py-3 text-sm font-mono text-gray-600">
                                {row.accountCode}
                              </td>
                              <td className="px-4 py-3 text-sm font-medium text-gray-900">
                                {row.accountName}
                              </td>
                              <td className="px-4 py-3 text-sm text-right text-red-600 font-semibold">
                                {formatCurrency(row.totalAmount)}
                              </td>
                              <td className="px-4 py-3 text-sm text-right text-gray-600">
                                {row.pctOfTotal.toFixed(1)}%
                              </td>
                              <td className="px-4 py-3 text-sm text-right text-gray-600">
                                {row.entryCount}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                          <tr className="font-bold">
                            <td colSpan={2} className="px-4 py-3 text-sm text-gray-900">
                              TOTAL EXPENSES
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-red-600">
                              {formatCurrency(report.summary.totalExpenses)}
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-gray-600">
                              100%
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-gray-600">
                              {report.expensesByAccount.reduce(
                                (s, r) => s + r.entryCount,
                                0
                              )}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </ResponsiveTableWrapper>
                  )}
                </div>
              </div>
            )}

            {/* ── Section 4b: Supplier Payments by Funding Account ── */}
            {report.supplierPaymentsByAccount && report.supplierPaymentsByAccount.length > 0 && (
              <div className="bg-white rounded-lg border shadow-sm">
                <div className="px-6 py-4 border-b">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-orange-600" />
                    <h2 className="text-lg font-semibold text-gray-900">
                      Section 4b — Supplier Payments by Account
                    </h2>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    Payments made to suppliers and which account funded them
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <ResponsiveTableWrapper>
                    <table className="min-w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                            Funding Account
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                            Supplier
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                            Payments
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                            Total Paid
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {report.supplierPaymentsByAccount.map((row, idx) => (
                          <tr key={`${row.fundingAccountCode}-${row.supplierName}-${idx}`} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm">
                              <span className="font-mono text-gray-600">{row.fundingAccountCode}</span>
                              {' — '}
                              <span className="text-gray-900">{row.fundingAccountName}</span>
                            </td>
                            <td className="px-4 py-3 text-sm font-medium text-gray-900">
                              {row.supplierName}
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-gray-600">
                              {row.paymentCount}
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-orange-600 font-semibold">
                              {formatCurrency(row.totalPaid)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                        <tr className="font-bold">
                          <td colSpan={2} className="px-4 py-3 text-sm text-gray-900">
                            TOTAL SUPPLIER PAYMENTS
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-gray-600">
                            {report.supplierPaymentsByAccount.reduce((s, r) => s + r.paymentCount, 0)}
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-orange-600">
                            {formatCurrency(report.supplierPaymentsByAccount.reduce((s, r) => s + r.totalPaid, 0))}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </ResponsiveTableWrapper>
                </div>
              </div>
            )}

            {/* ── Section 4c: Customer Deposits (Liability) ── */}
            {report.customerDeposits && (report.customerDeposits.depositCount > 0 || report.customerDeposits.outstandingLiability > 0) && (
              <div className="bg-white rounded-lg border shadow-sm">
                <div className="px-6 py-4 border-b">
                  <div className="flex items-center gap-2">
                    <Landmark className="h-5 w-5 text-purple-600" />
                    <h2 className="text-lg font-semibold text-gray-900">
                      Section 4c — Customer Deposits
                    </h2>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    Customer prepayments received, clearings applied, and outstanding liability (GL 2200)
                  </p>
                </div>
                <div className="p-4 sm:p-6">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                    <div className="bg-purple-50 p-4 rounded-lg text-center">
                      <p className="text-xs font-medium text-purple-600 uppercase tracking-wide mb-1">Deposits Received</p>
                      <p className="text-lg font-bold text-purple-700">{formatCurrency(report.customerDeposits.totalDeposited)}</p>
                      <p className="text-xs text-gray-500 mt-1">{report.customerDeposits.depositCount} deposit(s)</p>
                    </div>
                    <div className="bg-green-50 p-4 rounded-lg text-center">
                      <p className="text-xs font-medium text-green-600 uppercase tracking-wide mb-1">Clearings Applied</p>
                      <p className="text-lg font-bold text-green-700">{formatCurrency(report.customerDeposits.totalCleared)}</p>
                      <p className="text-xs text-gray-500 mt-1">{report.customerDeposits.clearingCount} clearing(s)</p>
                    </div>
                    <div className="bg-orange-50 p-4 rounded-lg text-center">
                      <p className="text-xs font-medium text-orange-600 uppercase tracking-wide mb-1">Outstanding Liability</p>
                      <p className="text-lg font-bold text-orange-700">{formatCurrency(report.customerDeposits.outstandingLiability)}</p>
                      <p className="text-xs text-gray-500 mt-1">{report.customerDeposits.activeDepositCount} active</p>
                    </div>
                    <div className="bg-blue-50 p-4 rounded-lg text-center">
                      <p className="text-xs font-medium text-blue-600 uppercase tracking-wide mb-1">Customers</p>
                      <p className="text-lg font-bold text-blue-700">{report.customerDeposits.customersWithDeposits}</p>
                      <p className="text-xs text-gray-500 mt-1">with deposits</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Section 5: Net Business Position (Income Statement) ── */}
            {showSection('NET_POSITION') && (
              <div className="bg-white rounded-lg border shadow-sm">
                <div className="px-6 py-4 border-b">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-indigo-600" />
                    <h2 className="text-lg font-semibold text-gray-900">
                      Section 5 — Net Business Position
                    </h2>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    Combined income statement — revenue, cost, expenses, bottom line
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <ResponsiveTableWrapper>
                    <table className="min-w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase w-1/2">
                            Line Item
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                            Amount
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        <tr>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            Total Revenue (GL)
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-green-700 font-semibold">
                            {formatCurrency(report.summary.totalRevenue)}
                          </td>
                        </tr>
                        <tr>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            Less: Cost of Goods Sold
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-orange-600">
                            ({formatCurrency(report.summary.totalCogs)})
                          </td>
                        </tr>
                        <tr className="bg-green-50">
                          <td className="px-4 py-3 text-sm font-bold text-gray-900">
                            Gross Profit
                          </td>
                          <td className="px-4 py-3 text-sm text-right font-bold text-green-700">
                            {formatCurrency(report.summary.grossProfit)}
                            <span className="ml-2 text-xs text-gray-500">
                              ({report.summary.grossMarginPct.toFixed(1)}%)
                            </span>
                          </td>
                        </tr>
                        {report.summary.totalStockAdjustments !== 0 && (
                          <tr>
                            <td className="px-4 py-3 text-sm text-gray-900">
                              Stock Adjustments (net)
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-orange-600">
                              {report.summary.totalStockAdjustments >= 0
                                ? formatCurrency(report.summary.totalStockAdjustments)
                                : `(${formatCurrency(
                                  Math.abs(report.summary.totalStockAdjustments)
                                )})`}
                            </td>
                          </tr>
                        )}
                        <tr>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            Less: Operating Expenses
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-red-600">
                            ({formatCurrency(report.summary.totalExpenses)})
                          </td>
                        </tr>
                        <tr
                          className={`${report.summary.netProfit >= 0 ? 'bg-emerald-50' : 'bg-red-50'
                            } border-t-2 border-gray-300`}
                        >
                          <td className="px-4 py-4 text-base font-bold text-gray-900">
                            Net Profit
                          </td>
                          <td
                            className={`px-4 py-4 text-base text-right font-bold ${report.summary.netProfit >= 0
                              ? 'text-emerald-700'
                              : 'text-red-700'
                              }`}
                          >
                            {formatCurrency(report.summary.netProfit)}
                            <span className="ml-2 text-xs text-gray-500">
                              ({report.summary.netMarginPct.toFixed(1)}% net margin)
                            </span>
                          </td>
                        </tr>
                      </tbody>
                      {/* Supplementary: Cash Disbursements (not part of P&L) */}
                      {report.summary.totalSupplierPayments > 0 && (
                        <tfoot className="border-t-2 border-gray-200">
                          <tr className="bg-gray-50">
                            <td colSpan={2} className="px-4 py-2">
                              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                Supplementary — Cash Disbursements (non-P&L)
                              </span>
                            </td>
                          </tr>
                          <tr>
                            <td className="px-4 py-3 text-sm text-gray-700">
                              Payments to Vendors
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-orange-600 font-semibold">
                              {formatCurrency(report.summary.totalSupplierPayments)}
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </ResponsiveTableWrapper>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
};

export default BusinessPerformancePage;
