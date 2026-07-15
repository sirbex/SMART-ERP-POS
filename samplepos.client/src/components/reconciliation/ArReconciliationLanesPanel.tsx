import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Database, History, FileWarning, RefreshCw, ShieldCheck } from 'lucide-react';
import { apiClient, type ApiResponse } from '../../utils/api';
import type { FinancialLaneResult } from '../../types/financialLane';
import { isPeriodCloseClear } from '../../types/financialLane';
import { FinancialLaneCard } from './FinancialLaneCard';

type ExpandedLane = 'integrity' | 'cache' | 'history' | 'writeoff' | null;

async function fetchLane(path: string, asOfDate: string): Promise<FinancialLaneResult> {
    const res = await apiClient.get<ApiResponse<FinancialLaneResult>>(path, {
        params: { asOfDate },
    });
    return res.data.data as FinancialLaneResult;
}

interface Props {
    asOfDate: string;
    onPeriodCloseStatus?: (reconciled: boolean) => void;
}

export function ArReconciliationLanesPanel({ asOfDate, onPeriodCloseStatus }: Props) {
    const queryClient = useQueryClient();
    const [expandedLane, setExpandedLane] = useState<ExpandedLane>(null);

    const integrityQuery = useQuery({
        queryKey: ['ar-lane-integrity', asOfDate],
        queryFn: () => fetchLane('/erp-accounting/reconciliation/ar/integrity', asOfDate),
        staleTime: 30_000,
    });

    const cacheQuery = useQuery({
        queryKey: ['ar-lane-cache', asOfDate],
        queryFn: () => fetchLane('/erp-accounting/reconciliation/ar/cache', asOfDate),
        staleTime: 30_000,
    });

    const historyQuery = useQuery({
        queryKey: ['ar-lane-history', asOfDate],
        queryFn: () => fetchLane('/erp-accounting/reconciliation/ar/history', asOfDate),
        staleTime: 30_000,
    });

    const writeoffQuery = useQuery({
        queryKey: ['ar-lane-writeoff', asOfDate],
        queryFn: () => fetchLane('/erp-accounting/reconciliation/ar/writeoff', asOfDate),
        staleTime: 30_000,
    });

    const integrity = integrityQuery.data;
    const cache = cacheQuery.data;
    const history = historyQuery.data;
    const writeoff = writeoffQuery.data;

    useEffect(() => {
        if (integrity && onPeriodCloseStatus) {
            onPeriodCloseStatus(isPeriodCloseClear(integrity));
        }
    }, [integrity, onPeriodCloseStatus]);

    const refreshCacheMutation = useMutation({
        mutationFn: async () => {
            await apiClient.post('/system/gl/recalc-customer-balances');
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['ar-lane-cache', asOfDate] });
            await queryClient.invalidateQueries({ queryKey: ['ar-lane-writeoff', asOfDate] });
            await queryClient.invalidateQueries({ queryKey: ['reconciliation-summary', asOfDate] });
        },
    });

    const isLoading =
        integrityQuery.isLoading
        || cacheQuery.isLoading
        || historyQuery.isLoading
        || writeoffQuery.isLoading;

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
                <h2 className="text-lg font-semibold text-gray-900">Accounts Receivable Reconciliation</h2>
                <p className="text-sm text-gray-500 mt-1">
                    Independent checks — only lanes marked <strong>Period-close gate</strong> block close when
                    unreconciled. Maintenance, audit, and write-off exposure lanes are informational.
                </p>
            </div>

            {integrity && (
                <FinancialLaneCard
                    lane={integrity}
                    icon={<ShieldCheck className="h-5 w-5" />}
                    expanded={expandedLane === 'integrity'}
                    onToggleExpand={() => toggleLane('integrity')}
                    entityColumnLabel="Customer"
                />
            )}

            {cache && (
                <FinancialLaneCard
                    lane={cache}
                    icon={<Database className="h-5 w-5" />}
                    expanded={expandedLane === 'cache'}
                    onToggleExpand={() => toggleLane('cache')}
                    entityColumnLabel="Customer"
                    action={
                        <button
                            type="button"
                            onClick={() => refreshCacheMutation.mutate()}
                            disabled={refreshCacheMutation.isPending}
                            className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded font-medium flex items-center gap-1"
                        >
                            <RefreshCw
                                className={`h-3.5 w-3.5 ${refreshCacheMutation.isPending ? 'animate-spin' : ''}`}
                            />
                            Refresh Cache
                        </button>
                    }
                />
            )}

            {history && (
                <FinancialLaneCard
                    lane={history}
                    icon={<History className="h-5 w-5" />}
                    expanded={expandedLane === 'history'}
                    onToggleExpand={() => toggleLane('history')}
                    entityColumnLabel="Customer"
                />
            )}

            {writeoff && (
                <FinancialLaneCard
                    lane={writeoff}
                    icon={<FileWarning className="h-5 w-5" />}
                    expanded={expandedLane === 'writeoff'}
                    onToggleExpand={() => toggleLane('writeoff')}
                    entityColumnLabel="Customer"
                    action={
                        <a
                            href="/accounting/bad-debt"
                            className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded font-medium"
                        >
                            Open write-off workqueue
                        </a>
                    }
                />
            )}
        </div>
    );
}
