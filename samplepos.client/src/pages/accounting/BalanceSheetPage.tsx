import { useState, useEffect, useCallback, useRef } from 'react';
import {
    ChevronDown, ChevronRight, Printer, Download,
    Calendar, CheckCircle2, AlertTriangle, RefreshCw, Scale
} from 'lucide-react';
import { Button } from '../../components/ui/temp-ui-components';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/temp-ui-components';
import { Badge } from '../../components/ui/temp-ui-components';
import { DatePicker } from '../../components/ui/date-picker';
import { formatCurrency } from '../../utils/currency';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { accountingApi } from '../../services/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface BalanceSheetLineItem {
    accountCode: string;
    accountName: string;
    amount: number;
}

interface BalanceSheetData {
    companyName: string;
    reportDate: string;
    generatedAt: string;
    assets: {
        currentAssets: BalanceSheetLineItem[];
        fixedAssets: BalanceSheetLineItem[];
        totalCurrentAssets: number;
        totalFixedAssets: number;
        totalOtherAssets: number;
        totalAssets: number;
    };
    liabilities: {
        currentLiabilities: BalanceSheetLineItem[];
        longTermLiabilities: BalanceSheetLineItem[];
        totalCurrentLiabilities: number;
        totalLongTermLiabilities: number;
        totalLiabilities: number;
    };
    equity: {
        items: BalanceSheetLineItem[];
        retainedEarnings: number;
        totalEquity: number;
    };
    totalLiabilitiesAndEquity: number;
    isBalanced: boolean;
}

// ---------------------------------------------------------------------------
// Collapsible section
// ---------------------------------------------------------------------------
function Section({
    title,
    items,
    subtotal,
    subtotalLabel,
    defaultOpen = true,
    accentColor = 'gray',
}: {
    title: string;
    items: BalanceSheetLineItem[];
    subtotal: number;
    subtotalLabel?: string;
    defaultOpen?: boolean;
    accentColor?: 'blue' | 'red' | 'green' | 'purple' | 'gray';
}) {
    const [open, setOpen] = useState(defaultOpen);

    const colors: Record<string, { bg: string; text: string; border: string }> = {
        blue: { bg: 'bg-blue-50', text: 'text-blue-900', border: 'border-blue-200' },
        red: { bg: 'bg-red-50', text: 'text-red-900', border: 'border-red-200' },
        green: { bg: 'bg-green-50', text: 'text-green-900', border: 'border-green-200' },
        purple: { bg: 'bg-purple-50', text: 'text-purple-900', border: 'border-purple-200' },
        gray: { bg: 'bg-gray-50', text: 'text-gray-900', border: 'border-gray-200' },
    };
    const c = colors[accentColor] || colors.gray;

    if (items.length === 0 && subtotal === 0) return null;

    return (
        <div className="mb-4">
            <button
                type="button"
                className={`flex items-center justify-between w-full px-4 py-2.5 rounded-t-lg ${c.bg} ${c.border} border font-semibold text-sm ${c.text} hover:opacity-80 transition-opacity`}
                onClick={() => setOpen(!open)}
                aria-expanded={open}
            >
                <span className="flex items-center gap-2">
                    {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    {title}
                    <Badge variant="outline" className="ml-2 text-xs font-normal">{items.length} accounts</Badge>
                </span>
                <span className="font-mono font-bold">{formatCurrency(subtotal)}</span>
            </button>

            {open && (
                <div className={`border-x border-b ${c.border} rounded-b-lg overflow-x-auto`}>
                    <table className="w-full text-sm min-w-[400px]">
                        <tbody>
                            {items.map((item, i) => (
                                <tr
                                    key={`${item.accountCode}-${i}`}
                                    className="border-b border-gray-100 last:border-0 hover:bg-gray-50/50 transition-colors"
                                >
                                    <td className="py-2 px-4 text-gray-500 font-mono w-24 text-xs">{item.accountCode}</td>
                                    <td className="py-2 px-4 text-gray-800">{item.accountName}</td>
                                    <td className={`py-2 px-4 text-right font-mono w-40 ${item.amount < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                                        {item.amount < 0
                                            ? `(${formatCurrency(Math.abs(item.amount))})`
                                            : formatCurrency(item.amount)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {/* Subtotal row */}
                    <div className={`flex justify-between items-center px-4 py-2 ${c.bg} border-t ${c.border} text-sm font-semibold ${c.text}`}>
                        <span>{subtotalLabel || `Total ${title}`}</span>
                        <span className="font-mono">{formatCurrency(subtotal)}</span>
                    </div>
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function BalanceSheetPage() {
    const [data, setData] = useState<BalanceSheetData | null>(null);
    const [loading, setLoading] = useState(false);
    const [asOfDate, setAsOfDate] = useState<Date>(() => new Date());
    const printRef = useRef<HTMLDivElement>(null);

    const fetchData = useCallback(async (date: Date) => {
        setLoading(true);
        try {
            const dateStr = format(date, 'yyyy-MM-dd');
            const response = await accountingApi.get(`/balance-sheet?asOfDate=${encodeURIComponent(dateStr)}`);
            const result = response.data;
            if (result.success) {
                setData(result.data);
            } else {
                toast.error(result.error || 'Failed to load balance sheet');
            }
        } catch (err) {
            toast.error('Failed to load balance sheet');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData(asOfDate);
    }, [asOfDate, fetchData]);

    const handlePrint = () => {
        window.print();
    };

    const handleExportCSV = () => {
        if (!data) return;
        const rows: string[][] = [
            ['Balance Sheet', '', ''],
            [`As of ${data.reportDate}`, '', ''],
            ['', '', ''],
            ['ASSETS', '', ''],
            ['Current Assets', '', ''],
            ...data.assets.currentAssets.map(i => [i.accountCode, i.accountName, String(i.amount)]),
            ['', 'Total Current Assets', String(data.assets.totalCurrentAssets)],
            ['', '', ''],
            ['Non-Current Assets', '', ''],
            ...data.assets.fixedAssets.map(i => [i.accountCode, i.accountName, String(i.amount)]),
            ['', 'Total Non-Current Assets', String(data.assets.totalFixedAssets)],
            ['', '', ''],
            ['', 'TOTAL ASSETS', String(data.assets.totalAssets)],
            ['', '', ''],
            ['LIABILITIES', '', ''],
            ['Current Liabilities', '', ''],
            ...data.liabilities.currentLiabilities.map(i => [i.accountCode, i.accountName, String(i.amount)]),
            ['', 'Total Current Liabilities', String(data.liabilities.totalCurrentLiabilities)],
            ['', '', ''],
            ['Long-term Liabilities', '', ''],
            ...data.liabilities.longTermLiabilities.map(i => [i.accountCode, i.accountName, String(i.amount)]),
            ['', 'Total Long-term Liabilities', String(data.liabilities.totalLongTermLiabilities)],
            ['', '', ''],
            ['', 'TOTAL LIABILITIES', String(data.liabilities.totalLiabilities)],
            ['', '', ''],
            ['EQUITY', '', ''],
            ...data.equity.items.map(i => [i.accountCode, i.accountName, String(i.amount)]),
            ['', 'Retained Earnings', String(data.equity.retainedEarnings)],
            ['', 'TOTAL EQUITY', String(data.equity.totalEquity)],
            ['', '', ''],
            ['', 'TOTAL LIABILITIES & EQUITY', String(data.totalLiabilitiesAndEquity)],
        ];

        const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `balance-sheet-${data.reportDate}.csv`;
        link.click();
        URL.revokeObjectURL(link.href);
        toast.success('CSV exported');
    };

    // Quick date presets
    const setPreset = (preset: string) => {
        const now = new Date();
        switch (preset) {
            case 'today':
                setAsOfDate(new Date());
                break;
            case 'month-end': {
                const d = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                setAsOfDate(d);
                break;
            }
            case 'last-month': {
                const d = new Date(now.getFullYear(), now.getMonth(), 0);
                setAsOfDate(d);
                break;
            }
            case 'quarter-end': {
                const q = Math.floor(now.getMonth() / 3);
                const d = new Date(now.getFullYear(), (q + 1) * 3, 0);
                setAsOfDate(d);
                break;
            }
            case 'year-end': {
                const d = new Date(now.getFullYear() - 1, 11, 31);
                setAsOfDate(d);
                break;
            }
        }
    };

    const difference = data
        ? Math.abs(data.assets.totalAssets - data.totalLiabilitiesAndEquity)
        : 0;

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            {/* ------------------------------------------------------------------ */}
            {/* Header                                                              */}
            {/* ------------------------------------------------------------------ */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Scale className="h-6 w-6 text-blue-600" />
                        Balance Sheet
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Statement of financial position
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <Button variant="outline" size="sm" onClick={() => fetchData(asOfDate)} disabled={loading}>
                        <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                    <Button variant="outline" size="sm" onClick={handlePrint}>
                        <Printer className="h-4 w-4 mr-1" />
                        Print
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={!data}>
                        <Download className="h-4 w-4 mr-1" />
                        CSV
                    </Button>
                </div>
            </div>

            {/* ------------------------------------------------------------------ */}
            {/* Date selector + presets                                             */}
            {/* ------------------------------------------------------------------ */}
            <Card>
                <CardContent className="py-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                    <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-gray-500" />
                        <span className="text-sm font-medium text-gray-700">As of:</span>
                        <DatePicker
                            value={format(asOfDate, 'yyyy-MM-dd')}
                            onChange={(dateStr: string) => {
                                const d = new Date(dateStr + 'T00:00:00');
                                if (!isNaN(d.getTime())) setAsOfDate(d);
                            }}
                        />
                    </div>
                    <div className="flex gap-1 flex-wrap">
                        {[
                            { key: 'today', label: 'Today' },
                            { key: 'month-end', label: 'Month End' },
                            { key: 'last-month', label: 'Last Month' },
                            { key: 'quarter-end', label: 'Quarter End' },
                            { key: 'year-end', label: 'Last Year End' },
                        ].map((p) => (
                            <Button key={p.key} variant="ghost" size="sm" className="text-xs h-7" onClick={() => setPreset(p.key)}>
                                {p.label}
                            </Button>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* ------------------------------------------------------------------ */}
            {/* Accounting equation banner                                          */}
            {/* ------------------------------------------------------------------ */}
            {data && (
                <div
                    className={`rounded-lg border p-4 flex flex-col sm:flex-row items-center justify-between gap-4 ${data.isBalanced
                            ? 'bg-green-50 border-green-200'
                            : 'bg-red-50 border-red-200'
                        }`}
                >
                    <div className="flex items-center gap-3">
                        {data.isBalanced ? (
                            <CheckCircle2 className="h-6 w-6 text-green-600 flex-shrink-0" />
                        ) : (
                            <AlertTriangle className="h-6 w-6 text-red-600 flex-shrink-0" />
                        )}
                        <div>
                            <p className={`font-semibold text-sm ${data.isBalanced ? 'text-green-800' : 'text-red-800'}`}>
                                {data.isBalanced
                                    ? 'Accounting equation is balanced'
                                    : `Out of balance by ${formatCurrency(difference)}`}
                            </p>
                            <p className="text-xs text-gray-600 mt-0.5 font-mono">
                                Assets ({formatCurrency(data.assets.totalAssets)}) = Liabilities ({formatCurrency(data.liabilities.totalLiabilities)}) + Equity ({formatCurrency(data.equity.totalEquity)})
                            </p>
                        </div>
                    </div>
                    <div className="text-xs text-gray-500">
                        Generated {data.generatedAt ? format(new Date(data.generatedAt), 'MMM d, yyyy h:mm a') : ''}
                    </div>
                </div>
            )}

            {/* ------------------------------------------------------------------ */}
            {/* Loading state                                                       */}
            {/* ------------------------------------------------------------------ */}
            {loading && !data && (
                <div className="flex justify-center py-20">
                    <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
                </div>
            )}

            {/* ------------------------------------------------------------------ */}
            {/* Report body (printable area)                                        */}
            {/* ------------------------------------------------------------------ */}
            {data && (
                <div ref={printRef} className="print:p-6">
                    {/* Print-only header */}
                    <div className="hidden print:block text-center mb-6">
                        <h1 className="text-xl font-bold">{data.companyName}</h1>
                        <h2 className="text-lg">Balance Sheet</h2>
                        <p className="text-sm text-gray-600">As of {data.reportDate}</p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* ============================================================ */}
                        {/* LEFT COLUMN — ASSETS                                          */}
                        {/* ============================================================ */}
                        <div>
                            <Card>
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-lg flex items-center justify-between">
                                        <span>Assets</span>
                                        <span className="text-blue-700 font-mono">{formatCurrency(data.assets.totalAssets)}</span>
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="pt-0">
                                    <Section
                                        title="Current Assets"
                                        items={data.assets.currentAssets}
                                        subtotal={data.assets.totalCurrentAssets}
                                        accentColor="blue"
                                    />
                                    <Section
                                        title="Non-Current Assets"
                                        items={data.assets.fixedAssets}
                                        subtotal={data.assets.totalFixedAssets}
                                        accentColor="blue"
                                        defaultOpen={data.assets.fixedAssets.length > 0}
                                    />

                                    {/* Grand Total Assets */}
                                    <div className="mt-4 bg-blue-600 text-white rounded-lg px-4 py-3 flex justify-between items-center">
                                        <span className="font-bold">TOTAL ASSETS</span>
                                        <span className="font-bold font-mono text-lg">{formatCurrency(data.assets.totalAssets)}</span>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        {/* ============================================================ */}
                        {/* RIGHT COLUMN — LIABILITIES & EQUITY                           */}
                        {/* ============================================================ */}
                        <div className="space-y-6">
                            {/* Liabilities */}
                            <Card>
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-lg flex items-center justify-between">
                                        <span>Liabilities</span>
                                        <span className="text-red-700 font-mono">{formatCurrency(data.liabilities.totalLiabilities)}</span>
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="pt-0">
                                    <Section
                                        title="Current Liabilities"
                                        items={data.liabilities.currentLiabilities}
                                        subtotal={data.liabilities.totalCurrentLiabilities}
                                        accentColor="red"
                                    />
                                    <Section
                                        title="Long-term Liabilities"
                                        items={data.liabilities.longTermLiabilities}
                                        subtotal={data.liabilities.totalLongTermLiabilities}
                                        accentColor="red"
                                        defaultOpen={data.liabilities.longTermLiabilities.length > 0}
                                    />

                                    {/* Total Liabilities */}
                                    <div className="mt-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 flex justify-between items-center">
                                        <span className="font-bold text-red-800">Total Liabilities</span>
                                        <span className="font-bold font-mono text-red-800">{formatCurrency(data.liabilities.totalLiabilities)}</span>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Equity */}
                            <Card>
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-lg flex items-center justify-between">
                                        <span>Equity</span>
                                        <span className="text-green-700 font-mono">{formatCurrency(data.equity.totalEquity)}</span>
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="pt-0">
                                    <Section
                                        title="Equity Accounts"
                                        items={data.equity.items}
                                        subtotal={data.equity.items.reduce((s, i) => s + i.amount, 0)}
                                        accentColor="green"
                                    />

                                    {/* Retained Earnings (computed) */}
                                    <div className="border border-green-200 rounded-lg px-4 py-2.5 flex justify-between items-center bg-green-50/50 mb-4">
                                        <span className="text-sm font-medium text-green-800">Retained Earnings (Net Income)</span>
                                        <span className="font-mono font-semibold text-green-800">{formatCurrency(data.equity.retainedEarnings)}</span>
                                    </div>

                                    {/* Total Equity */}
                                    <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2.5 flex justify-between items-center">
                                        <span className="font-bold text-green-800">Total Equity</span>
                                        <span className="font-bold font-mono text-green-800">{formatCurrency(data.equity.totalEquity)}</span>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Total Liabilities & Equity */}
                            <div
                                className={`rounded-lg px-4 py-3 flex justify-between items-center ${data.isBalanced ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                                    }`}
                            >
                                <span className="font-bold">TOTAL LIABILITIES & EQUITY</span>
                                <span className="font-bold font-mono text-lg">{formatCurrency(data.totalLiabilitiesAndEquity)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Empty state */}
            {!loading && !data && (
                <Card>
                    <CardContent className="py-12 text-center text-gray-500">
                        <Scale className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                        <p>No balance sheet data available.</p>
                        <p className="text-sm mt-1">Select a date and click Refresh to generate.</p>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
