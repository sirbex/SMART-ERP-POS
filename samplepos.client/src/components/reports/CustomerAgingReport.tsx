import React, { useState, useEffect } from 'react';
import Decimal from 'decimal.js';
import { formatCurrency } from '../../utils/currency';
import { comprehensiveInvoiceService } from '../../services/comprehensive-accounting';
import type { CustomerAgingReport as AgingReportType } from '../../types/comprehensive-accounting';

interface CustomerAgingReportProps {
    className?: string;
}

const CustomerAgingReport: React.FC<CustomerAgingReportProps> = ({ className = '' }) => {
    const [agingData, setAgingData] = useState<AgingReportType[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadAgingReport();
    }, []);

    const loadAgingReport = async () => {
        try {
            setIsLoading(true);
            setError(null);
            const response = await comprehensiveInvoiceService.getCustomerAging();
            if (response.success && response.data) {
                setAgingData(response.data);
            } else {
                setError('Failed to load aging report');
            }
        } catch (err) {
            console.error('Error loading aging report:', err);
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setIsLoading(false);
        }
    };

    const toNumber = (value: unknown): number => {
        if (typeof value === 'number') return value;
        return parseFloat(String(value) || '0') || 0;
    };

    // Calculate totals
    const totals = agingData.reduce(
        (acc, row) => ({
            current: new Decimal(acc.current).plus(toNumber(row.current)).toNumber(),
            days30: new Decimal(acc.days30).plus(toNumber(row.days30)).toNumber(),
            days60: new Decimal(acc.days60).plus(toNumber(row.days60)).toNumber(),
            days90: new Decimal(acc.days90).plus(toNumber(row.days90)).toNumber(),
            over90: new Decimal(acc.over90).plus(toNumber(row.over90)).toNumber(),
            totalOutstanding: new Decimal(acc.totalOutstanding).plus(toNumber(row.totalOutstanding)).toNumber(),
            overdueAmount: new Decimal(acc.overdueAmount).plus(toNumber(row.overdueAmount)).toNumber(),
        }),
        { current: 0, days30: 0, days60: 0, days90: 0, over90: 0, totalOutstanding: 0, overdueAmount: 0 }
    );

    const exportToCsv = () => {
        const headers = [
            'Customer Name',
            'Current',
            '1-30 Days',
            '31-60 Days',
            '61-90 Days',
            '90+ Days',
            'Total Outstanding',
            'Overdue Amount'
        ];

        const csvContent = [
            headers.join(','),
            ...agingData.map(row => [
                `"${row.customerName}"`,
                toNumber(row.current).toFixed(2),
                toNumber(row.days30).toFixed(2),
                toNumber(row.days60).toFixed(2),
                toNumber(row.days90).toFixed(2),
                toNumber(row.over90).toFixed(2),
                toNumber(row.totalOutstanding).toFixed(2),
                toNumber(row.overdueAmount).toFixed(2)
            ].join(',')),
            // Add totals row
            [
                '"TOTALS"',
                totals.current.toFixed(2),
                totals.days30.toFixed(2),
                totals.days60.toFixed(2),
                totals.days90.toFixed(2),
                totals.over90.toFixed(2),
                totals.totalOutstanding.toFixed(2),
                totals.overdueAmount.toFixed(2)
            ].join(',')
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `customer-aging-report-${new Date().toLocaleDateString('en-CA')}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    if (isLoading) {
        return (
            <div className={`bg-white rounded-lg shadow p-6 ${className}`}>
                <div className="animate-pulse">
                    <div className="h-6 bg-gray-200 rounded w-1/4 mb-4"></div>
                    <div className="space-y-3">
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className="h-4 bg-gray-200 rounded w-full"></div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className={`bg-white rounded-lg shadow p-6 ${className}`}>
                <div className="text-center py-8">
                    <div className="text-red-600 mb-2">❌ Failed to load aging report</div>
                    <div className="text-gray-600 text-sm mb-4">{error}</div>
                    <button
                        onClick={loadAgingReport}
                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className={`bg-white rounded-lg shadow ${className}`}>
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-semibold text-gray-900">Customer Aging Report</h2>
                        <p className="text-sm text-gray-600 mt-1">
                            Open-item aged receivables (net of on-account receipts) — same AR SSOT as Payments & Statement
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={loadAgingReport}
                            className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                        >
                            Refresh
                        </button>
                        <button
                            onClick={exportToCsv}
                            className="px-3 py-2 text-sm bg-slate-800 text-white rounded hover:bg-slate-900"
                        >
                            Export CSV
                        </button>
                    </div>
                </div>
            </div>

            <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 text-sm text-slate-600">
                <span className="font-semibold text-slate-800">Aging: </span>
                Buckets are open invoices by days past due. Totals are net of unallocated (on-account) receipts.
                For period movements use Account Statement / AR Ledger; for who paid use Customer Payments.
            </div>

            {/* Summary Cards */}
            <div className="px-6 py-4 bg-white border-b border-gray-200">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                    <div className="rounded-lg border border-slate-200 p-3 text-center">
                        <div className="text-lg font-bold text-slate-900">
                            {formatCurrency(totals.current)}
                        </div>
                        <div className="text-xs text-gray-600 uppercase tracking-wide mt-1">Current</div>
                    </div>
                    <div className="rounded-lg border border-amber-100 bg-amber-50/50 p-3 text-center">
                        <div className="text-lg font-bold text-amber-700">
                            {formatCurrency(totals.days30)}
                        </div>
                        <div className="text-xs text-gray-600 uppercase tracking-wide mt-1">1–30</div>
                    </div>
                    <div className="rounded-lg border border-orange-100 bg-orange-50/50 p-3 text-center">
                        <div className="text-lg font-bold text-orange-700">
                            {formatCurrency(totals.days60)}
                        </div>
                        <div className="text-xs text-gray-600 uppercase tracking-wide mt-1">31–60</div>
                    </div>
                    <div className="rounded-lg border border-orange-100 bg-orange-50/50 p-3 text-center">
                        <div className="text-lg font-bold text-orange-800">
                            {formatCurrency(totals.days90)}
                        </div>
                        <div className="text-xs text-gray-600 uppercase tracking-wide mt-1">61–90</div>
                    </div>
                    <div className="rounded-lg border border-red-100 bg-red-50/50 p-3 text-center">
                        <div className="text-lg font-bold text-red-700">
                            {formatCurrency(totals.over90)}
                        </div>
                        <div className="text-xs text-gray-600 uppercase tracking-wide mt-1">90+</div>
                    </div>
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-center">
                        <div className="text-lg font-bold text-red-800">
                            {formatCurrency(totals.totalOutstanding)}
                        </div>
                        <div className="text-xs text-gray-600 uppercase tracking-wide mt-1">Net open AR</div>
                    </div>
                </div>
            </div>

            {/* Data Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                                Customer
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">
                                Current
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">
                                1-30
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">
                                31-60
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">
                                61-90
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">
                                90+
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">
                                Open balance
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-100">
                        {agingData.map((row) => {
                            const overdueAmount = toNumber(row.overdueAmount);
                            const isOverdue = overdueAmount > 0;

                            return (
                                <tr key={row.customerId} className="hover:bg-slate-50">
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        <div className="font-medium text-slate-900">{row.customerName}</div>
                                        <div className="text-xs font-mono text-slate-500">
                                            {row.customerNumber || ''}
                                        </div>
                                        {isOverdue && (
                                            <div className="text-xs text-red-600 mt-0.5">
                                                Overdue: {formatCurrency(overdueAmount)}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums text-slate-800">
                                        {formatCurrency(toNumber(row.current))}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums text-amber-700">
                                        {formatCurrency(toNumber(row.days30))}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums text-orange-700">
                                        {formatCurrency(toNumber(row.days60))}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums text-orange-800">
                                        {formatCurrency(toNumber(row.days90))}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums text-red-700">
                                        {formatCurrency(toNumber(row.over90))}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums font-semibold text-slate-900">
                                        {formatCurrency(toNumber(row.totalOutstanding))}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                    <tfoot className="bg-slate-100">
                        <tr>
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-slate-900">
                                TOTALS
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-bold tabular-nums">
                                {formatCurrency(totals.current)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-bold tabular-nums text-amber-700">
                                {formatCurrency(totals.days30)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-bold tabular-nums text-orange-700">
                                {formatCurrency(totals.days60)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-bold tabular-nums text-orange-800">
                                {formatCurrency(totals.days90)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-bold tabular-nums text-red-700">
                                {formatCurrency(totals.over90)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-bold tabular-nums text-slate-900">
                                {formatCurrency(totals.totalOutstanding)}
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            {agingData.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                    No open receivables
                </div>
            )}
        </div>
    );
};

export default CustomerAgingReport;