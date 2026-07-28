import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { AlertTriangle, RefreshCw, Settings2 } from 'lucide-react';
import { AxiosError } from 'axios';
import { apiClient, RECONCILIATION_API_TIMEOUT, type ApiResponse } from '../utils/api';
import { DatePicker } from '../components/ui/date-picker';
import { PeriodCloseHeader } from '../components/financial-control/PeriodCloseHeader';
import { WorkspaceHero } from '../components/financial-workspace/WorkspaceHero';
import { WorkspaceSectionLoading } from '../components/financial-workspace/WorkspaceSectionLoading';
import { ControlTowerHealthStrip } from '../components/financial-control-tower/ControlTowerHealthStrip';
import { ControlTowerAttentionPreview } from '../components/financial-control-tower/ControlTowerAttentionPreview';
import { ControlTowerCloseSummary } from '../components/financial-control-tower/ControlTowerCloseSummary';
import { WorkspaceLauncherGrid } from '../components/financial-control-tower/WorkspaceLauncherGrid';
import { useFinancialControlAccess } from '../hooks/useFinancialControlAccess';
import { useAuth } from '../hooks/useAuth';
import type { DomainLaneSummary } from '../types/financialLane';
import type { GovernanceDashboard } from '../types/financialGovernance';
import { formatPeriodLabel } from '../lib/financialBusinessLabels';
import { buildCloseChecklist } from '../lib/financialCloseChecklist';
import {
    buildTowerAttentionPreview,
    buildTowerCloseSummary,
    buildTowerDomainStatuses,
    buildTowerWorkspaceLaunchers,
} from '../lib/financialControlTower';
import {
    buildActionQueue,
    buildExceptionInbox,
    buildWorkspaceHero,
} from '../lib/financialWorkspace';

function reconciliationErrorMessage(err: unknown, fallback: string): string {
    if (err == null) return fallback;
    if (typeof err === 'object' && err !== null && 'response' in err) {
        const ax = err as AxiosError<ApiResponse>;
        const status = ax.response?.status;
        const apiMsg = ax.response?.data?.error ?? ax.response?.data?.message;
        if (status === 403) {
            return apiMsg ?? 'You need reconciliation access. Ask your administrator to assign the Reconcile permission.';
        }
        if (status === 401) {
            return 'Session expired — sign in again.';
        }
        if (apiMsg) return apiMsg;
    }
    return err instanceof Error ? err.message : fallback;
}

async function fetchFinancialHealth(asOfDate: string): Promise<DomainLaneSummary[]> {
    const res = await apiClient.get<ApiResponse<DomainLaneSummary[]>>(
        '/erp-accounting/reconciliation/financial-health',
        { params: { asOfDate }, timeout: RECONCILIATION_API_TIMEOUT },
    );
    return res.data.data ?? [];
}

interface ReconciliationAccount {
    accountName: string;
    difference: number;
}

interface ReconciliationSummary {
    accounts: ReconciliationAccount[];
}

async function fetchSummary(asOfDate: string): Promise<ReconciliationSummary | undefined> {
    try {
        const response = await apiClient.get<ApiResponse<ReconciliationSummary>>(
            '/erp-accounting/reconciliation/summary',
            { params: { asOfDate }, timeout: RECONCILIATION_API_TIMEOUT },
        );
        return response.data.data;
    } catch {
        return undefined;
    }
}

async function fetchGovernanceDashboard(): Promise<GovernanceDashboard | undefined> {
    try {
        const res = await apiClient.get<ApiResponse<GovernanceDashboard>>(
            '/erp-accounting/reconciliation/governance/dashboard',
        );
        return res.data.data;
    } catch {
        return undefined;
    }
}

function parsePeriodFromDate(asOfDate: string): { year: number; month: number } {
    const d = new Date(asOfDate);
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

type LaneDataStatus = 'loading' | 'ready' | 'error' | 'skipped';

export default function ReconciliationPage() {
    const { isLoading: authLoading } = useAuth();
    const access = useFinancialControlAccess();
    const queryClient = useQueryClient();
    const launcherRef = useRef<HTMLElement>(null);
    const attentionRef = useRef<HTMLElement>(null);
    const [asOfDate, setAsOfDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const { year, month } = parsePeriodFromDate(asOfDate);
    const periodLabel = formatPeriodLabel(year, month);

    const needsLaneData = !access.isAuditorView;

    const healthQuery = useQuery({
        queryKey: ['financial-health', asOfDate],
        queryFn: () => fetchFinancialHealth(asOfDate),
        staleTime: 30_000,
        retry: 1,
        refetchOnWindowFocus: false,
        enabled: needsLaneData && !authLoading,
    });

    // Cash difference is optional enrichment — do not block the tower on legacy summary.
    const summaryQuery = useQuery({
        queryKey: ['reconciliation-summary', asOfDate],
        queryFn: () => fetchSummary(asOfDate),
        staleTime: 30_000,
        retry: 0,
        refetchOnWindowFocus: false,
        enabled: needsLaneData && !authLoading,
    });

    const governanceQuery = useQuery({
        queryKey: ['governance-dashboard'],
        queryFn: fetchGovernanceDashboard,
        staleTime: 60_000,
        retry: false,
        enabled: access.showPeriodClose,
    });

    const laneDataStatus: LaneDataStatus = !needsLaneData
        ? 'skipped'
        : authLoading || (healthQuery.isPending && healthQuery.data === undefined)
          ? 'loading'
          : healthQuery.isError
            ? 'error'
            : 'ready';

    const summaries = laneDataStatus === 'ready' ? (healthQuery.data ?? []) : [];
    const cashAccount = summaryQuery.data?.accounts?.find((a) => a.accountName.includes('Cash'));
    const cashDifference = cashAccount?.difference;

    const inbox = laneDataStatus === 'ready' ? buildExceptionInbox(summaries, cashDifference) : [];
    const actionQueue = laneDataStatus === 'ready' ? buildActionQueue(inbox, summaries) : [];
    const readyToClose =
        laneDataStatus === 'ready'
        && inbox.filter((i) => i.blocksClose).length === 0
        && summaries.length > 0;

    const hero =
        laneDataStatus === 'ready'
            ? buildWorkspaceHero(inbox, actionQueue, readyToClose)
            : {
                  totalNeedingAttention: 0,
                  blockingCount: 0,
                  warningCount: 0,
                  estimatedMinutes: 0,
                  readyToClose: false,
                  nextAction: null,
              };

    const closeChecklist =
        laneDataStatus === 'ready'
            ? buildCloseChecklist({
                  summaries,
                  inbox,
                  readyToClose,
                  asOfDate,
                  cashDifference,
                  governance: governanceQuery.data,
                  canClosePeriod: access.canClosePeriod,
              })
            : [];

    const domainStatuses =
        laneDataStatus === 'ready'
            ? buildTowerDomainStatuses(summaries, inbox, asOfDate, cashDifference)
            : [];
    const attentionPreview =
        laneDataStatus === 'ready' ? buildTowerAttentionPreview(inbox, asOfDate, 5) : [];
    // Launchers are static routes — show immediately so operators are never blocked on health.
    const launchers = buildTowerWorkspaceLaunchers(summaries, inbox, asOfDate, cashDifference);
    const closeSummary = buildTowerCloseSummary(closeChecklist, readyToClose);

    const laneErrorMessage = healthQuery.isError
        ? reconciliationErrorMessage(healthQuery.error, 'Could not load financial health data')
        : '';

    const handleRefresh = () => {
        void queryClient.invalidateQueries({ queryKey: ['financial-health', asOfDate] });
        void queryClient.invalidateQueries({ queryKey: ['reconciliation-summary', asOfDate] });
    };

    const scrollToLaunchers = () => {
        launcherRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const isRefreshing = healthQuery.isFetching && laneDataStatus === 'ready';
    const healthLoading = laneDataStatus === 'loading' && needsLaneData;

    return (
        <div className="p-4 lg:p-6 max-w-7xl mx-auto">
            <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Financial Control Tower</h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Overall health, close blockers, and workspace entry — resolve details in operational workspaces.
                    </p>
                </div>
                {access.showDiagnosticsLink && (
                    <Link
                        to="/accounting/financial-diagnostics"
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 shrink-0"
                    >
                        <Settings2 className="h-4 w-4" />
                        Financial diagnostics
                    </Link>
                )}
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
                <div className="flex flex-wrap items-end gap-4">
                    <div className="min-w-[200px]">
                        <label className="block text-sm font-semibold text-slate-700 mb-2">As of date</label>
                        <DatePicker
                            value={asOfDate}
                            onChange={(date) => setAsOfDate(date)}
                            placeholder="Select date"
                            maxDate={new Date()}
                        />
                    </div>
                    <button
                        type="button"
                        onClick={handleRefresh}
                        disabled={healthQuery.isFetching}
                        className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2 transition-colors disabled:opacity-50"
                    >
                        <RefreshCw className={`h-4 w-4 ${healthLoading || isRefreshing ? 'animate-spin' : ''}`} />
                        <span>Refresh</span>
                    </button>
                </div>
            </div>

            {laneDataStatus === 'error' && (
                <div className="mb-6 p-4 rounded-xl border border-red-200 bg-red-50">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                        <div>
                            <p className="font-semibold text-red-800">Could not load financial health</p>
                            <p className="text-sm text-red-700 mt-1">{laneErrorMessage}</p>
                            <button
                                type="button"
                                onClick={handleRefresh}
                                className="mt-3 text-sm font-medium text-red-800 underline hover:no-underline"
                            >
                                Try again
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {laneDataStatus === 'ready' && (
                <>
                    <WorkspaceHero
                        hero={hero}
                        periodLabel={periodLabel}
                        onScrollToQueue={scrollToLaunchers}
                    />

                    {access.showPeriodClose && (
                        <PeriodCloseHeader
                            year={year}
                            month={month}
                            readyToClose={readyToClose}
                            blockingCount={hero.blockingCount}
                            canClosePeriod={access.canClosePeriod}
                        />
                    )}

                    <ControlTowerHealthStrip domains={domainStatuses} />

                    {access.showPeriodClose && (
                        <ControlTowerCloseSummary
                            summary={closeSummary}
                            periodLabel={periodLabel}
                            asOfDate={asOfDate}
                            canClosePeriod={access.canClosePeriod}
                        />
                    )}

                    {access.showBlockingIssues && (
                        <ControlTowerAttentionPreview
                            items={attentionPreview}
                            totalCount={inbox.length}
                            sectionRef={attentionRef}
                        />
                    )}
                </>
            )}

            {healthLoading && (
                <WorkspaceSectionLoading label="Loading control account health…" />
            )}

            {!access.isAuditorView && (
                <WorkspaceLauncherGrid launchers={launchers} sectionRef={launcherRef} />
            )}

            {access.isAuditorView && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600 mb-6">
                    <p className="font-medium text-slate-800">Auditor view</p>
                    <p className="mt-1">
                        Use{' '}
                        <Link to="/accounting/financial-diagnostics" className="underline">
                            Financial diagnostics
                        </Link>{' '}
                        for audit evidence and governance.
                    </p>
                </div>
            )}
        </div>
    );
}
