import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, Lock, Unlock, RefreshCw, CheckCircle, AlertTriangle, History, X, Plus } from 'lucide-react';

// Auth helper for fetch calls
const authHeaders = (): HeadersInit => {
    const token = localStorage.getItem('auth_token');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
};

// API functions
const fetchPeriods = async (year?: number) => {
    const url = year ? `/api/erp-accounting/periods?year=${year}` : '/api/erp-accounting/periods';
    const response = await fetch(url, { headers: authHeaders() });
    if (!response.ok) throw new Error('Failed to fetch periods');
    return response.json();
};

const closePeriod = async ({ year, month, notes }: { year: number; month: number; notes?: string }) => {
    const response = await fetch('/api/erp-accounting/periods/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ year, month, notes })
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to close period');
    }
    return response.json();
};

const reopenPeriod = async ({ year, month, reason }: { year: number; month: number; reason: string }) => {
    const response = await fetch('/api/erp-accounting/periods/reopen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ year, month, reason })
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to reopen period');
    }
    return response.json();
};

const lockPeriod = async ({ year, month }: { year: number; month: number }) => {
    const response = await fetch('/api/erp-accounting/periods/lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ year, month })
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to lock period');
    }
    return response.json();
};

const fetchPeriodHistory = async (year: number, month: number) => {
    const response = await fetch(`/api/erp-accounting/periods/${year}/${month}/history`, { headers: authHeaders() });
    if (!response.ok) throw new Error('Failed to fetch period history');
    return response.json();
};

const createSpecialPeriod = async ({ year, data }: { year: number; data: { name: string; startDate: string; endDate: string } }) => {
    const response = await fetch(`/api/erp-accounting/period-control/${year}/special`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(data)
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create special period');
    }
    return response.json();
};

interface Period {
    id: string;
    year: number;
    month: number;
    status: 'OPEN' | 'CLOSED' | 'LOCKED';
    periodLabel: string;
    transactionCount: number;
    totalDebits: number;
    totalCredits: number;
    closedAt?: string;
    closedBy?: string;
    lockedAt?: string;
    lockedBy?: string;
}

interface PeriodHistoryEntry {
    action: 'OPENED' | 'CLOSED' | 'REOPENED' | 'LOCKED';
    changedAt: string;
    changedBy?: string;
    notes?: string;
}

const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

export default function PeriodManagementPage() {
    const queryClient = useQueryClient();
    const currentYear = new Date().getFullYear();
    const [selectedYear, setSelectedYear] = useState(currentYear);
    const [showCloseModal, setShowCloseModal] = useState<{ year: number; month: number } | null>(null);
    const [showReopenModal, setShowReopenModal] = useState<{ year: number; month: number } | null>(null);
    const [showLockModal, setShowLockModal] = useState<{ year: number; month: number } | null>(null);
    const [showHistoryModal, setShowHistoryModal] = useState<{ year: number; month: number } | null>(null);
    const [closeNotes, setCloseNotes] = useState('');
    const [reopenReason, setReopenReason] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [showSpecialForm, setShowSpecialForm] = useState(false);
    const [specialForm, setSpecialForm] = useState({ name: '', startDate: '', endDate: '' });

    // Queries
    const { data: periodsData, isLoading, refetch } = useQuery({
        queryKey: ['accounting-periods', selectedYear],
        queryFn: () => fetchPeriods(selectedYear)
    });

    const { data: historyData, isLoading: historyLoading } = useQuery({
        queryKey: ['period-history', showHistoryModal?.year, showHistoryModal?.month],
        queryFn: () => showHistoryModal ? fetchPeriodHistory(showHistoryModal.year, showHistoryModal.month) : null,
        enabled: !!showHistoryModal
    });

    // Mutations
    const closeMutation = useMutation({
        mutationFn: closePeriod,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['accounting-periods'] });
            setShowCloseModal(null);
            setCloseNotes('');
            setError(null);
        },
        onError: (err: Error) => {
            setError(err.message);
        }
    });

    const reopenMutation = useMutation({
        mutationFn: reopenPeriod,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['accounting-periods'] });
            setShowReopenModal(null);
            setReopenReason('');
            setError(null);
        },
        onError: (err: Error) => {
            setError(err.message);
        }
    });

    const lockMutation = useMutation({
        mutationFn: lockPeriod,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['accounting-periods'] });
            setShowLockModal(null);
            setError(null);
        },
        onError: (err: Error) => {
            setError(err.message);
        }
    });

    const specialMutation = useMutation({
        mutationFn: createSpecialPeriod,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['accounting-periods'] });
            setShowSpecialForm(false);
            setSpecialForm({ name: '', startDate: '', endDate: '' });
            setError(null);
        },
        onError: (err: Error) => {
            setError(err.message);
        }
    });

    const periods: Period[] = periodsData?.data?.periods || [];
    const history = historyData?.data?.history || [];

    // Create full year grid (all 12 months)
    const yearGrid = months.map((monthName, idx) => {
        const monthNum = idx + 1;
        const period = periods.find(p => p.month === monthNum);
        return {
            month: monthNum,
            monthName,
            period
        };
    });

    const getStatusColor = (status?: string) => {
        switch (status) {
            case 'OPEN': return 'bg-green-100 text-green-800 border-green-200';
            case 'CLOSED': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
            case 'LOCKED': return 'bg-gray-100 text-gray-800 border-gray-200';
            default: return 'bg-blue-100 text-blue-800 border-blue-200';
        }
    };

    const getStatusIcon = (status?: string) => {
        switch (status) {
            case 'OPEN': return <CheckCircle className="h-4 w-4" />;
            case 'CLOSED': return <Lock className="h-4 w-4" />;
            case 'LOCKED': return <Lock className="h-4 w-4" />;
            default: return <Calendar className="h-4 w-4" />;
        }
    };

    return (
        <div className="p-4 lg:p-6">
            {/* Year Selector */}
            <div className="bg-white rounded-lg shadow-sm border p-4 mb-6">
                <div className="flex items-center space-x-4">
                    <div>
                        <label htmlFor="periodYear" className="block text-sm font-medium text-gray-700 mb-1">Year</label>
                        <select
                            id="periodYear"
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                            className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                            title="Select year"
                        >
                            {[...Array(5)].map((_, i) => {
                                const year = currentYear - 2 + i;
                                return <option key={year} value={year}>{year}</option>;
                            })}
                        </select>
                    </div>
                    <button
                        onClick={() => refetch()}
                        disabled={isLoading}
                        className="mt-6 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center space-x-2"
                    >
                        <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                        <span>Refresh</span>
                    </button>
                    <button
                        onClick={() => setShowSpecialForm(!showSpecialForm)}
                        className="mt-6 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2"
                    >
                        <Plus className="h-4 w-4" />
                        <span>Special Period</span>
                    </button>
                </div>
            </div>

            {/* Special Period Creation Form */}
            {showSpecialForm && (
                <div className="bg-white rounded-lg shadow-sm border p-4 mb-6">
                    <h3 className="font-semibold text-gray-900 mb-3">Create Special Period</h3>
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            specialMutation.mutate({
                                year: selectedYear,
                                data: { name: specialForm.name, startDate: specialForm.startDate, endDate: specialForm.endDate }
                            });
                        }}
                        className="grid grid-cols-1 md:grid-cols-3 gap-4"
                    >
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                            <input
                                type="text"
                                value={specialForm.name}
                                onChange={(e) => setSpecialForm({ ...specialForm, name: e.target.value })}
                                required
                                className="w-full px-3 py-2 border rounded-lg text-sm"
                                placeholder="e.g., Year-End Closing"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                            <input
                                type="date"
                                value={specialForm.startDate}
                                onChange={(e) => setSpecialForm({ ...specialForm, startDate: e.target.value })}
                                required
                                className="w-full px-3 py-2 border rounded-lg text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                            <input
                                type="date"
                                value={specialForm.endDate}
                                onChange={(e) => setSpecialForm({ ...specialForm, endDate: e.target.value })}
                                required
                                className="w-full px-3 py-2 border rounded-lg text-sm"
                            />
                        </div>
                        <div className="md:col-span-3 flex justify-end gap-2">
                            <button type="button" onClick={() => setShowSpecialForm(false)} className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">Cancel</button>
                            <button type="submit" disabled={specialMutation.isPending} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
                                {specialMutation.isPending ? 'Creating...' : 'Create'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Period Grid */}
            {isLoading ? (
                <div className="flex justify-center py-12">
                    <RefreshCw className="h-8 w-8 text-gray-400 animate-spin" />
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {yearGrid.map(({ month, monthName, period }) => (
                        <div
                            key={month}
                            className="bg-white rounded-lg shadow-sm border p-4"
                        >
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="font-semibold text-gray-900">{monthName}</h3>
                                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(period?.status)}`}>
                                    {getStatusIcon(period?.status)}
                                    <span className="ml-1">{period?.status || 'Not Started'}</span>
                                </span>
                            </div>

                            {period ? (
                                <>
                                    <div className="text-sm text-gray-500 mb-3">
                                        <p>{period.transactionCount} transactions</p>
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                        {period.status === 'OPEN' && (
                                            <button
                                                onClick={() => {
                                                    setShowCloseModal({ year: selectedYear, month });
                                                    setError(null);
                                                }}
                                                className="px-3 py-1 text-xs bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 flex items-center space-x-1"
                                            >
                                                <Lock className="h-3 w-3" />
                                                <span>Close</span>
                                            </button>
                                        )}
                                        {period.status === 'CLOSED' && (
                                            <>
                                                <button
                                                    onClick={() => {
                                                        setShowReopenModal({ year: selectedYear, month });
                                                        setError(null);
                                                    }}
                                                    className="px-3 py-1 text-xs bg-green-100 text-green-700 rounded-lg hover:bg-green-200 flex items-center space-x-1"
                                                >
                                                    <Unlock className="h-3 w-3" />
                                                    <span>Reopen</span>
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setShowLockModal({ year: selectedYear, month });
                                                        setError(null);
                                                    }}
                                                    className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center space-x-1"
                                                >
                                                    <Lock className="h-3 w-3" />
                                                    <span>Lock</span>
                                                </button>
                                            </>
                                        )}
                                        <button
                                            onClick={() => setShowHistoryModal({ year: selectedYear, month })}
                                            className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 flex items-center space-x-1"
                                        >
                                            <History className="h-3 w-3" />
                                            <span>History</span>
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <p className="text-sm text-gray-400">No transactions yet</p>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Legend */}
            <div className="mt-6 bg-white rounded-lg shadow-sm border p-4">
                <h3 className="font-medium mb-3">Period Status Legend</h3>
                <div className="flex flex-wrap gap-4 text-sm">
                    <div className="flex items-center space-x-2">
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            OPEN
                        </span>
                        <span className="text-gray-500">Accepts new transactions</span>
                    </div>
                    <div className="flex items-center space-x-2">
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-200">
                            <Lock className="h-3 w-3 mr-1" />
                            CLOSED
                        </span>
                        <span className="text-gray-500">No new transactions, can be reopened</span>
                    </div>
                    <div className="flex items-center space-x-2">
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 border border-gray-200">
                            <Lock className="h-3 w-3 mr-1" />
                            LOCKED
                        </span>
                        <span className="text-gray-500">Permanently locked, cannot be reopened</span>
                    </div>
                </div>
            </div>

            {/* Close Period Modal */}
            {showCloseModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowCloseModal(null)}>
                    <div className="bg-white rounded-lg shadow-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
                        <div className="px-6 py-4 border-b flex items-center justify-between">
                            <h2 className="text-xl font-semibold">Close Period</h2>
                            <button
                                onClick={() => setShowCloseModal(null)}
                                className="text-gray-400 hover:text-gray-600"
                                title="Close"
                                aria-label="Close modal"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="p-6">
                            {error && (
                                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2 text-red-700">
                                    <AlertTriangle className="h-4 w-4" />
                                    <span>{error}</span>
                                </div>
                            )}
                            <p className="text-gray-600 mb-4">
                                You are about to close <strong>{months[showCloseModal.month - 1]} {showCloseModal.year}</strong>.
                                No new transactions will be allowed for this period after closing.
                            </p>
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                                <textarea
                                    value={closeNotes}
                                    onChange={(e) => setCloseNotes(e.target.value)}
                                    placeholder="Any notes about closing this period..."
                                    rows={3}
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <div className="flex justify-end space-x-3">
                                <button
                                    onClick={() => setShowCloseModal(null)}
                                    className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => closeMutation.mutate({
                                        year: showCloseModal.year,
                                        month: showCloseModal.month,
                                        notes: closeNotes || undefined
                                    })}
                                    disabled={closeMutation.isPending}
                                    className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50 flex items-center space-x-2"
                                >
                                    {closeMutation.isPending ? (
                                        <RefreshCw className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Lock className="h-4 w-4" />
                                    )}
                                    <span>Close Period</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Reopen Period Modal */}
            {showReopenModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowReopenModal(null)}>
                    <div className="bg-white rounded-lg shadow-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
                        <div className="px-6 py-4 border-b flex items-center justify-between">
                            <h2 className="text-xl font-semibold">Reopen Period</h2>
                            <button
                                onClick={() => setShowReopenModal(null)}
                                className="text-gray-400 hover:text-gray-600"
                                title="Close"
                                aria-label="Close modal"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="p-6">
                            {error && (
                                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2 text-red-700">
                                    <AlertTriangle className="h-4 w-4" />
                                    <span>{error}</span>
                                </div>
                            )}
                            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                <p className="text-yellow-800 text-sm">
                                    <strong>Warning:</strong> Reopening a period is an exceptional action.
                                    A documented reason is required for audit purposes.
                                </p>
                            </div>
                            <p className="text-gray-600 mb-4">
                                Reopen <strong>{months[showReopenModal.month - 1]} {showReopenModal.year}</strong>?
                            </p>
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Reason for reopening *</label>
                                <textarea
                                    value={reopenReason}
                                    onChange={(e) => setReopenReason(e.target.value)}
                                    placeholder="Explain why this period needs to be reopened (min 10 characters)"
                                    rows={3}
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <div className="flex justify-end space-x-3">
                                <button
                                    onClick={() => {
                                        setShowReopenModal(null);
                                        setReopenReason('');
                                    }}
                                    className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => reopenMutation.mutate({
                                        year: showReopenModal.year,
                                        month: showReopenModal.month,
                                        reason: reopenReason
                                    })}
                                    disabled={reopenMutation.isPending || reopenReason.length < 10}
                                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center space-x-2"
                                >
                                    {reopenMutation.isPending ? (
                                        <RefreshCw className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Unlock className="h-4 w-4" />
                                    )}
                                    <span>Reopen Period</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Lock Period Modal */}
            {showLockModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowLockModal(null)}>
                    <div className="bg-white rounded-lg shadow-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
                        <div className="px-6 py-4 border-b flex items-center justify-between">
                            <h2 className="text-xl font-semibold">Lock Period Permanently</h2>
                            <button
                                onClick={() => setShowLockModal(null)}
                                className="text-gray-400 hover:text-gray-600"
                                title="Close"
                                aria-label="Close modal"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="p-6">
                            {error && (
                                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2 text-red-700">
                                    <AlertTriangle className="h-4 w-4" />
                                    <span>{error}</span>
                                </div>
                            )}
                            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                                <p className="text-red-800 text-sm">
                                    <strong>Warning:</strong> This action is PERMANENT and cannot be undone.
                                    Once locked, this period can NEVER be reopened.
                                </p>
                            </div>
                            <p className="text-gray-600 mb-4">
                                Permanently lock <strong>{months[showLockModal.month - 1]} {showLockModal.year}</strong>?
                            </p>
                            <div className="flex justify-end space-x-3">
                                <button
                                    onClick={() => setShowLockModal(null)}
                                    className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => lockMutation.mutate({
                                        year: showLockModal.year,
                                        month: showLockModal.month
                                    })}
                                    disabled={lockMutation.isPending}
                                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center space-x-2"
                                >
                                    {lockMutation.isPending ? (
                                        <RefreshCw className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Lock className="h-4 w-4" />
                                    )}
                                    <span>Lock Permanently</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* History Modal */}
            {showHistoryModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowHistoryModal(null)}>
                    <div className="bg-white rounded-lg shadow-xl max-w-[95vw] sm:max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="px-6 py-4 border-b flex items-center justify-between">
                            <h2 className="text-xl font-semibold">
                                Period History: {months[showHistoryModal.month - 1]} {showHistoryModal.year}
                            </h2>
                            <button
                                onClick={() => setShowHistoryModal(null)}
                                className="text-gray-400 hover:text-gray-600"
                                title="Close"
                                aria-label="Close modal"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="p-6">
                            {historyLoading ? (
                                <div className="flex justify-center py-8">
                                    <RefreshCw className="h-8 w-8 text-gray-400 animate-spin" />
                                </div>
                            ) : history.length === 0 ? (
                                <p className="text-center text-gray-500 py-8">No history available</p>
                            ) : (
                                <div className="space-y-4">
                                    {history.map((entry: PeriodHistoryEntry, idx: number) => (
                                        <div key={idx} className="border-l-2 border-blue-300 pl-4 py-2">
                                            <div className="flex items-center space-x-2">
                                                <span className={`px-2 py-1 rounded text-xs font-medium ${entry.action === 'OPENED' ? 'bg-green-100 text-green-800' :
                                                    entry.action === 'CLOSED' ? 'bg-yellow-100 text-yellow-800' :
                                                        entry.action === 'REOPENED' ? 'bg-blue-100 text-blue-800' :
                                                            'bg-gray-100 text-gray-800'
                                                    }`}>
                                                    {entry.action}
                                                </span>
                                                <span className="text-sm text-gray-500">
                                                    {new Date(entry.changedAt).toLocaleString()}
                                                </span>
                                            </div>
                                            {entry.changedBy && (
                                                <p className="text-sm text-gray-600 mt-1">By: {entry.changedBy}</p>
                                            )}
                                            {entry.notes && (
                                                <p className="text-sm text-gray-600 mt-1">{entry.notes}</p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
