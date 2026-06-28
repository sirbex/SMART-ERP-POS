import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Database, History, RefreshCw, ShieldCheck } from 'lucide-react';
import { apiClient, type ApiResponse } from '../../utils/api';
import type { FinancialLaneResult } from '../../types/financialLane';
import { FinancialLaneCard } from './FinancialLaneCard';

type ExpandedLane = 'integrity' | 'cache' | 'history' | null;

async function fetchLane(path: string, asOfDate: string): Promise<FinancialLaneResult> {
    const res = await apiClient.get<ApiResponse<FinancialLaneResult>>(path, {
        params: { asOfDate },
    });
    return res.data.data as FinancialLaneResult;
}

interface Props {
    asOfDate: string;
}

export function InventoryReconciliationLanesPanel({ asOfDate, onPeriodCloseStatus }: Props) {
    const queryClient = useQueryClient();
    const [expandedLane, setExpandedLane] = useState<ExpandedLane>(null);

    const integrityQuery = useQuery({
        queryKey: ['inventory-lane-integrity', asOfDate],
        queryFn: () => fetchLane('/erp-accounting/reconciliation/inventory/integrity', asOfDate),
        staleTime: 30_000,
    });

    const cacheQuery = useQuery({
        queryKey: ['inventory-lane-cache', asOfDate],
        queryFn: () => fetchLane('/erp-accounting/reconciliation/inventory/cache', asOfDate),
        staleTime: 30_000,
    });

    const historyQuery = useQuery({
        queryKey: ['inventory-lane-history', asOfDate],
        queryFn: () => fetchLane('/erp-accounting/reconciliation/inventory/history', asOfDate),
        staleTime: 30_000,
    });

    const integrity = integrityQuery.data;
    const cache = cacheQuery.data;
    const history = historyQuery.data;

    const refreshCacheMutation = useMutation({
        mutationFn: async () => {
            await apiClient.post('/system/gl/rebuild-inventory-balances');
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['inventory-lane-cache', asOfDate] });
            await queryClient.invalidateQueries({ queryKey: ['reconciliation-summary', asOfDate] });
            await queryClient.invalidateQueries({ queryKey: ['financial-health', asOfDate] });
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
                <h2 className="text-lg font-semibold text-gray-900">Inventory Reconciliation</h2>
                <p className="text-sm text-gray-500 mt-1">
                    Three independent checks — only lanes marked <strong>Period-close gate</strong> block close when
                    unreconciled. Batch subledger is SSOT; product cache is maintenance only.
                </p>
            </div>

            {integrity && (
                <FinancialLaneCard
                    lane={integrity}
                    icon={<ShieldCheck className="h-5 w-5" />}
                    expanded={expandedLane === 'integrity'}
                    onToggleExpand={() => toggleLane('integrity')}
                    entityColumnLabel="Product"
                />
            )}

            {cache && (
                <FinancialLaneCard
                    lane={cache}
                    icon={<Database className="h-5 w-5" />}
                    expanded={expandedLane === 'cache'}
                    onToggleExpand={() => toggleLane('cache')}
                    entityColumnLabel="Product"
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
                            Rebuild Cache
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
                    expandLabel="View Journals"
                />
            )}
        </div>
    );
}
