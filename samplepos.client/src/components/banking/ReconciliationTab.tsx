/**
 * RECONCILIATION TAB
 * 
 * Bank reconciliation workflow:
 * 1. Select account and enter statement balance
 * 2. View unreconciled transactions
 * 3. Check off transactions that match statement
 * 4. Submit reconciliation
 */

import React, { useState, useMemo } from 'react';
import Decimal from 'decimal.js';
import { CheckCircle2, Circle, Calculator } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
    useBankAccounts,
    useBankTransactions,
    useReconcileTransactions
} from '../../hooks/useBanking';
import { formatCurrency } from '../../utils/currency';

export const ReconciliationTab: React.FC = () => {
    const [selectedAccountId, setSelectedAccountId] = useState<string>('');
    const [statementBalance, setStatementBalance] = useState<string>('');
    const [statementDate, setStatementDate] = useState(new Date().toLocaleDateString('en-CA'));
    const [selectedTransactionIds, setSelectedTransactionIds] = useState<Set<string>>(new Set());
    const [showReconciled, setShowReconciled] = useState(false);
    const [reconcileResult, setReconcileResult] = useState<{ reconciledCount: number; newBalance: number } | null>(null);

    const { data: accounts = [] } = useBankAccounts();
    const { data: transactionsData } = useBankTransactions({
        bankAccountId: selectedAccountId || undefined,
        isReconciled: showReconciled ? undefined : false,
        limit: 500
    });
    const reconcileMutation = useReconcileTransactions();

    const transactions = transactionsData?.transactions || [];
    const selectedAccount = accounts.find(a => a.id === selectedAccountId);

    // Calculate totals
    const totals = useMemo(() => {
        const selected = transactions.filter(t => selectedTransactionIds.has(t.id));
        const unselected = transactions.filter(t => !selectedTransactionIds.has(t.id) && !t.isReconciled);

        const selectedDeposits = selected
            .filter(t => ['DEPOSIT', 'TRANSFER_IN', 'INTEREST'].includes(t.type))
            .reduce((sum, t) => new Decimal(sum).plus(t.amount).toNumber(), 0);

        const selectedWithdrawals = selected
            .filter(t => ['WITHDRAWAL', 'TRANSFER_OUT', 'FEE'].includes(t.type))
            .reduce((sum, t) => new Decimal(sum).plus(t.amount).toNumber(), 0);

        const unselectedDeposits = unselected
            .filter(t => ['DEPOSIT', 'TRANSFER_IN', 'INTEREST'].includes(t.type))
            .reduce((sum, t) => new Decimal(sum).plus(t.amount).toNumber(), 0);

        const unselectedWithdrawals = unselected
            .filter(t => ['WITHDRAWAL', 'TRANSFER_OUT', 'FEE'].includes(t.type))
            .reduce((sum, t) => new Decimal(sum).plus(t.amount).toNumber(), 0);

        return {
            selectedDeposits,
            selectedWithdrawals,
            selectedNet: new Decimal(selectedDeposits).minus(selectedWithdrawals).toNumber(),
            unselectedDeposits,
            unselectedWithdrawals,
            unselectedNet: new Decimal(unselectedDeposits).minus(unselectedWithdrawals).toNumber(),
            selectedCount: selected.length,
            unselectedCount: unselected.length
        };
    }, [transactions, selectedTransactionIds]);

    // Calculate difference
    const difference = useMemo(() => {
        if (!statementBalance || !selectedAccount) return null;
        const stmtBal = parseFloat(statementBalance);
        if (isNaN(stmtBal)) return null;

        // Expected book balance after reconciliation = last reconciled + selected transactions
        const lastReconciled = selectedAccount.lastReconciledBalance || 0;
        const expectedBook = lastReconciled + totals.selectedNet;
        return stmtBal - expectedBook;
    }, [statementBalance, selectedAccount, totals.selectedNet]);

    const handleToggleTransaction = (transactionId: string) => {
        setSelectedTransactionIds(prev => {
            const next = new Set(prev);
            if (next.has(transactionId)) {
                next.delete(transactionId);
            } else {
                next.add(transactionId);
            }
            return next;
        });
    };

    const handleSelectAll = () => {
        const unreconciledIds = transactions
            .filter(t => !t.isReconciled && !t.isReversed)
            .map(t => t.id);
        setSelectedTransactionIds(new Set(unreconciledIds));
    };

    const handleSelectNone = () => {
        setSelectedTransactionIds(new Set());
    };

    const handleReconcile = async () => {
        if (!selectedAccountId || selectedTransactionIds.size === 0) return;

        const stmtBal = parseFloat(statementBalance);
        if (isNaN(stmtBal)) {
            alert('Please enter a valid statement balance');
            return;
        }

        try {
            const result = await reconcileMutation.mutateAsync({
                bankAccountId: selectedAccountId,
                transactionIds: Array.from(selectedTransactionIds),
                statementBalance: stmtBal
            });

            setReconcileResult(result);
            setSelectedTransactionIds(new Set());
        } catch (error) {
            alert((error as Error).message);
        }
    };

    const getTransactionSign = (type: string) => {
        return ['DEPOSIT', 'TRANSFER_IN', 'INTEREST'].includes(type) ? '+' : '-';
    };

    const getTransactionColor = (type: string) => {
        return ['DEPOSIT', 'TRANSFER_IN', 'INTEREST'].includes(type)
            ? 'text-green-600'
            : 'text-red-600';
    };

    return (
        <div className="space-y-6">
            {/* Reconciliation Setup */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Calculator className="h-5 w-5" />
                        Bank Reconciliation
                    </CardTitle>
                    <CardDescription>
                        Match your bank statement with recorded transactions
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="space-y-2">
                            <Label>Bank Account</Label>
                            <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select account..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {accounts.map(acc => (
                                        <SelectItem key={acc.id} value={acc.id}>
                                            {acc.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Statement Date</Label>
                            <Input
                                type="date"
                                value={statementDate}
                                onChange={(e) => setStatementDate(e.target.value)}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Statement Ending Balance</Label>
                            <Input
                                type="number"
                                step="0.01"
                                value={statementBalance}
                                onChange={(e) => setStatementBalance(e.target.value)}
                                placeholder="0.00"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Last Reconciled Balance</Label>
                            <div className="h-10 flex items-center px-3 border rounded-md bg-muted">
                                {selectedAccount?.lastReconciledBalance !== undefined
                                    ? formatCurrency(selectedAccount.lastReconciledBalance)
                                    : 'N/A'}
                            </div>
                        </div>
                    </div>

                    {selectedAccount?.lastReconciledAt && (
                        <p className="text-sm text-muted-foreground">
                            Last reconciled: {new Date(selectedAccount.lastReconciledAt).toLocaleDateString()}
                        </p>
                    )}
                </CardContent>
            </Card>

            {/* Reconciliation Summary */}
            {selectedAccountId && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">Selected for Reconciliation</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{totals.selectedCount} transactions</div>
                            <div className="text-sm text-muted-foreground">
                                <span className="text-green-600">+{formatCurrency(totals.selectedDeposits)}</span>
                                {' / '}
                                <span className="text-red-600">-{formatCurrency(totals.selectedWithdrawals)}</span>
                            </div>
                            <div className="text-sm font-medium mt-1">
                                Net: {formatCurrency(totals.selectedNet)}
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">Unselected Transactions</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{totals.unselectedCount} transactions</div>
                            <div className="text-sm text-muted-foreground">
                                Deposits in transit or outstanding checks
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">Reconciliation Difference</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className={`text-2xl font-bold ${difference !== null && Math.abs(difference) > 0.01
                                    ? 'text-red-600'
                                    : 'text-green-600'
                                }`}>
                                {difference !== null ? formatCurrency(difference) : '—'}
                            </div>
                            <div className="text-sm text-muted-foreground">
                                {difference !== null && Math.abs(difference) <= 0.01
                                    ? '✓ Balanced'
                                    : 'Should be zero when balanced'}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Result Alert */}
            {reconcileResult && (
                <Alert>
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertTitle>Reconciliation Complete</AlertTitle>
                    <AlertDescription>
                        {reconcileResult.reconciledCount} transactions marked as reconciled.
                        New balance: {formatCurrency(reconcileResult.newBalance)}
                    </AlertDescription>
                </Alert>
            )}

            {/* Transaction List */}
            {selectedAccountId && (
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle>Transactions to Reconcile</CardTitle>
                                <CardDescription>
                                    Check off transactions that appear on your bank statement
                                </CardDescription>
                            </div>
                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={handleSelectAll}>
                                    Select All
                                </Button>
                                <Button variant="outline" size="sm" onClick={handleSelectNone}>
                                    Select None
                                </Button>
                                <Button
                                    variant="default"
                                    size="sm"
                                    onClick={handleReconcile}
                                    disabled={selectedTransactionIds.size === 0 || reconcileMutation.isPending}
                                >
                                    {reconcileMutation.isPending ? 'Reconciling...' : 'Reconcile Selected'}
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="mb-4">
                            <label className="flex items-center gap-2 text-sm">
                                <Checkbox
                                    checked={showReconciled}
                                    onCheckedChange={(checked) => setShowReconciled(!!checked)}
                                />
                                Show already reconciled transactions
                            </label>
                        </div>

                        {transactions.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                <Circle className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                                <p>No unreconciled transactions found</p>
                            </div>
                        ) : (
                            <div className="rounded-md border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-12">
                                                <Checkbox
                                                    checked={selectedTransactionIds.size === transactions.filter(t => !t.isReconciled).length}
                                                    onCheckedChange={(checked) => checked ? handleSelectAll() : handleSelectNone()}
                                                />
                                            </TableHead>
                                            <TableHead>Date</TableHead>
                                            <TableHead>Description</TableHead>
                                            <TableHead>Reference</TableHead>
                                            <TableHead>Type</TableHead>
                                            <TableHead className="text-right">Amount</TableHead>
                                            <TableHead>Status</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {transactions.map(txn => (
                                            <TableRow
                                                key={txn.id}
                                                className={txn.isReconciled ? 'bg-muted/30' : undefined}
                                            >
                                                <TableCell>
                                                    <Checkbox
                                                        checked={selectedTransactionIds.has(txn.id) || txn.isReconciled}
                                                        disabled={txn.isReconciled}
                                                        onCheckedChange={() => handleToggleTransaction(txn.id)}
                                                    />
                                                </TableCell>
                                                <TableCell className="whitespace-nowrap">
                                                    {new Date(txn.transactionDate).toLocaleDateString()}
                                                </TableCell>
                                                <TableCell className="max-w-xs truncate" title={txn.description}>
                                                    {txn.description}
                                                </TableCell>
                                                <TableCell className="text-muted-foreground">
                                                    {txn.reference || '—'}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline" className="capitalize">
                                                        {txn.type.toLowerCase().replace('_', ' ')}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className={`text-right font-medium ${getTransactionColor(txn.type)}`}>
                                                    {getTransactionSign(txn.type)}{formatCurrency(txn.amount)}
                                                </TableCell>
                                                <TableCell>
                                                    {txn.isReconciled ? (
                                                        <Badge variant="default" className="bg-green-100 text-green-800">
                                                            <CheckCircle2 className="h-3 w-3 mr-1" />
                                                            Reconciled
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="secondary">Pending</Badge>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
};

export default ReconciliationTab;
