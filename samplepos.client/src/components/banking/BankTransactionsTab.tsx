/**
 * BANK TRANSACTIONS TAB
 * 
 * Displays bank transactions with filtering, manual entry, and transfers.
 */

import React, { useState, useMemo } from 'react';
import { Plus, ArrowUpRight, ArrowDownLeft, ArrowLeftRight, Search, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
    useBankAccounts,
    useBankTransactions,
    useBankCategories,
    useCreateBankTransaction,
    useCreateBankTransfer,
    useReverseBankTransaction,
    BankTransaction
} from '../../hooks/useBanking';
import { formatCurrency } from '../../utils/currency';

type TransactionFormData = {
    bankAccountId: string;
    transactionDate: string;
    type: 'DEPOSIT' | 'WITHDRAWAL' | 'FEE' | 'INTEREST';
    categoryId: string;
    description: string;
    reference: string;
    amount: number;
};

type TransferFormData = {
    fromAccountId: string;
    toAccountId: string;
    transactionDate: string;
    amount: number;
    description: string;
    reference: string;
};

const emptyTransactionForm: TransactionFormData = {
    bankAccountId: '',
    transactionDate: new Date().toLocaleDateString('en-CA'),
    type: 'DEPOSIT',
    categoryId: '',
    description: '',
    reference: '',
    amount: 0
};

const emptyTransferForm: TransferFormData = {
    fromAccountId: '',
    toAccountId: '',
    transactionDate: new Date().toLocaleDateString('en-CA'),
    amount: 0,
    description: '',
    reference: ''
};

export const BankTransactionsTab: React.FC = () => {
    const [filterAccountId, setFilterAccountId] = useState<string>('');
    const [filterType, setFilterType] = useState<string>('');
    const [searchText, setSearchText] = useState('');

    const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [isReverseModalOpen, setIsReverseModalOpen] = useState(false);
    const [selectedTransaction, setSelectedTransaction] = useState<BankTransaction | null>(null);
    const [reverseReason, setReverseReason] = useState('');

    const [transactionForm, setTransactionForm] = useState<TransactionFormData>(emptyTransactionForm);
    const [transferForm, setTransferForm] = useState<TransferFormData>(emptyTransferForm);

    const { data: accounts = [] } = useBankAccounts();
    const { data: categories = [] } = useBankCategories();
    const { data: transactionsData, isLoading, refetch } = useBankTransactions({
        bankAccountId: filterAccountId || undefined,
        type: filterType || undefined,
        limit: 100
    });

    const transactions = transactionsData?.transactions || [];

    const createTransactionMutation = useCreateBankTransaction();
    const createTransferMutation = useCreateBankTransfer();
    const reverseMutation = useReverseBankTransaction();

    // Filter by search text
    const filteredTransactions = useMemo(() => {
        if (!searchText) return transactions;
        const lower = searchText.toLowerCase();
        return transactions.filter(t =>
            t.description?.toLowerCase().includes(lower) ||
            t.reference?.toLowerCase().includes(lower) ||
            t.transactionNumber?.toLowerCase().includes(lower)
        );
    }, [transactions, searchText]);

    const handleOpenTransactionModal = () => {
        setTransactionForm({
            ...emptyTransactionForm,
            bankAccountId: filterAccountId || accounts[0]?.id || ''
        });
        setIsTransactionModalOpen(true);
    };

    const handleOpenTransferModal = () => {
        setTransferForm({
            ...emptyTransferForm,
            fromAccountId: accounts[0]?.id || '',
            toAccountId: accounts[1]?.id || ''
        });
        setIsTransferModalOpen(true);
    };

    const handleOpenReverseModal = (txn: BankTransaction) => {
        setSelectedTransaction(txn);
        setReverseReason('');
        setIsReverseModalOpen(true);
    };

    const handleSubmitTransaction = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await createTransactionMutation.mutateAsync({
                bankAccountId: transactionForm.bankAccountId,
                transactionDate: transactionForm.transactionDate,
                type: transactionForm.type,
                categoryId: transactionForm.categoryId || undefined,
                description: transactionForm.description,
                reference: transactionForm.reference || undefined,
                amount: transactionForm.amount
            });
            setIsTransactionModalOpen(false);
            refetch();
        } catch (error) {
            console.error('Failed to create transaction:', error);
        }
    };

    const handleSubmitTransfer = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await createTransferMutation.mutateAsync({
                fromAccountId: transferForm.fromAccountId,
                toAccountId: transferForm.toAccountId,
                transactionDate: transferForm.transactionDate,
                amount: transferForm.amount,
                description: transferForm.description || undefined,
                reference: transferForm.reference || undefined
            });
            setIsTransferModalOpen(false);
            refetch();
        } catch (error) {
            console.error('Failed to create transfer:', error);
        }
    };

    const handleReverseTransaction = async () => {
        if (!selectedTransaction || !reverseReason.trim()) return;
        try {
            await reverseMutation.mutateAsync({
                id: selectedTransaction.id,
                reason: reverseReason
            });
            setIsReverseModalOpen(false);
            setSelectedTransaction(null);
            refetch();
        } catch (error) {
            console.error('Failed to reverse transaction:', error);
        }
    };

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'DEPOSIT':
            case 'TRANSFER_IN':
            case 'INTEREST':
                return <ArrowDownLeft className="h-4 w-4 text-green-500" />;
            case 'WITHDRAWAL':
            case 'TRANSFER_OUT':
            case 'FEE':
                return <ArrowUpRight className="h-4 w-4 text-red-500" />;
            default:
                return <ArrowLeftRight className="h-4 w-4" />;
        }
    };

    const getTypeBadge = (type: string) => {
        const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
            DEPOSIT: 'default',
            WITHDRAWAL: 'destructive',
            TRANSFER_IN: 'secondary',
            TRANSFER_OUT: 'secondary',
            FEE: 'outline',
            INTEREST: 'default'
        };
        return <Badge variant={variants[type] || 'outline'}>{type.replace('_', ' ')}</Badge>;
    };

    if (isLoading) {
        return <div className="flex items-center justify-center py-8">Loading transactions...</div>;
    }

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle>Transactions</CardTitle>
                    <CardDescription>
                        View and manage bank transactions
                    </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={handleOpenTransferModal}>
                        <ArrowLeftRight className="h-4 w-4 mr-2" />
                        Transfer
                    </Button>
                    <Button onClick={handleOpenTransactionModal}>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Transaction
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Filters */}
                <div className="flex flex-wrap gap-4">
                    <div className="flex-1 min-w-[200px]">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search transactions..."
                                value={searchText}
                                onChange={e => setSearchText(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                    </div>
                    <Select value={filterAccountId || '_all'} onValueChange={(v) => setFilterAccountId(v === '_all' ? '' : v)}>
                        <SelectTrigger className="w-[200px]">
                            <SelectValue placeholder="All Accounts" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="_all">All Accounts</SelectItem>
                            {accounts.map(acc => (
                                <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select value={filterType || '_all'} onValueChange={(v) => setFilterType(v === '_all' ? '' : v)}>
                        <SelectTrigger className="w-[150px]">
                            <SelectValue placeholder="All Types" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="_all">All Types</SelectItem>
                            <SelectItem value="DEPOSIT">Deposit</SelectItem>
                            <SelectItem value="WITHDRAWAL">Withdrawal</SelectItem>
                            <SelectItem value="TRANSFER_IN">Transfer In</SelectItem>
                            <SelectItem value="TRANSFER_OUT">Transfer Out</SelectItem>
                            <SelectItem value="FEE">Fee</SelectItem>
                            <SelectItem value="INTEREST">Interest</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* Transactions Table */}
                {filteredTransactions.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                        <ArrowLeftRight className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No transactions found</p>
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Reference</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead>Account</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Category</TableHead>
                                <TableHead className="text-right">Amount</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredTransactions.map(txn => (
                                <TableRow key={txn.id}>
                                    <TableCell>{txn.transactionDate}</TableCell>
                                    <TableCell className="font-mono text-sm">
                                        {txn.transactionNumber}
                                    </TableCell>
                                    <TableCell className="max-w-[200px] truncate" title={txn.description}>
                                        {txn.description}
                                    </TableCell>
                                    <TableCell>{txn.bankAccountName || '-'}</TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            {getTypeIcon(txn.type)}
                                            {getTypeBadge(txn.type)}
                                        </div>
                                    </TableCell>
                                    <TableCell>{txn.categoryName || '-'}</TableCell>
                                    <TableCell className="text-right font-mono">
                                        <span className={
                                            ['DEPOSIT', 'TRANSFER_IN', 'INTEREST'].includes(txn.type)
                                                ? 'text-green-600'
                                                : 'text-red-600'
                                        }>
                                            {['DEPOSIT', 'TRANSFER_IN', 'INTEREST'].includes(txn.type) ? '+' : '-'}
                                            {formatCurrency(txn.amount)}
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        {txn.isReconciled ? (
                                            <Badge variant="secondary">Reconciled</Badge>
                                        ) : (
                                            <Badge variant="outline">Pending</Badge>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {!txn.isReconciled && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleOpenReverseModal(txn)}
                                                title="Reverse transaction"
                                            >
                                                <RotateCcw className="h-4 w-4" />
                                            </Button>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </CardContent>

            {/* Add Transaction Modal */}
            <Dialog open={isTransactionModalOpen} onOpenChange={setIsTransactionModalOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Add Transaction</DialogTitle>
                        <DialogDescription>
                            Record a manual bank transaction
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSubmitTransaction} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="txn-account">Bank Account *</Label>
                            <Select
                                value={transactionForm.bankAccountId}
                                onValueChange={value => setTransactionForm(prev => ({ ...prev, bankAccountId: value }))}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select account..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {accounts.map(acc => (
                                        <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="txn-date">Date *</Label>
                                <Input
                                    id="txn-date"
                                    type="date"
                                    value={transactionForm.transactionDate}
                                    onChange={e => setTransactionForm(prev => ({ ...prev, transactionDate: e.target.value }))}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="txn-type">Type *</Label>
                                <Select
                                    value={transactionForm.type}
                                    onValueChange={value => setTransactionForm(prev => ({
                                        ...prev,
                                        type: value as TransactionFormData['type']
                                    }))}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="DEPOSIT">Deposit</SelectItem>
                                        <SelectItem value="WITHDRAWAL">Withdrawal</SelectItem>
                                        <SelectItem value="FEE">Bank Fee</SelectItem>
                                        <SelectItem value="INTEREST">Interest</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="txn-category">Category</Label>
                            <Select
                                value={transactionForm.categoryId}
                                onValueChange={value => setTransactionForm(prev => ({ ...prev, categoryId: value }))}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select category..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {categories.map(cat => (
                                        <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="txn-amount">Amount *</Label>
                            <Input
                                id="txn-amount"
                                type="number"
                                step="0.01"
                                min="0.01"
                                value={transactionForm.amount || ''}
                                onChange={e => setTransactionForm(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))}
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="txn-description">Description *</Label>
                            <Input
                                id="txn-description"
                                value={transactionForm.description}
                                onChange={e => setTransactionForm(prev => ({ ...prev, description: e.target.value }))}
                                placeholder="Transaction description"
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="txn-reference">Reference</Label>
                            <Input
                                id="txn-reference"
                                value={transactionForm.reference}
                                onChange={e => setTransactionForm(prev => ({ ...prev, reference: e.target.value }))}
                                placeholder="Optional reference number"
                            />
                        </div>

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsTransactionModalOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={createTransactionMutation.isPending}>
                                {createTransactionMutation.isPending ? 'Saving...' : 'Save'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Transfer Modal */}
            <Dialog open={isTransferModalOpen} onOpenChange={setIsTransferModalOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Bank Transfer</DialogTitle>
                        <DialogDescription>
                            Transfer funds between bank accounts
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSubmitTransfer} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="transfer-from">From Account *</Label>
                            <Select
                                value={transferForm.fromAccountId}
                                onValueChange={value => setTransferForm(prev => ({ ...prev, fromAccountId: value }))}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select account..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {accounts.map(acc => (
                                        <SelectItem key={acc.id} value={acc.id}>
                                            {acc.name} ({formatCurrency(acc.currentBalance || 0)})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="transfer-to">To Account *</Label>
                            <Select
                                value={transferForm.toAccountId}
                                onValueChange={value => setTransferForm(prev => ({ ...prev, toAccountId: value }))}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select account..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {accounts
                                        .filter(acc => acc.id !== transferForm.fromAccountId)
                                        .map(acc => (
                                            <SelectItem key={acc.id} value={acc.id}>
                                                {acc.name} ({formatCurrency(acc.currentBalance || 0)})
                                            </SelectItem>
                                        ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="transfer-date">Date *</Label>
                                <Input
                                    id="transfer-date"
                                    type="date"
                                    value={transferForm.transactionDate}
                                    onChange={e => setTransferForm(prev => ({ ...prev, transactionDate: e.target.value }))}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="transfer-amount">Amount *</Label>
                                <Input
                                    id="transfer-amount"
                                    type="number"
                                    step="0.01"
                                    min="0.01"
                                    value={transferForm.amount || ''}
                                    onChange={e => setTransferForm(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))}
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="transfer-description">Description</Label>
                            <Input
                                id="transfer-description"
                                value={transferForm.description}
                                onChange={e => setTransferForm(prev => ({ ...prev, description: e.target.value }))}
                                placeholder="e.g., Weekly transfer to savings"
                            />
                        </div>

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsTransferModalOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={createTransferMutation.isPending}>
                                {createTransferMutation.isPending ? 'Transferring...' : 'Transfer'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Reverse Transaction Modal */}
            <Dialog open={isReverseModalOpen} onOpenChange={setIsReverseModalOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Reverse Transaction</DialogTitle>
                        <DialogDescription>
                            This will create a reversing entry. This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    {selectedTransaction && (
                        <div className="space-y-4">
                            <div className="bg-muted p-4 rounded-lg">
                                <div className="text-sm text-muted-foreground">Transaction</div>
                                <div className="font-mono">{selectedTransaction.transactionNumber}</div>
                                <div className="mt-2 text-sm text-muted-foreground">Amount</div>
                                <div className="font-mono">{formatCurrency(selectedTransaction.amount)}</div>
                                <div className="mt-2 text-sm text-muted-foreground">Description</div>
                                <div>{selectedTransaction.description}</div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="reverse-reason">Reason for reversal *</Label>
                                <Textarea
                                    id="reverse-reason"
                                    value={reverseReason}
                                    onChange={e => setReverseReason(e.target.value)}
                                    placeholder="Enter reason for reversing this transaction"
                                    required
                                />
                            </div>

                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={() => setIsReverseModalOpen(false)}>
                                    Cancel
                                </Button>
                                <Button
                                    variant="destructive"
                                    onClick={handleReverseTransaction}
                                    disabled={!reverseReason.trim() || reverseMutation.isPending}
                                >
                                    {reverseMutation.isPending ? 'Reversing...' : 'Reverse Transaction'}
                                </Button>
                            </DialogFooter>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </Card>
    );
};
