import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '../ui/dialog';
import { ResponsiveTableWrapper } from '../ui/ResponsiveTableWrapper';
import { apiClient, type ApiResponse } from '../../utils/api';
import { formatCurrency } from '../../utils/currency';
import { toBusinessLabel } from '../../lib/financialBusinessLabels';

type AccountType = 'cash' | 'accounts-receivable' | 'inventory' | 'accounts-payable';

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

async function fetchAccountReconciliation(
    account: string,
    asOfDate?: string,
): Promise<ReconciliationDetail | undefined> {
    const response = await apiClient.get<ApiResponse<ReconciliationDetail>>(
        `/erp-accounting/reconciliation/${account}`,
        { params: asOfDate ? { asOfDate } : undefined },
    );
    return response.data.data;
}

interface Props {
    selectedAccount: AccountType | null;
    asOfDate: string;
    onClose: () => void;
}

export function AccountDetailModal({ selectedAccount, asOfDate, onClose }: Props) {
    const navigate = useNavigate();

    const { data: accountDetail, isLoading } = useQuery({
        queryKey: ['reconciliation-account', selectedAccount, asOfDate],
        queryFn: () => (selectedAccount ? fetchAccountReconciliation(selectedAccount, asOfDate) : undefined),
        enabled: !!selectedAccount,
        staleTime: 30_000,
    });

    const journalPath = '/accounting/journal-entries';

    return (
        <Dialog open={!!selectedAccount} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{accountDetail?.accountName ?? selectedAccount} — details</DialogTitle>
                </DialogHeader>

                {isLoading ? (
                    <div className="flex justify-center py-12">
                        <RefreshCw className="h-8 w-8 text-gray-400 animate-spin" />
                    </div>
                ) : accountDetail ? (
                    <div className="space-y-6">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="bg-gray-50 rounded-lg p-4 min-w-0">
                                <p className="text-sm text-gray-500">General ledger balance</p>
                                <p className="text-base sm:text-xl font-bold">
                                    {formatCurrency(accountDetail.glBalance)}
                                </p>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-4 min-w-0">
                                <p className="text-sm text-gray-500">Supporting balance</p>
                                <p className="text-base sm:text-xl font-bold">
                                    {formatCurrency(accountDetail.subledgerBalance)}
                                </p>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-4 min-w-0">
                                <p className="text-sm text-gray-500">Difference</p>
                                <p
                                    className={`text-base sm:text-xl font-bold ${
                                        Math.abs(accountDetail.difference) < 0.01
                                            ? 'text-green-600'
                                            : 'text-red-600'
                                    }`}
                                >
                                    {formatCurrency(accountDetail.difference)}
                                </p>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-4 min-w-0">
                                <p className="text-sm text-gray-500">Status</p>
                                <p
                                    className={`text-base sm:text-xl font-bold ${
                                        accountDetail.status === 'RECONCILED' ? 'text-green-600' : 'text-red-600'
                                    }`}
                                >
                                    {accountDetail.status === 'RECONCILED' ? 'Reconciled' : 'Needs review'}
                                </p>
                            </div>
                        </div>

                        {Math.abs(accountDetail.difference) > 0.01 && (
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        onClose();
                                        navigate(journalPath);
                                    }}
                                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                                >
                                    Create journal entry
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        onClose();
                                        navigate('/accounting/general-ledger');
                                    }}
                                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                                >
                                    View ledger
                                </button>
                            </div>
                        )}

                        <div>
                            <h3 className="font-semibold mb-3">Source documents</h3>
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
                                            {accountDetail.items?.map((item, idx) => (
                                                <tr key={idx} className="hover:bg-gray-50">
                                                    <td className="px-4 py-3 text-xs">{item.source}</td>
                                                    <td className="px-4 py-3">{item.description}</td>
                                                    <td className="px-4 py-3 text-right">
                                                        {formatCurrency(item.amount)}
                                                    </td>
                                                    <td
                                                        className={`px-4 py-3 text-right ${
                                                            Math.abs(item.difference) > 0.01
                                                                ? 'text-red-600 font-medium'
                                                                : ''
                                                        }`}
                                                    >
                                                        {formatCurrency(item.difference)}
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <span
                                                            className={`px-2 py-1 rounded text-xs font-medium ${
                                                                item.status === 'MATCHED'
                                                                    ? 'bg-green-100 text-green-800'
                                                                    : item.status === 'DISCREPANCY'
                                                                      ? 'bg-red-100 text-red-800'
                                                                      : 'bg-gray-100 text-gray-800'
                                                            }`}
                                                        >
                                                            {toBusinessLabel(item.status)}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </ResponsiveTableWrapper>
                            </div>
                        </div>

                        {(accountDetail.recommendations?.length ?? 0) > 0 && (
                            <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                                <h3 className="font-semibold text-yellow-800 mb-2">Recommended actions</h3>
                                <ul className="list-disc list-inside space-y-1">
                                    {(accountDetail.recommendations ?? []).map((rec, idx) => (
                                        <li key={idx} className="text-sm text-yellow-700">
                                            {rec}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="py-8 text-center text-gray-500">No data available</div>
                )}
            </DialogContent>
        </Dialog>
    );
}
