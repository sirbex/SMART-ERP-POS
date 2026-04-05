import React, { useState } from 'react';
import { TrendingUp, TrendingDown, DollarSign, ShoppingCart, Receipt, BarChart3 } from 'lucide-react';
import Layout from '../../components/Layout';
import { DateRangeFilter } from '../../components/ui/DateRangeFilter';
import { ResponsiveTableWrapper } from '../../components/ui/ResponsiveTableWrapper';
import { formatCurrency } from '../../utils/currency';
import { useBusinessPerformance } from '../../hooks/useApi';

interface CategoryPerformance {
  categoryName: string;
  transactionCount: number;
  unitsSold: number;
  totalSales: number;
  totalCogs: number;
  grossProfit: number;
  grossMarginPct: number;
}

interface ExpenseBreakdown {
  categoryName: string;
  expenseCount: number;
  totalExpenses: number;
  pctOfTotal: number;
}

interface BusinessSummary {
  totalSales: number;
  totalCogs: number;
  grossProfit: number;
  grossMarginPct: number;
  totalExpenses: number;
  netProfit: number;
  netMarginPct: number;
  completedSalesCount: number;
  paidExpensesCount: number;
}

interface BusinessPerformanceData {
  summary: BusinessSummary;
  revenueByCategory: CategoryPerformance[];
  expensesByCategory: ExpenseBreakdown[];
}

const BusinessPerformancePage: React.FC = () => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const { data, isLoading, error } = useBusinessPerformance({ startDate, endDate });
  const report = data as BusinessPerformanceData | undefined;

  // Summary cards
  const summaryCards = report?.summary
    ? [
        {
          label: 'Total Sales',
          value: formatCurrency(report.summary.totalSales),
          icon: ShoppingCart,
          color: 'text-blue-600',
          bg: 'bg-blue-50',
        },
        {
          label: 'Cost of Goods',
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
          label: 'Total Expenses',
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
          label: 'Transactions',
          value: report.summary.completedSalesCount.toLocaleString(),
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
            Business Performance by Category
          </h1>
          <p className="text-gray-500 mt-1">
            Where did the money come from, and where did it go?
          </p>
        </div>

        {/* Date Filter */}
        <div className="bg-white rounded-lg border shadow-sm p-4">
          <DateRangeFilter
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            defaultPreset="THIS_MONTH"
          />
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="text-center py-12 text-gray-500">Loading report...</div>
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
                <div
                  key={card.label}
                  className={`${card.bg} rounded-lg p-4 border`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <card.icon className={`h-4 w-4 ${card.color}`} />
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                      {card.label}
                    </span>
                  </div>
                  <div className={`text-lg font-bold ${card.color}`}>
                    {card.value}
                  </div>
                  {card.sub && (
                    <div className="text-xs text-gray-500 mt-0.5">{card.sub}</div>
                  )}
                </div>
              ))}
            </div>

            {/* Section 1: Revenue & COGS by Category */}
            <div className="bg-white rounded-lg border shadow-sm">
              <div className="px-6 py-4 border-b">
                <h2 className="text-lg font-semibold text-gray-900">
                  Revenue &amp; Profitability by Product Category
                </h2>
                <p className="text-sm text-gray-500">
                  Sales performance from completed transactions
                </p>
              </div>
              <div className="overflow-x-auto">
                {report.revenueByCategory.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No sales data for this period
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
                          Sales
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
                            {formatCurrency(row.totalSales)}
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-orange-600">
                            {formatCurrency(row.totalCogs)}
                          </td>
                          <td
                            className={`px-4 py-3 text-sm text-right font-semibold ${
                              row.grossProfit >= 0
                                ? 'text-green-700'
                                : 'text-red-600'
                            }`}
                          >
                            {formatCurrency(row.grossProfit)}
                          </td>
                          <td className="px-4 py-3 text-sm text-right">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                row.grossMarginPct >= 30
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
                    {/* Totals row */}
                    <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                      <tr className="font-bold">
                        <td className="px-4 py-3 text-sm text-gray-900">TOTAL</td>
                        <td className="px-4 py-3 text-sm text-right text-green-700">
                          {formatCurrency(report.summary.totalSales)}
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
                          {report.summary.completedSalesCount}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-gray-600">
                          {report.revenueByCategory
                            .reduce((sum, r) => sum + r.unitsSold, 0)
                            .toLocaleString()}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                  </ResponsiveTableWrapper>
                )}
              </div>
            </div>

            {/* Section 2: Expense Breakdown */}
            <div className="bg-white rounded-lg border shadow-sm">
              <div className="px-6 py-4 border-b">
                <h2 className="text-lg font-semibold text-gray-900">
                  Expense Breakdown
                </h2>
                <p className="text-sm text-gray-500">
                  Operating expenses by category (paid &amp; approved)
                </p>
              </div>
              <div className="overflow-x-auto">
                {report.expensesByCategory.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No expenses recorded for this period
                  </div>
                ) : (
                  <ResponsiveTableWrapper>
                  <table className="min-w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                          Expense Category
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                          Amount
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                          % of Total
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                          Count
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {report.expensesByCategory.map((row) => (
                        <tr key={row.categoryName} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">
                            {row.categoryName}
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-red-600 font-semibold">
                            {formatCurrency(row.totalExpenses)}
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-gray-600">
                            {row.pctOfTotal.toFixed(1)}%
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-gray-600">
                            {row.expenseCount}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                      <tr className="font-bold">
                        <td className="px-4 py-3 text-sm text-gray-900">TOTAL EXPENSES</td>
                        <td className="px-4 py-3 text-sm text-right text-red-600">
                          {formatCurrency(report.summary.totalExpenses)}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-gray-600">
                          100%
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-gray-600">
                          {report.summary.paidExpensesCount}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                  </ResponsiveTableWrapper>
                )}
              </div>
            </div>

            {/* Section 3: Net Business View */}
            <div className="bg-white rounded-lg border shadow-sm">
              <div className="px-6 py-4 border-b">
                <h2 className="text-lg font-semibold text-gray-900">
                  Net Business View
                </h2>
                <p className="text-sm text-gray-500">
                  Combined revenue, costs, and expenses — bottom line
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
                        Total Sales Revenue
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-green-700 font-semibold">
                        {formatCurrency(report.summary.totalSales)}
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
                    <tr>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        Less: Operating Expenses
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-red-600">
                        ({formatCurrency(report.summary.totalExpenses)})
                      </td>
                    </tr>
                    <tr
                      className={`${
                        report.summary.netProfit >= 0 ? 'bg-emerald-50' : 'bg-red-50'
                      } border-t-2 border-gray-300`}
                    >
                      <td className="px-4 py-4 text-base font-bold text-gray-900">
                        Net Profit
                      </td>
                      <td
                        className={`px-4 py-4 text-base text-right font-bold ${
                          report.summary.netProfit >= 0
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
                </table>
                </ResponsiveTableWrapper>
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
};

export default BusinessPerformancePage;
