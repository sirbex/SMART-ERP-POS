import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { ChevronRight, Lock, RefreshCw } from 'lucide-react';
import { apiClient, RECONCILIATION_API_TIMEOUT, type ApiResponse } from '../../utils/api';
import type { DomainLaneSummary } from '../../types/financialLane';
import type { GovernanceDashboard } from '../../types/financialGovernance';
import { ReconciliationWorkspaceShell } from '../../components/reconciliation-workspace/ReconciliationWorkspaceShell';
import { CloseChecklistPanel } from '../../components/financial-workspace/CloseChecklistPanel';
import { AuditWorkspacePanel } from '../../components/financial-control/AuditWorkspacePanel';
import { ExceptionTraceDrawer } from '../../components/financial-workspace/ExceptionTraceDrawer';
import { useFinancialControlAccess } from '../../hooks/useFinancialControlAccess';
import { formatPeriodLabel } from '../../lib/financialBusinessLabels';
import { buildCloseChecklist } from '../../lib/financialCloseChecklist';
import { buildExceptionInbox } from '../../lib/financialWorkspace';

async function fetchFinancialHealth(asOfDate: string): Promise<DomainLaneSummary[]> {
    const res = await apiClient.get<ApiResponse<DomainLaneSummary[]>>(
        '/erp-accounting/reconciliation/financial-health',
        { params: { asOfDate }, timeout: RECONCILIATION_API_TIMEOUT },
    );
    return res.data.data ?? [];
}

async function fetchSummary(asOfDate: string) {
    try {
        const response = await apiClient.get<ApiResponse<{ accounts: Array<{ accountName: string; difference: number }> }>>(
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

export default function PeriodCloseWorkspacePage() {
    const access = useFinancialControlAccess();
    const [searchParams, setSearchParams] = useSearchParams();
    const asOfDate = searchParams.get('asOfDate') ?? format(new Date(), 'yyyy-MM-dd');
    const [traceExceptionId, setTraceExceptionId] = useState<string | null>(null);
    const { year, month } = parsePeriodFromDate(asOfDate);
    const periodLabel = formatPeriodLabel(year, month);

    const healthQuery = useQuery({
        queryKey: ['financial-health', asOfDate],
        queryFn: () => fetchFinancialHealth(asOfDate),
        staleTime: 30_000,
    });

    const summaryQuery = useQuery({
        queryKey: ['reconciliation-summary', asOfDate],
        queryFn: () => fetchSummary(asOfDate),
        staleTime: 30_000,
        enabled: healthQuery.isSuccess,
    });

    const governanceQuery = useQuery({
        queryKey: ['governance-dashboard'],
        queryFn: fetchGovernanceDashboard,
        staleTime: 60_000,
    });

    const handleAsOfDateChange = (date: string) => {
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set('asOfDate', date);
            return next;
        });
    };

    const summaries = healthQuery.data ?? [];
    const cashDifference = summaryQuery.data?.accounts?.find((a) =>
        a.accountName.includes('Cash'),
    )?.difference;
    const inbox = buildExceptionInbox(summaries, cashDifference);
    const readyToClose =
        inbox.filter((i) => i.blocksClose).length === 0 && summaries.length > 0;
    const closeChecklist = buildCloseChecklist({
        summaries,
        inbox,
        readyToClose,
        asOfDate,
        cashDifference,
        governance: governanceQuery.data,
        canClosePeriod: access.canClosePeriod,
    });

    const isLoading = healthQuery.isLoading;

    return (
        <ReconciliationWorkspaceShell
            title="Period Close"
            subtitle="Execute month-end checklist, capture audit evidence, and close the period."
            accountCode={periodLabel}
            asOfDate={asOfDate}
            onAsOfDateChange={handleAsOfDateChange}
            headerExtra={
                <button
                    type="button"
                    onClick={() => {
                        void healthQuery.refetch();
                        void summaryQuery.refetch();
                        void governanceQuery.refetch();
                    }}
                    disabled={isLoading}
                    className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50"
                >
                    <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                    Refresh
                </button>
            }
        >
            <div
                className={`mb-6 rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 ${
                    readyToClose ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                }`}
            >
                <div>
                    <p
                        className={`font-semibold ${
                            readyToClose ? 'text-green-800' : 'text-red-800'
                        }`}
                    >
                        {readyToClose ? 'Ready to close' : 'Period close blocked'}
                    </p>
                    <p className="text-sm text-slate-700 mt-1">
                        {readyToClose
                            ? `All control accounts reconcile for ${periodLabel}.`
                            : `${inbox.filter((i) => i.blocksClose).length} blocking exception(s) remain.`}
                    </p>
                </div>
                {access.canClosePeriod && (
                    <Link
                        to="/accounting/periods"
                        className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${
                            readyToClose
                                ? 'bg-green-600 text-white hover:bg-green-700'
                                : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                        }`}
                    >
                        <Lock className="h-4 w-4" />
                        Close {periodLabel}
                        <ChevronRight className="h-4 w-4" />
                    </Link>
                )}
            </div>

            {isLoading ? (
                <div className="flex justify-center py-16">
                    <RefreshCw className="h-8 w-8 text-slate-400 animate-spin" />
                </div>
            ) : (
                <CloseChecklistPanel
                    steps={closeChecklist}
                    periodLabel={periodLabel}
                    onViewTrace={(exceptionId) => setTraceExceptionId(exceptionId)}
                />
            )}

            {access.showAuditWorkspace && (
                <div className="mt-6">
                    <AuditWorkspacePanel
                        asOfDate={asOfDate}
                        canCaptureSnapshot={access.canCaptureSnapshot}
                        canDownloadEvidence={access.canDownloadEvidence}
                        canRequestSignoff={access.canRequestSignoff}
                        canApproveSignoff={access.canApproveSignoff}
                    />
                </div>
            )}

            <ExceptionTraceDrawer
                exceptionId={traceExceptionId}
                asOfDate={asOfDate}
                onClose={() => setTraceExceptionId(null)}
            />
        </ReconciliationWorkspaceShell>
    );
}
