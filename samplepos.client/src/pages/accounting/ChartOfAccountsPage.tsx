import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Search, Download } from 'lucide-react';
import {
  Button,
  Input,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Badge,
  Textarea
} from '../../components/ui/temp-ui-components';
import { formatCurrency } from '../../utils/currency';
import toast from 'react-hot-toast';
import { accountingApi } from '../../services/api';

interface Account {
  id: string;
  accountNumber: string;
  accountName: string;
  accountType: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  parentAccountId?: string;
  isActive: boolean;
  balance: number;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

interface CreateAccountRequest {
  accountNumber: string;
  accountName: string;
  accountType: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  parentAccountId?: string;
  description?: string;
  isActive: boolean;
}

const ACCOUNT_TYPES = [
  { value: 'ASSET', label: 'Assets', color: 'bg-blue-100 text-blue-800' },
  { value: 'LIABILITY', label: 'Liabilities', color: 'bg-red-100 text-red-800' },
  { value: 'EQUITY', label: 'Equity', color: 'bg-purple-100 text-purple-800' },
  { value: 'REVENUE', label: 'Revenue', color: 'bg-green-100 text-green-800' },
  { value: 'EXPENSE', label: 'Expenses', color: 'bg-orange-100 text-orange-800' }
];

const ChartOfAccountsPage = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('ALL');
  const [filterActive, setFilterActive] = useState<string>('ALL');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);

  // Form state
  const [formData, setFormData] = useState<CreateAccountRequest>({
    accountNumber: '',
    accountName: '',
    accountType: 'ASSET',
    parentAccountId: undefined,
    description: '',
    isActive: true
  });

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      setLoading(true);
      // Call C# Accounting API through Node.js proxy
      const response = await accountingApi.get('/chart-of-accounts');
      const result = response.data;
      if (result.success) {
        // Map API response to frontend interface (currentBalance -> balance)
        const mappedAccounts = (result.data || []).map((acc: any) => ({
          ...acc,
          balance: acc.currentBalance ?? acc.balance ?? 0
        }));
        setAccounts(mappedAccounts);
      } else {
        throw new Error(result.error || 'Failed to load accounts');
      }
    } catch (error: any) {
      console.error('Error loading accounts:', error);
      toast.error(`Failed to load accounts: ${error.message}`);
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAccount = async () => {
    try {
      const result = await accountingApi.post('/chart-of-accounts', formData);
      if (result.data?.success) {
        toast.success('Account created successfully');
        setShowCreateDialog(false);
        resetForm();
        loadAccounts();
      } else {
        throw new Error(result.data?.error || 'Failed to create account');
      }
    } catch (error: any) {
      console.error('Error creating account:', error);
      toast.error(`Failed to create account: ${error.message}`);
    }
  };

  const handleUpdateAccount = async () => {
    if (!editingAccount) return;

    try {
      const result = await accountingApi.put(`/chart-of-accounts/${editingAccount.id}`, formData);
      if (result.data?.success) {
        toast.success('Account updated successfully');
        setEditingAccount(null);
        resetForm();
        loadAccounts();
      } else {
        throw new Error(result.data?.error || 'Failed to update account');
      }
    } catch (error: any) {
      console.error('Error updating account:', error);
      toast.error(`Failed to update account: ${error.message}`);
    }
  };

  const handleDeleteAccount = async (accountId: string, accountName: string) => {
    if (!confirm(`Are you sure you want to delete account "${accountName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const result = await accountingApi.delete(`/chart-of-accounts/${accountId}`);
      if (result.data?.success) {
        toast.success('Account deleted successfully');
        loadAccounts();
      } else {
        throw new Error(result.data?.error || 'Failed to delete account');
      }
    } catch (error: any) {
      console.error('Error deleting account:', error);
      toast.error(`Failed to delete account: ${error.message}`);
    }
  };

  const resetForm = () => {
    setFormData({
      accountNumber: '',
      accountName: '',
      accountType: 'ASSET',
      parentAccountId: undefined,
      description: '',
      isActive: true
    });
  };

  const openEditDialog = (account: Account) => {
    setEditingAccount(account);
    setFormData({
      accountNumber: account.accountNumber,
      accountName: account.accountName,
      accountType: account.accountType,
      parentAccountId: account.parentAccountId,
      description: account.description || '',
      isActive: account.isActive
    });
  };

  const filteredAccounts = accounts.filter(account => {
    const matchesSearch =
      account.accountNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      account.accountName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (account.description || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesType = filterType === 'ALL' || account.accountType === filterType;
    const matchesActive = filterActive === 'ALL' ||
      (filterActive === 'ACTIVE' && account.isActive) ||
      (filterActive === 'INACTIVE' && !account.isActive);

    return matchesSearch && matchesType && matchesActive;
  });

  const getAccountTypeColor = (type: string) => {
    const typeConfig = ACCOUNT_TYPES.find(t => t.value === type);
    return typeConfig?.color || 'bg-gray-100 text-gray-800';
  };

  const exportToCSV = () => {
    const headers = ['Account Number', 'Account Name', 'Type', 'Balance', 'Status', 'Description'];
    const rows = filteredAccounts.map(account => [
      account.accountNumber,
      account.accountName,
      account.accountType,
      account.balance.toString(),
      account.isActive ? 'Active' : 'Inactive',
      account.description || ''
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(field => `"${field.replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `chart-of-accounts-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="p-4 lg:p-6">
        {/* Integration Status */}
        <div className="mb-6 flex justify-end">
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
            <div className="flex items-center gap-2 text-green-700 font-medium">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              Integration Active
            </div>
            <div className="text-xs text-green-600 mt-1">
              ✓ Customer AR • ✓ Supplier AP • ✓ Invoices
            </div>
          </div>
        </div>

        {/* Controls */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Account Management</CardTitle>
            <CardDescription>Search, filter, and manage your chart of accounts</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4 mb-4">
              {/* Search */}
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search accounts..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* Filters */}
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Types</SelectItem>
                  {ACCOUNT_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterActive} onValueChange={setFilterActive}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="INACTIVE">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2">
              <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                <DialogTrigger asChild>
                  <Button onClick={() => { resetForm(); setShowCreateDialog(true); }}>
                    <Plus className="h-4 w-4 mr-2" />
                    New Account
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Create New Account</DialogTitle>
                    <DialogDescription>
                      Add a new account to your chart of accounts
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="accountNumber">Account Number *</Label>
                        <Input
                          id="accountNumber"
                          value={formData.accountNumber}
                          onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
                          placeholder="1000"
                        />
                      </div>
                      <div>
                        <Label htmlFor="accountType">Account Type *</Label>
                        <Select value={formData.accountType} onValueChange={(value: any) => setFormData({ ...formData, accountType: value })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ACCOUNT_TYPES.map(type => (
                              <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="accountName">Account Name *</Label>
                      <Input
                        id="accountName"
                        value={formData.accountName}
                        onChange={(e) => setFormData({ ...formData, accountName: e.target.value })}
                        placeholder="Cash and Cash Equivalents"
                      />
                    </div>

                    <div>
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        value={formData.description}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFormData({ ...formData, description: e.target.value })}
                        placeholder="Optional description of the account"
                        rows={3}
                      />
                    </div>

                    <div className="flex items-center space-x-2">
                      <input
                        id="isActive"
                        type="checkbox"
                        checked={formData.isActive}
                        onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        aria-label="Account is active"
                      />
                      <Label htmlFor="isActive">Active Account</Label>
                    </div>
                  </div>

                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleCreateAccount} disabled={!formData.accountNumber || !formData.accountName}>
                      Create Account
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Button variant="outline" onClick={exportToCSV} disabled={filteredAccounts.length === 0}>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>

              <Button variant="outline" onClick={loadAccounts} disabled={loading}>
                Refresh
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Accounts Table */}
        <Card>
          <CardHeader>
            <CardTitle>Accounts ({filteredAccounts.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="text-gray-500 mt-2">Loading accounts...</p>
              </div>
            ) : filteredAccounts.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500">No accounts found matching your criteria.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b">
                    <tr className="text-left">
                      <th className="pb-3 font-medium">Account #</th>
                      <th className="pb-3 font-medium">Account Name</th>
                      <th className="pb-3 font-medium">Type</th>
                      <th className="pb-3 font-medium text-right">Balance</th>
                      <th className="pb-3 font-medium">Status</th>
                      <th className="pb-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredAccounts.map((account) => (
                      <tr key={account.id} className="hover:bg-gray-50">
                        <td className="py-3 font-mono">{account.accountNumber}</td>
                        <td className="py-3">
                          <div>
                            <p className="font-medium">{account.accountName}</p>
                            {account.description && (
                              <p className="text-sm text-gray-500">{account.description}</p>
                            )}
                          </div>
                        </td>
                        <td className="py-3">
                          <Badge className={getAccountTypeColor(account.accountType)}>
                            {account.accountType}
                          </Badge>
                        </td>
                        <td className="py-3 text-right font-mono">
                          <span className={account.balance < 0 ? 'text-red-600' : 'text-gray-900'}>
                            {formatCurrency(account.balance)}
                          </span>
                        </td>
                        <td className="py-3">
                          <Badge variant={account.isActive ? 'default' : 'secondary'}>
                            {account.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openEditDialog(account)}
                            >
                              <Edit2 className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDeleteAccount(account.id, account.accountName)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Edit Account Dialog */}
        <Dialog open={!!editingAccount} onOpenChange={() => setEditingAccount(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Account</DialogTitle>
              <DialogDescription>
                Update account information
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-accountNumber">Account Number *</Label>
                  <Input
                    id="edit-accountNumber"
                    value={formData.accountNumber}
                    onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-accountType">Account Type *</Label>
                  <Select value={formData.accountType} onValueChange={(value: any) => setFormData({ ...formData, accountType: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACCOUNT_TYPES.map(type => (
                        <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="edit-accountName">Account Name *</Label>
                <Input
                  id="edit-accountName"
                  value={formData.accountName}
                  onChange={(e) => setFormData({ ...formData, accountName: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="edit-description">Description</Label>
                <Textarea
                  id="edit-description"
                  value={formData.description}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="edit-isActive"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="rounded border-gray-300"
                />
                <label htmlFor="edit-isActive">Active Account</label>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingAccount(null)}>
                Cancel
              </Button>
              <Button onClick={handleUpdateAccount} disabled={!formData.accountNumber || !formData.accountName}>
                Update Account
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
};

export default ChartOfAccountsPage;