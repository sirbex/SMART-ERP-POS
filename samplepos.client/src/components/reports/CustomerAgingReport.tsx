import React, { useState, useEffect } from 'react';
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
            current: acc.current + toNumber(row.current),
            days30: acc.days30 + toNumber(row.days30),
            days60: acc.days60 + toNumber(row.days60),
            days90: acc.days90 + toNumber(row.days90),
            over90: acc.over90 + toNumber(row.over90),
            totalOutstanding: acc.totalOutstanding + toNumber(row.totalOutstanding),
            overdueAmount: acc.overdueAmount + toNumber(row.overdueAmount),
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
        a.download = `customer-aging-report-${new Date().toISOString().split('T')[0]}.csv`;
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
                            Outstanding customer balances by aging periods
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={loadAgingReport}
                            className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                        >
                            🔄 Refresh
                        </button>
                        <button
                            onClick={exportToCsv}
                            className="px-3 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                        >
                            📊 Export CSV
                        </button>
                    </div>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center">
                        <div className="text-2xl font-bold text-green-600">
                            {formatCurrency(totals.current)}
                        </div>
                        <div className="text-sm text-gray-600">Current</div>
                    </div>
                    <div className="text-center">
                        <div className="text-2xl font-bold text-yellow-600">
                            {formatCurrency(totals.days30)}
                        </div>
                        <div className="text-sm text-gray-600">1-30 Days</div>
                    </div>
                    <div className="text-center">
                        <div className="text-2xl font-bold text-orange-600">
                            {formatCurrency(totals.days60)}
                        </div>
                        <div className="text-sm text-gray-600">31-60 Days</div>
                    </div>
                    <div className="text-center">
                        <div className="text-2xl font-bold text-red-600">
                            {formatCurrency(totals.over90)}
                        </div>
                        <div className="text-sm text-gray-600">90+ Days</div>
                    </div>
                </div>
            </div>

            {/* Data Table */}
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Customer
                            </th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Current
                            </th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                1-30 Days
                            </th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                31-60 Days
                            </th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                61-90 Days
                            </th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                90+ Days
                            </th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Total Outstanding
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {agingData.map((row, index) => {
                            const overdueAmount = toNumber(row.overdueAmount);
                            const isOverdue = overdueAmount > 0;

                            return (
                                <tr key={row.customerId} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center">
                                            <div>
                                                <div className="text-sm font-medium text-gray-900">
                                                    {row.customerName}
                                                </div>
                                                {isOverdue && (
                                                    <div className="text-xs text-red-600">
                                                        Overdue: {formatCurrency(overdueAmount)}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-green-600">
                                        {formatCurrency(toNumber(row.current))}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-yellow-600">
                                        {formatCurrency(toNumber(row.days30))}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-orange-600">
                                        {formatCurrency(toNumber(row.days60))}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-orange-600">
                                        {formatCurrency(toNumber(row.days90))}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-red-600">
                                        {formatCurrency(toNumber(row.over90))}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900">
                                        {formatCurrency(toNumber(row.totalOutstanding))}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                    {/* Totals Footer */}
                    <tfoot className="bg-gray-100">
                        <tr>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                                TOTALS
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-bold text-green-600">
                                {formatCurrency(totals.current)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-bold text-yellow-600">
                                {formatCurrency(totals.days30)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-bold text-orange-600">
                                {formatCurrency(totals.days60)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-bold text-orange-600">
                                {formatCurrency(totals.days90)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-bold text-red-600">
                                {formatCurrency(totals.over90)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-bold text-gray-900">
                                {formatCurrency(totals.totalOutstanding)}
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            {agingData.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                    No aging data available
                </div>
            )}
        </div>
    );
};

export default CustomerAgingReport;