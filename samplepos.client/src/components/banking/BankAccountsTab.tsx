/**
 * BANK ACCOUNTS TAB
 * 
 * Displays list of bank accounts with CRUD operations.
 */

import React, { useMemo, useState } from 'react';
import { Plus, Edit, Building2, CheckCircle, XCircle, Bell, BellOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
    useBankAccounts,
    useCreateBankAccount,
    useUpdateBankAccount,
    useSetLowBalanceThreshold,
    BankAccount
} from '../../hooks/useBanking';
import { formatCurrency } from '../../utils/currency';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { HandledApiError, getStructuredErrorMessage } from '../../utils/errorHandler';

type GlAccountOption = {
    id: string;
    accountCode: string;
    accountName: string;
    isPostingAccount?: boolean;
};

/** Money field helper: empty string while typing, no leading-zero / scroll-bump quirks. */
function parseMoneyInput(raw: string): number {
    const trimmed = raw.trim().replace(/,/g, '');
    if (trimmed === '' || trimmed === '-' || trimmed === '.') return 0;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : 0;
}

function moneyToInput(value: number | undefined | null): string {
    if (value == null || value === 0) return '';
    return String(value);
}

const preventNumberScroll = (e: React.WheelEvent<HTMLInputElement>) => {
    e.currentTarget.blur();
};

// Fetch GL accounts for dropdown (posting Asset accounts for bank account linking)
const useGLAccounts = () => {
    return useQuery({
        queryKey: ['glAccounts', 'ASSET', 'posting'],
        queryFn: async (): Promise<GlAccountOption[]> => {
            const response = await fetch('/api/accounting/chart-of-accounts?type=ASSET', {
                headers: {
                    Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
                },
            });
            if (!response.ok) throw new Error('Failed to fetch GL accounts');
            const result = await response.json();
            const rows = (result.data || []) as Array<Record<string, unknown>>;
            return rows
                .map((acc) => {
                    const id = String(acc.id ?? acc.Id ?? '');
                    const accountCode = String(acc.accountCode ?? acc.accountNumber ?? acc.AccountCode ?? '');
                    const accountName = String(acc.accountName ?? acc.AccountName ?? '');
                    const isPostingAccount = Boolean(
                        acc.isPostingAccount ?? acc.IsPostingAccount ?? true,
                    );
                    return { id, accountCode, accountName, isPostingAccount };
                })
                .filter((acc) => acc.id && acc.accountCode && acc.isPostingAccount);
        },
    });
};

interface AccountFormData {
    name: string;
    accountNumber: string;
    bankName: string;
    branch: string;
    glAccountId: string;
    /** String so the user can clear and type freely (avoids "05" / sticky 0). */
    openingBalance: string;
    isDefault: boolean;
    lowBalanceThreshold: string;
    lowBalanceAlertEnabled: boolean;
}

const emptyForm: AccountFormData = {
    name: '',
    accountNumber: '',
    bankName: '',
    branch: '',
    glAccountId: '',
    openingBalance: '',
    isDefault: false,
    lowBalanceThreshold: '',
    lowBalanceAlertEnabled: false
};

export const BankAccountsTab: React.FC = () => {
    const [showInactive, setShowInactive] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
    const [formData, setFormData] = useState<AccountFormData>(emptyForm);
    const [showCreateGl, setShowCreateGl] = useState(false);
    const [newGlCode, setNewGlCode] = useState('');
    const [newGlName, setNewGlName] = useState('');
    const [creatingGl, setCreatingGl] = useState(false);

    const { data: accounts = [], isLoading, refetch } = useBankAccounts(showInactive);
    const { data: glAccounts = [], refetch: refetchGlAccounts } = useGLAccounts();
    const createMutation = useCreateBankAccount();
    const updateMutation = useUpdateBankAccount();
    const lowBalanceMutation = useSetLowBalanceThreshold();

    /** GLs already linked to another active bank book — hide from picker (keep current when editing). */
    const availableGlAccounts = useMemo(() => {
        const usedByOther = new Set(
            accounts
                .filter((a) => a.isActive !== false && a.glAccountId && a.id !== editingAccount?.id)
                .map((a) => a.glAccountId),
        );
        return glAccounts
            .filter((g) => {
                if (!g.id || usedByOther.has(g.id)) return false;
                const code = String(g.accountCode || '');
                // Never offer AR / inventory / equity / undeposited / P&L as bank-book GLs
                if (
                    ['1000', '1015', '1200', '1250', '1300', '1500', '2100', '2200', '3050'].includes(code) ||
                    /^12\d{2}/.test(code) ||
                    /^2\d{3}/.test(code) ||
                    /^3\d{3}/.test(code) ||
                    /^[4567]\d{3}/.test(code)
                ) {
                    return false;
                }
                return true;
            })
            .sort((a, b) => a.accountCode.localeCompare(b.accountCode, undefined, { numeric: true }));
    }, [accounts, glAccounts, editingAccount?.id]);

    const suggestedGlCode = useMemo(() => {
        const usedCodes = new Set(
            [...accounts.map((a) => a.glAccountCode), ...glAccounts.map((g) => g.accountCode)].filter(
                Boolean,
            ) as string[],
        );
        for (let n = 1031; n <= 1090; n++) {
            const code = String(n);
            if (!usedCodes.has(code)) return code;
        }
        return `10${Date.now().toString().slice(-4)}`;
    }, [accounts, glAccounts]);

    const handleCreateGlInline = async () => {
        const code = (newGlCode || suggestedGlCode).trim();
        const name = newGlName.trim() || formData.name.trim() || 'Bank Account';
        if (!code) {
            toast.error('Enter a GL account code (e.g. 1031)');
            return;
        }
        setCreatingGl(true);
        try {
            const response = await fetch('/api/accounting/chart-of-accounts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
                },
                body: JSON.stringify({
                    accountNumber: code,
                    accountName: name,
                    accountType: 'ASSET',
                    normalBalance: 'DEBIT',
                    isPostingAccount: true,
                    // Required for Deposit Worksheet (TREASURY_DEPOSIT) — stamps SystemAccountTag=BANK
                    bankLiquidity: true,
                }),
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) {
                const detail =
                    typeof result.error === 'string'
                        ? result.error
                        : result.error?.message || result.message || 'Failed to create GL account';
                throw new Error(detail);
            }
            const createdId = String(result.data?.id ?? '');
            await refetchGlAccounts();
            if (createdId) {
                setFormData((prev) => ({ ...prev, glAccountId: createdId }));
            }
            setShowCreateGl(false);
            setNewGlCode('');
            setNewGlName('');
            toast.success(`Created GL ${code} — ${name}`);
        } catch (error) {
            if (error instanceof HandledApiError) return;
            toast.error(error instanceof Error ? error.message : 'Failed to create GL account');
        } finally {
            setCreatingGl(false);
        }
    };

    const handleOpenCreate = () => {
        setEditingAccount(null);
        setFormData(emptyForm);
        setShowCreateGl(false);
        setNewGlCode('');
        setNewGlName('');
        void refetch();
        void refetchGlAccounts();
        setIsModalOpen(true);
    };

    const handleOpenEdit = (account: BankAccount) => {
        setEditingAccount(account);
        setFormData({
            name: account.name,
            accountNumber: account.accountNumber || '',
            bankName: account.bankName || '',
            branch: account.branch || '',
            glAccountId: account.glAccountId,
            openingBalance: moneyToInput(account.openingBalance),
            isDefault: account.isDefault,
            lowBalanceThreshold: moneyToInput(account.lowBalanceThreshold),
            lowBalanceAlertEnabled: account.lowBalanceAlertEnabled || false
        });
        setShowCreateGl(false);
        setNewGlCode('');
        setNewGlName('');
        void refetch();
        void refetchGlAccounts();
        setIsModalOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.glAccountId) {
            toast.error('Select a GL (Asset) account for this bank book');
            return;
        }
        const openingBalance = parseMoneyInput(formData.openingBalance);
        const lowBalanceThreshold = parseMoneyInput(formData.lowBalanceThreshold);
        try {
            if (editingAccount) {
                await updateMutation.mutateAsync({
                    id: editingAccount.id,
                    data: {
                        name: formData.name,
                        accountNumber: formData.accountNumber || undefined,
                        bankName: formData.bankName || undefined,
                        branch: formData.branch || undefined,
                        glAccountId: formData.glAccountId,
                        openingBalance,
                        isDefault: formData.isDefault
                    }
                });
                await lowBalanceMutation.mutateAsync({
                    bankAccountId: editingAccount.id,
                    threshold: lowBalanceThreshold,
                    enabled: formData.lowBalanceAlertEnabled
                });
            } else {
                await createMutation.mutateAsync({
                    name: formData.name,
                    accountNumber: formData.accountNumber || undefined,
                    bankName: formData.bankName || undefined,
                    branch: formData.branch || undefined,
                    glAccountId: formData.glAccountId,
                    openingBalance: openingBalance || undefined,
                    isDefault: formData.isDefault
                });
            }
            setIsModalOpen(false);
            toast.success(editingAccount ? 'Bank account updated' : 'Bank account created');
            refetch();
        } catch (error) {
            if (error instanceof HandledApiError) return;
            console.error('Failed to save bank account:', error);
            toast.error(getStructuredErrorMessage(error, 'Failed to save bank account'));
        }
    };

    const handleToggleActive = async (account: BankAccount) => {
        try {
            await updateMutation.mutateAsync({
                id: account.id,
                data: { isActive: !account.isActive }
            });
            toast.success(account.isActive ? 'Bank account deactivated' : 'Bank account activated');
            refetch();
        } catch (error) {
            if (error instanceof HandledApiError) return;
            console.error('Failed to toggle account status:', error);
            toast.error(getStructuredErrorMessage(error, 'Failed to update account status'));
        }
    };

    if (isLoading) {
        return <div className="flex items-center justify-center py-8">Loading accounts...</div>;
    }

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle>Bank Accounts</CardTitle>
                    <CardDescription>
                        Manage your connected bank accounts
                    </CardDescription>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <Switch
                            id="show-inactive"
                            checked={showInactive}
                            onCheckedChange={setShowInactive}
                        />
                        <Label htmlFor="show-inactive" className="text-sm">Show inactive</Label>
                    </div>
                    <Button onClick={handleOpenCreate}>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Account
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                {accounts.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                        <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No bank accounts found</p>
                        <p className="text-sm">Click "Add Account" to create your first bank account</p>
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Account Name</TableHead>
                                <TableHead>Bank / Branch</TableHead>
                                <TableHead>Account Number</TableHead>
                                <TableHead>GL Account</TableHead>
                                <TableHead className="text-right">Balance</TableHead>
                                <TableHead>Alert</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {accounts.map(account => (
                                <TableRow key={account.id} className={!account.isActive ? 'opacity-50' : ''}>
                                    <TableCell className="font-medium">
                                        {account.name}
                                        {account.isDefault && (
                                            <Badge variant="secondary" className="ml-2">Default</Badge>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        {account.bankName || '-'}
                                        {account.branch && ` / ${account.branch}`}
                                    </TableCell>
                                    <TableCell>{account.accountNumber || '-'}</TableCell>
                                    <TableCell>
                                        <div className="flex flex-col gap-0.5">
                                            <span>
                                                {account.glAccountCode
                                                    ? `${account.glAccountCode} · ${account.glAccountName || ''}`
                                                    : account.glAccountName || '-'}
                                            </span>
                                            {account.transferEligible === false && (
                                                <Badge variant="destructive" className="w-fit text-xs">
                                                    Not a bank GL — edit and Create new GL
                                                </Badge>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right font-mono">
                                        {formatCurrency(account.currentBalance || 0)}
                                    </TableCell>
                                    <TableCell>
                                        {account.lowBalanceAlertEnabled ? (
                                            <div className="flex items-center gap-1" title={`Alert below ${formatCurrency(account.lowBalanceThreshold || 0)}`}>
                                                <Bell className="h-4 w-4 text-blue-500" />
                                                {(account.currentBalance || 0) < (account.lowBalanceThreshold || 0) && (
                                                    <Badge variant="destructive" className="text-xs">Low</Badge>
                                                )}
                                            </div>
                                        ) : (
                                            <span title="Alerts disabled">
                                                <BellOff className="h-4 w-4 text-muted-foreground" />
                                            </span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        {account.isActive ? (
                                            <Badge variant="default" className="bg-green-500">Active</Badge>
                                        ) : (
                                            <Badge variant="secondary">Inactive</Badge>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleOpenEdit(account)}
                                                title="Edit"
                                            >
                                                <Edit className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleToggleActive(account)}
                                                title={account.isActive ? 'Deactivate' : 'Activate'}
                                            >
                                                {account.isActive ? (
                                                    <XCircle className="h-4 w-4 text-red-500" />
                                                ) : (
                                                    <CheckCircle className="h-4 w-4 text-green-500" />
                                                )}
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </CardContent>

            {/* Create/Edit Modal */}
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>
                            {editingAccount ? 'Edit Bank Account' : 'Add Bank Account'}
                        </DialogTitle>
                        <DialogDescription>
                            {editingAccount
                                ? 'Update bank account details. Wrong opening balance can be corrected here — the difference posts to GL.'
                                : 'Create a new bank account for tracking transactions'
                            }
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="name">Account Name *</Label>
                            <Input
                                id="name"
                                value={formData.name}
                                onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                placeholder="e.g., Main Operating Account"
                                required
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="bankName">Bank Name</Label>
                                <Input
                                    id="bankName"
                                    value={formData.bankName}
                                    onChange={e => setFormData(prev => ({ ...prev, bankName: e.target.value }))}
                                    placeholder="e.g., Stanbic Bank"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="branch">Branch</Label>
                                <Input
                                    id="branch"
                                    value={formData.branch}
                                    onChange={e => setFormData(prev => ({ ...prev, branch: e.target.value }))}
                                    placeholder="e.g., Main Branch"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="accountNumber">Account Number</Label>
                            <Input
                                id="accountNumber"
                                value={formData.accountNumber}
                                onChange={e => setFormData(prev => ({ ...prev, accountNumber: e.target.value }))}
                                placeholder="e.g., 9012345678"
                            />
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                                <Label htmlFor="glAccount">GL Account *</Label>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    className="h-auto p-0 text-xs text-primary underline-offset-4 hover:underline"
                                    onClick={() => {
                                        setShowCreateGl((v) => !v);
                                        if (!newGlCode) setNewGlCode(suggestedGlCode);
                                        if (!newGlName && formData.name) setNewGlName(formData.name);
                                    }}
                                >
                                    {showCreateGl ? 'Cancel new GL' : '+ Create new GL'}
                                </Button>
                            </div>
                            {showCreateGl ? (
                                <div className="rounded-md border bg-muted/30 p-3 space-y-3">
                                    <p className="text-xs text-muted-foreground">
                                        Creates a posting Asset account, then selects it for this bank book.
                                    </p>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="space-y-1">
                                            <Label className="text-xs">Code *</Label>
                                            <Input
                                                value={newGlCode}
                                                onChange={(e) => setNewGlCode(e.target.value)}
                                                placeholder={suggestedGlCode}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs">Name *</Label>
                                            <Input
                                                value={newGlName}
                                                onChange={(e) => setNewGlName(e.target.value)}
                                                placeholder={formData.name || 'e.g. Stanbic Operating'}
                                            />
                                        </div>
                                    </div>
                                    <Button
                                        type="button"
                                        size="sm"
                                        disabled={creatingGl}
                                        onClick={() => void handleCreateGlInline()}
                                    >
                                        {creatingGl ? 'Creating…' : 'Create & use this GL'}
                                    </Button>
                                </div>
                            ) : (
                                <Select
                                    value={formData.glAccountId}
                                    onValueChange={(value) =>
                                        setFormData((prev) => ({ ...prev, glAccountId: value }))
                                    }
                                >
                                    <SelectTrigger>
                                        <SelectValue
                                            placeholder={
                                                availableGlAccounts.length === 0
                                                    ? 'No free GL — create one above'
                                                    : 'Select GL account…'
                                            }
                                        />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {availableGlAccounts.map((acc) => (
                                            <SelectItem key={acc.id} value={acc.id}>
                                                {acc.accountCode} - {acc.accountName}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                            <p className="text-xs text-muted-foreground">
                                Each bank book needs its own unused Asset GL. Used accounts are hidden from this list.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="openingBalance">Opening Balance</Label>
                            <Input
                                id="openingBalance"
                                type="text"
                                inputMode="decimal"
                                value={formData.openingBalance}
                                onChange={e => {
                                    const v = e.target.value;
                                    if (v === '' || /^-?\d*\.?\d*$/.test(v)) {
                                        setFormData(prev => ({ ...prev, openingBalance: v }));
                                    }
                                }}
                                onFocus={e => e.target.select()}
                                onWheel={preventNumberScroll}
                                placeholder="0.00"
                                autoComplete="off"
                            />
                            <p className="text-xs text-muted-foreground">
                                {editingAccount
                                    ? 'If this was entered wrong, change it and Save — only the difference is posted (DR bank / CR Opening Balance Equity).'
                                    : 'Posts DR bank GL / CR Opening Balance Equity (3050). Leave blank for zero.'}
                            </p>
                        </div>

                        <div className="flex items-center gap-2">
                            <Switch
                                id="isDefault"
                                checked={formData.isDefault}
                                onCheckedChange={(checked: boolean) => setFormData(prev => ({ ...prev, isDefault: checked }))}
                            />
                            <Label htmlFor="isDefault">Set as default account</Label>
                        </div>

                        {/* Low Balance Alert Settings */}
                        {editingAccount && (
                            <div className="border-t pt-4 mt-4 space-y-4">
                                <div className="flex items-center gap-2">
                                    <Bell className="h-4 w-4 text-muted-foreground" />
                                    <span className="font-medium text-sm">Low Balance Alerts</span>
                                </div>

                                <div className="flex items-center gap-2">
                                    <Switch
                                        id="lowBalanceAlertEnabled"
                                        checked={formData.lowBalanceAlertEnabled}
                                        onCheckedChange={(checked: boolean) => setFormData(prev => ({ ...prev, lowBalanceAlertEnabled: checked }))}
                                    />
                                    <Label htmlFor="lowBalanceAlertEnabled">Enable low balance alerts</Label>
                                </div>

                                {formData.lowBalanceAlertEnabled && (
                                    <div className="space-y-2">
                                        <Label htmlFor="lowBalanceThreshold">Alert Threshold</Label>
                                        <Input
                                            id="lowBalanceThreshold"
                                            type="text"
                                            inputMode="decimal"
                                            value={formData.lowBalanceThreshold}
                                            onChange={e => {
                                                const v = e.target.value;
                                                if (v === '' || /^-?\d*\.?\d*$/.test(v)) {
                                                    setFormData(prev => ({ ...prev, lowBalanceThreshold: v }));
                                                }
                                            }}
                                            onFocus={e => e.target.select()}
                                            onWheel={preventNumberScroll}
                                            placeholder="Enter minimum balance..."
                                            autoComplete="off"
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Alert when balance falls below this amount
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                disabled={
                                    createMutation.isPending ||
                                    updateMutation.isPending ||
                                    lowBalanceMutation.isPending ||
                                    !formData.glAccountId ||
                                    (!editingAccount && availableGlAccounts.length === 0)
                                }
                            >
                                {createMutation.isPending || updateMutation.isPending || lowBalanceMutation.isPending
                                    ? 'Saving...'
                                    : 'Save'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </Card>
    );
};
