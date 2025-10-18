/**
 * Payment & Billing Page
 * Manage transactions, payments, refunds, and billing records
 */

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import MainLayout from '../components/layout/MainLayout';
import { FormField } from '../components/Form';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { 
  DollarSign, 
  Receipt, 
  RefreshCw, 
  TrendingUp, 
  History,
  Filter,
  Download,
  AlertCircle
} from 'lucide-react';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import * as POSServiceAPI from '../services/POSServiceAPI';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface Transaction {
  id: string;
  invoiceNumber: string;
  timestamp: string;
  customerName: string;
  total: number;
  amountPaid: number;
  outstanding: number;
  status: 'PAID' | 'PARTIAL' | 'PENDING';
  paymentMethod: string;
  reference?: string;
  notes?: string;
}

interface PaymentStats {
  totalRevenue: number;
  totalTransactions: number;
  pendingAmount: number;
  refundedAmount: number;
}

interface PaymentFilter {
  dateFrom: Date | null;
  dateTo: Date | null;
  paymentMethod: string;
  status: string;
  searchTerm: string;
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

async function fetchTransactions(): Promise<Transaction[]> {
  try {
    const apiTransactions = await POSServiceAPI.getAllTransactions();
    return apiTransactions.map((t: any) => ({
      id: t.id || t.transaction_id || '',
      invoiceNumber: t.invoiceNumber || t.invoiceNo || `INV-${t.id}`,
      timestamp: t.createdAt || t.transaction_date || new Date().toISOString(),
      customerName: t.customerName || 'Walk-in Customer',
      total: parseFloat(t.total) || 0,
      amountPaid: parseFloat(t.amountPaid || t.total) || 0,
      outstanding: Math.max(0, parseFloat(t.total) - parseFloat(t.amountPaid || t.total)),
      status: determineStatus(t),
      paymentMethod: t.paymentMethod || 'Cash',
      reference: t.reference || '',
      notes: t.notes || ''
    }));
  } catch (error) {
    console.error('Failed to fetch transactions:', error);
    throw error;
  }
}

function determineStatus(transaction: any): 'PAID' | 'PARTIAL' | 'PENDING' {
  const total = parseFloat(transaction.total) || 0;
  const paid = parseFloat(transaction.amountPaid || transaction.total) || 0;
  
  if (paid >= total) return 'PAID';
  if (paid > 0) return 'PARTIAL';
  return 'PENDING';
}

function calculateStats(transactions: Transaction[]): PaymentStats {
  return transactions.reduce((stats, t) => ({
    totalRevenue: stats.totalRevenue + t.amountPaid,
    totalTransactions: stats.totalTransactions + 1,
    pendingAmount: stats.pendingAmount + t.outstanding,
    refundedAmount: stats.refundedAmount // Not tracking refunds yet
  }), {
    totalRevenue: 0,
    totalTransactions: 0,
    pendingAmount: 0,
    refundedAmount: 0
  });
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface PaymentBillingPageProps {
  onNavigate: (screen: string) => void;
}

const PaymentBillingPage: React.FC<PaymentBillingPageProps> = ({ onNavigate }) => {
  const [filters, setFilters] = useState<PaymentFilter>({
    dateFrom: subDays(new Date(), 30),
    dateTo: new Date(),
    paymentMethod: 'all',
    status: 'all',
    searchTerm: ''
  });

  const [showFilters, setShowFilters] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);

  // React Query for data fetching
  const { 
    data: transactions = [], 
    error, 
    isLoading,
    refetch 
  } = useQuery({
    queryKey: ['transactions'],
    queryFn: fetchTransactions,
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  // Calculate statistics
  const stats = React.useMemo(() => 
    calculateStats(transactions), 
    [transactions]
  );

  // Apply filters to transactions
  const filteredTransactions = React.useMemo(() => {
    let filtered = [...transactions];

    // Date range filter
    if (filters.dateFrom) {
      const fromDate = startOfDay(filters.dateFrom);
      filtered = filtered.filter(t => new Date(t.timestamp) >= fromDate);
    }
    if (filters.dateTo) {
      const toDate = endOfDay(filters.dateTo);
      filtered = filtered.filter(t => new Date(t.timestamp) <= toDate);
    }

    // Payment method filter
    if (filters.paymentMethod !== 'all') {
      filtered = filtered.filter(t => t.paymentMethod === filters.paymentMethod);
    }

    // Status filter
    if (filters.status !== 'all') {
      filtered = filtered.filter(t => t.status === filters.status);
    }

    // Search filter
    if (filters.searchTerm) {
      const searchLower = filters.searchTerm.toLowerCase();
      filtered = filtered.filter(t => 
        t.invoiceNumber.toLowerCase().includes(searchLower) ||
        t.customerName.toLowerCase().includes(searchLower) ||
        t.reference?.toLowerCase().includes(searchLower)
      );
    }

    // Sort by most recent first
    return filtered.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [transactions, filters]);

  const updateFilter = (field: keyof PaymentFilter, value: any) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  return (
    <MainLayout
      selected="payment-billing"
      onNavigate={onNavigate}
      title="Payment & Billing"
      subtitle="Manage transactions, payments, and refunds"
      actions={
        <>
          <Button 
            variant="outline" 
            size="sm" 
            className="gap-2"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="h-4 w-4" />
            <span className="hidden sm:inline">Filter</span>
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            className="gap-2"
            onClick={() => refetch()}
          >
            <RefreshCw className="h-4 w-4" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button variant="outline" size="sm" className="gap-2">
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Export</span>
          </Button>
        </>
      }
      maxWidth="7xl"
    >
      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-3 text-muted-foreground">Loading transactions...</span>
        </div>
      )}

      {/* Error State */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
              <div>
                <p className="font-medium text-destructive">Failed to load transactions</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {(error as Error).message}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Content */}
      {!isLoading && !error && (
        <>
          {/* Statistics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardDescription>Total Revenue</CardDescription>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </div>
                <CardTitle className="text-2xl lg:text-3xl">
                  ${stats.totalRevenue.toFixed(2)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  From {stats.totalTransactions} transactions
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardDescription>Transactions</CardDescription>
                  <Receipt className="h-4 w-4 text-muted-foreground" />
                </div>
                <CardTitle className="text-2xl lg:text-3xl">
                  {stats.totalTransactions}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Last 30 days
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardDescription>Pending Amount</CardDescription>
                  <History className="h-4 w-4 text-muted-foreground" />
                </div>
                <CardTitle className="text-2xl lg:text-3xl">
                  ${stats.pendingAmount.toFixed(2)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Outstanding payments
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardDescription>Avg Transaction</CardDescription>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </div>
                <CardTitle className="text-2xl lg:text-3xl">
                  ${stats.totalTransactions > 0 
                    ? (stats.totalRevenue / stats.totalTransactions).toFixed(2) 
                    : '0.00'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Per transaction
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Filters Section */}
          {showFilters && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-lg">Filters</CardTitle>
                <CardDescription>Refine your transaction search</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <FormField
                    label="Payment Method"
                    name="paymentMethod"
                    type="select"
                    value={filters.paymentMethod}
                    onChange={(value) => updateFilter('paymentMethod', value)}
                    options={[
                      { value: 'all', label: 'All Methods' },
                      { value: 'Cash', label: 'Cash' },
                      { value: 'Card', label: 'Card' },
                      { value: 'Mobile Money', label: 'Mobile Money' },
                      { value: 'Bank Transfer', label: 'Bank Transfer' }
                    ]}
                    fullWidth
                  />

                  <FormField
                    label="Status"
                    name="status"
                    type="select"
                    value={filters.status}
                    onChange={(value) => updateFilter('status', value)}
                    options={[
                      { value: 'all', label: 'All Status' },
                      { value: 'PAID', label: 'Paid' },
                      { value: 'PARTIAL', label: 'Partial' },
                      { value: 'PENDING', label: 'Pending' }
                    ]}
                    fullWidth
                  />

                  <FormField
                    label="Date From"
                    name="dateFrom"
                    type="date"
                    value={filters.dateFrom ? format(filters.dateFrom, 'yyyy-MM-dd') : ''}
                    onChange={(value) => updateFilter('dateFrom', value ? new Date(value) : null)}
                    fullWidth
                  />

                  <FormField
                    label="Date To"
                    name="dateTo"
                    type="date"
                    value={filters.dateTo ? format(filters.dateTo, 'yyyy-MM-dd') : ''}
                    onChange={(value) => updateFilter('dateTo', value ? new Date(value) : null)}
                    fullWidth
                  />
                </div>

                <div className="mt-4">
                  <FormField
                    label="Search"
                    name="search"
                    type="text"
                    value={filters.searchTerm}
                    onChange={(value) => updateFilter('searchTerm', value)}
                    placeholder="Search by invoice #, customer, or reference..."
                    fullWidth
                  />
                </div>

                <div className="flex justify-end gap-2 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFilters({
                      dateFrom: subDays(new Date(), 30),
                      dateTo: new Date(),
                      paymentMethod: 'all',
                      status: 'all',
                      searchTerm: ''
                    })}
                  >
                    Clear Filters
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Transactions Table */}
          <Card>
            <CardHeader>
              <CardTitle>Transactions</CardTitle>
              <CardDescription>
                Showing {filteredTransactions.length} of {transactions.length} transactions
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filteredTransactions.length === 0 ? (
                <div className="text-center py-12">
                  <Receipt className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No transactions found</p>
                  <p className="text-sm text-muted-foreground">
                    Try adjusting your filters or date range
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-2 sm:px-4 font-medium">Invoice</th>
                        <th className="text-left py-3 px-2 sm:px-4 font-medium hidden sm:table-cell">Customer</th>
                        <th className="text-left py-3 px-2 sm:px-4 font-medium">Amount</th>
                        <th className="text-left py-3 px-2 sm:px-4 font-medium hidden md:table-cell">Payment</th>
                        <th className="text-left py-3 px-2 sm:px-4 font-medium">Status</th>
                        <th className="text-left py-3 px-2 sm:px-4 font-medium hidden lg:table-cell">Date</th>
                        <th className="text-left py-3 px-2 sm:px-4 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTransactions.map((transaction) => (
                        <tr 
                          key={transaction.id} 
                          className="border-b hover:bg-muted/50 transition-colors"
                        >
                          <td className="py-3 px-2 sm:px-4 font-medium">
                            {transaction.invoiceNumber}
                          </td>
                          <td className="py-3 px-2 sm:px-4 hidden sm:table-cell">
                            {transaction.customerName}
                          </td>
                          <td className="py-3 px-2 sm:px-4">
                            <div>
                              <div className="font-medium">${transaction.total.toFixed(2)}</div>
                              {transaction.outstanding > 0 && (
                                <div className="text-xs text-muted-foreground">
                                  ${transaction.outstanding.toFixed(2)} due
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-2 sm:px-4 hidden md:table-cell">
                            <Badge variant="outline">{transaction.paymentMethod}</Badge>
                          </td>
                          <td className="py-3 px-2 sm:px-4">
                            <Badge 
                              variant={
                                transaction.status === 'PAID' ? 'default' :
                                transaction.status === 'PARTIAL' ? 'secondary' :
                                'destructive'
                              }
                            >
                              {transaction.status}
                            </Badge>
                          </td>
                          <td className="py-3 px-2 sm:px-4 hidden lg:table-cell text-muted-foreground">
                            {format(new Date(transaction.timestamp), 'MMM dd, yyyy')}
                          </td>
                          <td className="py-3 px-2 sm:px-4">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedTransaction(transaction)}
                            >
                              View
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Transaction Detail Dialog */}
      <Dialog 
        open={!!selectedTransaction} 
        onOpenChange={(open) => !open && setSelectedTransaction(null)}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Transaction Details</DialogTitle>
          </DialogHeader>
          {selectedTransaction && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Invoice Number</p>
                  <p className="text-lg font-semibold">{selectedTransaction.invoiceNumber}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Status</p>
                  <Badge className="mt-1" variant={
                    selectedTransaction.status === 'PAID' ? 'default' :
                    selectedTransaction.status === 'PARTIAL' ? 'secondary' :
                    'destructive'
                  }>
                    {selectedTransaction.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Customer</p>
                  <p className="font-medium">{selectedTransaction.customerName}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Date</p>
                  <p className="font-medium">
                    {format(new Date(selectedTransaction.timestamp), 'MMM dd, yyyy HH:mm')}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Amount</p>
                  <p className="text-lg font-bold">${selectedTransaction.total.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Amount Paid</p>
                  <p className="text-lg font-bold text-green-600">
                    ${selectedTransaction.amountPaid.toFixed(2)}
                  </p>
                </div>
                {selectedTransaction.outstanding > 0 && (
                  <div className="col-span-2">
                    <p className="text-sm font-medium text-muted-foreground">Outstanding</p>
                    <p className="text-lg font-bold text-red-600">
                      ${selectedTransaction.outstanding.toFixed(2)}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Payment Method</p>
                  <p className="font-medium">{selectedTransaction.paymentMethod}</p>
                </div>
                {selectedTransaction.reference && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Reference</p>
                    <p className="font-medium">{selectedTransaction.reference}</p>
                  </div>
                )}
              </div>
              {selectedTransaction.notes && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Notes</p>
                  <p className="mt-1 text-sm">{selectedTransaction.notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
};

export default PaymentBillingPage;
