/**
 * BANK REPORTS TAB
 * 
 * Display banking reports including:
 * - Account summaries
 * - Activity reports
 * - Cash position
 */

import React, { useState } from 'react';
import { BarChart3, TrendingUp, Wallet, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
    useAccountSummaries,
    useActivityReport,
    useCashPositionReport,
    useBankAccounts,
} from '../../hooks/useBanking';
import { formatCurrency } from '../../utils/currency';

type ReportType = 'summaries' | 'activity' | 'cash-position';

export const BankReportsTab: React.FC = () => {
    const [activeReport, setActiveReport] = useState<ReportType>('summaries');
    const [selectedAccountId, setSelectedAccountId] = useState<string>('');
    const [periodStart, setPeriodStart] = useState(() => {
        const date = new Date();
        date.setMonth(date.getMonth() - 1);
        return date.toISOString().split('T')[0];
    });
    const [periodEnd, setPeriodEnd] = useState(() => new Date().toISOString().split('T')[0]);
    const [asOfDate, setAsOfDate] = useState(() => new Date().toISOString().split('T')[0]);

    const { data: accounts = [] } = useBankAccounts();
    const { data: summaries = [], isLoading: loadingSummaries, refetch: refetchSummaries } = useAccountSummaries();
    const { data: activityReport, isLoading: loadingActivity, refetch: refetchActivity } = useActivityReport(
        selectedAccountId || null,
        periodStart,
        periodEnd
    );
    const { data: cashPosition, isLoading: loadingCash, refetch: refetchCash } = useCashPositionReport(asOfDate);

    const reportButtons = [
        { id: 'summaries' as ReportType, label: 'Account Summaries', icon: BarChart3 },
        { id: 'activity' as ReportType, label: 'Activity Report', icon: TrendingUp },
        { id: 'cash-position' as ReportType, label: 'Cash Position', icon: Wallet },
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold">Bank Reports</h2>
                    <p className="text-muted-foreground">
                        View account summaries, activity reports, and cash position
                    </p>
                </div>
            </div>

            {/* Report Type Selector */}
            <div className="flex gap-2">
                {reportButtons.map(({ id, label, icon: Icon }) => (
                    <Button
                        key={id}
                        variant={activeReport === id ? 'default' : 'outline'}
                        onClick={() => setActiveReport(id)}
                        className="flex items-center gap-2"
                    >
                        <Icon className="h-4 w-4" />
                        {label}
                    </Button>
                ))}
            </div>

            {/* Account Summaries Report */}
            {activeReport === 'summaries' && (
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                            <CardTitle>Account Summaries</CardTitle>
                            <CardDescription>Overview of all bank accounts with key metrics</CardDescription>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => refetchSummaries()}>
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Refresh
                        </Button>
                    </CardHeader>
                    <CardContent>
                        {loadingSummaries ? (
                            <div className="text-center py-8">Loading...</div>
                        ) : summaries.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">No account data available</div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Account</TableHead>
                                        <TableHead className="text-right">Current Balance</TableHead>
                                        <TableHead className="text-right">Last Reconciled</TableHead>
                                        <TableHead className="text-right">Unreconciled</TableHead>
                                        <TableHead className="text-right">Deposits (MTD)</TableHead>
                                        <TableHead className="text-right">Withdrawals (MTD)</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {summaries.map((summary) => (
                                        <TableRow key={summary.id}>
                                            <TableCell>
                                                <div className="font-medium">{summary.name}</div>
                                                <div className="text-sm text-muted-foreground">{summary.bankName}</div>
                                            </TableCell>
                                            <TableCell className="text-right font-medium">
                                                {formatCurrency(summary.currentBalance)}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {summary.lastReconciledAt ? (
                                                    <div>
                                                        <div>{formatCurrency(summary.lastReconciledBalance || 0)}</div>
                                                        <div className="text-xs text-muted-foreground">
                                                            {new Date(summary.lastReconciledAt).toLocaleDateString()}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <span className="text-muted-foreground">Never</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Badge variant={summary.unreconciledCount > 0 ? 'destructive' : 'secondary'}>
                                                    {summary.unreconciledCount} items
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right text-green-600">
                                                +{formatCurrency(summary.totalDepositsThisMonth)}
                                            </TableCell>
                                            <TableCell className="text-right text-red-600">
                                                -{formatCurrency(summary.totalWithdrawalsThisMonth)}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Activity Report */}
            {activeReport === 'activity' && (
                <Card>
                    <CardHeader>
                        <CardTitle>Activity Report</CardTitle>
                        <CardDescription>Detailed transaction activity by category for a specific account</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* Filters */}
                        <div className="flex gap-4 items-end">
                            <div className="space-y-2">
                                <Label>Bank Account</Label>
                                <select
                                    aria-label="Bank Account"
                                    className="h-10 px-3 border rounded-md bg-background min-w-[200px]"
                                    value={selectedAccountId}
                                    onChange={(e) => setSelectedAccountId(e.target.value)}
                                >
                                    <option value="">Select account...</option>
                                    {accounts.map((acc) => (
                                        <option key={acc.id} value={acc.id}>{acc.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-2">
                                <Label>Period Start</Label>
                                <Input
                                    type="date"
                                    value={periodStart}
                                    onChange={(e) => setPeriodStart(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Period End</Label>
                                <Input
                                    type="date"
                                    value={periodEnd}
                                    onChange={(e) => setPeriodEnd(e.target.value)}
                                />
                            </div>
                            <Button variant="outline" onClick={() => refetchActivity()} disabled={!selectedAccountId}>
                                <RefreshCw className="h-4 w-4 mr-2" />
                                Generate
                            </Button>
                        </div>

                        {/* Report Content */}
                        {!selectedAccountId ? (
                            <div className="text-center py-8 text-muted-foreground">
                                Select an account to generate the activity report
                            </div>
                        ) : loadingActivity ? (
                            <div className="text-center py-8">Loading...</div>
                        ) : activityReport ? (
                            <div className="space-y-6">
                                {/* Summary */}
                                <div className="grid grid-cols-4 gap-4">
                                    <Card>
                                        <CardContent className="pt-4">
                                            <div className="text-sm text-muted-foreground">Opening Balance</div>
                                            <div className="text-2xl font-bold">{formatCurrency(activityReport.openingBalance)}</div>
                                        </CardContent>
                                    </Card>
                                    <Card>
                                        <CardContent className="pt-4">
                                            <div className="text-sm text-muted-foreground">Total Deposits</div>
                                            <div className="text-2xl font-bold text-green-600">+{formatCurrency(activityReport.totalDeposits)}</div>
                                        </CardContent>
                                    </Card>
                                    <Card>
                                        <CardContent className="pt-4">
                                            <div className="text-sm text-muted-foreground">Total Withdrawals</div>
                                            <div className="text-2xl font-bold text-red-600">-{formatCurrency(activityReport.totalWithdrawals)}</div>
                                        </CardContent>
                                    </Card>
                                    <Card>
                                        <CardContent className="pt-4">
                                            <div className="text-sm text-muted-foreground">Closing Balance</div>
                                            <div className="text-2xl font-bold">{formatCurrency(activityReport.closingBalance)}</div>
                                        </CardContent>
                                    </Card>
                                </div>

                                {/* Category Breakdown */}
                                {activityReport.categories && activityReport.categories.length > 0 && (
                                    <div>
                                        <h3 className="text-lg font-semibold mb-3">By Category</h3>
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Category</TableHead>
                                                    <TableHead>Direction</TableHead>
                                                    <TableHead className="text-right">Transactions</TableHead>
                                                    <TableHead className="text-right">Total Amount</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {activityReport.categories.map((cat, idx) => (
                                                    <TableRow key={idx}>
                                                        <TableCell>
                                                            <div className="font-medium">{cat.categoryName}</div>
                                                            <div className="text-xs text-muted-foreground">{cat.categoryCode}</div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <Badge variant={cat.direction === 'IN' ? 'default' : 'secondary'}>
                                                                {cat.direction}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell className="text-right">{cat.transactionCount}</TableCell>
                                                        <TableCell className={`text-right font-medium ${cat.direction === 'IN' ? 'text-green-600' : 'text-red-600'}`}>
                                                            {cat.direction === 'IN' ? '+' : '-'}{formatCurrency(cat.totalAmount)}
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                )}
                            </div>
                        ) : null}
                    </CardContent>
                </Card>
            )}

            {/* Cash Position Report */}
            {activeReport === 'cash-position' && (
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                            <CardTitle>Cash Position</CardTitle>
                            <CardDescription>Current cash position across all bank accounts</CardDescription>
                        </div>
                        <div className="flex gap-2 items-end">
                            <div className="space-y-2">
                                <Label>As of Date</Label>
                                <Input
                                    type="date"
                                    value={asOfDate}
                                    onChange={(e) => setAsOfDate(e.target.value)}
                                />
                            </div>
                            <Button variant="outline" onClick={() => refetchCash()}>
                                <RefreshCw className="h-4 w-4 mr-2" />
                                Refresh
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {loadingCash ? (
                            <div className="text-center py-8">Loading...</div>
                        ) : cashPosition ? (
                            <div className="space-y-6">
                                {/* Total Summary */}
                                <div className="grid grid-cols-2 gap-4">
                                    <Card className="bg-primary/5">
                                        <CardContent className="pt-4">
                                            <div className="text-sm text-muted-foreground">Total Cash Balance</div>
                                            <div className="text-3xl font-bold">{formatCurrency(cashPosition.totalCashBalance)}</div>
                                            <div className="text-xs text-muted-foreground mt-1">
                                                As of {new Date(cashPosition.asOfDate).toLocaleDateString()}
                                            </div>
                                        </CardContent>
                                    </Card>
                                    <Card className={cashPosition.totalUnreconciledAmount !== 0 ? 'bg-destructive/5' : 'bg-green-50'}>
                                        <CardContent className="pt-4">
                                            <div className="text-sm text-muted-foreground">Unreconciled Amount</div>
                                            <div className="text-3xl font-bold">
                                                {formatCurrency(Math.abs(cashPosition.totalUnreconciledAmount))}
                                            </div>
                                            <div className="text-xs text-muted-foreground mt-1">
                                                {cashPosition.totalUnreconciledAmount === 0 ? 'Fully reconciled' : 'Needs attention'}
                                            </div>
                                        </CardContent>
                                    </Card>
                                </div>

                                {/* Account Breakdown */}
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Account</TableHead>
                                            <TableHead className="text-right">Balance</TableHead>
                                            <TableHead className="text-right">Last Reconciled</TableHead>
                                            <TableHead className="text-right">Unreconciled</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {cashPosition.accounts.map((acc) => (
                                            <TableRow key={acc.id}>
                                                <TableCell>
                                                    <div className="font-medium">{acc.name}</div>
                                                    {acc.bankName && <div className="text-sm text-muted-foreground">{acc.bankName}</div>}
                                                </TableCell>
                                                <TableCell className="text-right font-medium">
                                                    {formatCurrency(acc.balance)}
                                                </TableCell>
                                                <TableCell className="text-right text-sm text-muted-foreground">
                                                    {acc.lastReconciled ? new Date(acc.lastReconciled).toLocaleDateString() : 'Never'}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <span className={acc.unreconciledAmount !== 0 ? 'text-destructive' : 'text-green-600'}>
                                                        {formatCurrency(Math.abs(acc.unreconciledAmount))}
                                                    </span>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        ) : (
                            <div className="text-center py-8 text-muted-foreground">No data available</div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
};

export default BankReportsTab;
