import React, { useState, useEffect } from 'react';
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Badge } from "./ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Search, Plus, Download, Users, CreditCard, TrendingUp, Eye, History, ShoppingCart, Wallet, Calendar, User, DollarSign, BarChart, Activity, FileText, Edit, Trash2 } from "lucide-react";
import { useCustomerLedger } from '../context/CustomerLedgerContext';
import type { Customer, LedgerEntry } from '../context/CustomerLedgerContext';
import { CustomerAccountService } from '../services/CustomerAccountService';
import type { 
  CustomerAccount, 
  InstallmentPlan,
  CreditSaleOptions,
  PaymentMethod 
} from '../types/CustomerAccount';


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

// Using the centralized currency formatter from utils
import { formatCurrency } from '../utils/currency';
import { PaginatedList } from './shared/PaginatedList';

const CustomerLedgerFormShadcn: React.FC = () => {
  const { customers, setCustomers, ledger, setLedger } = useCustomerLedger();
  
  // Enhanced customer accounts state
  const [enhancedCustomers, setEnhancedCustomers] = useState<CustomerAccount[]>([]);
  const [installmentPlans, setInstallmentPlans] = useState<InstallmentPlan[]>([]);
  
  // Form states
  const [customerForm, setCustomerForm] = useState({ 
    name: '', 
    contact: '', 
    email: '', 
    address: '',
    customerType: 'individual' as 'individual' | 'business' | 'wholesale' | 'retail',
    creditLimit: 10000,
    paymentTermsDays: 30
  });
  
  const [ledgerForm, setLedgerForm] = useState({ 
    customer: '', 
    date: new Date().toISOString().split('T')[0], 
    amount: '', 
    type: 'credit' as 'credit' | 'debit', 
    note: '',
    paymentMethod: 'cash'
  });

  // Credit Sale Form
  const [creditSaleForm, setCreditSaleForm] = useState<{
    customerId: string;
    items: Array<{ name: string; quantity: number; unitPrice: number; total: number }>;
    paymentType: 'full_credit' | 'partial_credit' | 'deposit_and_credit' | 'installment';
    useDepositAmount: number;
    creditAmount: number;
    installmentPlan?: {
      numberOfInstallments: number;
      frequency: 'weekly' | 'bi-weekly' | 'monthly';
      interestRate: number;
    };
    notes: string;
  }>({
    customerId: '',
    items: [{ name: '', quantity: 1, unitPrice: 0, total: 0 }],
    paymentType: 'full_credit',
    useDepositAmount: 0,
    creditAmount: 0,
    notes: ''
  });

  // Payment Form
  const [paymentForm, setPaymentForm] = useState<{
    customerId: string;
    amount: number;
    paymentMethod: PaymentMethod;
    applyToInstallment: boolean;
    installmentPlanId: string;
    notes: string;
  }>({
    customerId: '',
    amount: 0,
    paymentMethod: 'cash',
    applyToInstallment: false,
    installmentPlanId: '',
    notes: ''
  });

  // Deposit Form
  const [depositForm, setDepositForm] = useState<{
    customerId: string;
    amount: number;
    paymentMethod: PaymentMethod;
    notes: string;
  }>({
    customerId: '',
    amount: 0,
    paymentMethod: 'cash',
    notes: ''
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
  const [showEditCustomer, setShowEditCustomer] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCustomerHistoryModal, setShowCustomerHistoryModal] = useState(false);
  const [selectedCustomerForEdit, setSelectedCustomerForEdit] = useState<CustomerAccount | null>(null);
  const [selectedCustomerForDelete, setSelectedCustomerForDelete] = useState<CustomerAccount | null>(null);
  const [selectedCustomerForHistory, setSelectedCustomerForHistory] = useState<CustomerAccount | null>(null);
  const [transactionHistory, setTransactionHistory] = useState<Record<string, any[]>>({});

  // Load enhanced customer accounts data
  useEffect(() => {
    loadEnhancedCustomers();
  }, []);

  useEffect(() => {
    if (selectedCustomer) {
      loadCustomerAccountDetails(selectedCustomer);
    }
  }, [selectedCustomer]);

  // Pre-populate form when editing customer
  useEffect(() => {
    if (selectedCustomerForEdit) {
      setCustomerForm({
        name: selectedCustomerForEdit.name,
        contact: selectedCustomerForEdit.contact,
        email: selectedCustomerForEdit.email || '',
        address: selectedCustomerForEdit.address || '',
        customerType: selectedCustomerForEdit.customerType,
        creditLimit: selectedCustomerForEdit.creditLimit,
        paymentTermsDays: selectedCustomerForEdit.paymentTermsDays
      });
    }
  }, [selectedCustomerForEdit]);

  // Initialize transaction history for all customers
  useEffect(() => {
    if (enhancedCustomers.length > 0 && ledger.length >= 0) {
      const historyData: Record<string, any[]> = {};
      
      enhancedCustomers.forEach(customer => {
        const transactions = loadTransactionHistory(customer.id);
        historyData[customer.id] = transactions;
      });
      
      setTransactionHistory(historyData);
    }
  }, [enhancedCustomers, ledger]);

  const loadEnhancedCustomers = () => {
    const allCustomers = CustomerAccountService.getAllCustomers();
    setEnhancedCustomers(allCustomers);
    
    // Sync with existing customer context for backward compatibility
    const legacyCustomers: Customer[] = allCustomers.map(customer => ({
      id: customer.id,
      name: customer.name,
      contact: customer.contact,
      email: customer.email,
      balance: customer.currentBalance,
      joinDate: customer.createdDate.split('T')[0],
      type: customer.customerType === 'wholesale' || customer.customerType === 'retail' ? 'business' : customer.customerType as 'individual' | 'business'
    }));
    setCustomers(legacyCustomers);
  };

  const loadCustomerAccountDetails = async (customerId: string) => {
    try {
      const plans = CustomerAccountService.getCustomerInstallmentPlans(customerId);
      setInstallmentPlans(plans);
    } catch (error) {
      setStatus('Error loading customer details: ' + (error as Error).message);
    }
  };

  // Transaction history management
  const loadTransactionHistory = (customerAccountId: string) => {
    try {
      // Find the customer to get their name for ledger matching
      const customer = enhancedCustomers.find(c => c.id === customerAccountId);
      const customerName = customer?.name || customerAccountId;
      
      // Get ledger entries for this customer (this is the main source that works)
      const customerLedger = ledger.filter(entry => {
        return entry.customer === customerName || 
               entry.customer === customerAccountId ||
               entry.customer === customer?.accountNumber;
      });
      
      // Load from additional POS sources
      const sources = [
        'pos_transaction_history_v1',
        'transaction_history', 
        'pos_sales'
      ];
      
      let posTransactions: any[] = [];
      
      sources.forEach(source => {
        const data = localStorage.getItem(source);
        if (data) {
          try {
            const parsed = JSON.parse(data);
            if (Array.isArray(parsed)) {
              // Filter transactions for this customer using multiple matching criteria
              const customerTransactions = parsed.filter((tx: any) => 
                tx.customerName === customerName || 
                tx.customer === customerName ||
                tx.customerId === customerAccountId ||
                tx.customerName === customerAccountId
              );
              
              posTransactions = [...posTransactions, ...customerTransactions];
            }
          } catch (e) {
            // Silent error handling
          }
        }
      });
      
      // Combine and format all transactions
      const combined = [
        // POS transactions
        ...posTransactions.map(tx => ({
          ...tx,
          type: 'sale',
          source: 'pos',
          displayType: 'Sale'
        })),
        // Ledger entries
        ...customerLedger.map(entry => ({
          ...entry,
          type: entry.type,
          source: 'ledger',
          displayType: entry.type === 'credit' ? 'Payment' : 'Charge',
          total: entry.amount // Ensure amount is available as total for display
        }))
      ].sort((a, b) => new Date(b.date || b.timestamp || 0).getTime() - new Date(a.date || a.timestamp || 0).getTime());
      
      setTransactionHistory(prev => ({
        ...prev,
        [customerAccountId]: combined
      }));

      return combined;
    } catch (error) {
      console.error('❌ Error loading transaction history:', error);
      return [];
    }
  };

  const openCustomerHistoryModal = (customer: CustomerAccount) => {
    setSelectedCustomerForHistory(customer);
    // Load transaction history when opening modal
    if (!transactionHistory[customer.id]) {
      loadTransactionHistory(customer.id);
    }
    setShowCustomerHistoryModal(true);
  };

  const getCustomerStats = (customer: CustomerAccount) => {
    const customerTransactions = transactionHistory[customer.id] || [];
    const totalTransactions = customerTransactions.length;
    const totalSales = customerTransactions
      .filter(tx => tx.type === 'sale')
      .reduce((sum, tx) => sum + (tx.total || 0), 0);
    const lastTransaction = customerTransactions[0]?.date || customerTransactions[0]?.timestamp;
    
    return {
      totalTransactions,
      totalSales,
      lastTransaction: lastTransaction ? new Date(lastTransaction).toLocaleDateString() : 'Never'
    };
  };

  // Debug function to create sample transactions for testing
  const createSampleTransactions = () => {
    if (enhancedCustomers.length > 0) {
      const sampleLedgerEntries = enhancedCustomers.slice(0, 2).flatMap(customer => [
        {
          id: `sample-${customer.id}-1`,
          customer: customer.name,
          date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 7 days ago
          amount: 150.00,
          type: 'debit' as const,
          note: 'Purchase - Electronics',
          paymentMethod: 'cash'
        },
        {
          id: `sample-${customer.id}-2`,
          customer: customer.name,
          date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 3 days ago
          amount: 75.00,
          type: 'credit' as const,
          note: 'Payment received',
          paymentMethod: 'card'
        },
        {
          id: `sample-${customer.id}-3`,
          customer: customer.name,
          date: new Date().toISOString().split('T')[0], // Today
          amount: 200.00,
          type: 'debit' as const,
          note: 'Purchase - Groceries',
          paymentMethod: 'customer_account'
        }
      ]);

      setLedger(prev => [...prev, ...sampleLedgerEntries]);
      console.log(`✅ Created ${sampleLedgerEntries.length} sample transactions`);
      setStatus('Sample transactions created for testing!');
    }
  };

  // Event handlers
  const handleCustomerChange = (field: string, value: string | number) => {
    setCustomerForm(prev => ({ ...prev, [field]: value }));
  };

  const handleLedgerChange = (field: string, value: string | number) => {
    setLedgerForm(prev => ({ ...prev, [field]: value }));
  };

  const addCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await CustomerAccountService.createCustomerAccount({
        name: customerForm.name,
        contact: customerForm.contact,
        email: customerForm.email || undefined,
        address: customerForm.address || undefined,
        customerType: customerForm.customerType,
        creditLimit: customerForm.creditLimit,
        paymentTermsDays: customerForm.paymentTermsDays
      });
      
      // Reload customers
      loadEnhancedCustomers();
      setStatus(`Customer ${customerForm.name} added successfully!`);
      setCustomerForm({ 
        name: '', 
        contact: '', 
        email: '', 
        address: '',
        customerType: 'individual',
        creditLimit: 10000,
        paymentTermsDays: 30
      });
      setShowAddCustomer(false);
    } catch (error) {
      setStatus('Error adding customer: ' + (error as Error).message);
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
  
  // Enhanced customers filtering
  const filteredEnhancedCustomers = enhancedCustomers.filter(c =>
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

  // Enhanced Statistics
  const totalBalance = enhancedCustomers.reduce((sum, c) => sum + c.currentBalance, 0) || customers.reduce((sum, c) => sum + c.balance, 0);
  const totalDeposits = enhancedCustomers.reduce((sum, c) => sum + c.depositBalance, 0);
  const totalCreditLimit = enhancedCustomers.reduce((sum, c) => sum + c.creditLimit, 0);
  const customerCount = enhancedCustomers.length;

  // Auto-clear status messages
  React.useEffect(() => {
    if (status) {
      const timer = setTimeout(() => setStatus(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [status]);

  return (
    <div className="min-h-screen bg-background p-2 sm:p-4 md:p-6">
      <div className="w-full mx-auto space-y-4 sm:space-y-6">
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
                
                {/* Debug: Create sample transactions */}
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={createSampleTransactions}
                  className="gap-2"
                  title="Create sample transactions for testing transaction history"
                >
                  <History className="h-4 w-4" />
                  <span className="hidden sm:inline">Add Sample Data</span>
                  <span className="sm:hidden">Sample</span>
                </Button>

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
                    <div className="text-lg sm:text-xl font-bold">{customerCount}</div>
                    <div className="text-xs sm:text-sm text-muted-foreground">Total Customers</div>
                  </div>
                </div>
              </Card>
              
              <Card className="p-3 sm:p-4">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-red-600" />
                  <div>
                    <div className="text-lg sm:text-xl font-bold">{formatCurrency(totalBalance)}</div>
                    <div className="text-xs sm:text-sm text-muted-foreground">Outstanding Balance</div>
                  </div>
                </div>
              </Card>
              
              <Card className="p-3 sm:p-4">
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-green-600" />
                  <div>
                    <div className="text-lg sm:text-xl font-bold">{formatCurrency(totalDeposits)}</div>
                    <div className="text-xs sm:text-sm text-muted-foreground">Customer Deposits</div>
                  </div>
                </div>
              </Card>
              
              <Card className="p-3 sm:p-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-blue-600" />
                  <div>
                    <div className="text-lg sm:text-xl font-bold">{formatCurrency(totalCreditLimit)}</div>
                    <div className="text-xs sm:text-sm text-muted-foreground">Total Credit Limit</div>
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
          <TabsList className="grid w-full grid-cols-5 mb-4">
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
            <TabsTrigger value="credit-sales" className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" />
              <span className="hidden sm:inline">Credit Sales</span>
              <span className="sm:hidden">Sales</span>
            </TabsTrigger>
            <TabsTrigger value="payments" className="flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              <span className="hidden sm:inline">Payments</span>
              <span className="sm:hidden">Pay</span>
            </TabsTrigger>
            <TabsTrigger value="installments" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <span className="hidden sm:inline">Installments</span>
              <span className="sm:hidden">Plans</span>
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
                {filteredEnhancedCustomers.length === 0 ? (
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
                          <th className="p-3 text-left font-medium">Customer</th>
                          <th className="p-3 text-left font-medium">Contact</th>
                          <th className="p-3 text-left font-medium">Balance</th>
                          <th className="p-3 text-left font-medium">History</th>
                          <th className="p-3 text-left font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredEnhancedCustomers.map((customer, idx) => {
                          const stats = getCustomerStats(customer);
                          
                          return (
                            <tr key={customer.id || idx} className="border-b hover:bg-muted/30">
                              <td className="p-3">
                                <div>
                                  <div className="font-medium">{customer.name}</div>
                                  <div className="text-xs text-muted-foreground">{customer.accountNumber}</div>
                                </div>
                              </td>
                              <td className="p-3">
                                <div className="text-sm">{customer.contact}</div>
                                {customer.email && (
                                  <div className="text-xs text-muted-foreground">{customer.email}</div>
                                )}
                              </td>
                              <td className="p-3">
                                <div className="space-y-1">
                                  <div className={`text-sm font-medium ${customer.currentBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                    {formatCurrency(customer.currentBalance)}
                                  </div>
                                  {customer.depositBalance > 0 && (
                                    <div className="text-xs text-blue-600">
                                      +{formatCurrency(customer.depositBalance)} deposit
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td className="p-3">
                                <div className="text-sm">
                                  <div>{stats.totalTransactions} transactions</div>
                                  <div className="text-xs text-muted-foreground">{stats.lastTransaction}</div>
                                </div>
                              </td>
                              <td className="p-3">
                                <div className="flex gap-1 flex-wrap">
                                  <Button 
                                    size="sm" 
                                    variant="outline"
                                    onClick={() => openCustomerHistoryModal(customer)}
                                    className="gap-1"
                                  >
                                    <History className="h-3 w-3" />
                                    <span className="hidden sm:inline">History</span>
                                  </Button>
                                  <Button 
                                    size="sm" 
                                    variant="outline"
                                    onClick={() => { 
                                      setSelectedCustomer(customer.id); 
                                      setShowCustomerDetail(true); 
                                    }}
                                    className="gap-1"
                                  >
                                    <Eye className="h-3 w-3" />
                                    <span className="hidden sm:inline">Details</span>
                                  </Button>
                                  <Button 
                                    size="sm" 
                                    variant="outline"
                                    onClick={() => { 
                                      setSelectedCustomerForEdit(customer);
                                      setShowEditCustomer(true);
                                    }}
                                    className="gap-1"
                                  >
                                    <Edit className="h-3 w-3" />
                                    <span className="hidden sm:inline">Edit</span>
                                  </Button>
                                  <Button 
                                    size="sm" 
                                    variant="outline"
                                    onClick={() => { 
                                      setSelectedCustomerForDelete(customer);
                                      setShowDeleteConfirm(true);
                                    }}
                                    className="gap-1 text-red-600 hover:text-red-700"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                    <span className="hidden sm:inline">Delete</span>
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
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

          {/* Credit Sales Tab */}
          <TabsContent value="credit-sales" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg sm:text-xl">Credit Sales Management</CardTitle>
                <CardDescription className="text-sm">Process credit sales and manage customer purchases</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Customer Selection */}
                  <div className="space-y-2">
                    <Label>Select Customer</Label>
                    <Select value={creditSaleForm.customerId} onValueChange={(value) => 
                      setCreditSaleForm({ ...creditSaleForm, customerId: value })
                    }>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose customer for credit sale" />
                      </SelectTrigger>
                      <SelectContent>
                        {enhancedCustomers.map((customer) => (
                          <SelectItem key={customer.id} value={customer.id}>
                            {customer.name} - Available Credit: {formatCurrency(customer.availableCredit)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Sale Items */}
                  <div className="space-y-2">
                    <Label>Sale Items</Label>
                    {creditSaleForm.items.map((item, index) => (
                      <div key={index} className="grid grid-cols-12 gap-2 items-center">
                        <div className="col-span-4">
                          <Input
                            placeholder="Item name"
                            value={item.name}
                            onChange={(e) => {
                              const updatedItems = [...creditSaleForm.items];
                              updatedItems[index] = { ...item, name: e.target.value };
                              setCreditSaleForm({ ...creditSaleForm, items: updatedItems });
                            }}
                          />
                        </div>
                        <div className="col-span-2">
                          <Input
                            type="number"
                            placeholder="Qty"
                            value={item.quantity}
                            onChange={(e) => {
                              const updatedItems = [...creditSaleForm.items];
                              const quantity = parseFloat(e.target.value) || 0;
                              updatedItems[index] = { 
                                ...item, 
                                quantity,
                                total: quantity * item.unitPrice 
                              };
                              setCreditSaleForm({ ...creditSaleForm, items: updatedItems });
                            }}
                          />
                        </div>
                        <div className="col-span-2">
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="Price"
                            value={item.unitPrice}
                            onChange={(e) => {
                              const updatedItems = [...creditSaleForm.items];
                              const unitPrice = parseFloat(e.target.value) || 0;
                              updatedItems[index] = { 
                                ...item, 
                                unitPrice,
                                total: item.quantity * unitPrice 
                              };
                              setCreditSaleForm({ ...creditSaleForm, items: updatedItems });
                            }}
                          />
                        </div>
                        <div className="col-span-2">
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="Total"
                            value={item.total}
                            readOnly
                          />
                        </div>
                        <div className="col-span-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const updatedItems = creditSaleForm.items.filter((_, i) => i !== index);
                              setCreditSaleForm({ ...creditSaleForm, items: updatedItems });
                            }}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      onClick={() => {
                        setCreditSaleForm({
                          ...creditSaleForm,
                          items: [...creditSaleForm.items, { name: '', quantity: 1, unitPrice: 0, total: 0 }]
                        });
                      }}
                    >
                      Add Item
                    </Button>
                  </div>

                  {/* Payment Type Selection */}
                  <div className="space-y-2">
                    <Label>Payment Type</Label>
                    <Select value={creditSaleForm.paymentType} onValueChange={(value: any) => 
                      setCreditSaleForm({ ...creditSaleForm, paymentType: value })
                    }>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="full_credit">Full Credit Sale</SelectItem>
                        <SelectItem value="deposit_and_credit">Use Deposit + Credit</SelectItem>
                        <SelectItem value="installment">Installment Plan</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Sale Total */}
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <div className="text-lg font-semibold">
                      Total Sale Amount: {formatCurrency(creditSaleForm.items.reduce((sum, item) => sum + item.total, 0))}
                    </div>
                  </div>

                  {/* Process Sale Button */}
                  <Button
                    className="w-full"
                    onClick={async () => {
                      try {
                        const saleAmount = creditSaleForm.items.reduce((sum, item) => sum + item.total, 0);
                        const options: CreditSaleOptions = {
                          customerId: creditSaleForm.customerId,
                          saleAmount,
                          items: creditSaleForm.items.filter(item => item.name && item.quantity > 0),
                          paymentType: creditSaleForm.paymentType,
                          notes: creditSaleForm.notes
                        };

                        const result = await CustomerAccountService.processCreditSale(options);
                        if (result.success) {
                          setStatus('Credit sale processed successfully!');
                          setCreditSaleForm({
                            customerId: '',
                            items: [{ name: '', quantity: 1, unitPrice: 0, total: 0 }],
                            paymentType: 'full_credit',
                            useDepositAmount: 0,
                            creditAmount: 0,
                            notes: ''
                          });
                          loadEnhancedCustomers();
                        } else {
                          setStatus('Error processing credit sale: ' + (result.errors?.join(', ') || 'Unknown error'));
                        }
                      } catch (error) {
                        setStatus('Error processing credit sale: ' + (error as Error).message);
                      }
                    }}
                    disabled={!creditSaleForm.customerId || creditSaleForm.items.length === 0}
                  >
                    Process Credit Sale
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Payments Tab */}
          <TabsContent value="payments" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg sm:text-xl">Payment Management</CardTitle>
                <CardDescription className="text-sm">Record customer payments and manage deposits</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Record Payment Section */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Record Payment</h3>
                    
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label>Customer</Label>
                        <Select value={paymentForm.customerId} onValueChange={(value) => 
                          setPaymentForm({ ...paymentForm, customerId: value })
                        }>
                          <SelectTrigger>
                            <SelectValue placeholder="Select customer" />
                          </SelectTrigger>
                          <SelectContent>
                            {enhancedCustomers.map((customer) => (
                              <SelectItem key={customer.id} value={customer.id}>
                                {customer.name} - Balance: {formatCurrency(customer.currentBalance)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Payment Amount</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={paymentForm.amount}
                          onChange={(e) => setPaymentForm({ 
                            ...paymentForm, 
                            amount: parseFloat(e.target.value) || 0 
                          })}
                          placeholder="0.00"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Payment Method</Label>
                        <Select value={paymentForm.paymentMethod} onValueChange={(value: PaymentMethod) => 
                          setPaymentForm({ ...paymentForm, paymentMethod: value })
                        }>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="cash">Cash</SelectItem>
                            <SelectItem value="card">Card</SelectItem>
                            <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                            <SelectItem value="mobile_money">Mobile Money</SelectItem>
                            <SelectItem value="check">Check</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <Button
                        className="w-full"
                        onClick={async () => {
                          try {
                            const result = await CustomerAccountService.recordPayment({
                              customerId: paymentForm.customerId,
                              amount: paymentForm.amount,
                              paymentMethod: paymentForm.paymentMethod,
                              notes: paymentForm.notes
                            });

                            if (result.success) {
                              setStatus('Payment recorded successfully!');
                              setPaymentForm({
                                customerId: '',
                                amount: 0,
                                paymentMethod: 'cash',
                                applyToInstallment: false,
                                installmentPlanId: '',
                                notes: ''
                              });
                              loadEnhancedCustomers();
                            } else {
                              setStatus('Error recording payment: ' + (result.errors?.join(', ') || 'Unknown error'));
                            }
                          } catch (error) {
                            setStatus('Error recording payment: ' + (error as Error).message);
                          }
                        }}
                        disabled={!paymentForm.customerId || paymentForm.amount <= 0}
                      >
                        Record Payment
                      </Button>
                    </div>
                  </div>

                  {/* Add Deposit Section */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Add Customer Deposit</h3>
                    
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label>Customer</Label>
                        <Select value={depositForm.customerId} onValueChange={(value) => 
                          setDepositForm({ ...depositForm, customerId: value })
                        }>
                          <SelectTrigger>
                            <SelectValue placeholder="Select customer" />
                          </SelectTrigger>
                          <SelectContent>
                            {enhancedCustomers.map((customer) => (
                              <SelectItem key={customer.id} value={customer.id}>
                                {customer.name} - Deposit: {formatCurrency(customer.depositBalance)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Deposit Amount</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={depositForm.amount}
                          onChange={(e) => setDepositForm({ 
                            ...depositForm, 
                            amount: parseFloat(e.target.value) || 0 
                          })}
                          placeholder="0.00"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Payment Method</Label>
                        <Select value={depositForm.paymentMethod} onValueChange={(value: PaymentMethod) => 
                          setDepositForm({ ...depositForm, paymentMethod: value })
                        }>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="cash">Cash</SelectItem>
                            <SelectItem value="card">Card</SelectItem>
                            <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                            <SelectItem value="mobile_money">Mobile Money</SelectItem>
                            <SelectItem value="check">Check</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <Button
                        className="w-full"
                        onClick={async () => {
                          try {
                            const result = await CustomerAccountService.addDeposit({
                              customerId: depositForm.customerId,
                              amount: depositForm.amount,
                              paymentMethod: depositForm.paymentMethod,
                              notes: depositForm.notes
                            });

                            if (result.success) {
                              setStatus('Deposit added successfully!');
                              setDepositForm({
                                customerId: '',
                                amount: 0,
                                paymentMethod: 'cash',
                                notes: ''
                              });
                              loadEnhancedCustomers();
                            } else {
                              setStatus('Error adding deposit: ' + (result.errors?.join(', ') || 'Unknown error'));
                            }
                          } catch (error) {
                            setStatus('Error adding deposit: ' + (error as Error).message);
                          }
                        }}
                        disabled={!depositForm.customerId || depositForm.amount <= 0}
                      >
                        Add Deposit
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Installments Tab */}
          <TabsContent value="installments" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg sm:text-xl">Installment Plans</CardTitle>
                <CardDescription className="text-sm">Manage customer installment payment plans</CardDescription>
              </CardHeader>
              <CardContent>
                {installmentPlans.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                    <p className="text-lg font-medium">No installment plans found</p>
                    <p className="text-sm">Installment plans will appear here when customers choose installment payment options</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {installmentPlans.map((plan) => (
                      <Card key={plan.id} className="p-4">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <h4 className="font-semibold">Plan #{plan.id}</h4>
                            <p className="text-sm text-muted-foreground">
                              Customer: {enhancedCustomers.find(c => c.id === plan.customerId)?.name}
                            </p>
                          </div>
                          <Badge variant={plan.status === 'active' ? 'default' : 'secondary'}>
                            {plan.status}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">Total:</span>
                            <div className="font-semibold">{formatCurrency(plan.totalAmount)}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Remaining:</span>
                            <div className="font-semibold">{formatCurrency(plan.remainingAmount)}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Installments:</span>
                            <div className="font-semibold">{plan.numberOfInstallments}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Frequency:</span>
                            <div className="font-semibold capitalize">{plan.frequency}</div>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Edit Customer Modal */}
        <Dialog open={showEditCustomer} onOpenChange={setShowEditCustomer}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Customer</DialogTitle>
              <DialogDescription>
                Update customer information and account settings.
              </DialogDescription>
            </DialogHeader>
            
            {selectedCustomerForEdit && (
              <form onSubmit={(e) => {
                e.preventDefault();
                try {
                  const success = CustomerAccountService.updateCustomerAccount(selectedCustomerForEdit.id, {
                    name: customerForm.name,
                    contact: customerForm.contact,
                    email: customerForm.email || undefined,
                    address: customerForm.address || undefined,
                    customerType: customerForm.customerType,
                    creditLimit: customerForm.creditLimit,
                    paymentTermsDays: customerForm.paymentTermsDays
                  });
                  
                  if (success) {
                    loadEnhancedCustomers();
                    setStatus(`Customer ${customerForm.name} updated successfully!`);
                    setShowEditCustomer(false);
                    setSelectedCustomerForEdit(null);
                  } else {
                    setStatus('Error updating customer. Please try again.');
                  }
                } catch (error) {
                  setStatus('Error updating customer: ' + (error as Error).message);
                }
              }} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-customer-name">Customer Name *</Label>
                  <Input
                    id="edit-customer-name"
                    value={customerForm.name}
                    onChange={(e) => handleCustomerChange('name', e.target.value)}
                    placeholder="Enter customer name"
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="edit-customer-contact">Contact Number *</Label>
                  <Input
                    id="edit-customer-contact"
                    value={customerForm.contact}
                    onChange={(e) => handleCustomerChange('contact', e.target.value)}
                    placeholder="Enter contact number"
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="edit-customer-email">Email (Optional)</Label>
                  <Input
                    id="edit-customer-email"
                    type="email"
                    value={customerForm.email}
                    onChange={(e) => handleCustomerChange('email', e.target.value)}
                    placeholder="Enter email address"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="edit-customer-address">Address</Label>
                  <Textarea
                    id="edit-customer-address"
                    value={customerForm.address}
                    onChange={(e) => handleCustomerChange('address', e.target.value)}
                    placeholder="Enter customer address"
                    rows={2}
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="edit-customer-type">Customer Type</Label>
                    <Select value={customerForm.customerType} onValueChange={(value) => handleCustomerChange('customerType', value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="individual">Individual</SelectItem>
                        <SelectItem value="business">Business</SelectItem>
                        <SelectItem value="wholesale">Wholesale</SelectItem>
                        <SelectItem value="retail">Retail</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="edit-payment-terms">Payment Terms (Days)</Label>
                    <Input
                      id="edit-payment-terms"
                      type="number"
                      min="1"
                      value={customerForm.paymentTermsDays}
                      onChange={(e) => handleCustomerChange('paymentTermsDays', parseInt(e.target.value) || 30)}
                      placeholder="30"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-credit-limit">Credit Limit</Label>
                  <Input
                    id="edit-credit-limit"
                    type="number"
                    min="0"
                    step="0.01"
                    value={customerForm.creditLimit}
                    onChange={(e) => handleCustomerChange('creditLimit', parseFloat(e.target.value) || 0)}
                    placeholder="10000.00"
                  />
                </div>
                
                <DialogFooter className="gap-2">
                  <Button type="button" variant="outline" onClick={() => {
                    setShowEditCustomer(false);
                    setSelectedCustomerForEdit(null);
                  }}>
                    Cancel
                  </Button>
                  <Button type="submit">Update Customer</Button>
                </DialogFooter>
              </form>
            )}
          </DialogContent>
        </Dialog>

        {/* Delete Customer Confirmation Modal */}
        <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-red-600">Delete Customer</DialogTitle>
              <DialogDescription>
                This action cannot be undone. This will permanently delete the customer account and all associated data.
              </DialogDescription>
            </DialogHeader>
            
            {selectedCustomerForDelete && (() => {
              const deleteCheck = CustomerAccountService.canDeleteCustomer(selectedCustomerForDelete.id);
              
              return (
                <div className="space-y-4">
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <h4 className="font-medium mb-2">Customer: {selectedCustomerForDelete.name}</h4>
                    <div className="text-sm text-gray-600 space-y-1">
                      <p>Account: {selectedCustomerForDelete.accountNumber}</p>
                      <p>Balance: {formatCurrency(selectedCustomerForDelete.currentBalance)}</p>
                      <p>Deposit: {formatCurrency(selectedCustomerForDelete.depositBalance)}</p>
                    </div>
                  </div>
                  
                  {deleteCheck.blockers.length > 0 && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                      <h5 className="font-medium text-red-800 mb-2">⚠️ Cannot Delete - Issues Found:</h5>
                      <ul className="text-sm text-red-700 space-y-1">
                        {deleteCheck.blockers.map((blocker, index) => (
                          <li key={index}>• {blocker}</li>
                        ))}
                      </ul>
                      <p className="text-sm text-red-600 mt-3">
                        Resolve these issues before deleting this customer.
                      </p>
                    </div>
                  )}
                  
                  {deleteCheck.warnings.length > 0 && (
                    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <h5 className="font-medium text-yellow-800 mb-2">⚠️ Warnings:</h5>
                      <ul className="text-sm text-yellow-700 space-y-1">
                        {deleteCheck.warnings.map((warning, index) => (
                          <li key={index}>• {warning}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {deleteCheck.canDelete && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-sm text-red-700">
                        <strong>Are you sure you want to delete this customer?</strong><br/>
                        This will permanently remove all customer data, transaction history, and installment plans.
                      </p>
                    </div>
                  )}
                  
                  <DialogFooter className="gap-2">
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => {
                        setShowDeleteConfirm(false);
                        setSelectedCustomerForDelete(null);
                      }}
                    >
                      Cancel
                    </Button>
                    
                    {deleteCheck.canDelete && (
                      <Button 
                        type="button"
                        variant="destructive"
                        onClick={() => {
                          try {
                            const result = CustomerAccountService.deleteCustomerAccount(
                              selectedCustomerForDelete.id,
                              { checkDependencies: true, forceDelete: false }
                            );
                            
                            if (result.success) {
                              loadEnhancedCustomers();
                              setStatus(`Customer ${selectedCustomerForDelete.name} deleted successfully.`);
                              if (result.warnings && result.warnings.length > 0) {
                                setStatus(prev => prev + ' Warnings: ' + result.warnings!.join(', '));
                              }
                            } else {
                              setStatus('Error deleting customer: ' + (result.errors?.join(', ') || 'Unknown error'));
                            }
                            
                            setShowDeleteConfirm(false);
                            setSelectedCustomerForDelete(null);
                          } catch (error) {
                            setStatus('Error deleting customer: ' + (error as Error).message);
                            setShowDeleteConfirm(false);
                            setSelectedCustomerForDelete(null);
                          }
                        }}
                        className="gap-2"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete Customer
                      </Button>
                    )}
                  </DialogFooter>
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>

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
                <Label htmlFor="customer-address">Address</Label>
                <Textarea
                  id="customer-address"
                  value={customerForm.address}
                  onChange={(e) => handleCustomerChange('address', e.target.value)}
                  placeholder="Enter customer address"
                  rows={2}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="customer-type">Customer Type</Label>
                  <Select value={customerForm.customerType} onValueChange={(value) => handleCustomerChange('customerType', value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="individual">Individual</SelectItem>
                      <SelectItem value="business">Business</SelectItem>
                      <SelectItem value="wholesale">Wholesale</SelectItem>
                      <SelectItem value="retail">Retail</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="payment-terms">Payment Terms (Days)</Label>
                  <Input
                    id="payment-terms"
                    type="number"
                    min="1"
                    value={customerForm.paymentTermsDays}
                    onChange={(e) => handleCustomerChange('paymentTermsDays', parseInt(e.target.value) || 30)}
                    placeholder="30"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="credit-limit">Credit Limit</Label>
                <Input
                  id="credit-limit"
                  type="number"
                  min="0"
                  step="0.01"
                  value={customerForm.creditLimit}
                  onChange={(e) => handleCustomerChange('creditLimit', parseFloat(e.target.value) || 0)}
                  placeholder="10000.00"
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

        {/* Customer Detail Modal */}
        <Dialog open={showCustomerDetail} onOpenChange={setShowCustomerDetail}>
          <DialogContent className="sm:max-w-6xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold">Customer Details</DialogTitle>
              <DialogDescription>
                Complete account information and activity summary
              </DialogDescription>
            </DialogHeader>
            
            {selectedCustomer && (() => {
              const customer = enhancedCustomers.find(c => c.id === selectedCustomer);
              const accountSummary = CustomerAccountService.getAccountSummary(selectedCustomer);
              const recentTransactions = CustomerAccountService.getCustomerTransactions(selectedCustomer).slice(0, 10);
              const customerPlans = CustomerAccountService.getCustomerInstallmentPlans(selectedCustomer);
              
              if (!customer) return (
                <div className="p-4 text-center">
                  <p className="text-muted-foreground">Customer not found</p>
                </div>
              );
              
              return (
                <div className="space-y-6 p-1">
                  {/* Customer Overview */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <User className="h-5 w-5" />
                          Basic Information
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div>
                          <Label className="text-sm font-medium text-muted-foreground">Name</Label>
                          <p className="text-lg font-semibold">{customer.name}</p>
                        </div>
                        <div>
                          <Label className="text-sm font-medium text-muted-foreground">Account Number</Label>
                          <p className="font-mono text-sm bg-muted px-2 py-1 rounded">{customer.accountNumber}</p>
                        </div>
                        <div>
                          <Label className="text-sm font-medium text-muted-foreground">Contact</Label>
                          <p>{customer.contact}</p>
                        </div>
                        {customer.email && (
                          <div>
                            <Label className="text-sm font-medium text-muted-foreground">Email</Label>
                            <p>{customer.email}</p>
                          </div>
                        )}
                        {customer.address && (
                          <div>
                            <Label className="text-sm font-medium text-muted-foreground">Address</Label>
                            <p className="text-sm">{customer.address}</p>
                          </div>
                        )}
                        <div>
                          <Label className="text-sm font-medium text-muted-foreground">Customer Type</Label>
                          <Badge variant="outline" className="capitalize">
                            {customer.customerType}
                          </Badge>
                        </div>
                        <div>
                          <Label className="text-sm font-medium text-muted-foreground">Account Status</Label>
                          <Badge variant={customer.status === 'active' ? 'default' : 'destructive'} className="capitalize">
                            {customer.status}
                          </Badge>
                        </div>
                        <div>
                          <Label className="text-sm font-medium text-muted-foreground">Member Since</Label>
                          <p className="text-sm">{new Date(customer.createdDate).toLocaleDateString()}</p>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <DollarSign className="h-5 w-5" />
                          Financial Summary
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div>
                          <Label className="text-sm font-medium text-muted-foreground">Current Balance</Label>
                          <p className={`text-lg font-bold ${customer.currentBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {formatCurrency(customer.currentBalance)}
                          </p>
                        </div>
                        <div>
                          <Label className="text-sm font-medium text-muted-foreground">Deposit Balance</Label>
                          <p className="text-lg font-semibold text-blue-600">
                            {formatCurrency(customer.depositBalance)}
                          </p>
                        </div>
                        <div>
                          <Label className="text-sm font-medium text-muted-foreground">Credit Limit</Label>
                          <p className="font-semibold">{formatCurrency(customer.creditLimit)}</p>
                        </div>
                        <div>
                          <Label className="text-sm font-medium text-muted-foreground">Available Credit</Label>
                          <p className="font-semibold text-green-600">{formatCurrency(customer.availableCredit)}</p>
                        </div>
                        <div>
                          <Label className="text-sm font-medium text-muted-foreground">Credit Utilization</Label>
                          <div className="flex items-center justify-between">
                            <span className={`font-semibold ${
                              customer.creditLimit > 0 && (customer.totalCreditUsed / customer.creditLimit) > 0.8 
                                ? 'text-red-600' 
                                : customer.creditLimit > 0 && (customer.totalCreditUsed / customer.creditLimit) > 0.5 
                                ? 'text-yellow-600' 
                                : 'text-green-600'
                            }`}>
                              {customer.creditLimit > 0 ? Math.round((customer.totalCreditUsed / customer.creditLimit) * 100) : 0}%
                            </span>
                            <span className="text-sm text-muted-foreground">
                              {formatCurrency(customer.totalCreditUsed)} / {formatCurrency(customer.creditLimit)}
                            </span>
                          </div>
                        </div>
                        <div>
                          <Label className="text-sm font-medium text-muted-foreground">Lifetime Value</Label>
                          <p className="font-semibold">{formatCurrency(customer.lifetimeValue)}</p>
                        </div>
                        <div>
                          <Label className="text-sm font-medium text-muted-foreground">Payment Terms</Label>
                          <p>{customer.paymentTermsDays} days</p>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Account Summary Stats */}
                  {accountSummary && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <BarChart className="h-5 w-5" />
                          Account Performance
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="text-center">
                            <p className="text-2xl font-bold text-blue-600">{accountSummary.totalTransactions}</p>
                            <p className="text-sm text-muted-foreground">Total Transactions</p>
                          </div>
                          <div className="text-center">
                            <p className="text-2xl font-bold text-green-600">{formatCurrency(accountSummary.totalPayments)}</p>
                            <p className="text-sm text-muted-foreground">Total Payments</p>
                          </div>
                          <div className="text-center">
                            <p className="text-2xl font-bold text-purple-600">{accountSummary.creditScore}/100</p>
                            <p className="text-sm text-muted-foreground">Credit Score</p>
                          </div>
                          <div className="text-center">
                            <p className="text-2xl font-bold text-orange-600">{formatCurrency(accountSummary.averageMonthlySpending)}</p>
                            <p className="text-sm text-muted-foreground">Avg Monthly</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Recent Transactions */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Activity className="h-5 w-5" />
                        Recent Transactions
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {recentTransactions.length > 0 ? (
                        <div className="space-y-3">
                          {recentTransactions.map((transaction) => (
                            <div key={transaction.id} className="flex items-center justify-between p-3 border rounded-lg">
                              <div className="space-y-1">
                                <p className="font-medium">{transaction.description}</p>
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <span>{new Date(transaction.date).toLocaleDateString()}</span>
                                  <span>•</span>
                                  <span className="capitalize">{transaction.type.replace('_', ' ')}</span>
                                  {transaction.paymentMethod && (
                                    <>
                                      <span>•</span>
                                      <span className="capitalize">{transaction.paymentMethod}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                              <div className="text-right">
                                <p className={`font-semibold ${transaction.isDebit ? 'text-green-600' : 'text-red-600'}`}>
                                  {transaction.isDebit ? '-' : '+'}{formatCurrency(transaction.amount)}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  Balance: {formatCurrency(transaction.balanceAfter)}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          <Activity className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                          <p>No transactions found</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Installment Plans */}
                  {customerPlans.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Calendar className="h-5 w-5" />
                          Active Installment Plans
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {customerPlans.map((plan) => (
                            <div key={plan.id} className="p-3 border rounded-lg">
                              <div className="flex items-center justify-between mb-2">
                                <p className="font-medium">Plan #{plan.planNumber}</p>
                                <Badge variant={plan.status === 'active' ? 'default' : 'secondary'} className="capitalize">
                                  {plan.status}
                                </Badge>
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                                <div>
                                  <span className="text-muted-foreground">Total:</span>
                                  <span className="ml-1 font-medium">{formatCurrency(plan.totalAmount)}</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Paid:</span>
                                  <span className="ml-1 font-medium text-green-600">{formatCurrency(plan.paidAmount)}</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Remaining:</span>
                                  <span className="ml-1 font-medium text-red-600">{formatCurrency(plan.remainingAmount)}</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Next Due:</span>
                                  <span className="ml-1 font-medium">{new Date(plan.nextDueDate).toLocaleDateString()}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {customer.notes && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <FileText className="h-5 w-5" />
                          Notes
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm whitespace-pre-wrap">{customer.notes}</p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              );
            })()}

            <DialogFooter>
              <Button onClick={() => setShowCustomerDetail(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Customer History Popup Modal */}
        <Dialog open={showCustomerHistoryModal} onOpenChange={setShowCustomerHistoryModal}>
          <DialogContent className="sm:max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Transaction History - {selectedCustomerForHistory?.name}
              </DialogTitle>
              <DialogDescription>
                Complete transaction history for this customer
              </DialogDescription>
            </DialogHeader>
            
            {selectedCustomerForHistory && (() => {
              const customerTransactions = transactionHistory[selectedCustomerForHistory.id] || [];
              const stats = getCustomerStats(selectedCustomerForHistory);
              
              return (
                <div className="space-y-4">
                  {/* Customer Summary */}
                  <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                    <div className="space-y-1">
                      <h4 className="font-semibold">{selectedCustomerForHistory.name}</h4>
                      <p className="text-sm text-muted-foreground">Account: {selectedCustomerForHistory.accountNumber}</p>
                    </div>
                    <div className="text-right space-y-1">
                      <div className={`text-lg font-bold ${selectedCustomerForHistory.currentBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {formatCurrency(selectedCustomerForHistory.currentBalance)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {stats.totalTransactions} transactions • Last: {stats.lastTransaction}
                      </div>
                    </div>
                  </div>

                  {/* Transaction History - OPTIMIZED WITH PAGINATION */}
                  {customerTransactions.length > 0 ? (
                    <div className="space-y-3">
                      <PaginatedList
                        items={customerTransactions}
                        renderItem={(transaction) => (
                          <div className="p-3 border rounded-lg hover:bg-muted/20 transition-colors">
                            <div className="flex justify-between items-start">
                              <div className="space-y-1">
                                <div className="flex items-center gap-3">
                                  <span className="text-sm font-medium">
                                    {transaction.type === 'credit' ? 'Payment Received' : 
                                     transaction.type === 'debit' ? 'Purchase/Charge' : 
                                     transaction.displayType || 'Transaction'}
                                  </span>
                                  <Badge variant={transaction.type === 'credit' ? 'default' : 'secondary'} className="text-xs">
                                    {transaction.type === 'credit' ? 'Payment' : 'Charge'}
                                  </Badge>
                                </div>
                                
                                {transaction.note && (
                                  <p className="text-sm text-muted-foreground">{transaction.note}</p>
                                )}
                                
                                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                  <span>{new Date(transaction.date || transaction.timestamp).toLocaleDateString()}</span>
                                  {transaction.paymentMethod && (
                                    <span className="capitalize">via {transaction.paymentMethod.replace('_', ' ')}</span>
                                  )}
                                  {transaction.source && (
                                    <span>Source: {transaction.source}</span>
                                  )}
                                </div>
                              </div>
                              
                              <div className="text-right">
                                <div className={`text-lg font-bold ${
                                  transaction.type === 'credit' ? 'text-green-600' : 'text-blue-600'
                                }`}>
                                  {transaction.type === 'credit' ? '+' : ''}
                                  {formatCurrency(transaction.total || transaction.amount || 0)}
                                </div>
                                
                                <div className="text-xs text-muted-foreground mt-1">
                                  {new Date(transaction.date || transaction.timestamp).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                        defaultItemsPerPage={10}
                        itemsPerPageOptions={[10, 20, 50]}
                        showSearch
                        searchPlaceholder="Search transactions..."
                        compact
                        emptyMessage="No transactions found"
                      />
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <History className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                      <p className="text-lg font-medium">No transaction history</p>
                      <p className="text-sm">This customer hasn't made any transactions yet</p>
                    </div>
                  )}
                </div>
              );
            })()}
            
            <DialogFooter className="flex justify-between">
              <Button 
                variant="outline"
                onClick={() => {
                  if (selectedCustomerForHistory) {
                    const customerTransactions = transactionHistory[selectedCustomerForHistory.id] || [];
                    exportToCSV(
                      customerTransactions.map(tx => ({
                        Date: new Date(tx.date || tx.timestamp).toLocaleDateString(),
                        Type: tx.type === 'credit' ? 'Payment' : 'Charge',
                        Amount: tx.total || tx.amount || 0,
                        Note: tx.note || '',
                        PaymentMethod: tx.paymentMethod || '',
                        Source: tx.source || ''
                      })), 
                      `${selectedCustomerForHistory.name.replace(/\s+/g, '_')}_transaction_history.csv`
                    );
                  }
                }}
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                Export History
              </Button>
              
              <Button onClick={() => setShowCustomerHistoryModal(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>




      </div>
    </div>
  );
};

export default CustomerLedgerFormShadcn;