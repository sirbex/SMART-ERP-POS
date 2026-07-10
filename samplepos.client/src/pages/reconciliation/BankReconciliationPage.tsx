import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { AlertTriangle, RefreshCw, Search } from 'lucide-react';
import { apiClient, type ApiResponse } from '../../utils/api';
import { ReconciliationWorkspaceShell } from '../../components/reconciliation-workspace/ReconciliationWorkspaceShell';
import { ExceptionTraceDrawer } from '../../components/financial-workspace/ExceptionTraceDrawer';
import { ResponsiveTableWrapper } from '../../components/ui/ResponsiveTableWrapper';
import { formatCurrency } from '../../utils/currency';

interface ReconciliationItem {
    source: string;
    description: string;
    amount: number;
    difference: number;
    status: string;
}

interface CashReconciliationReport {
    accountName: string;
    accountCode: string;
    glBalance: number;
    subledgerBalance: number;
    difference: number;
    status: string;
    items: ReconciliationItem[];
    recommendations: string[];
}

async function fetchCashReconciliation(asOfDate: string): Promise<CashReconciliationReport> {
    const res = await apiClient.get<ApiResponse<CashReconciliationReport>>(
        '/erp-accounting/reconciliation/cash',
        { params: { asOfDate } },
    );
    return res.data.data as CashReconciliationReport;
}

export default function BankReconciliationPage() {
    const queryClient = useQueryClient();
    const [searchParams, setSearchParams] = useSearchParams();
    const asOfDate = searchParams.get('asOfDate') ?? format(new Date(), 'yyyy-MM-dd');
    const [search, setSearch] = useState('');
    const [traceOpen, setTraceOpen] = useState(false);

    const { data, isLoading, isFetching } = useQuery({
        queryKey: ['cash-reconciliation', asOfDate],
        queryFn: () => fetchCashReconciliation(asOfDate),
        staleTime: 30_000,
    });

    const handleAsOfDateChange = (date: string) => {
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set('asOfDate', date);
            return next;
        });
    };

    const discrepancyItems = useMemo(() => {
        if (!data?.items) return [];
        return data.items.filter(
            (item) =>
                item.source !== 'GL_BALANCE'
                && item.source !== 'STORED_BALANCE'
                && (item.status === 'DISCREPANCY' || item.status === 'ACTION_REQUIRED')
                && Math.abs(item.difference) > 0.01,
        );
    }, [data]);

    const filteredItems = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return discrepancyItems;
        return discrepancyItems.filter(
            (item) =>
                item.description.toLowerCase().includes(q)
                || item.source.toLowerCase().includes(q),
        );
    }, [discrepancyItems, search]);

    const reconciled = data ? Math.abs(data.difference) <= 0.01 && discrepancyItems.length === 0 : false;

    return (
        <ReconciliationWorkspaceShell
            title="Bank Reconciliation"
            subtitle="Reconcile Cash (1010) to stored balance and recorded activity."
            accountCode="1010"
            asOfDate={asOfDate}
            onAsOfDateChange={handleAsOfDateChange}
            headerExtra={
                <button
                    type="button"
                    onClick={() =>
                        void queryClient.invalidateQueries({ queryKey: ['cash-reconciliation', asOfDate] })
                    }
                    disabled={isLoading}
                    className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50"
                >
                    <RefreshCw className={`h-4 w-4 ${isLoading || isFetching ? 'animate-spin' : ''}`} />
                    Refresh
                </button>
            }
        >
            {isLoading && (
                <div className="flex justify-center py-16">
                    <RefreshCw className="h-8 w-8 text-slate-400 animate-spin" />
                </div>
            )}

            {!isLoading && data && (
                <>
                    <div
                        className={`mb-6 rounded-xl border p-4 ${
                            reconciled ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                        }`}
                    >
                        <p className={`font-semibold ${reconciled ? 'text-green-800' : 'text-red-800'}`}>
                            {reconciled
                                ? 'Cash account reconciled'
                                : 'Cash difference blocks period close'}
                        </p>
                        <p className="text-sm mt-1 text-slate-700">
                            GL balance: {formatCurrency(data.glBalance)} · Stored:{' '}
                            {formatCurrency(data.subledgerBalance)} · Difference:{' '}
                            {formatCurrency(data.difference)}
                        </p>
                    </div>

                    <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden mb-6">
                        <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <div>
                                <h2 className="text-lg font-semibold text-slate-900">Cash discrepancies</h2>
                                <p className="text-sm text-slate-500">
                                    {filteredItems.length} item{filteredItems.length === 1 ? '' : 's'} need review
                                </p>
                            </div>
                            <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <input
                                    type="search"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Search items…"
                                    className="pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg w-48"
                                />
                            </div>
                        </div>

                        {filteredItems.length === 0 ? (
                            <div className="p-8 text-center text-sm text-slate-500">
                                {discrepancyItems.length === 0
                                    ? 'No cash discrepancies — account is within tolerance.'
                                    : 'No items match your search.'}
                            </div>
                        ) : (
                            <ResponsiveTableWrapper>
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50 text-slate-600">
                                        <tr>
                                            <th className="text-left py-3 px-4 font-semibold">Source</th>
                                            <th className="text-left py-3 px-4 font-semibold">Description</th>
                                            <th className="text-right py-3 px-4 font-semibold">Amount</th>
                                            <th className="text-right py-3 px-4 font-semibold">Difference</th>
                                            <th className="text-right py-3 px-4 font-semibold">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {filteredItems.map((item) => (
                                            <tr key={`${item.source}-${item.description}`} className="hover:bg-slate-50/80">
                                                <td className="py-3 px-4 font-medium">{item.source}</td>
                                                <td className="py-3 px-4">{item.description}</td>
                                                <td className="py-3 px-4 text-right tabular-nums">
                                                    {formatCurrency(item.amount)}
                                                </td>
                                                <td className="py-3 px-4 text-right tabular-nums font-semibold text-red-700">
                                                    {formatCurrency(item.difference)}
                                                </td>
                                                <td className="py-3 px-4 text-right text-xs">{item.status}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </ResponsiveTableWrapper>
                        )}
                    </section>

                    {data.recommendations.length > 0 && (
                        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
                            <div className="flex items-start gap-2">
                                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-semibold text-amber-900">Recommended actions</p>
                                    <ul className="mt-2 space-y-1 text-sm text-amber-800 list-disc list-inside">
                                        {data.recommendations.map((rec) => (
                                            <li key={rec}>{rec}</li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="flex flex-wrap gap-3">
                        <Link
                            to="/accounting/banking"
                            className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                        >
                            Open banking workspace
                        </Link>
                        <button
                            type="button"
                            onClick={() => setTraceOpen(true)}
                            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                        >
                            View trace summary
                        </button>
                        <Link
                            to={`/accounting/general-ledger?account=1010`}
                            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                        >
                            View ledger (1010)
                        </Link>
                    </div>
                </>
            )}

            <ExceptionTraceDrawer
                exceptionId={traceOpen ? 'exc-cash-summary' : null}
                asOfDate={asOfDate}
                onClose={() => setTraceOpen(false)}
            />
        </ReconciliationWorkspaceShell>
    );
}
