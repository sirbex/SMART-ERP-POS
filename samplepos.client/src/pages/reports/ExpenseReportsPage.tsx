import React, { useState } from 'react';
import { FileText, Download } from 'lucide-react';
import Layout from '../../components/Layout';
import { DatePicker } from '../../components/ui/date-picker';
import { formatCurrency } from '../../utils/currency';
import { useAuth } from '../../contexts/AuthContext';

// TIMEZONE STRATEGY: Display dates without conversion
const formatDisplayDate = (dateString: string | null | undefined): string => {
    if (!dateString) return 'N/A';
    if (dateString.includes('T')) {
        return dateString.split('T')[0];
    }
    return dateString;
};

// Dynamic field formatting
const formatFieldValue = (key: string, value: any): string => {
    const lowerKey = key.toLowerCase();
    if (value === null || value === undefined) return '-';

    if (typeof value === 'number') {
        if (lowerKey.includes('amount') || lowerKey.includes('total') || lowerKey.includes('average') || lowerKey.includes('value')) {
            return formatCurrency(value);
        }
        if (lowerKey.includes('count') || lowerKey.includes('quantity')) {
            return value.toLocaleString();
        }
        return value.toLocaleString();
    }

    if (lowerKey.includes('date') || lowerKey.includes('period')) {
        return formatDisplayDate(String(value));
    }

    return String(value);
};

// Color coding for values
const getFieldColorClass = (key: string, _value: any): string => {
    const lowerKey = key.toLowerCase();
    if (lowerKey.includes('amount') || lowerKey.includes('total') || lowerKey.includes('revenue')) {
        return 'text-green-600 font-semibold';
    }
    if (lowerKey.includes('count')) {
        return 'text-blue-600 font-medium';
    }
    return 'text-gray-900';
};

interface DateRange {
    startDate: string | null;
    endDate: string | null;
}


type ExpenseReportType = 'SUMMARY' | 'BY_CATEGORY' | 'BY_VENDOR' | 'TRENDS' | 'BY_PAYMENT_METHOD';

interface ReportOption {
    value: ExpenseReportType;
    label: string;
    description: string;
    icon: string;
}

const EXPENSE_REPORT_OPTIONS: ReportOption[] = [
    {
        value: 'SUMMARY',
        label: 'Expense Summary',
        description: 'Overall expense statistics and totals',
        icon: '📊'
    },
    {
        value: 'BY_CATEGORY',
        label: 'By Category',
        description: 'Expense breakdown by category',
        icon: '📂'
    },
    {
        value: 'BY_VENDOR',
        label: 'By Vendor',
        description: 'Top vendors and spending analysis',
        icon: '🏢'
    },
    {
        value: 'TRENDS',
        label: 'Monthly Trends',
        description: 'Expense trends over time',
        icon: '📈'
    },
    {
        value: 'BY_PAYMENT_METHOD',
        label: 'By Payment Method',
        description: 'Payment method distribution',
        icon: '💳'
    }
];

const ExpenseReportsPage: React.FC = () => {
    const { isAuthenticated } = useAuth();
    const [selectedReport, setSelectedReport] = useState<ExpenseReportType>('SUMMARY');
    const [dateRange, setDateRange] = useState<DateRange>({
        startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0]
    });
    const [reportData, setReportData] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Show auth message if not logged in
    if (!isAuthenticated) {
        return (
            <Layout>
                <div className="max-w-7xl mx-auto p-6 space-y-6">
                    <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded">
                        <div className="flex">
                            <div className="flex-shrink-0">
                                <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                </svg>
                            </div>
                            <div className="ml-3">
                                <p className="text-sm text-yellow-700">
                                    You must be logged in to view expense reports. Please <a href="/login" className="font-medium underline">log in</a> to continue.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </Layout>
        );
    }

    // Generate report
    const generateReport = async () => {
        setLoading(true);
        setError(null);

        try {
            // Check authentication first
            if (!isAuthenticated) {
                throw new Error('Authentication required. Please log in.');
            }

            // Use the correct token key that AuthContext uses
            const token = localStorage.getItem('auth_token');

            if (!token) {
                throw new Error('Authentication token not found. Please log in again.');
            }

            const params = new URLSearchParams();
            if (dateRange.startDate) params.append('start_date', dateRange.startDate);
            if (dateRange.endDate) params.append('end_date', dateRange.endDate);

            const endpointMap: Record<ExpenseReportType, string> = {
                'SUMMARY': '/api/expenses/summary',
                'BY_CATEGORY': '/api/expenses/reports/by-category',
                'BY_VENDOR': '/api/expenses/reports/by-vendor',
                'TRENDS': '/api/expenses/reports/trends',
                'BY_PAYMENT_METHOD': '/api/expenses/reports/by-payment-method'
            };

            const url = `${endpointMap[selectedReport]}?${params.toString()}`;
            console.log('Fetching expense report:', url);

            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('API Error:', response.status, errorText);

                try {
                    const errorJson = JSON.parse(errorText);
                    throw new Error(errorJson.error || `Server error: ${response.status}`);
                } catch {
                    throw new Error(`Failed to generate report: ${response.status} ${response.statusText}`);
                }
            }

            const result = await response.json();
            console.log('Report data received:', result);

            if (result.success && result.data) {
                setReportData(result.data);
            } else {
                throw new Error(result.error || 'Invalid response format from server');
            }
        } catch (err) {
            console.error('Report generation error:', err);
            setError(err instanceof Error ? err.message : 'An error occurred');
            setReportData(null);
        } finally {
            setLoading(false);
        }
    };

    // Export to CSV
    const exportToCSV = async () => {
        try {
            const token = localStorage.getItem('auth_token');
            const params = new URLSearchParams();
            if (dateRange.startDate) params.append('start_date', dateRange.startDate);
            if (dateRange.endDate) params.append('end_date', dateRange.endDate);

            const response = await fetch(`/api/expenses/reports/export?${params.toString()}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Failed to export');

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `expense_report_${dateRange.startDate}_${dateRange.endDate}.csv`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (err) {
            alert('Failed to export report');
        }
    };

    // Export to PDF
    const exportToPDF = async () => {
        try {
            const token = localStorage.getItem('auth_token');
            const params = new URLSearchParams();
            params.append('format', 'pdf');
            if (dateRange.startDate) params.append('start_date', dateRange.startDate);
            if (dateRange.endDate) params.append('end_date', dateRange.endDate);

            const endpointMap: Record<ExpenseReportType, string> = {
                'SUMMARY': '/api/expenses/summary',
                'BY_CATEGORY': '/api/expenses/reports/by-category',
                'BY_VENDOR': '/api/expenses/reports/by-vendor',
                'TRENDS': '/api/expenses/reports/trends',
                'BY_PAYMENT_METHOD': '/api/expenses/reports/by-payment-method'
            };

            const url = `${endpointMap[selectedReport]}?${params.toString()}`;
            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Failed to generate PDF');

            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/pdf')) {
                throw new Error('Server did not return a PDF file');
            }

            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = `expense_report_${selectedReport}_${dateRange.startDate || 'all'}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(blobUrl);
            document.body.removeChild(a);
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Failed to generate PDF');
        }
    };

    // Render summary cards
    const renderSummary = (data: any) => {
        if (!data || typeof data !== 'object') return null;

        return (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
                {Object.entries(data).map(([key, value]) => (
                    <div key={key} className="bg-white border rounded-lg p-4 shadow-sm">
                        <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                            {key.replace(/_/g, ' ')}
                        </div>
                        <div className={`text-xl font-bold ${getFieldColorClass(key, value)}`}>
                            {formatFieldValue(key, value)}
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    // Render data table
    const renderTable = (data: any[]) => {
        if (!Array.isArray(data) || data.length === 0) {
            return <div className="text-center py-8 text-gray-500">No data available</div>;
        }

        const columns = Object.keys(data[0]);

        return (
            <div className="overflow-x-auto">
                <table className="min-w-full bg-white border">
                    <thead className="bg-gray-50">
                        <tr>
                            {columns.map((col) => (
                                <th key={col} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider border-b">
                                    {col.replace(/_/g, ' ')}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {data.map((row, idx) => (
                            <tr key={idx} className="hover:bg-gray-50">
                                {columns.map((col) => (
                                    <td key={col} className="px-4 py-3 text-sm whitespace-nowrap">
                                        <span className={getFieldColorClass(col, row[col])}>
                                            {formatFieldValue(col, row[col])}
                                        </span>
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    return (
        <Layout>
            <div className="p-6 max-w-7xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">💰 Expense Reports</h1>
                        <p className="text-gray-600 mt-1">Comprehensive expense analytics and insights</p>
                    </div>
                </div>

                {/* Report Type Selection */}
                <div className="bg-white rounded-lg border shadow-sm p-6">
                    <h2 className="text-lg font-semibold mb-4">Report Type</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                        {EXPENSE_REPORT_OPTIONS.map((option) => (
                            <button
                                key={option.value}
                                onClick={() => setSelectedReport(option.value)}
                                className={`p-4 rounded-lg border-2 text-left transition-all hover:shadow-md ${selectedReport === option.value
                                        ? 'border-blue-500 bg-blue-50'
                                        : 'border-gray-200 hover:border-blue-300'
                                    }`}
                            >
                                <div className="text-2xl mb-2">{option.icon}</div>
                                <div className="font-semibold text-sm">{option.label}</div>
                                <div className="text-xs text-gray-500 mt-1">{option.description}</div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Filters */}
                <div className="bg-white rounded-lg border shadow-sm p-6">
                    <h2 className="text-lg font-semibold mb-4">Filters</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
                            <DatePicker
                                value={dateRange.startDate || undefined}
                                onChange={(date) => setDateRange((prev) => ({ ...prev, startDate: date }))}
                                placeholder="Select start date"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
                            <DatePicker
                                value={dateRange.endDate || undefined}
                                onChange={(date) => setDateRange((prev) => ({ ...prev, endDate: date }))}
                                placeholder="Select end date"
                            />
                        </div>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap gap-3">
                    <button
                        onClick={generateReport}
                        disabled={loading}
                        className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                    >
                        <FileText className="h-4 w-4" />
                        {loading ? 'Generating...' : 'Generate Report'}
                    </button>

                    {reportData && (
                        <>
                            <button
                                onClick={exportToPDF}
                                className="px-6 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors flex items-center gap-2"
                            >
                                <FileText className="h-4 w-4" />
                                Export PDF
                            </button>
                            <button
                                onClick={exportToCSV}
                                className="px-6 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors flex items-center gap-2"
                            >
                                <Download className="h-4 w-4" />
                                Export CSV
                            </button>
                        </>
                    )}
                </div>

                {/* Error Message */}
                {error && (
                    <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
                        <div className="flex">
                            <div className="flex-shrink-0">
                                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                </svg>
                            </div>
                            <div className="ml-3">
                                <p className="text-sm text-red-700">{error}</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Report Results */}
                {reportData && !loading && (
                    <div className="bg-white rounded-lg border shadow-sm p-6">
                        <h2 className="text-xl font-bold mb-6">Report Results</h2>

                        {/* Summary Cards (if single object) */}
                        {!Array.isArray(reportData) && renderSummary(reportData)}

                        {/* Data Table (if array) */}
                        {Array.isArray(reportData) && renderTable(reportData)}
                    </div>
                )}
            </div>
        </Layout>
    );
};

export default ExpenseReportsPage;
