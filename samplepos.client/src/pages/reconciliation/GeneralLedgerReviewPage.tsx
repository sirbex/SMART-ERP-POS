import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { RefreshCw } from 'lucide-react';
import { accountingApi } from '../../services/api';
import { apiClient, RECONCILIATION_API_TIMEOUT, type ApiResponse } from '../../utils/api';
import type { DomainLaneSummary } from '../../types/financialLane';
import { ReconciliationWorkspaceShell } from '../../components/reconciliation-workspace/ReconciliationWorkspaceShell';
import { GlReviewControlAccounts } from '../../components/reconciliation-workspace/GlReviewControlAccounts';
import {
    GL_REVIEW_TASK_ICONS,
    GlReviewTaskGrid,
    type GlReviewTask,
} from '../../components/reconciliation-workspace/GlReviewTaskGrid';
import { usePendingApprovals } from '../../hooks/useAccountingModules';
import { formatCurrency } from '../../utils/currency';

interface TrialBalanceTotals {
    totalDebits: number;
    totalCredits: number;
    difference?: number;
    netDifference?: number;
    isBalanced: boolean;
}

interface ReconciliationSummary {
    accounts: Array<{ accountName: string; difference: number }>;
}

async function fetchFinancialHealth(asOfDate: string): Promise<DomainLaneSummary[]> {
    const res = await apiClient.get<ApiResponse<DomainLaneSummary[]>>(
        '/erp-accounting/reconciliation/financial-health',
        { params: { asOfDate }, timeout: RECONCILIATION_API_TIMEOUT },
    );
    return res.data.data ?? [];
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

async function fetchTrialBalanceTotals(asOfDate: string): Promise<TrialBalanceTotals | null> {
    try {
        const response = await accountingApi.get('/trial-balance', {
            params: { asOfDate, includeZeroBalances: 'false' },
        });
        const result = response.data;
        if (!result.success) return null;
        const totals = result.data?.totals ?? result.data;
        return {
            totalDebits: Number(totals.totalDebits ?? 0),
            totalCredits: Number(totals.totalCredits ?? 0),
            difference: Number(totals.difference ?? totals.netDifference ?? 0),
            isBalanced: Boolean(totals.isBalanced),
        };
    } catch {
        return null;
    }
}

export default function GeneralLedgerReviewPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const asOfDate = searchParams.get('asOfDate') ?? format(new Date(), 'yyyy-MM-dd');
    const accountHighlight = searchParams.get('account') ?? undefined;

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

    const trialBalanceQuery = useQuery({
        queryKey: ['trial-balance-totals', asOfDate],
        queryFn: () => fetchTrialBalanceTotals(asOfDate),
        staleTime: 30_000,
    });

    const { data: pendingApprovals } = usePendingApprovals();
    const pendingCount = Array.isArray(pendingApprovals) ? pendingApprovals.length : 0;

    const cashDifference = summaryQuery.data?.accounts?.find((a) =>
        a.accountName.includes('Cash'),
    )?.difference;

    const handleAsOfDateChange = (date: string) => {
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set('asOfDate', date);
            return next;
        });
    };

    const isLoading = healthQuery.isLoading || trialBalanceQuery.isLoading;
    const tb = trialBalanceQuery.data;
    const tbDiff = tb?.difference ?? 0;

    const tasks: GlReviewTask[] = useMemo(() => {
        const glAccount = accountHighlight ?? '1200';
        return [
            {
                id: 'journals',
                title: 'Journal entries',
                description: 'Review posted and draft journal entries for the period.',
                path: `/accounting/journal-entries?asOfDate=${asOfDate}`,
                icon: GL_REVIEW_TASK_ICONS.journal,
            },
            {
                id: 'approvals',
                title: 'Journal approvals',
                description: 'Approve or reject entries above workflow thresholds.',
                path: '/accounting/je-approval',
                icon: GL_REVIEW_TASK_ICONS.approval,
                badge: pendingCount > 0 ? `${pendingCount} pending` : undefined,
                tone: pendingCount > 0 ? 'warning' : 'default',
            },
            {
                id: 'trial-balance',
                title: 'Trial balance',
                description: 'Verify debits equal credits across all accounts.',
                path: `/accounting/trial-balance?asOfDate=${asOfDate}`,
                icon: GL_REVIEW_TASK_ICONS.trialBalance,
                badge: tb && !tb.isBalanced ? 'Out of balance' : tb?.isBalanced ? 'Balanced' : undefined,
                tone: tb && !tb.isBalanced ? 'danger' : 'default',
            },
            {
                id: 'entry-matching',
                title: 'GL entry matching',
                description: 'Match unreconciled ledger lines by control account.',
                path: `/accounting/gl-reconciliation?account=${glAccount}`,
                icon: GL_REVIEW_TASK_ICONS.entryMatching,
            },
            {
                id: 'general-ledger',
                title: 'General ledger',
                description: 'Drill into account activity and transaction detail.',
                path: accountHighlight
                    ? `/accounting/general-ledger?account=${accountHighlight}`
                    : '/accounting/general-ledger',
                icon: GL_REVIEW_TASK_ICONS.ledger,
            },
            {
                id: 'statements',
                title: 'Financial statements',
                description: 'P&L, balance sheet, and statement packages.',
                path: '/accounting/financial-statements',
                icon: GL_REVIEW_TASK_ICONS.statements,
            },
        ];
    }, [asOfDate, accountHighlight, pendingCount, tb]);

    return (
        <ReconciliationWorkspaceShell
            title="General Ledger Review"
            subtitle="Trial balance, journals, approvals, and control account oversight before close."
            accountCode="GL"
            asOfDate={asOfDate}
            onAsOfDateChange={handleAsOfDateChange}
            headerExtra={
                <button
                    type="button"
                    onClick={() => {
                        void healthQuery.refetch();
                        void summaryQuery.refetch();
                        void trialBalanceQuery.refetch();
                    }}
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

            {!isLoading && (
                <>
                    {tb && (
                        <div
                            className={`mb-6 rounded-xl border p-4 ${
                                tb.isBalanced
                                    ? 'border-green-200 bg-green-50'
                                    : 'border-red-200 bg-red-50'
                            }`}
                        >
                            <p
                                className={`font-semibold ${
                                    tb.isBalanced ? 'text-green-800' : 'text-red-800'
                                }`}
                            >
                                {tb.isBalanced
                                    ? 'Trial balance is in balance'
                                    : 'Trial balance is out of balance'}
                            </p>
                            <p className="text-sm mt-1 text-slate-700 tabular-nums">
                                Debits {formatCurrency(tb.totalDebits)} · Credits{' '}
                                {formatCurrency(tb.totalCredits)}
                                {Math.abs(tbDiff) > 0.01 && (
                                    <> · Difference {formatCurrency(tbDiff)}</>
                                )}
                            </p>
                        </div>
                    )}

                    <GlReviewTaskGrid tasks={tasks} />

                    {healthQuery.data && (
                        <GlReviewControlAccounts
                            summaries={healthQuery.data}
                            asOfDate={asOfDate}
                            cashDifference={cashDifference}
                        />
                    )}
                </>
            )}
        </ReconciliationWorkspaceShell>
    );
}
