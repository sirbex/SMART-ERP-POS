import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { CheckCircle, AlertTriangle, RefreshCw, ChevronDown, ChevronRight, FileText } from 'lucide-react';
import { formatCurrency } from '../utils/currency';
import { DatePicker } from '../components/ui/date-picker';
import { ResponsiveTableWrapper } from '../components/ui/ResponsiveTableWrapper';
import { formatTimestamp } from '../utils/businessDate';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '../components/ui/dialog';
import { AxiosError } from 'axios';
import { apiClient, type ApiResponse } from '../utils/api';
import { ApReconciliationLanesPanel } from '../components/reconciliation/ApReconciliationLanesPanel';

function reconciliationErrorMessage(err: unknown, fallback: string): string {
    const ax = err as AxiosError<ApiResponse>;
    const status = ax.response?.status;
    const apiMsg = ax.response?.data?.error ?? ax.response?.data?.message;
    if (status === 403) {
        return apiMsg ?? 'You need the accounting.reconcile permission (Admin → Roles).';
    }
    if (status === 401) {
        return 'Session expired — sign in again.';
    }
    return apiMsg ?? (err instanceof Error ? err.message : fallback);
}

// API functions (shared api client: auth refresh, tenant routing)
const fetchReconciliationSummary = async (
    asOfDate?: string,
): Promise<ApiResponse<ReconciliationSummary>> => {
    const response = await apiClient.get<ApiResponse<ReconciliationSummary>>(
        '/erp-accounting/reconciliation/summary',
        { params: asOfDate ? { asOfDate } : undefined },
    );
    return response.data;
};

const fetchAccountReconciliation = async (
    account: string,
    asOfDate?: string,
): Promise<ApiResponse<ReconciliationDetail>> => {
    const response = await apiClient.get<ApiResponse<ReconciliationDetail>>(
        `/erp-accounting/reconciliation/${account}`,
        { params: asOfDate ? { asOfDate } : undefined },
    );
    return response.data;
};

const fetchDiscrepancyDetails = async (
    accountCode: string,
    asOfDate?: string,
): Promise<ApiResponse<DiscrepancyListResponse>> => {
    const response = await apiClient.get<ApiResponse<DiscrepancyListResponse>>(
        `/erp-accounting/reconciliation/${accountCode}/discrepancies`,
        { params: asOfDate ? { asOfDate } : undefined },
    );
    return response.data;
};

const fetchActiveAccounts = async (): Promise<ChartAccount[]> => {
    const response = await apiClient.get<ApiResponse<ChartAccount[]>>(
        '/accounting/chart-of-accounts',
        { params: { isPostingAccount: true, isActive: true } },
    );
    return response.data.data ?? [];
};

type AccountType = 'cash' | 'accounts-receivable' | 'inventory' | 'accounts-payable';

interface ReconciliationAccount {
    accountName: string;
    glBalance: number;
    subledgerBalance: number;
    difference: number;
    status: 'MATCHED' | 'DISCREPANCY';
    recommendation: string;
}

interface ReconciliationSummary {
    asOfDate: string;
    generatedAt: string;
    accounts: ReconciliationAccount[];
    overallStatus: 'ALL_RECONCILED' | 'HAS_DISCREPANCIES';
    discrepancyCount: number;
}

interface ReconciliationDetail {
    accountName: string;
    glBalance: number;
    subledgerBalance: number;
    difference: number;
    status: string;
    items?: Array<{
        source: string;
        description: string;
        amount: number;
        difference: number;
        status: string;
    }>;
    recommendations?: string[];
}

interface ApIntegritySummary {
    glNetActive: number;
    openItemSubledger: number;
    integrityDifference: number;
    status: 'RECONCILED' | 'DISCREPANCY';
}

interface DiscrepancyListResponse {
    discrepancies: Array<{
        entityName: string;
        glBalance: number;
        subledgerBalance: number;
        difference: number;
    }>;
}

interface ChartAccount {
    id: string;
    accountNumber: string;
    accountName: string;
    accountType: string;
    isPostingAccount: boolean;
    isActive: boolean;
    currentBalance: number;
}

/** Key used to pass pre-fill data from Reconciliation → Journal Entries page */
const ADJUST_PREFILL_KEY = 'recon_adjust_prefill';

export default function ReconciliationPage() {
    const navigate = useNavigate();
    const [asOfDate, setAsOfDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [selectedAccount, setSelectedAccount] = useState<AccountType | null>(null);
    const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());

    // Queries
    const {
        data: summaryData,
        isLoading: summaryLoading,
        isError: summaryError,
        error: summaryQueryError,
        refetch: refetchSummary,
    } = useQuery({
        queryKey: ['reconciliation-summary', asOfDate],
        queryFn: () => fetchReconciliationSummary(asOfDate),
        staleTime: 30_000,
        retry: 1,
    });

    const { data: accountData, isLoading: accountLoading, refetch: refetchAccount } = useQuery({
        queryKey: ['reconciliation-account', selectedAccount, asOfDate],
        queryFn: () => selectedAccount ? fetchAccountReconciliation(selectedAccount, asOfDate) : null,
        enabled: !!selectedAccount,
        staleTime: 30_000,
    });

    const { data: apIntegrityLane, refetch: refetchApIntegrity } = useQuery({
        queryKey: ['ap-lane-integrity', asOfDate],
        queryFn: async () => {
            const res = await apiClient.get<ApiResponse<ApIntegritySummary>>(
                '/erp-accounting/reconciliation/ap/integrity',
                { params: { asOfDate } },
            );
            return res.data.data;
        },
        staleTime: 30_000,
    });

    const { data: arDiscrepancies, refetch: refetchArDiscrepancies } = useQuery({
        queryKey: ['discrepancies-1200', asOfDate],
        queryFn: () => fetchDiscrepancyDetails('1200', asOfDate),
        enabled: expandedAccounts.has('1200'),
        staleTime: 30_000,
    });

    // Accounts for resolving account codes → UUIDs for pre-fill
    const { data: accountsData } = useQuery({
        queryKey: ['chart-accounts-posting'],
        queryFn: fetchActiveAccounts
    });
    const chartAccounts: ChartAccount[] = accountsData || [];

    const summary = summaryData?.data as ReconciliationSummary | undefined;
    const accountDetail = accountData?.data as ReconciliationDetail | undefined;

    /**
     * Navigate to Journal Entries page with pre-filled adjusting entry data.
     * Uses sessionStorage to pass complex form data without URL params.
     */
    const openAdjustingEntry = (account: ReconciliationAccount) => {
        const code = accountCodes[account.accountName] || '';
        const diff = account.difference; // GL - Subledger

        // Find the account UUID from chart of accounts
        const targetAccount = chartAccounts.find(a => a.accountNumber === code);
        const targetAccountId = targetAccount?.id || '';

        // Pre-fill logic:
        // If GL > Subledger (positive difference), we need to REDUCE GL
        //   For asset accounts (1xxx): Credit the account to reduce it
        //   For liability accounts (2xxx): Debit the account to reduce it  
        // If GL < Subledger (negative difference), we need to INCREASE GL
        //   For asset accounts (1xxx): Debit the account to increase it
        //   For liability accounts (2xxx): Credit the account to increase it
        const isLiability = code.startsWith('2');
        const absDiff = Math.abs(diff);

        let line1Debit = 0;
        let line1Credit = 0;
        if (isLiability) {
            line1Debit = diff > 0 ? absDiff : 0;
            line1Credit = diff < 0 ? absDiff : 0;
        } else {
            line1Debit = diff < 0 ? absDiff : 0;
            line1Credit = diff > 0 ? absDiff : 0;
        }

        const prefill = {
            transactionDate: asOfDate,
            description: `Reconciliation adjustment: ${account.accountName} — ${diff > 0 ? 'reduce' : 'increase'} GL by ${formatCurrency(absDiff)}`,
            referenceNumber: `RECON-ADJ-${code}-${asOfDate}`,
            lines: [
                {
                    accountId: targetAccountId,
                    debitAmount: line1Debit,
                    creditAmount: line1Credit,
                    description: `Adjustment for ${account.accountName} reconciliation discrepancy`
                },
                {
                    accountId: '',
                    debitAmount: line1Credit,
                    creditAmount: line1Debit,
                    description: `Contra entry for ${account.accountName} reconciliation`
                }
            ]
        };

        sessionStorage.setItem(ADJUST_PREFILL_KEY, JSON.stringify(prefill));
        navigate('/accounting/journal-entries');
    };

    const toggleExpanded = (code: string) => {
        setExpandedAccounts(prev => {
            const next = new Set(prev);
            if (next.has(code)) {
                next.delete(code);
            } else {
                next.add(code);
            }
            return next;
        });
    };

    const accountRoutes: Record<string, AccountType> = {
        'Cash': 'cash',
        'Cash (1010)': 'cash',
        'Accounts Receivable': 'accounts-receivable',
        'Accounts Receivable (1200)': 'accounts-receivable',
        'Inventory': 'inventory',
        'Inventory (1300)': 'inventory',
        'Accounts Payable': 'accounts-payable',
        'Accounts Payable (2100)': 'accounts-payable'
    };

    const accountCodes: Record<string, string> = {
        'Cash': '1010',
        'Cash (1010)': '1010',
        'Accounts Receivable': '1200',
        'Accounts Receivable (1200)': '1200',
        'Inventory': '1300',
        'Inventory (1300)': '1300',
        'Accounts Payable': '2100',
        'Accounts Payable (2100)': '2100'
    };

    const handleRefresh = async () => {
        await refetchSummary();
        await refetchApIntegrity();
        if (selectedAccount) {
            await refetchAccount();
        }
        if (expandedAccounts.has('1200')) {
            await refetchArDiscrepancies();
        }
    };

    const nonApDiscrepancyCount = summary?.accounts.filter(
        (a) => a.status === 'DISCREPANCY' && !a.accountName.includes('Payable'),
    ).length ?? 0;
    const apIntegrityDiscrepancy = apIntegrityLane?.status === 'DISCREPANCY' ? 1 : 0;
    const totalDiscrepancyCount = nonApDiscrepancyCount + apIntegrityDiscrepancy;
    const overallReconciled = summary?.overallStatus === 'ALL_RECONCILED'
        ? (apIntegrityLane ? apIntegrityLane.status === 'RECONCILED' : true)
        : totalDiscrepancyCount === 0;

    return (
        <div className="p-4 lg:p-6">
            {/* Date Selector */}
            <div className="bg-white rounded-lg shadow-sm border p-4 mb-6">
                <div className="flex flex-wrap items-end gap-4">
                    <div className="min-w-[200px]">
                        <label className="block text-sm font-semibold text-gray-700 mb-2">📅 As of Date</label>
                        <DatePicker
                            value={asOfDate}
                            onChange={(date) => setAsOfDate(date)}
                            placeholder="Select date"
                            maxDate={new Date()}
                        />
                    </div>
                    <button
                        onClick={handleRefresh}
                        disabled={summaryLoading}
                        className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2 transition-colors disabled:opacity-50"
                    >
                        <RefreshCw className={`h-4 w-4 ${summaryLoading ? 'animate-spin' : ''}`} />
                        <span>Refresh</span>
                    </button>
                </div>
            </div>

            {/* Overall Status */}
            {summary && (
                <div className={`mb-6 p-4 rounded-lg border ${overallReconciled ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                    <div className="flex items-center space-x-3">
                        {overallReconciled ? (
                            <CheckCircle className="h-6 w-6 text-green-600" />
                        ) : (
                            <AlertTriangle className="h-6 w-6 text-red-600" />
                        )}
                        <div>
                            <p className={`font-semibold text-lg ${overallReconciled ? 'text-green-800' : 'text-red-800'}`}>
                                {overallReconciled ? 'All Accounts Reconciled' : `${totalDiscrepancyCount} Account(s) with Discrepancies`}
                            </p>
                            <p className="text-sm text-gray-600">
                                As of {summary.asOfDate} | Generated {formatTimestamp(summary.generatedAt)}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Summary Table */}
            {summaryError ? (
                <div className="mb-6 p-4 rounded-lg border border-red-200 bg-red-50">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                        <div>
                            <p className="font-semibold text-red-800">Could not load reconciliation</p>
                            <p className="text-sm text-red-700 mt-1">
                                {reconciliationErrorMessage(
                                    summaryQueryError,
                                    'Failed to fetch reconciliation summary',
                                )}
                            </p>
                            <button
                                type="button"
                                onClick={() => void refetchSummary()}
                                className="mt-3 text-sm font-medium text-red-800 underline hover:no-underline"
                            >
                                Try again
                            </button>
                        </div>
                    </div>
                </div>
            ) : summaryLoading ? (
                <div className="flex justify-center py-12">
                    <RefreshCw className="h-8 w-8 text-gray-400 animate-spin" />
                </div>
            ) : summary?.accounts && summary.accounts.length > 0 ? (
                <>
                <ApReconciliationLanesPanel asOfDate={asOfDate} />

                <div className="bg-white rounded-lg shadow-sm border mb-6">
                    <div className="px-6 py-4 border-b">
                        <h2 className="text-lg font-semibold">Reconciliation Summary</h2>
                    </div>
                    <div className="divide-y">
                        {summary.accounts.map((account: ReconciliationAccount, idx: number) => {
                            const code = accountCodes[account.accountName] || '';
                            const isAp = code === '2100';
                            const hasDetails = code === '1200';
                            const isExpanded = expandedAccounts.has(code);
                            const discrepancies = code === '1200' ? arDiscrepancies?.data?.discrepancies : [];

                            const displayGl = isAp && apIntegrityLane
                                ? apIntegrityLane.glNetActive
                                : account.glBalance;
                            const displaySubledger = isAp && apIntegrityLane
                                ? apIntegrityLane.openItemSubledger
                                : account.subledgerBalance;
                            const displayDiff = isAp && apIntegrityLane
                                ? apIntegrityLane.integrityDifference
                                : account.difference;
                            const displayStatus = isAp && apIntegrityLane
                                ? (apIntegrityLane.status === 'RECONCILED' ? 'MATCHED' : 'DISCREPANCY')
                                : account.status;
                            const glLabel = isAp ? 'GL (Net Active)' : 'GL Balance';
                            const subLabel = isAp ? 'Open-item Subledger' : 'Subledger';
                            const diffLabel = isAp ? 'Integrity Difference' : 'Difference';

                            return (
                                <div key={idx}>
                                    <div
                                        className={`px-4 sm:px-6 py-4 hover:bg-gray-50 ${hasDetails && displayStatus === 'DISCREPANCY' ? 'cursor-pointer' : ''}`}
                                        onClick={() => hasDetails && displayStatus === 'DISCREPANCY' && toggleExpanded(code)}
                                    >
                                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                            <div className="flex items-center space-x-4">
                                                {hasDetails && displayStatus === 'DISCREPANCY' ? (
                                                    isExpanded ? (
                                                        <ChevronDown className="h-5 w-5 text-gray-400" />
                                                    ) : (
                                                        <ChevronRight className="h-5 w-5 text-gray-400" />
                                                    )
                                                ) : (
                                                    <div className="w-5" />
                                                )}
                                                <div>
                                                    <p className="font-medium text-gray-900">{account.accountName}</p>
                                                    <p className="text-sm text-gray-500">Account {code}</p>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center sm:space-x-8 ml-9 sm:ml-0">
                                                <div className="text-left sm:text-right">
                                                    <p className="text-xs sm:text-sm text-gray-500">{glLabel}</p>
                                                    <p className="text-sm sm:text-base font-semibold">{formatCurrency(displayGl)}</p>
                                                </div>
                                                <div className="text-left sm:text-right">
                                                    <p className="text-xs sm:text-sm text-gray-500">{subLabel}</p>
                                                    <p className="text-sm sm:text-base font-semibold">{formatCurrency(displaySubledger)}</p>
                                                </div>
                                                <div className="text-left sm:text-right">
                                                    <p className="text-xs sm:text-sm text-gray-500">{diffLabel}</p>
                                                    <p className={`text-sm sm:text-base font-semibold ${Math.abs(displayDiff) < 0.01 ? 'text-green-600' : 'text-red-600'}`}>
                                                        {formatCurrency(displayDiff)}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 ml-9 sm:ml-0">
                                                <div>
                                                    {displayStatus === 'MATCHED' ? (
                                                        <span className="inline-flex items-center px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium bg-green-100 text-green-800">
                                                            <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                                                            Matched
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium bg-red-100 text-red-800">
                                                            <AlertTriangle className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                                                            Discrepancy
                                                        </span>
                                                    )}
                                                </div>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedAccount(accountRoutes[account.accountName]);
                                                    }}
                                                    className="px-3 py-1 text-sm text-blue-600 hover:text-blue-700 font-medium"
                                                >
                                                    Details
                                                </button>
                                                {displayStatus === 'DISCREPANCY' && !isAp && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            openAdjustingEntry(account);
                                                        }}
                                                        className="px-3 py-1 text-sm bg-amber-100 text-amber-800 hover:bg-amber-200 rounded font-medium flex items-center space-x-1"
                                                    >
                                                        <FileText className="h-3 w-3" />
                                                        <span>Adjust</span>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        {account.recommendation && displayStatus === 'DISCREPANCY' && !isAp && (
                                            <p className="mt-2 text-sm text-gray-500 ml-9">{account.recommendation}</p>
                                        )}
                                    </div>

                                    {/* Expanded discrepancy details */}
                                    {isExpanded && discrepancies && discrepancies.length > 0 && (
                                        <div className="px-6 py-4 bg-gray-50 border-t">
                                            <p className="text-sm font-medium text-gray-700 mb-3">
                                                Entities with discrepancies:
                                            </p>
                                            <ResponsiveTableWrapper>
                                                <table className="w-full text-sm">
                                                    <thead>
                                                        <tr className="text-gray-500">
                                                            <th className="text-left py-2">Name</th>
                                                            <th className="text-right py-2">GL Balance</th>
                                                            <th className="text-right py-2">Open-item Subledger</th>
                                                            <th className="text-right py-2">Integrity Difference</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y">
                                                        {discrepancies.map((d: { entityName: string; glBalance: number; subledgerBalance: number; difference: number }, dIdx: number) => (
                                                            <tr key={dIdx}>
                                                                <td className="py-2">{d.entityName}</td>
                                                                <td className="py-2 text-right">{formatCurrency(d.glBalance)}</td>
                                                                <td className="py-2 text-right">{formatCurrency(d.subledgerBalance)}</td>
                                                                <td className="py-2 text-right text-red-600">{formatCurrency(d.difference)}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </ResponsiveTableWrapper>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
                </>
            ) : !summaryLoading && !summaryError ? (
                <div className="mb-6 p-4 rounded-lg border border-amber-200 bg-amber-50 text-amber-900 text-sm">
                    No reconciliation data returned for {asOfDate}. If this persists after Refresh,
                    ask an admin to verify the database function{' '}
                    <code className="text-xs bg-amber-100 px-1 rounded">fn_full_reconciliation_report</code>{' '}
                    is deployed for this tenant.
                </div>
            ) : null}

            {/* Reconciliation Details Modal */}
            <Dialog open={!!selectedAccount} onOpenChange={(open) => !open && setSelectedAccount(null)}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center justify-between">
                            <span>{accountDetail?.accountName || selectedAccount} Details</span>
                        </DialogTitle>
                    </DialogHeader>

                    {accountLoading ? (
                        <div className="flex justify-center py-12">
                            <RefreshCw className="h-8 w-8 text-gray-400 animate-spin" />
                        </div>
                    ) : accountDetail ? (
                        <div className="space-y-6">
                            {/* Summary Cards */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="bg-gray-50 rounded-lg p-4 min-w-0">
                                    <p className="text-sm text-gray-500">
                                        {selectedAccount === 'accounts-payable' ? 'GL (Net Active)' : 'GL Balance'}
                                    </p>
                                    <p className="text-base sm:text-xl font-bold">{formatCurrency(accountDetail.glBalance)}</p>
                                </div>
                                <div className="bg-gray-50 rounded-lg p-4 min-w-0">
                                    <p className="text-sm text-gray-500">
                                        {selectedAccount === 'accounts-payable' ? 'Open-item Subledger' : 'Subledger Balance'}
                                    </p>
                                    <p className="text-base sm:text-xl font-bold">{formatCurrency(accountDetail.subledgerBalance)}</p>
                                </div>
                                <div className="bg-gray-50 rounded-lg p-4 min-w-0">
                                    <p className="text-sm text-gray-500">
                                        {selectedAccount === 'accounts-payable' ? 'Integrity Difference' : 'Difference'}
                                    </p>
                                    <p className={`text-base sm:text-xl font-bold ${Math.abs(accountDetail.difference) < 0.01 ? 'text-green-600' : 'text-red-600'}`}>
                                        {formatCurrency(accountDetail.difference)}
                                    </p>
                                </div>
                                <div className="bg-gray-50 rounded-lg p-4 min-w-0">
                                    <p className="text-sm text-gray-500">Status</p>
                                    <p className={`text-base sm:text-xl font-bold ${accountDetail.status === 'RECONCILED' ? 'text-green-600' : 'text-red-600'}`}>
                                        {accountDetail.status}
                                    </p>
                                </div>
                            </div>

                            {/* Reconciliation Items Table */}
                            <div>
                                <h3 className="font-semibold mb-3">Reconciliation Items</h3>
                                <div className="border rounded-lg overflow-hidden">
                                    <ResponsiveTableWrapper>
                                        <table className="w-full text-sm">
                                            <thead className="bg-gray-50">
                                                <tr>
                                                    <th className="text-left px-4 py-3 font-medium">Source</th>
                                                    <th className="text-left px-4 py-3 font-medium">Description</th>
                                                    <th className="text-right px-4 py-3 font-medium">Amount</th>
                                                    <th className="text-right px-4 py-3 font-medium">Difference</th>
                                                    <th className="text-center px-4 py-3 font-medium">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y">
                                                {accountDetail.items?.map((item: { source: string; description: string; amount: number; difference: number; status: string }, idx: number) => (
                                                    <tr key={idx} className="hover:bg-gray-50">
                                                        <td className="px-4 py-3 font-mono text-xs">{item.source}</td>
                                                        <td className="px-4 py-3">{item.description}</td>
                                                        <td className="px-4 py-3 text-right">{formatCurrency(item.amount)}</td>
                                                        <td className={`px-4 py-3 text-right ${Math.abs(item.difference) > 0.01 ? 'text-red-600 font-medium' : ''}`}>
                                                            {formatCurrency(item.difference)}
                                                        </td>
                                                        <td className="px-4 py-3 text-center">
                                                            <span className={`px-2 py-1 rounded text-xs font-medium ${item.status === 'MATCHED' ? 'bg-green-100 text-green-800' :
                                                                item.status === 'BASE' ? 'bg-blue-100 text-blue-800' :
                                                                    item.status === 'DISCREPANCY' ? 'bg-red-100 text-red-800' :
                                                                        item.status === 'ACTION_REQUIRED' ? 'bg-yellow-100 text-yellow-800' :
                                                                            'bg-gray-100 text-gray-800'
                                                                }`}>
                                                                {item.status}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </ResponsiveTableWrapper>
                                </div>
                            </div>

                            {/* Recommendations */}
                            {(accountDetail.recommendations?.length ?? 0) > 0 && (
                                <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                                    <h3 className="font-semibold text-yellow-800 mb-2">Recommendations</h3>
                                    <ul className="list-disc list-inside space-y-1">
                                        {(accountDetail.recommendations ?? []).map((rec: string, idx: number) => (
                                            <li key={idx} className="text-sm text-yellow-700">{rec}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="py-8 text-center text-gray-500">
                            No data available
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
