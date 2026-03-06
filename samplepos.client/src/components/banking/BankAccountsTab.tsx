/**
 * BANK ACCOUNTS TAB
 * 
 * Displays list of bank accounts with CRUD operations.
 */

import React, { useState } from 'react';
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

// Fetch GL accounts for dropdown (Asset accounts for bank account linking)
const useGLAccounts = () => {
    return useQuery({
        queryKey: ['glAccounts', 'ASSET'],
        queryFn: async () => {
            const response = await fetch('/api/accounting/chart-of-accounts?type=ASSET', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
                }
            });
            if (!response.ok) throw new Error('Failed to fetch GL accounts');
            const result = await response.json();
            return result.data || [];
        }
    });
};

interface AccountFormData {
    name: string;
    accountNumber: string;
    bankName: string;
    branch: string;
    glAccountId: string;
    openingBalance: number;
    isDefault: boolean;
    lowBalanceThreshold: number;
    lowBalanceAlertEnabled: boolean;
}

const emptyForm: AccountFormData = {
    name: '',
    accountNumber: '',
    bankName: '',
    branch: '',
    glAccountId: '',
    openingBalance: 0,
    isDefault: false,
    lowBalanceThreshold: 0,
    lowBalanceAlertEnabled: false
};

export const BankAccountsTab: React.FC = () => {
    const [showInactive, setShowInactive] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
    const [formData, setFormData] = useState<AccountFormData>(emptyForm);

    const { data: accounts = [], isLoading, refetch } = useBankAccounts(showInactive);
    const { data: glAccounts = [] } = useGLAccounts();
    const createMutation = useCreateBankAccount();
    const updateMutation = useUpdateBankAccount();
    const lowBalanceMutation = useSetLowBalanceThreshold();

    const handleOpenCreate = () => {
        setEditingAccount(null);
        setFormData(emptyForm);
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
            openingBalance: 0, // Not editable
            isDefault: account.isDefault,
            lowBalanceThreshold: account.lowBalanceThreshold || 0,
            lowBalanceAlertEnabled: account.lowBalanceAlertEnabled || false
        });
        setIsModalOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
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
                        isDefault: formData.isDefault
                    }
                });
                // Update low balance settings separately
                await lowBalanceMutation.mutateAsync({
                    bankAccountId: editingAccount.id,
                    threshold: formData.lowBalanceThreshold,
                    enabled: formData.lowBalanceAlertEnabled
                });
            } else {
                await createMutation.mutateAsync({
                    name: formData.name,
                    accountNumber: formData.accountNumber || undefined,
                    bankName: formData.bankName || undefined,
                    branch: formData.branch || undefined,
                    glAccountId: formData.glAccountId,
                    openingBalance: formData.openingBalance || undefined,
                    isDefault: formData.isDefault
                });
            }
            setIsModalOpen(false);
            refetch();
        } catch (error) {
            console.error('Failed to save bank account:', error);
        }
    };

    const handleToggleActive = async (account: BankAccount) => {
        try {
            await updateMutation.mutateAsync({
                id: account.id,
                data: { isActive: !account.isActive }
            });
            refetch();
        } catch (error) {
            console.error('Failed to toggle account status:', error);
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
                                    <TableCell>{account.glAccountName || '-'}</TableCell>
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
                                ? 'Update bank account details'
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
                            <Label htmlFor="glAccount">GL Account *</Label>
                            <Select
                                value={formData.glAccountId}
                                onValueChange={value => setFormData(prev => ({ ...prev, glAccountId: value }))}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select GL account..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {glAccounts
                                        .filter((acc: { Id: string; AccountCode: string; AccountName: string }) => acc.Id && acc.Id !== '') // Filter out empty IDs
                                        .map((acc: { Id: string; AccountCode: string; AccountName: string }) => (
                                            <SelectItem key={acc.Id} value={acc.Id}>
                                                {acc.AccountCode} - {acc.AccountName}
                                            </SelectItem>
                                        ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {!editingAccount && (
                            <div className="space-y-2">
                                <Label htmlFor="openingBalance">Opening Balance</Label>
                                <Input
                                    id="openingBalance"
                                    type="number"
                                    step="0.01"
                                    value={formData.openingBalance}
                                    onChange={e => setFormData(prev => ({ ...prev, openingBalance: parseFloat(e.target.value) || 0 }))}
                                    placeholder="0.00"
                                />
                            </div>
                        )}

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
                                            type="number"
                                            step="0.01"
                                            value={formData.lowBalanceThreshold}
                                            onChange={e => setFormData(prev => ({ ...prev, lowBalanceThreshold: parseFloat(e.target.value) || 0 }))}
                                            placeholder="Enter minimum balance..."
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
                                disabled={createMutation.isPending || updateMutation.isPending}
                            >
                                {createMutation.isPending || updateMutation.isPending ? 'Saving...' : 'Save'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </Card>
    );
};
