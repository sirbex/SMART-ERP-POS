import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, endOfMonth } from 'date-fns';
import {
  FileText,
  TrendingUp,
  TrendingDown,
  Users,
  Package,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { formatCurrency } from '../utils/currency';
import { getBusinessDate } from '../utils/businessDate';
import { DatePicker } from '../components/ui/date-picker';

const authHeaders = (): HeadersInit => {
  const token = localStorage.getItem('auth_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const fetchProfitLoss = async (dateFrom: string, dateTo: string) => {
  const response = await fetch(
    `/api/erp-accounting/reports/profit-loss?dateFrom=${dateFrom}&dateTo=${dateTo}`,
    { headers: authHeaders() },
  );
  if (!response.ok) throw new Error('Failed to fetch P&L report');
  return response.json();
};

const fetchPLByCustomer = async (dateFrom: string, dateTo: string) => {
  const response = await fetch(
    `/api/erp-accounting/reports/profit-loss/by-customer?dateFrom=${dateFrom}&dateTo=${dateTo}`,
    { headers: authHeaders() },
  );
  if (!response.ok) throw new Error('Failed to fetch P&L by customer');
  return response.json();
};

const fetchPLByCategory = async (dateFrom: string, dateTo: string) => {
  const response = await fetch(
    `/api/erp-accounting/reports/profit-loss/by-category?dateFrom=${dateFrom}&dateTo=${dateTo}`,
    { headers: authHeaders() },
  );
  if (!response.ok) throw new Error('Failed to fetch P&L by category');
  return response.json();
};

const fetchPLVerification = async (dateFrom: string, dateTo: string) => {
  const response = await fetch(
    `/api/erp-accounting/reports/profit-loss/verify?dateFrom=${dateFrom}&dateTo=${dateTo}`,
    { headers: authHeaders() },
  );
  if (!response.ok) throw new Error('Failed to verify P&L');
  return response.json();
};

const fetchComparativePL = async (periods: number) => {
  const response = await fetch(
    `/api/erp-accounting/reports/profit-loss/comparative?periods=${periods}`,
    { headers: authHeaders() },
  );
  if (!response.ok) throw new Error('Failed to fetch comparative P&L');
  return response.json();
};

type ViewTab = 'summary' | 'by-customer' | 'by-category' | 'comparative';

interface PLLineItem {
  accountCode: string;
  accountName: string;
  amount?: number;
  displayAmount?: number;
}

interface PLSummary {
  totalRevenue?: number;
  totalCOGS?: number;
  grossProfit?: number;
  grossMarginPercent?: number;
  totalOperatingExpenses?: number;
  totalExpenses?: number;
  netIncome?: number;
  netProfit?: number;
  netMarginPercent?: number;
}

function pickNetProfit(summary?: PLSummary): number {
  return Number(summary?.netIncome ?? summary?.netProfit ?? 0);
}

function pickExpenses(summary?: PLSummary): number {
  return Number(summary?.totalOperatingExpenses ?? summary?.totalExpenses ?? 0);
}

function lineAmount(item: PLLineItem): number {
  return Number(item.amount ?? item.displayAmount ?? 0);
}

export default function ProfitLossPage() {
  const bizDate = getBusinessDate();
  const [y, m] = bizDate.split('-').map(Number);
  const firstOfMonth = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastOfMonth = format(endOfMonth(new Date(y, m - 1, 1)), 'yyyy-MM-dd');
  const [dateFrom, setDateFrom] = useState(firstOfMonth);
  const [dateTo, setDateTo] = useState(lastOfMonth);
  const [activeTab, setActiveTab] = useState<ViewTab>('summary');
  const [comparativePeriods, setComparativePeriods] = useState(3);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const { data: plData, isLoading: plLoading, refetch: refetchPL } = useQuery({
    queryKey: ['profit-loss', dateFrom, dateTo],
    queryFn: () => fetchProfitLoss(dateFrom, dateTo),
    enabled: activeTab === 'summary',
  });

  const { data: customerData, isLoading: customerLoading } = useQuery({
    queryKey: ['profit-loss-customer', dateFrom, dateTo],
    queryFn: () => fetchPLByCustomer(dateFrom, dateTo),
    enabled: activeTab === 'by-customer',
  });

  const { data: categoryData, isLoading: categoryLoading } = useQuery({
    queryKey: ['profit-loss-category', dateFrom, dateTo],
    queryFn: () => fetchPLByCategory(dateFrom, dateTo),
    enabled: activeTab === 'by-category',
  });

  const { data: comparativeData, isLoading: comparativeLoading } = useQuery({
    queryKey: ['profit-loss-comparative', comparativePeriods],
    queryFn: () => fetchComparativePL(comparativePeriods),
    enabled: activeTab === 'comparative',
  });

  const {
    data: verificationData,
    isLoading: verifyLoading,
    refetch: refetchVerify,
  } = useQuery({
    queryKey: ['profit-loss-verify', dateFrom, dateTo],
    queryFn: () => fetchPLVerification(dateFrom, dateTo),
  });

  const report = plData?.data;
  const verification = verificationData?.data;
  const summary = report?.summary as PLSummary | undefined;

  const toggleCategory = (name: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const sections = useMemo(() => {
    if (report?.sections) return report.sections as {
      revenue?: PLLineItem[];
      cogs?: PLLineItem[];
      expenses?: PLLineItem[];
    };
    const accounts = (report?.accounts || []) as Array<PLLineItem & { section?: string }>;
    return {
      revenue: accounts.filter((a) => a.section === 'REVENUE'),
      cogs: accounts.filter((a) => a.section === 'COST_OF_GOODS_SOLD'),
      expenses: accounts.filter((a) => a.section === 'OPERATING_EXPENSES'),
    };
  }, [report]);

  const netProfit = pickNetProfit(summary);
  const operatingExpenses = pickExpenses(summary);

  const tabs = [
    { id: 'summary' as ViewTab, name: 'Summary', icon: <FileText className="h-4 w-4" /> },
    { id: 'by-customer' as ViewTab, name: 'By Customer', icon: <Users className="h-4 w-4" /> },
    { id: 'by-category' as ViewTab, name: 'By Category', icon: <Package className="h-4 w-4" /> },
    { id: 'comparative' as ViewTab, name: 'Comparative', icon: <TrendingUp className="h-4 w-4" /> },
  ];

  return (
    <div className="p-4 lg:p-6">
      {verification && (
        <div
          className={`mb-6 p-4 rounded-lg border ${
            verification.isConsistent
              ? 'bg-green-50 border-green-200'
              : 'bg-amber-50 border-amber-200'
          }`}
        >
          <div className="flex items-center space-x-3">
            {verification.isConsistent ? (
              <CheckCircle className="h-5 w-5 text-green-600" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            )}
            <div className="min-w-0 flex-1">
              <p
                className={`font-medium ${
                  verification.isConsistent ? 'text-green-800' : 'text-amber-900'
                }`}
              >
                {verification.isConsistent
                  ? 'P&L consistent (summary matches account rollup)'
                  : 'P&L rollup difference detected'}
              </p>
              <p className="text-sm text-gray-600">
                Net income {formatCurrency(verification.plNetIncome || 0)} · Detail rollup{' '}
                {formatCurrency(verification.trialBalanceNetIncome || 0)}
                {!verification.isConsistent
                  ? ` · Δ ${formatCurrency(verification.difference || 0)}`
                  : ''}
              </p>
            </div>
            <button
              onClick={() => refetchVerify()}
              disabled={verifyLoading}
              className="ml-auto p-2 text-gray-500 hover:text-gray-700"
              title="Refresh verification"
              aria-label="Refresh verification"
            >
              <RefreshCw className={`h-4 w-4 ${verifyLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border p-4 mb-6">
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[200px]">
            <label className="block text-sm font-semibold text-gray-700 mb-2">From</label>
            <DatePicker
              value={dateFrom}
              onChange={setDateFrom}
              placeholder="Select start date"
              maxDate={dateTo ? new Date(dateTo) : undefined}
            />
          </div>
          <div className="min-w-[200px]">
            <label className="block text-sm font-semibold text-gray-700 mb-2">To</label>
            <DatePicker
              value={dateTo}
              onChange={setDateTo}
              placeholder="Select end date"
              minDate={dateFrom ? new Date(dateFrom) : undefined}
            />
          </div>
          <button
            onClick={() => {
              void refetchPL();
              void refetchVerify();
            }}
            className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <div className="border-b mb-6 overflow-x-auto">
        <nav className="flex space-x-4 sm:space-x-8 min-w-max">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-2 py-3 sm:py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.icon}
              <span>{tab.name}</span>
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'summary' && (
        <div>
          {plLoading ? (
            <div className="flex justify-center py-12">
              <RefreshCw className="h-8 w-8 text-gray-400 animate-spin" />
            </div>
          ) : report ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-lg shadow-sm border p-4">
                  <p className="text-sm text-gray-500">Total Revenue</p>
                  <p className="text-2xl font-bold text-green-600">
                    {formatCurrency(summary?.totalRevenue || 0)}
                  </p>
                </div>
                <div className="bg-white rounded-lg shadow-sm border p-4">
                  <p className="text-sm text-gray-500">Cost of Goods Sold</p>
                  <p className="text-2xl font-bold text-red-600">
                    {formatCurrency(summary?.totalCOGS || 0)}
                  </p>
                </div>
                <div className="bg-white rounded-lg shadow-sm border p-4">
                  <p className="text-sm text-gray-500">Gross Profit</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {formatCurrency(summary?.grossProfit || 0)}
                  </p>
                  <p className="text-xs text-gray-400">
                    {(summary?.grossMarginPercent || 0).toFixed(1)}% margin
                  </p>
                </div>
                <div className="bg-white rounded-lg shadow-sm border p-4">
                  <p className="text-sm text-gray-500">Net Profit</p>
                  <p
                    className={`text-2xl font-bold ${
                      netProfit >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {formatCurrency(netProfit)}
                  </p>
                  <p className="text-xs text-gray-400">
                    {(summary?.netMarginPercent || 0).toFixed(1)}% margin
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm border">
                <div className="px-6 py-4 border-b">
                  <h2 className="text-lg font-semibold">Profit & Loss Statement</h2>
                  <p className="text-sm text-gray-500">
                    {report.dateFrom} to {report.dateTo}
                  </p>
                </div>
                <div className="p-6">
                  <div className="mb-6">
                    <h3 className="font-semibold text-gray-900 mb-2">Revenue</h3>
                    {sections.revenue?.map((item, idx) => (
                      <div key={idx} className="flex justify-between py-1 text-sm">
                        <span className="text-gray-600">
                          {item.accountCode} - {item.accountName}
                        </span>
                        <span className="text-green-600">{formatCurrency(lineAmount(item))}</span>
                      </div>
                    ))}
                    <div className="flex justify-between py-2 font-semibold border-t mt-2">
                      <span>Total Revenue</span>
                      <span className="text-green-600">
                        {formatCurrency(summary?.totalRevenue || 0)}
                      </span>
                    </div>
                  </div>

                  <div className="mb-6">
                    <h3 className="font-semibold text-gray-900 mb-2">Cost of Goods Sold</h3>
                    {sections.cogs?.map((item, idx) => (
                      <div key={idx} className="flex justify-between py-1 text-sm">
                        <span className="text-gray-600">
                          {item.accountCode} - {item.accountName}
                        </span>
                        <span className="text-red-600">({formatCurrency(lineAmount(item))})</span>
                      </div>
                    ))}
                    <div className="flex justify-between py-2 font-semibold border-t mt-2">
                      <span>Total COGS</span>
                      <span className="text-red-600">
                        ({formatCurrency(summary?.totalCOGS || 0)})
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-between py-3 font-bold text-lg border-t border-b bg-gray-50 px-2">
                    <span>Gross Profit</span>
                    <span className="text-blue-600">
                      {formatCurrency(summary?.grossProfit || 0)}
                    </span>
                  </div>

                  <div className="mb-6 mt-6">
                    <h3 className="font-semibold text-gray-900 mb-2">Operating Expenses</h3>
                    {sections.expenses?.length ? (
                      sections.expenses.map((item, idx) => (
                        <div key={idx} className="flex justify-between py-1 text-sm">
                          <span className="text-gray-600">
                            {item.accountCode} - {item.accountName}
                          </span>
                          <span className="text-red-600">({formatCurrency(lineAmount(item))})</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-gray-400 py-1">No operating expense postings in period</p>
                    )}
                    <div className="flex justify-between py-2 font-semibold border-t mt-2">
                      <span>Total Expenses</span>
                      <span className="text-red-600">({formatCurrency(operatingExpenses)})</span>
                    </div>
                  </div>

                  <div className="flex justify-between py-3 font-bold text-xl border-t-2 border-double mt-4 pt-4">
                    <span>Net Profit (Loss)</span>
                    <span className={netProfit >= 0 ? 'text-green-600' : 'text-red-600'}>
                      {formatCurrency(netProfit)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">No data available</div>
          )}
        </div>
      )}

      {activeTab === 'by-customer' && (
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-semibold">Profitability by Customer</h2>
            <p className="text-sm text-gray-500">Sales analytics for the selected period</p>
          </div>
          {customerLoading ? (
            <div className="flex justify-center py-12">
              <RefreshCw className="h-8 w-8 text-gray-400 animate-spin" />
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Customer</th>
                  <th className="text-right px-6 py-3 text-sm font-medium text-gray-500">Revenue</th>
                  <th className="text-right px-6 py-3 text-sm font-medium text-gray-500">COGS</th>
                  <th className="text-right px-6 py-3 text-sm font-medium text-gray-500">
                    Gross Profit
                  </th>
                  <th className="text-right px-6 py-3 text-sm font-medium text-gray-500">Margin %</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {customerData?.data?.customers?.map(
                  (
                    cust: {
                      customerName?: string;
                      revenue?: number;
                      totalRevenue?: number;
                      cogs?: number;
                      totalCOGS?: number;
                      grossProfit?: number;
                      marginPercent?: number;
                      grossMarginPercent?: number;
                    },
                    idx: number,
                  ) => {
                    const revenue = Number(cust.revenue ?? cust.totalRevenue ?? 0);
                    const cogs = Number(cust.cogs ?? cust.totalCOGS ?? 0);
                    const margin = Number(cust.marginPercent ?? cust.grossMarginPercent ?? 0);
                    return (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-6 py-4 font-medium">{cust.customerName || 'Walk-in'}</td>
                        <td className="px-6 py-4 text-right text-green-600">
                          {formatCurrency(revenue)}
                        </td>
                        <td className="px-6 py-4 text-right text-red-600">{formatCurrency(cogs)}</td>
                        <td className="px-6 py-4 text-right font-semibold">
                          {formatCurrency(cust.grossProfit || 0)}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span
                            className={`px-2 py-1 rounded text-sm ${
                              margin >= 20
                                ? 'bg-green-100 text-green-800'
                                : margin >= 10
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {margin.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    );
                  },
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === 'by-category' && (
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-semibold">Profitability by Category</h2>
            <p className="text-sm text-gray-500">Click a category to view products</p>
          </div>
          {categoryLoading ? (
            <div className="flex justify-center py-12">
              <RefreshCw className="h-8 w-8 text-gray-400 animate-spin" />
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Category</th>
                  <th className="text-right px-6 py-3 text-sm font-medium text-gray-500">Revenue</th>
                  <th className="text-right px-6 py-3 text-sm font-medium text-gray-500">COGS</th>
                  <th className="text-right px-6 py-3 text-sm font-medium text-gray-500">
                    Gross Profit
                  </th>
                  <th className="text-right px-6 py-3 text-sm font-medium text-gray-500">Margin %</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {categoryData?.data?.categories?.map(
                  (
                    cat: {
                      categoryName?: string;
                      revenue?: number;
                      totalRevenue?: number;
                      cogs?: number;
                      totalCOGS?: number;
                      grossProfit?: number;
                      marginPercent?: number;
                      grossMarginPercent?: number;
                      productCount?: number;
                      products?: Array<{
                        productName?: string;
                        productSku?: string;
                        revenue?: number;
                        totalRevenue?: number;
                        cogs?: number;
                        totalCOGS?: number;
                        grossProfit?: number;
                        marginPercent?: number;
                        grossMarginPercent?: number;
                      }>;
                    },
                    idx: number,
                  ) => {
                    const name = cat.categoryName || 'Uncategorized';
                    const expanded = expandedCategories.has(name);
                    const revenue = Number(cat.revenue ?? cat.totalRevenue ?? 0);
                    const cogs = Number(cat.cogs ?? cat.totalCOGS ?? 0);
                    const margin = Number(cat.marginPercent ?? cat.grossMarginPercent ?? 0);
                    return (
                      <Fragment key={name}>
                        <tr
                          className="hover:bg-gray-50 cursor-pointer"
                          onClick={() => toggleCategory(name)}
                        >
                          <td className="px-6 py-4 font-medium">
                            <span className="inline-flex items-center gap-2">
                              {expanded ? (
                                <ChevronDown className="h-4 w-4 text-gray-500" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-gray-500" />
                              )}
                              {name}
                              <span className="text-xs font-normal text-gray-400">
                                ({cat.productCount ?? cat.products?.length ?? 0})
                              </span>
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right text-green-600">
                            {formatCurrency(revenue)}
                          </td>
                          <td className="px-6 py-4 text-right text-red-600">{formatCurrency(cogs)}</td>
                          <td className="px-6 py-4 text-right font-semibold">
                            {formatCurrency(cat.grossProfit || 0)}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <span
                              className={`px-2 py-1 rounded text-sm ${
                                margin >= 20
                                  ? 'bg-green-100 text-green-800'
                                  : margin >= 10
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {margin.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                        {expanded &&
                          (cat.products || []).map((prod, pIdx) => {
                            const pRev = Number(prod.revenue ?? prod.totalRevenue ?? 0);
                            const pCogs = Number(prod.cogs ?? prod.totalCOGS ?? 0);
                            const pMargin = Number(
                              prod.marginPercent ?? prod.grossMarginPercent ?? 0,
                            );
                            return (
                              <tr key={`prod-${idx}-${pIdx}`} className="bg-slate-50/80">
                                <td className="px-6 py-3 pl-14 text-sm text-gray-700">
                                  {prod.productName}
                                  {prod.productSku ? (
                                    <span className="ml-2 text-xs text-gray-400">
                                      {prod.productSku}
                                    </span>
                                  ) : null}
                                </td>
                                <td className="px-6 py-3 text-right text-sm text-green-600">
                                  {formatCurrency(pRev)}
                                </td>
                                <td className="px-6 py-3 text-right text-sm text-red-600">
                                  {formatCurrency(pCogs)}
                                </td>
                                <td className="px-6 py-3 text-right text-sm font-medium">
                                  {formatCurrency(prod.grossProfit || 0)}
                                </td>
                                <td className="px-6 py-3 text-right text-sm text-gray-600">
                                  {pMargin.toFixed(1)}%
                                </td>
                              </tr>
                            );
                          })}
                      </Fragment>
                    );
                  },
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === 'comparative' && (
        <div className="space-y-6">
          <div className="flex items-center space-x-4">
            <label htmlFor="comparativePeriods" className="text-sm font-medium text-gray-700">
              Compare last
            </label>
            <select
              id="comparativePeriods"
              value={comparativePeriods}
              onChange={(e) => setComparativePeriods(parseInt(e.target.value))}
              className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              title="Number of periods to compare"
            >
              <option value={3}>3 months</option>
              <option value={6}>6 months</option>
              <option value={12}>12 months</option>
            </select>
          </div>

          {comparativeLoading ? (
            <div className="flex justify-center py-12">
              <RefreshCw className="h-8 w-8 text-gray-400 animate-spin" />
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-sm border">
              <div className="px-6 py-4 border-b">
                <h2 className="text-lg font-semibold">Period Comparison</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Period</th>
                      <th className="text-right px-6 py-3 text-sm font-medium text-gray-500">
                        Revenue
                      </th>
                      <th className="text-right px-6 py-3 text-sm font-medium text-gray-500">COGS</th>
                      <th className="text-right px-6 py-3 text-sm font-medium text-gray-500">
                        Gross Profit
                      </th>
                      <th className="text-right px-6 py-3 text-sm font-medium text-gray-500">
                        Expenses
                      </th>
                      <th className="text-right px-6 py-3 text-sm font-medium text-gray-500">
                        Net Profit
                      </th>
                      <th className="text-right px-6 py-3 text-sm font-medium text-gray-500">Trend</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(comparativeData?.data?.periods || comparativeData?.data?.comparisons || []).map(
                      (
                        period: {
                          periodLabel?: string;
                          period?: string;
                          revenue?: number;
                          totalRevenue?: number;
                          cogs?: number;
                          totalCOGS?: number;
                          grossProfit?: number;
                          expenses?: number;
                          operatingExpenses?: number;
                          netProfit?: number;
                          netIncome?: number;
                        },
                        idx: number,
                        all: Array<{ netProfit?: number; netIncome?: number }>,
                      ) => {
                        const np = Number(period.netProfit ?? period.netIncome ?? 0);
                        const prev = idx > 0 ? Number(all[idx - 1]?.netProfit ?? all[idx - 1]?.netIncome ?? 0) : null;
                        return (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-6 py-4 font-medium">
                              {period.periodLabel || period.period}
                            </td>
                            <td className="px-6 py-4 text-right text-green-600">
                              {formatCurrency(period.revenue ?? period.totalRevenue ?? 0)}
                            </td>
                            <td className="px-6 py-4 text-right text-red-600">
                              {formatCurrency(period.cogs ?? period.totalCOGS ?? 0)}
                            </td>
                            <td className="px-6 py-4 text-right">
                              {formatCurrency(period.grossProfit || 0)}
                            </td>
                            <td className="px-6 py-4 text-right text-red-600">
                              {formatCurrency(period.expenses ?? period.operatingExpenses ?? 0)}
                            </td>
                            <td className="px-6 py-4 text-right font-semibold">
                              <span className={np >= 0 ? 'text-green-600' : 'text-red-600'}>
                                {formatCurrency(np)}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              {prev != null &&
                                (np > prev ? (
                                  <TrendingUp className="h-5 w-5 text-green-500 inline" />
                                ) : (
                                  <TrendingDown className="h-5 w-5 text-red-500 inline" />
                                ))}
                            </td>
                          </tr>
                        );
                      },
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
