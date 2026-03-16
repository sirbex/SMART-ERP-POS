import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { FileText, TrendingUp, TrendingDown, Users, Package, RefreshCw, CheckCircle, AlertTriangle } from 'lucide-react';
import { formatCurrency } from '../utils/currency';
import { DatePicker } from '../components/ui/date-picker';

// Auth helper for fetch calls
const authHeaders = (): HeadersInit => {
    const token = localStorage.getItem('auth_token');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
};

// API functions
const fetchProfitLoss = async (dateFrom: string, dateTo: string) => {
    const response = await fetch(`/api/erp-accounting/reports/profit-loss?dateFrom=${dateFrom}&dateTo=${dateTo}`, { headers: authHeaders() });
    if (!response.ok) throw new Error('Failed to fetch P&L report');
    return response.json();
};

const fetchPLByCustomer = async (dateFrom: string, dateTo: string) => {
    const response = await fetch(`/api/erp-accounting/reports/profit-loss/by-customer?dateFrom=${dateFrom}&dateTo=${dateTo}`, { headers: authHeaders() });
    if (!response.ok) throw new Error('Failed to fetch P&L by customer');
    return response.json();
};

const fetchPLByProduct = async (dateFrom: string, dateTo: string) => {
    const response = await fetch(`/api/erp-accounting/reports/profit-loss/by-product?dateFrom=${dateFrom}&dateTo=${dateTo}`, { headers: authHeaders() });
    if (!response.ok) throw new Error('Failed to fetch P&L by product');
    return response.json();
};

const fetchPLVerification = async () => {
    const response = await fetch('/api/erp-accounting/reports/profit-loss/verify', { headers: authHeaders() });
    if (!response.ok) throw new Error('Failed to verify P&L');
    return response.json();
};

const fetchComparativePL = async (periods: number) => {
    const response = await fetch(`/api/erp-accounting/reports/profit-loss/comparative?periods=${periods}`, { headers: authHeaders() });
    if (!response.ok) throw new Error('Failed to fetch comparative P&L');
    return response.json();
};

type ViewTab = 'summary' | 'by-customer' | 'by-product' | 'comparative';

interface PLLineItem {
    accountCode: string;
    accountName: string;
    amount: number;
}

interface CustomerProfitability {
    customerName: string;
    revenue: number;
    cogs: number;
    grossProfit: number;
    marginPercent: number;
}

interface ProductProfitability {
    productName: string;
    revenue: number;
    cogs: number;
    grossProfit: number;
    marginPercent: number;
}

interface ComparativePeriod {
    periodLabel: string;
    revenue: number;
    cogs: number;
    grossProfit: number;
    expenses: number;
    netProfit: number;
}

export default function ProfitLossPage() {
    const today = new Date();
    const [dateFrom, setDateFrom] = useState(format(startOfMonth(today), 'yyyy-MM-dd'));
    const [dateTo, setDateTo] = useState(format(endOfMonth(today), 'yyyy-MM-dd'));
    const [activeTab, setActiveTab] = useState<ViewTab>('summary');
    const [comparativePeriods, setComparativePeriods] = useState(3);

    // Queries
    const { data: plData, isLoading: plLoading, refetch: refetchPL } = useQuery({
        queryKey: ['profit-loss', dateFrom, dateTo],
        queryFn: () => fetchProfitLoss(dateFrom, dateTo),
        enabled: activeTab === 'summary'
    });

    const { data: customerData, isLoading: customerLoading } = useQuery({
        queryKey: ['profit-loss-customer', dateFrom, dateTo],
        queryFn: () => fetchPLByCustomer(dateFrom, dateTo),
        enabled: activeTab === 'by-customer'
    });

    const { data: productData, isLoading: productLoading } = useQuery({
        queryKey: ['profit-loss-product', dateFrom, dateTo],
        queryFn: () => fetchPLByProduct(dateFrom, dateTo),
        enabled: activeTab === 'by-product'
    });

    const { data: comparativeData, isLoading: comparativeLoading } = useQuery({
        queryKey: ['profit-loss-comparative', comparativePeriods],
        queryFn: () => fetchComparativePL(comparativePeriods),
        enabled: activeTab === 'comparative'
    });

    const { data: verificationData, isLoading: verifyLoading, refetch: refetchVerify } = useQuery({
        queryKey: ['profit-loss-verify'],
        queryFn: fetchPLVerification
    });

    const report = plData?.data;
    const verification = verificationData?.data;

    const tabs = [
        { id: 'summary' as ViewTab, name: 'Summary', icon: <FileText className="h-4 w-4" /> },
        { id: 'by-customer' as ViewTab, name: 'By Customer', icon: <Users className="h-4 w-4" /> },
        { id: 'by-product' as ViewTab, name: 'By Product', icon: <Package className="h-4 w-4" /> },
        { id: 'comparative' as ViewTab, name: 'Comparative', icon: <TrendingUp className="h-4 w-4" /> }
    ];

    return (
        <div className="p-4 lg:p-6">
            {/* Verification Status */}
            {verification && (
                <div className={`mb-6 p-4 rounded-lg border ${verification.isConsistent ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                    <div className="flex items-center space-x-3">
                        {verification.isConsistent ? (
                            <CheckCircle className="h-5 w-5 text-green-600" />
                        ) : (
                            <AlertTriangle className="h-5 w-5 text-red-600" />
                        )}
                        <div>
                            <p className={`font-medium ${verification.isConsistent ? 'text-green-800' : 'text-red-800'}`}>
                                {verification.isConsistent ? 'P&L Consistent with Trial Balance' : 'Discrepancy Detected'}
                            </p>
                            <p className="text-sm text-gray-600">
                                Income & Expense Balance: {formatCurrency(verification.trialBalanceIncomeExpense || 0)}
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

            {/* Date Range Selector */}
            <div className="bg-white rounded-lg shadow-sm border p-4 mb-6">
                <div className="flex flex-wrap items-end gap-4">
                    <div className="min-w-[200px]">
                        <label className="block text-sm font-semibold text-gray-700 mb-2">📅 From</label>
                        <DatePicker
                            value={dateFrom}
                            onChange={(date) => setDateFrom(date)}
                            placeholder="Select start date"
                            maxDate={dateTo ? new Date(dateTo) : undefined}
                        />
                    </div>
                    <div className="min-w-[200px]">
                        <label className="block text-sm font-semibold text-gray-700 mb-2">📅 To</label>
                        <DatePicker
                            value={dateTo}
                            onChange={(date) => setDateTo(date)}
                            placeholder="Select end date"
                            minDate={dateFrom ? new Date(dateFrom) : undefined}
                        />
                    </div>
                    <button
                        onClick={() => refetchPL()}
                        className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2 transition-colors"
                    >
                        <RefreshCw className="h-4 w-4" />
                        <span>Refresh</span>
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="border-b mb-6">
                <nav className="flex space-x-8">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm ${activeTab === tab.id
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

            {/* Summary View */}
            {activeTab === 'summary' && (
                <div>
                    {plLoading ? (
                        <div className="flex justify-center py-12">
                            <RefreshCw className="h-8 w-8 text-gray-400 animate-spin" />
                        </div>
                    ) : report ? (
                        <div className="space-y-6">
                            {/* Summary Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div className="bg-white rounded-lg shadow-sm border p-4">
                                    <p className="text-sm text-gray-500">Total Revenue</p>
                                    <p className="text-2xl font-bold text-green-600">{formatCurrency(report.summary?.totalRevenue || 0)}</p>
                                </div>
                                <div className="bg-white rounded-lg shadow-sm border p-4">
                                    <p className="text-sm text-gray-500">Cost of Goods Sold</p>
                                    <p className="text-2xl font-bold text-red-600">{formatCurrency(report.summary?.totalCOGS || 0)}</p>
                                </div>
                                <div className="bg-white rounded-lg shadow-sm border p-4">
                                    <p className="text-sm text-gray-500">Gross Profit</p>
                                    <p className="text-2xl font-bold text-blue-600">{formatCurrency(report.summary?.grossProfit || 0)}</p>
                                    <p className="text-xs text-gray-400">{(report.summary?.grossMarginPercent || 0).toFixed(1)}% margin</p>
                                </div>
                                <div className="bg-white rounded-lg shadow-sm border p-4">
                                    <p className="text-sm text-gray-500">Net Profit</p>
                                    <p className={`text-2xl font-bold ${(report.summary?.netProfit || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {formatCurrency(report.summary?.netProfit || 0)}
                                    </p>
                                    <p className="text-xs text-gray-400">{(report.summary?.netMarginPercent || 0).toFixed(1)}% margin</p>
                                </div>
                            </div>

                            {/* Detailed Report */}
                            <div className="bg-white rounded-lg shadow-sm border">
                                <div className="px-6 py-4 border-b">
                                    <h2 className="text-lg font-semibold">Profit & Loss Statement</h2>
                                    <p className="text-sm text-gray-500">{report.dateFrom} to {report.dateTo}</p>
                                </div>
                                <div className="p-6">
                                    {/* Revenue Section */}
                                    <div className="mb-6">
                                        <h3 className="font-semibold text-gray-900 mb-2">Revenue</h3>
                                        {report.sections?.revenue?.map((item: PLLineItem, idx: number) => (
                                            <div key={idx} className="flex justify-between py-1 text-sm">
                                                <span className="text-gray-600">{item.accountCode} - {item.accountName}</span>
                                                <span className="text-green-600">{formatCurrency(item.amount)}</span>
                                            </div>
                                        ))}
                                        <div className="flex justify-between py-2 font-semibold border-t mt-2">
                                            <span>Total Revenue</span>
                                            <span className="text-green-600">{formatCurrency(report.summary?.totalRevenue || 0)}</span>
                                        </div>
                                    </div>

                                    {/* COGS Section */}
                                    <div className="mb-6">
                                        <h3 className="font-semibold text-gray-900 mb-2">Cost of Goods Sold</h3>
                                        {report.sections?.cogs?.map((item: PLLineItem, idx: number) => (
                                            <div key={idx} className="flex justify-between py-1 text-sm">
                                                <span className="text-gray-600">{item.accountCode} - {item.accountName}</span>
                                                <span className="text-red-600">({formatCurrency(item.amount)})</span>
                                            </div>
                                        ))}
                                        <div className="flex justify-between py-2 font-semibold border-t mt-2">
                                            <span>Total COGS</span>
                                            <span className="text-red-600">({formatCurrency(report.summary?.totalCOGS || 0)})</span>
                                        </div>
                                    </div>

                                    {/* Gross Profit */}
                                    <div className="flex justify-between py-3 font-bold text-lg border-t border-b bg-gray-50 px-2">
                                        <span>Gross Profit</span>
                                        <span className="text-blue-600">{formatCurrency(report.summary?.grossProfit || 0)}</span>
                                    </div>

                                    {/* Expenses Section */}
                                    <div className="mb-6 mt-6">
                                        <h3 className="font-semibold text-gray-900 mb-2">Operating Expenses</h3>
                                        {report.sections?.expenses?.map((item: PLLineItem, idx: number) => (
                                            <div key={idx} className="flex justify-between py-1 text-sm">
                                                <span className="text-gray-600">{item.accountCode} - {item.accountName}</span>
                                                <span className="text-red-600">({formatCurrency(item.amount)})</span>
                                            </div>
                                        ))}
                                        <div className="flex justify-between py-2 font-semibold border-t mt-2">
                                            <span>Total Expenses</span>
                                            <span className="text-red-600">({formatCurrency(report.summary?.totalExpenses || 0)})</span>
                                        </div>
                                    </div>

                                    {/* Net Profit */}
                                    <div className="flex justify-between py-3 font-bold text-xl border-t-2 border-double mt-4 pt-4">
                                        <span>Net Profit (Loss)</span>
                                        <span className={(report.summary?.netProfit || 0) >= 0 ? 'text-green-600' : 'text-red-600'}>
                                            {formatCurrency(report.summary?.netProfit || 0)}
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

            {/* By Customer View */}
            {activeTab === 'by-customer' && (
                <div className="bg-white rounded-lg shadow-sm border">
                    <div className="px-6 py-4 border-b">
                        <h2 className="text-lg font-semibold">Profitability by Customer</h2>
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
                                    <th className="text-right px-6 py-3 text-sm font-medium text-gray-500">Gross Profit</th>
                                    <th className="text-right px-6 py-3 text-sm font-medium text-gray-500">Margin %</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {customerData?.data?.customers?.map((cust: CustomerProfitability, idx: number) => (
                                    <tr key={idx} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 font-medium">{cust.customerName || 'Walk-in'}</td>
                                        <td className="px-6 py-4 text-right text-green-600">{formatCurrency(cust.revenue)}</td>
                                        <td className="px-6 py-4 text-right text-red-600">{formatCurrency(cust.cogs)}</td>
                                        <td className="px-6 py-4 text-right font-semibold">{formatCurrency(cust.grossProfit)}</td>
                                        <td className="px-6 py-4 text-right">
                                            <span className={`px-2 py-1 rounded text-sm ${cust.marginPercent >= 20 ? 'bg-green-100 text-green-800' : cust.marginPercent >= 10 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
                                                {cust.marginPercent?.toFixed(1)}%
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {/* By Product View */}
            {activeTab === 'by-product' && (
                <div className="bg-white rounded-lg shadow-sm border">
                    <div className="px-6 py-4 border-b">
                        <h2 className="text-lg font-semibold">Profitability by Product</h2>
                    </div>
                    {productLoading ? (
                        <div className="flex justify-center py-12">
                            <RefreshCw className="h-8 w-8 text-gray-400 animate-spin" />
                        </div>
                    ) : (
                        <table className="w-full">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Product</th>
                                    <th className="text-right px-6 py-3 text-sm font-medium text-gray-500">Revenue</th>
                                    <th className="text-right px-6 py-3 text-sm font-medium text-gray-500">COGS</th>
                                    <th className="text-right px-6 py-3 text-sm font-medium text-gray-500">Gross Profit</th>
                                    <th className="text-right px-6 py-3 text-sm font-medium text-gray-500">Margin %</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {productData?.data?.products?.map((prod: ProductProfitability, idx: number) => (
                                    <tr key={idx} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 font-medium">{prod.productName}</td>
                                        <td className="px-6 py-4 text-right text-green-600">{formatCurrency(prod.revenue)}</td>
                                        <td className="px-6 py-4 text-right text-red-600">{formatCurrency(prod.cogs)}</td>
                                        <td className="px-6 py-4 text-right font-semibold">{formatCurrency(prod.grossProfit)}</td>
                                        <td className="px-6 py-4 text-right">
                                            <span className={`px-2 py-1 rounded text-sm ${prod.marginPercent >= 20 ? 'bg-green-100 text-green-800' : prod.marginPercent >= 10 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
                                                {prod.marginPercent?.toFixed(1)}%
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {/* Comparative View */}
            {activeTab === 'comparative' && (
                <div className="space-y-6">
                    <div className="flex items-center space-x-4">
                        <label htmlFor="comparativePeriods" className="text-sm font-medium text-gray-700">Compare last</label>
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
                                            <th className="text-right px-6 py-3 text-sm font-medium text-gray-500">Revenue</th>
                                            <th className="text-right px-6 py-3 text-sm font-medium text-gray-500">COGS</th>
                                            <th className="text-right px-6 py-3 text-sm font-medium text-gray-500">Gross Profit</th>
                                            <th className="text-right px-6 py-3 text-sm font-medium text-gray-500">Expenses</th>
                                            <th className="text-right px-6 py-3 text-sm font-medium text-gray-500">Net Profit</th>
                                            <th className="text-right px-6 py-3 text-sm font-medium text-gray-500">Trend</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {comparativeData?.data?.periods?.map((period: ComparativePeriod, idx: number) => (
                                            <tr key={idx} className="hover:bg-gray-50">
                                                <td className="px-6 py-4 font-medium">{period.periodLabel}</td>
                                                <td className="px-6 py-4 text-right text-green-600">{formatCurrency(period.revenue)}</td>
                                                <td className="px-6 py-4 text-right text-red-600">{formatCurrency(period.cogs)}</td>
                                                <td className="px-6 py-4 text-right">{formatCurrency(period.grossProfit)}</td>
                                                <td className="px-6 py-4 text-right text-red-600">{formatCurrency(period.expenses)}</td>
                                                <td className="px-6 py-4 text-right font-semibold">
                                                    <span className={period.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}>
                                                        {formatCurrency(period.netProfit)}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    {idx > 0 && comparativeData?.data?.periods?.[idx - 1] && (
                                                        period.netProfit > comparativeData.data.periods[idx - 1].netProfit ? (
                                                            <TrendingUp className="h-5 w-5 text-green-500 inline" />
                                                        ) : (
                                                            <TrendingDown className="h-5 w-5 text-red-500 inline" />
                                                        )
                                                    )}
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
        </div>
    );
}
