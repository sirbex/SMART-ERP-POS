import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { Database, History, RefreshCw, ShieldCheck } from 'lucide-react';
import { apiClient, type ApiResponse } from '../../utils/api';
import type { FinancialLaneResult } from '../../types/financialLane';
import { isPeriodCloseClear } from '../../types/financialLane';
import { FinancialLaneCard } from '../reconciliation/FinancialLaneCard';
import { ReconciliationWorkspaceShell } from './ReconciliationWorkspaceShell';
import { ReconciliationExceptionGrid } from './ReconciliationExceptionGrid';
import { ExceptionTraceDrawer } from '../financial-workspace/ExceptionTraceDrawer';
import type { DomainWorkspaceConfig } from '../../lib/reconciliationWorkspaceConfig';

type ExpandedLane = 'integrity' | 'cache' | 'history' | null;

async function fetchLane(path: string, asOfDate: string): Promise<FinancialLaneResult> {
    const res = await apiClient.get<ApiResponse<FinancialLaneResult>>(path, {
        params: { asOfDate },
    });
    return res.data.data as FinancialLaneResult;
}

interface Props {
    config: DomainWorkspaceConfig;
}

export function DomainReconciliationWorkspace({ config }: Props) {
    const queryClient = useQueryClient();
    const [searchParams, setSearchParams] = useSearchParams();
    const asOfDate = searchParams.get('asOfDate') ?? format(new Date(), 'yyyy-MM-dd');
    const highlight = searchParams.get('highlight');
    const [expandedLane, setExpandedLane] = useState<ExpandedLane>('integrity');
    const [traceExceptionId, setTraceExceptionId] = useState<string | null>(null);

    useEffect(() => {
        if (highlight) setExpandedLane('integrity');
    }, [highlight]);

    const integrityQuery = useQuery({
        queryKey: [`${config.queryKeyPrefix}-integrity`, asOfDate],
        queryFn: () => fetchLane(`${config.apiBase}/integrity`, asOfDate),
        staleTime: 30_000,
    });

    const cacheQuery = useQuery({
        queryKey: [`${config.queryKeyPrefix}-cache`, asOfDate],
        queryFn: () => fetchLane(`${config.apiBase}/cache`, asOfDate),
        staleTime: 30_000,
    });

    const historyQuery = useQuery({
        queryKey: [`${config.queryKeyPrefix}-history`, asOfDate],
        queryFn: () => fetchLane(`${config.apiBase}/history`, asOfDate),
        staleTime: 30_000,
    });

    const refreshCacheMutation = useMutation({
        mutationFn: async () => {
            await apiClient.post(config.cacheRefresh.url);
        },
        onSuccess: async () => {
            for (const key of config.cacheRefresh.invalidateKeys) {
                await queryClient.invalidateQueries({ queryKey: [key, asOfDate] });
            }
        },
    });

    const handleAsOfDateChange = (date: string) => {
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set('asOfDate', date);
            return next;
        });
    };

    const handleRefresh = () => {
        void queryClient.invalidateQueries({ queryKey: [`${config.queryKeyPrefix}-integrity`, asOfDate] });
        void queryClient.invalidateQueries({ queryKey: [`${config.queryKeyPrefix}-cache`, asOfDate] });
        void queryClient.invalidateQueries({ queryKey: [`${config.queryKeyPrefix}-history`, asOfDate] });
    };

    const isLoading =
        integrityQuery.isLoading || cacheQuery.isLoading || historyQuery.isLoading;

    const integrity = integrityQuery.data;
    const cache = cacheQuery.data;
    const history = historyQuery.data;
    const periodCloseClear = integrity ? isPeriodCloseClear(integrity) : false;

    const toggleLane = (lane: ExpandedLane) => {
        setExpandedLane((prev) => (prev === lane ? null : lane));
    };

    return (
        <ReconciliationWorkspaceShell
            title={config.title}
            subtitle={config.subtitle}
            accountCode={config.accountCode}
            asOfDate={asOfDate}
            onAsOfDateChange={handleAsOfDateChange}
            headerExtra={
                <button
                    type="button"
                    onClick={handleRefresh}
                    disabled={isLoading}
                    className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50"
                >
                    <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                    Refresh
                </button>
            }
        >
            {isLoading && (
                <div className="flex justify-center py-16">
                    <RefreshCw className="h-8 w-8 text-slate-400 animate-spin" />
                </div>
            )}

            {!isLoading && integrity && (
                <>
                    <div
                        className={`mb-6 rounded-xl border p-4 ${
                            periodCloseClear
                                ? 'border-green-200 bg-green-50'
                                : 'border-red-200 bg-red-50'
                        }`}
                    >
                        <p
                            className={`font-semibold ${
                                periodCloseClear ? 'text-green-800' : 'text-red-800'
                            }`}
                        >
                            {periodCloseClear ? config.clearBannerTitle : config.blockedBannerTitle}
                        </p>
                        <p className="text-sm mt-1 text-slate-700">
                            {integrity.leftLabel}: {integrity.leftAmount.toFixed(2)} ·{' '}
                            {integrity.rightLabel}: {integrity.rightAmount.toFixed(2)} · Difference:{' '}
                            {integrity.difference.toFixed(2)}
                        </p>
                    </div>

                    <div className="mb-6">
                        <ReconciliationExceptionGrid
                            heading={config.exceptionHeading}
                            entityLabel={config.entityLabel}
                            entityPlural={config.entityPlural}
                            searchPlaceholder={config.searchPlaceholder}
                            emptyClearMessage={config.exceptionEmptyClear}
                            emptySearchMessage={config.exceptionEmptySearch}
                            exceptions={integrity.exceptions}
                            leftLabel={integrity.leftLabel}
                            rightLabel={integrity.rightLabel}
                            highlightId={highlight}
                            openEntityPath={config.openEntityPath}
                            onTrace={(entityId) =>
                                setTraceExceptionId(`${config.exceptionIdPrefix}-${entityId}`)
                            }
                        />
                    </div>

                    <div className="space-y-4 mb-6">
                        <p className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
                            Lane detail
                        </p>
                        <FinancialLaneCard
                            lane={integrity}
                            icon={<ShieldCheck className="h-5 w-5" />}
                            expanded={expandedLane === 'integrity'}
                            onToggleExpand={() => toggleLane('integrity')}
                            entityColumnLabel={config.entityLabel}
                        />
                        {cache && (
                            <FinancialLaneCard
                                lane={cache}
                                icon={<Database className="h-5 w-5" />}
                                expanded={expandedLane === 'cache'}
                                onToggleExpand={() => toggleLane('cache')}
                                entityColumnLabel={config.entityLabel}
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
                                        {config.cacheRefresh.label}
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
                                entityColumnLabel={config.entityLabel}
                                expandLabel={
                                    config.domain === 'inventory' ? 'View Journals' : undefined
                                }
                            />
                        )}
                    </div>
                </>
            )}

            <ExceptionTraceDrawer
                exceptionId={traceExceptionId}
                asOfDate={asOfDate}
                onClose={() => setTraceExceptionId(null)}
            />
        </ReconciliationWorkspaceShell>
    );
}
