import React, { useState } from 'react';
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Badge } from "./ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Search, Plus, Download, Users, CreditCard, TrendingUp, Eye, History } from "lucide-react";
import { useCustomerLedger } from '../context/CustomerLedgerContext';
import type { Customer, LedgerEntry } from '../context/CustomerLedgerContext';
// import CustomerDetail from './CustomerDetail'; // Removed - was not Shadcn-only
// import PaymentScheduleManager from './PaymentScheduleManager'; // Removed - was not Shadcn-only
// import InstallmentPlanManager from './InstallmentPlanManager'; // Removed - was not Shadcn-only

// Helper functions
function exportToCSV(data: any[], filename: string) {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const rows = data.map((row: any) => headers.map(h => JSON.stringify(row[h] ?? '')).join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
};

const CustomerLedgerFormShadcn: React.FC = () => {
  const { customers, setCustomers, ledger, setLedger } = useCustomerLedger();
  
  // Form states
  const [customerForm, setCustomerForm] = useState({ name: '', contact: '', email: '', balance: 0 });
  const [ledgerForm, setLedgerForm] = useState({ 
    customer: '', 
    date: new Date().toISOString().split('T')[0], 
    amount: '', 
    type: 'credit' as 'credit' | 'debit', 
    note: '',
    paymentMethod: 'cash'
  });
  
  // UI states
  const [status, setStatus] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'credit' | 'debit'>('all');
  
  // Modal states
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [showAddTransaction, setShowAddTransaction] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showCustomerDetail, setShowCustomerDetail] = useState(false);
  const [showScheduleManager, setShowScheduleManager] = useState(false);
  const [showInstallmentManager, setShowInstallmentManager] = useState(false);

  // Event handlers
  const handleCustomerChange = (field: string, value: string | number) => {
    setCustomerForm(prev => ({ ...prev, [field]: value }));
  };

  const handleLedgerChange = (field: string, value: string | number) => {
    setLedgerForm(prev => ({ ...prev, [field]: value }));
  };

  const addCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const newCustomer: Customer = {
        id: `customer-${Date.now()}`,
        name: customerForm.name,
        contact: customerForm.contact,
        email: customerForm.email,
        balance: customerForm.balance,
        joinDate: new Date().toISOString().split('T')[0],
        type: 'individual'
      };
      
      setCustomers([...customers, newCustomer]);
      setStatus(`Customer ${customerForm.name} added successfully!`);
      setCustomerForm({ name: '', contact: '', email: '', balance: 0 });
      setShowAddCustomer(false);
    } catch (error) {
      setStatus('Error adding customer. Please try again.');
    }
  };

  const addLedgerEntry = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const newEntry: LedgerEntry = {
        id: `ledger-${Date.now()}`,
        customer: ledgerForm.customer,
        date: ledgerForm.date,
        amount: parseFloat(ledgerForm.amount.toString()) || 0,
        type: ledgerForm.type,
        note: ledgerForm.note,
        paymentMethod: ledgerForm.paymentMethod,
        status: 'completed'
      };
      
      setLedger([...ledger, newEntry]);
      setStatus(`Transaction for ${ledgerForm.customer} added successfully!`);
      
      // Update customer balance
      setCustomers(customers.map(c => {
        if (c.name === ledgerForm.customer) {
          return {
            ...c,
            balance: ledgerForm.type === 'credit'
              ? c.balance + newEntry.amount
              : Math.max(0, c.balance - newEntry.amount)
          };
        }
        return c;
      }));
      
      setLedgerForm({ 
        customer: '', 
        date: new Date().toISOString().split('T')[0], 
        amount: '', 
        type: 'credit', 
        note: '',
        paymentMethod: 'cash'
      });
      setShowAddTransaction(false);
    } catch (error) {
      setStatus('Error adding transaction. Please try again.');
    }
  };

  // Filtered data
  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.contact.toLowerCase().includes(customerSearch.toLowerCase()) ||
    (c.email && c.email.toLowerCase().includes(customerSearch.toLowerCase()))
  );

  const filteredLedger = ledger.filter(entry => {
    const matchesSearch = 
      entry.customer.toLowerCase().includes(ledgerSearch.toLowerCase()) ||
      entry.note.toLowerCase().includes(ledgerSearch.toLowerCase()) ||
      entry.amount.toString().includes(ledgerSearch);
    
    const matchesType = filterType === 'all' || entry.type === filterType;
    
    return matchesSearch && matchesType;
  });

  const customerHistory = ledger.filter(l =>
    l.customer === selectedCustomer &&
    (l.date.toLowerCase().includes(historySearch.toLowerCase()) ||
     l.note.toLowerCase().includes(historySearch.toLowerCase()) ||
     String(l.amount).includes(historySearch))
  );

  // Statistics
  const totalBalance = customers.reduce((sum, c) => sum + c.balance, 0);
  const totalCredits = ledger.filter(l => l.type === 'credit').reduce((sum, l) => sum + l.amount, 0);
  const totalDebits = ledger.filter(l => l.type === 'debit').reduce((sum, l) => sum + l.amount, 0);

  // Auto-clear status messages
  React.useEffect(() => {
    if (status) {
      const timer = setTimeout(() => setStatus(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [status]);

  return (
    <div className="min-h-screen bg-background p-2 sm:p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
        {/* Header */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle className="text-xl sm:text-2xl lg:text-3xl font-bold">Customer Management & Ledger</CardTitle>
                <CardDescription className="text-sm sm:text-base">
                  Manage customers, track transactions, and monitor account balances
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2 sm:gap-3">
                <Dialog open={showAddCustomer} onOpenChange={setShowAddCustomer}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="gap-2">
                      <Plus className="h-4 w-4" />
                      <span className="hidden sm:inline">Add Customer</span>
                      <span className="sm:hidden">Add</span>
                    </Button>
                  </DialogTrigger>
                </Dialog>
                
                <Dialog open={showScheduleManager} onOpenChange={setShowScheduleManager}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                      <CreditCard className="h-4 w-4" />
                      <span className="hidden sm:inline">Payment Schedule</span>
                      <span className="sm:hidden">Schedule</span>
                    </Button>
                  </DialogTrigger>
                </Dialog>
                
                <Dialog open={showInstallmentManager} onOpenChange={setShowInstallmentManager}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                      <TrendingUp className="h-4 w-4" />
                      <span className="hidden sm:inline">Installments</span>
                      <span className="sm:hidden">Plans</span>
                    </Button>
                  </DialogTrigger>
                </Dialog>
              </div>
            </div>
          </CardHeader>
          
          <CardContent>
            {/* Statistics Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4">
              <Card className="p-3 sm:p-4">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-blue-600" />
                  <div>
                    <div className="text-lg sm:text-xl font-bold">{customers.length}</div>
                    <div className="text-xs sm:text-sm text-muted-foreground">Total Customers</div>
                  </div>
                </div>
              </Card>
              
              <Card className="p-3 sm:p-4">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-green-600" />
                  <div>
                    <div className="text-lg sm:text-xl font-bold">{formatCurrency(totalBalance)}</div>
                    <div className="text-xs sm:text-sm text-muted-foreground">Total Balance</div>
                  </div>
                </div>
              </Card>
              
              <Card className="p-3 sm:p-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-blue-600" />
                  <div>
                    <div className="text-lg sm:text-xl font-bold">{formatCurrency(totalCredits)}</div>
                    <div className="text-xs sm:text-sm text-muted-foreground">Total Credits</div>
                  </div>
                </div>
              </Card>
              
              <Card className="p-3 sm:p-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-red-600" />
                  <div>
                    <div className="text-lg sm:text-xl font-bold">{formatCurrency(totalDebits)}</div>
                    <div className="text-xs sm:text-sm text-muted-foreground">Total Debits</div>
                  </div>
                </div>
              </Card>
            </div>
          </CardContent>
        </Card>

        {/* Status Message */}
        {status && (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="pt-6">
              <p className="text-green-800 text-sm sm:text-base">{status}</p>
            </CardContent>
          </Card>
        )}

        {/* Main Content Tabs */}
        <Tabs defaultValue="customers" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="customers" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Customers</span>
              <span className="sm:hidden">Customers</span>
            </TabsTrigger>
            <TabsTrigger value="ledger" className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              <span className="hidden sm:inline">Transactions</span>
              <span className="sm:hidden">Ledger</span>
            </TabsTrigger>
          </TabsList>

          {/* Customers Tab */}
          <TabsContent value="customers" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <CardTitle className="text-lg sm:text-xl">Customer Directory</CardTitle>
                    <CardDescription className="text-sm">Manage your customer database</CardDescription>
                  </div>
                  <Button 
                    onClick={() => exportToCSV(filteredCustomers, 'customers.csv')} 
                    variant="outline" 
                    size="sm"
                    className="gap-2 w-full sm:w-auto"
                  >
                    <Download className="h-4 w-4" />
                    Export CSV
                  </Button>
                </div>
              </CardHeader>
              
              <CardContent>
                {/* Search */}
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search customers by name, contact, or email..."
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
                
                {/* Customers Table */}
                {filteredCustomers.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                    <p className="text-lg font-medium">No customers found</p>
                    <p className="text-sm">Add your first customer to get started</p>
                  </div>
                ) : (
                  <div className="rounded-md border overflow-x-auto">
                    <table className="w-full min-w-[600px]">
                      <thead className="border-b bg-muted/50">
                        <tr>
                          <th className="p-3 text-left font-medium">Name</th>
                          <th className="p-3 text-left font-medium">Contact</th>
                          <th className="p-3 text-left font-medium">Email</th>
                          <th className="p-3 text-left font-medium">Balance</th>
                          <th className="p-3 text-left font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredCustomers.map((customer, idx) => (
                          <tr key={customer.id || idx} className="border-b hover:bg-muted/30">
                            <td className="p-3 font-medium">{customer.name}</td>
                            <td className="p-3 text-muted-foreground">{customer.contact}</td>
                            <td className="p-3 text-muted-foreground">{customer.email || '-'}</td>
                            <td className="p-3">
                              <Badge variant={customer.balance > 0 ? "default" : "secondary"}>
                                {formatCurrency(customer.balance)}
                              </Badge>
                            </td>
                            <td className="p-3">
                              <div className="flex gap-2">
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={() => { 
                                    setSelectedCustomer(customer.name); 
                                    setShowHistory(true); 
                                  }}
                                  className="gap-1"
                                >
                                  <History className="h-3 w-3" />
                                  <span className="hidden sm:inline">History</span>
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={() => { 
                                    setSelectedCustomer(customer.name); 
                                    setShowCustomerDetail(true); 
                                  }}
                                  className="gap-1"
                                >
                                  <Eye className="h-3 w-3" />
                                  <span className="hidden sm:inline">Details</span>
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
          </TabsContent>

          {/* Ledger Tab */}
          <TabsContent value="ledger" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <CardTitle className="text-lg sm:text-xl">Transaction Ledger</CardTitle>
                    <CardDescription className="text-sm">View and manage all transactions</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Dialog open={showAddTransaction} onOpenChange={setShowAddTransaction}>
                      <DialogTrigger asChild>
                        <Button size="sm" className="gap-2">
                          <Plus className="h-4 w-4" />
                          <span className="hidden sm:inline">Add Transaction</span>
                          <span className="sm:hidden">Add</span>
                        </Button>
                      </DialogTrigger>
                    </Dialog>
                    <Button 
                      onClick={() => exportToCSV(filteredLedger, 'ledger.csv')} 
                      variant="outline" 
                      size="sm"
                      className="gap-2"
                    >
                      <Download className="h-4 w-4" />
                      <span className="hidden sm:inline">Export</span>
                    </Button>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent>
                {/* Search and Filters */}
                <div className="flex flex-col sm:flex-row gap-3 mb-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search transactions..."
                      value={ledgerSearch}
                      onChange={(e) => setLedgerSearch(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Select value={filterType} onValueChange={(value) => setFilterType(value as 'all' | 'credit' | 'debit')}>
                    <SelectTrigger className="w-full sm:w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="credit">Credits</SelectItem>
                      <SelectItem value="debit">Debits</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {/* Transactions Table */}
                {filteredLedger.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <CreditCard className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                    <p className="text-lg font-medium">No transactions found</p>
                    <p className="text-sm">Add your first transaction to get started</p>
                  </div>
                ) : (
                  <div className="rounded-md border overflow-x-auto">
                    <table className="w-full min-w-[700px]">
                      <thead className="border-b bg-muted/50">
                        <tr>
                          <th className="p-3 text-left font-medium">Customer</th>
                          <th className="p-3 text-left font-medium">Date</th>
                          <th className="p-3 text-left font-medium">Amount</th>
                          <th className="p-3 text-left font-medium">Type</th>
                          <th className="p-3 text-left font-medium">Method</th>
                          <th className="p-3 text-left font-medium">Note</th>
                          <th className="p-3 text-left font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredLedger.map((entry, idx) => (
                          <tr key={entry.id || idx} className="border-b hover:bg-muted/30">
                            <td className="p-3 font-medium">{entry.customer}</td>
                            <td className="p-3 text-muted-foreground">
                              {new Date(entry.date).toLocaleDateString()}
                            </td>
                            <td className="p-3">
                              <span className={entry.type === 'credit' ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                                {entry.type === 'credit' ? '+' : '-'}{formatCurrency(entry.amount)}
                              </span>
                            </td>
                            <td className="p-3">
                              <Badge variant={entry.type === 'credit' ? "default" : "destructive"}>
                                {entry.type}
                              </Badge>
                            </td>
                            <td className="p-3 text-muted-foreground">
                              {entry.paymentMethod || 'N/A'}
                            </td>
                            <td className="p-3 text-muted-foreground max-w-[200px] truncate">
                              {entry.note}
                            </td>
                            <td className="p-3">
                              <Badge variant={entry.status === 'completed' ? "default" : "secondary"}>
                                {entry.status || 'completed'}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Add Customer Modal */}
        <Dialog open={showAddCustomer} onOpenChange={setShowAddCustomer}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add New Customer</DialogTitle>
              <DialogDescription>
                Enter the customer details to add them to your system.
              </DialogDescription>
            </DialogHeader>
            
            <form onSubmit={addCustomer} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="customer-name">Customer Name *</Label>
                <Input
                  id="customer-name"
                  value={customerForm.name}
                  onChange={(e) => handleCustomerChange('name', e.target.value)}
                  placeholder="Enter customer name"
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="customer-contact">Contact Number *</Label>
                <Input
                  id="customer-contact"
                  value={customerForm.contact}
                  onChange={(e) => handleCustomerChange('contact', e.target.value)}
                  placeholder="Enter contact number"
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="customer-email">Email (Optional)</Label>
                <Input
                  id="customer-email"
                  type="email"
                  value={customerForm.email}
                  onChange={(e) => handleCustomerChange('email', e.target.value)}
                  placeholder="Enter email address"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="customer-balance">Initial Balance</Label>
                <Input
                  id="customer-balance"
                  type="number"
                  min="0"
                  step="0.01"
                  value={customerForm.balance}
                  onChange={(e) => handleCustomerChange('balance', parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                />
              </div>
              
              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => setShowAddCustomer(false)}>
                  Cancel
                </Button>
                <Button type="submit">Add Customer</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Add Transaction Modal */}
        <Dialog open={showAddTransaction} onOpenChange={setShowAddTransaction}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add New Transaction</DialogTitle>
              <DialogDescription>
                Record a new transaction for a customer.
              </DialogDescription>
            </DialogHeader>
            
            <form onSubmit={addLedgerEntry} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="transaction-customer">Customer *</Label>
                <Select value={ledgerForm.customer} onValueChange={(value) => handleLedgerChange('customer', value)} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((c, idx) => (
                      <SelectItem key={c.id || idx} value={c.name}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="transaction-date">Date *</Label>
                  <Input
                    id="transaction-date"
                    type="date"
                    value={ledgerForm.date}
                    onChange={(e) => handleLedgerChange('date', e.target.value)}
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="transaction-amount">Amount *</Label>
                  <Input
                    id="transaction-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={ledgerForm.amount}
                    onChange={(e) => handleLedgerChange('amount', e.target.value)}
                    placeholder="0.00"
                    required
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="transaction-type">Type *</Label>
                  <Select value={ledgerForm.type} onValueChange={(value) => handleLedgerChange('type', value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="credit">Credit (Charge)</SelectItem>
                      <SelectItem value="debit">Debit (Payment)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="transaction-method">Payment Method</Label>
                  <Select value={ledgerForm.paymentMethod} onValueChange={(value) => handleLedgerChange('paymentMethod', value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="card">Card</SelectItem>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="check">Check</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="transaction-note">Note</Label>
                <Textarea
                  id="transaction-note"
                  value={ledgerForm.note}
                  onChange={(e) => handleLedgerChange('note', e.target.value)}
                  placeholder="Enter transaction details..."
                  rows={3}
                />
              </div>
              
              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => setShowAddTransaction(false)}>
                  Cancel
                </Button>
                <Button type="submit">Add Transaction</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Transaction History Modal */}
        <Dialog open={showHistory} onOpenChange={setShowHistory}>
          <DialogContent className="sm:max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Transaction History - {selectedCustomer}</DialogTitle>
              <DialogDescription>
                Complete transaction history for this customer
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search history..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              <div className="rounded-md border">
                <table className="w-full">
                  <thead className="border-b bg-muted/50">
                    <tr>
                      <th className="p-3 text-left font-medium">Date</th>
                      <th className="p-3 text-left font-medium">Amount</th>
                      <th className="p-3 text-left font-medium">Type</th>
                      <th className="p-3 text-left font-medium">Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customerHistory.map((entry, idx) => (
                      <tr key={entry.id || idx} className="border-b">
                        <td className="p-3 text-muted-foreground">
                          {new Date(entry.date).toLocaleDateString()}
                        </td>
                        <td className="p-3">
                          <span className={entry.type === 'credit' ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                            {entry.type === 'credit' ? '+' : '-'}{formatCurrency(entry.amount)}
                          </span>
                        </td>
                        <td className="p-3">
                          <Badge variant={entry.type === 'credit' ? "default" : "destructive"}>
                            {entry.type}
                          </Badge>
                        </td>
                        <td className="p-3 text-muted-foreground">{entry.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Customer Detail Modal - Temporarily simplified */}
        <Dialog open={showCustomerDetail} onOpenChange={setShowCustomerDetail}>
          <DialogContent className="sm:max-w-4xl max-h-[80vh] overflow-y-auto">
            <div className="p-4 text-center">
              <h3 className="text-lg font-semibold mb-2">Customer Detail</h3>
              <p className="text-muted-foreground">Customer: {selectedCustomer}</p>
              <p className="text-sm text-muted-foreground mt-2">Detail view temporarily disabled (converting to Shadcn-only)</p>
              <button onClick={() => setShowCustomerDetail(false)} className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded">
                Close
              </button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Payment Schedule Manager Modal - Temporarily simplified */}
        <Dialog open={showScheduleManager} onOpenChange={setShowScheduleManager}>
          <DialogContent className="sm:max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Payment Schedule Manager</DialogTitle>
              <DialogDescription>
                Manage payment schedules and recurring transactions
              </DialogDescription>
            </DialogHeader>
            <div className="p-4 text-center">
              <p className="text-muted-foreground">Payment Schedule Manager temporarily disabled</p>
              <p className="text-sm text-muted-foreground mt-2">(Converting to Shadcn-only components)</p>
              <button onClick={() => setShowScheduleManager(false)} className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded">
                Close
              </button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Installment Plan Manager Modal - Temporarily simplified */}
        <Dialog open={showInstallmentManager} onOpenChange={setShowInstallmentManager}>
          <DialogContent className="sm:max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Installment Plan Manager</DialogTitle>
              <DialogDescription>
                Create and manage customer installment payment plans
              </DialogDescription>
            </DialogHeader>
            <div className="p-4 text-center">
              <p className="text-muted-foreground">Installment Plan Manager temporarily disabled</p>
              <p className="text-sm text-muted-foreground mt-2">(Converting to Shadcn-only components)</p>
              <button onClick={() => setShowInstallmentManager(false)} className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded">
                Close
              </button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default CustomerLedgerFormShadcn;