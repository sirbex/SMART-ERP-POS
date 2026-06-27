import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    CheckCircle,
    ChevronDown,
    ChevronRight,
    History,
    RefreshCw,
    ShieldCheck,
    Database,
} from 'lucide-react';
import { formatCurrency } from '../../utils/currency';
import { ResponsiveTableWrapper } from '../ui/ResponsiveTableWrapper';
import { apiClient, type ApiResponse } from '../../utils/api';

interface ApSupplierLaneRow {
    supplierId: string;
    supplierName: string;
    leftAmount: number;
    rightAmount: number;
    difference: number;
}

interface ApIntegrityLane {
    lane: 'integrity';
    asOfDate: string;
    glNetActive: number;
    openItemSubledger: number;
    integrityDifference: number;
    status: 'RECONCILED' | 'DISCREPANCY';
    exceptions: ApSupplierLaneRow[];
}

interface ApCacheLane {
    lane: 'cache';
    openItemBalance: number;
    supplierCacheBalance: number;
    cacheDifference: number;
    status: 'HEALTHY' | 'DRIFT';
    exceptions: ApSupplierLaneRow[];
}

interface ApJournalAuditEntry {
    transactionNumber: string;
    referenceType: string;
    referenceNumber: string | null;
    transactionDate: string;
    isReversed: boolean;
    isReversingEntry: boolean;
    apImpact: number;
    supplierName: string | null;
}

interface ApJournalAuditLane {
    lane: 'journal_audit';
    grossPosted: number;
    netActive: number;
    reversalImpact: number;
    supplierExceptions: ApSupplierLaneRow[];
    journals: ApJournalAuditEntry[];
}

type ExpandedLane = 'integrity' | 'cache' | 'history' | null;

async function fetchLane<T>(path: string, asOfDate: string): Promise<T> {
    const res = await apiClient.get<ApiResponse<T>>(path, {
        params: { asOfDate },
    });
    return res.data.data as T;
}

interface Props {
    asOfDate: string;
    onPeriodCloseStatus?: (reconciled: boolean) => void;
}

export function ApReconciliationLanesPanel({ asOfDate, onPeriodCloseStatus }: Props) {
    const queryClient = useQueryClient();
    const [expandedLane, setExpandedLane] = useState<ExpandedLane>(null);

    const integrityQuery = useQuery({
        queryKey: ['ap-lane-integrity', asOfDate],
        queryFn: () => fetchLane<ApIntegrityLane>('/erp-accounting/reconciliation/ap/integrity', asOfDate),
        staleTime: 30_000,
    });

    const cacheQuery = useQuery({
        queryKey: ['ap-lane-cache', asOfDate],
        queryFn: () => fetchLane<ApCacheLane>('/erp-accounting/reconciliation/ap/cache', asOfDate),
        staleTime: 30_000,
    });

    const historyQuery = useQuery({
        queryKey: ['ap-lane-history', asOfDate],
        queryFn: () => fetchLane<ApJournalAuditLane>('/erp-accounting/reconciliation/ap/history', asOfDate),
        staleTime: 30_000,
    });

    const integrity = integrityQuery.data;
    const cache = cacheQuery.data;
    const history = historyQuery.data;

    useEffect(() => {
        if (integrity && onPeriodCloseStatus) {
            onPeriodCloseStatus(integrity.status === 'RECONCILED');
        }
    }, [integrity, onPeriodCloseStatus]);

    const refreshCacheMutation = useMutation({
        mutationFn: async () => {
            await apiClient.post('/system/gl/recalc-supplier-balances');
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['ap-lane-cache', asOfDate] });
            await queryClient.invalidateQueries({ queryKey: ['reconciliation-summary', asOfDate] });
        },
    });

    const isLoading = integrityQuery.isLoading || cacheQuery.isLoading || historyQuery.isLoading;

    const toggleLane = (lane: ExpandedLane) => {
        setExpandedLane((prev) => (prev === lane ? null : lane));
    };

    if (isLoading) {
        return (
            <div className="flex justify-center py-8">
                <RefreshCw className="h-6 w-6 text-gray-400 animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-4 mb-6">
            <div className="px-1">
                <h2 className="text-lg font-semibold text-gray-900">Accounts Payable Reconciliation</h2>
                <p className="text-sm text-gray-500 mt-1">
                    Three independent checks — only <strong>Accounting Integrity</strong> gates period close.
                </p>
            </div>

            {/* Lane 1 — Integrity */}
            {integrity && (
                <LaneCard
                    icon={<ShieldCheck className="h-5 w-5" />}
                    title="Accounts Payable Integrity"
                    subtitle="Period close — net-active GL vs open-item subledger"
                    statusLabel={integrity.status === 'RECONCILED' ? 'Reconciled' : 'Investigate'}
                    statusTone={integrity.status === 'RECONCILED' ? 'success' : 'danger'}
                    metrics={[
                        { label: 'GL (Net Active)', value: integrity.glNetActive },
                        { label: 'Open-item Subledger', value: integrity.openItemSubledger },
                        {
                            label: 'Integrity Difference',
                            value: integrity.integrityDifference,
                            emphasize: true,
                            tone: integrity.status === 'RECONCILED' ? 'success' : 'danger',
                        },
                    ]}
                    expanded={expandedLane === 'integrity'}
                    onToggleExpand={() => toggleLane('integrity')}
                    expandLabel="View Exceptions"
                    exceptions={integrity.exceptions}
                    exceptionHeaders={['Supplier', 'GL (Net Active)', 'Open-item Subledger', 'Integrity Difference']}
                    mapException={(row) => [
                        row.supplierName,
                        row.leftAmount,
                        row.rightAmount,
                        row.difference,
                    ]}
                />
            )}

            {/* Lane 2 — Cache */}
            {cache && (
                <LaneCard
                    icon={<Database className="h-5 w-5" />}
                    title="Supplier Cache Health"
                    subtitle="Maintenance — open-item balance vs supplier cache (does not affect period close)"
                    statusLabel={cache.status === 'HEALTHY' ? 'Healthy' : 'Cache drift'}
                    statusTone={cache.status === 'HEALTHY' ? 'neutral' : 'warning'}
                    metrics={[
                        { label: 'Open-item Balance', value: cache.openItemBalance },
                        { label: 'Supplier Cache', value: cache.supplierCacheBalance },
                        {
                            label: 'Cache Difference',
                            value: cache.cacheDifference,
                            emphasize: true,
                            tone: cache.status === 'HEALTHY' ? 'success' : 'warning',
                        },
                    ]}
                    expanded={expandedLane === 'cache'}
                    onToggleExpand={() => toggleLane('cache')}
                    expandLabel="View Exceptions"
                    exceptions={cache.exceptions}
                    exceptionHeaders={['Supplier', 'Open-item Balance', 'Supplier Cache', 'Cache Difference']}
                    mapException={(row) => [
                        row.supplierName,
                        row.leftAmount,
                        row.rightAmount,
                        row.difference,
                    ]}
                    action={
                        <button
                            type="button"
                            onClick={() => refreshCacheMutation.mutate()}
                            disabled={refreshCacheMutation.isPending}
                            className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded font-medium flex items-center gap-1"
                        >
                            <RefreshCw className={`h-3.5 w-3.5 ${refreshCacheMutation.isPending ? 'animate-spin' : ''}`} />
                            Refresh Cache
                        </button>
                    }
                />
            )}

            {/* Lane 3 — Journal audit */}
            {history && (
                <LaneCard
                    icon={<History className="h-5 w-5" />}
                    title="Posted Journal Audit"
                    subtitle="Informational — gross posted vs net-active (reversals and history)"
                    statusLabel="Informational"
                    statusTone="neutral"
                    metrics={[
                        { label: 'Gross Posted', value: history.grossPosted },
                        { label: 'Net Active', value: history.netActive },
                        {
                            label: 'Reversal Impact',
                            value: history.reversalImpact,
                            emphasize: true,
                            tone: 'neutral',
                        },
                    ]}
                    expanded={expandedLane === 'history'}
                    onToggleExpand={() => toggleLane('history')}
                    expandLabel="View Journals"
                    exceptions={history.supplierExceptions}
                    exceptionHeaders={['Supplier', 'Gross Posted', 'Net Active', 'Reversal Impact']}
                    mapException={(row) => [
                        row.supplierName,
                        row.leftAmount,
                        row.rightAmount,
                        row.difference,
                    ]}
                    journalTable={history.journals}
                />
            )}
        </div>
    );
}

interface MetricDef {
    label: string;
    value: number;
    emphasize?: boolean;
    tone?: 'success' | 'danger' | 'warning' | 'neutral';
}

interface LaneCardProps {
    icon: React.ReactNode;
    title: string;
    subtitle: string;
    statusLabel: string;
    statusTone: 'success' | 'danger' | 'warning' | 'neutral';
    metrics: MetricDef[];
    expanded: boolean;
    onToggleExpand: () => void;
    expandLabel: string;
    exceptions: ApSupplierLaneRow[];
    exceptionHeaders: string[];
    mapException: (row: ApSupplierLaneRow) => [string, number, number, number];
    action?: React.ReactNode;
    journalTable?: ApJournalAuditEntry[];
}

function LaneCard({
    icon,
    title,
    subtitle,
    statusLabel,
    statusTone,
    metrics,
    expanded,
    onToggleExpand,
    expandLabel,
    exceptions,
    exceptionHeaders,
    mapException,
    action,
    journalTable,
}: LaneCardProps) {
    const statusClasses = {
        success: 'bg-green-100 text-green-800',
        danger: 'bg-red-100 text-red-800',
        warning: 'bg-amber-100 text-amber-800',
        neutral: 'bg-gray-100 text-gray-700',
    }[statusTone];

    const toneClass = (tone?: MetricDef['tone']) => {
        if (tone === 'success') return 'text-green-600';
        if (tone === 'danger') return 'text-red-600';
        if (tone === 'warning') return 'text-amber-600';
        return 'text-gray-900';
    };

    const hasExpandContent =
        (exceptions.length > 0) || (journalTable && journalTable.length > 0);

    return (
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
            <div className="px-4 sm:px-6 py-4">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="flex items-start gap-3">
                        <div className="mt-0.5 text-gray-500">{icon}</div>
                        <div>
                            <p className="font-semibold text-gray-900">{title}</p>
                            <p className="text-sm text-gray-500">{subtitle}</p>
                        </div>
                    </div>
                    <span className={`self-start px-2.5 py-1 rounded-full text-xs font-medium ${statusClasses}`}>
                        {statusLabel}
                    </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                    {metrics.map((m) => (
                        <div key={m.label} className="min-w-0">
                            <p className="text-xs text-gray-500">{m.label}</p>
                            <p className={`text-base font-semibold truncate ${m.emphasize ? toneClass(m.tone) : 'text-gray-900'}`}>
                                {formatCurrency(m.value)}
                            </p>
                        </div>
                    ))}
                </div>

                <div className="flex flex-wrap items-center gap-2 mt-4">
                    {hasExpandContent && (
                        <button
                            type="button"
                            onClick={onToggleExpand}
                            className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                        >
                            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            {expandLabel}
                            {exceptions.length > 0 && (
                                <span className="text-gray-500">({exceptions.length})</span>
                            )}
                        </button>
                    )}
                    {action}
                </div>
            </div>

            {expanded && exceptions.length > 0 && (
                <div className="px-4 sm:px-6 py-4 bg-gray-50 border-t">
                    <ResponsiveTableWrapper>
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-gray-500">
                                    {exceptionHeaders.map((h) => (
                                        <th key={h} className={`py-2 ${h === exceptionHeaders[0] ? 'text-left' : 'text-right'}`}>
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {exceptions.map((row) => {
                                    const [name, a, b, diff] = mapException(row);
                                    return (
                                        <tr key={row.supplierId}>
                                            <td className="py-2">{name}</td>
                                            <td className="py-2 text-right">{formatCurrency(a)}</td>
                                            <td className="py-2 text-right">{formatCurrency(b)}</td>
                                            <td className="py-2 text-right">{formatCurrency(diff)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </ResponsiveTableWrapper>
                </div>
            )}

            {expanded && journalTable && journalTable.length > 0 && (
                <div className="px-4 sm:px-6 py-4 bg-gray-50 border-t">
                    <p className="text-sm font-medium text-gray-700 mb-2">Reversal and historical journal legs</p>
                    <ResponsiveTableWrapper>
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-gray-500">
                                    <th className="text-left py-2">Transaction</th>
                                    <th className="text-left py-2">Type</th>
                                    <th className="text-left py-2">Supplier</th>
                                    <th className="text-left py-2">Date</th>
                                    <th className="text-right py-2">AP Impact</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {journalTable.map((j) => (
                                    <tr key={j.transactionNumber}>
                                        <td className="py-2 font-mono text-xs">{j.transactionNumber}</td>
                                        <td className="py-2">
                                            {j.referenceType}
                                            {j.isReversed && <span className="ml-1 text-amber-600">(reversed)</span>}
                                            {j.isReversingEntry && <span className="ml-1 text-amber-600">(reversal)</span>}
                                        </td>
                                        <td className="py-2">{j.supplierName ?? '—'}</td>
                                        <td className="py-2">{j.transactionDate}</td>
                                        <td className="py-2 text-right">{formatCurrency(j.apImpact)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </ResponsiveTableWrapper>
                </div>
            )}

            {expanded && exceptions.length === 0 && (!journalTable || journalTable.length === 0) && (
                <div className="px-6 py-4 bg-gray-50 border-t text-sm text-gray-500 flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    No exceptions for this lane.
                </div>
            )}
        </div>
    );
}
