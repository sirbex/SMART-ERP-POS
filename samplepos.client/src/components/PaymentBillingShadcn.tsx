import React, { useState, useEffect } from 'react';
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Badge } from "./ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Separator } from "./ui/separator";

// Import existing components that will still be used
// import AdvancedFilters from './AdvancedFilters'; // Removed - was not Shadcn-only
// import PaymentCharts from './PaymentCharts'; // Removed - was not Shadcn-only
// import ExportTools from './ExportTools'; // Removed - was not Shadcn-only
// import AccountsReceivable from './AccountsReceivable'; // Removed - was not Shadcn-only
// import PaymentProcessors from './PaymentProcessors'; // Removed - was not Shadcn-only

// Define interfaces for our data structures
interface PaymentDetail {
  amount: number;
  method: string;
  reference: string;
  note?: string;
  timestamp: string;
}

interface SaleItem {
  name: string;
  price: number;
  quantity: number | '';
  batch?: string;
  // UoM support
  unitOfMeasure?: string; // Display name of the unit (e.g., "Dozen", "Box")
  uomId?: string;         // ID of the UoM used
  baseUnitConversion?: number; // Conversion factor to base unit
}

interface SaleRecord {
  id: string;
  cart: SaleItem[];
  customer: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  change: number;
  outstanding: number;
  status: 'PAID' | 'PARTIAL' | 'OVERPAID';
  payments: PaymentDetail[];
  paymentType: string;
  note?: string;
  timestamp: string;
  invoiceNumber: string;
}

// Helper function to format currency
const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
};

// Component for viewing transaction details
const TransactionDetails: React.FC<{ 
  transaction: SaleRecord; 
  onClose: () => void;
  onPrint: (transaction: SaleRecord) => void;
  onEmail: (transaction: SaleRecord) => void;
}> = ({ transaction, onClose, onPrint, onEmail }) => {
  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Transaction Details</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Transaction Info */}
          <Card>
            <CardHeader>
              <CardTitle>Transaction Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">Invoice Number</Label>
                  <p className="text-lg font-semibold">{transaction.invoiceNumber}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Date</Label>
                  <p>{new Date(transaction.timestamp).toLocaleString()}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Customer</Label>
                  <p>{transaction.customer || 'N/A'}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Status</Label>
                  <Badge 
                    variant={
                      transaction.status === 'PAID' ? 'default' :
                      transaction.status === 'PARTIAL' ? 'secondary' : 
                      'destructive'
                    }
                  >
                    {transaction.status}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Items */}
          <Card>
            <CardHeader>
              <CardTitle>Items</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <table className="w-full min-w-[600px]">
                  <thead className="border-b bg-muted/50">
                    <tr>
                      <th className="p-3 text-left">Item</th>
                      <th className="p-3 text-left">Qty</th>
                      <th className="p-3 text-left">Price</th>
                      <th className="p-3 text-left">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transaction.cart.map((item, idx) => (
                      <tr key={idx} className="border-b hover:bg-muted/30">
                        <td className="p-3">
                          <div>
                            <p className="font-medium">{item.name}</p>
                            {item.batch && (
                              <p className="text-sm text-muted-foreground">Batch: {item.batch}</p>
                            )}
                          </div>
                        </td>
                        <td className="p-3">
                          <div>
                            {item.quantity}
                            {item.unitOfMeasure && (
                              <span className="text-sm text-muted-foreground ml-1">
                                {item.unitOfMeasure}
                              </span>
                            )}
                            {item.baseUnitConversion && item.baseUnitConversion > 1 && (
                              <p className="text-xs text-muted-foreground">
                                1 {item.unitOfMeasure} = {item.baseUnitConversion} units
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="p-3">{formatCurrency(item.price)}</td>
                        <td className="p-3">
                          {formatCurrency(item.price * (typeof item.quantity === 'number' ? item.quantity : 0))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Payment Details */}
          <Card>
            <CardHeader>
              <CardTitle>Payment Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Totals */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>Subtotal:</span>
                      <span>{formatCurrency(transaction.subtotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Discount:</span>
                      <span>{formatCurrency(transaction.discount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Tax:</span>
                      <span>{formatCurrency(transaction.tax)}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between font-semibold">
                      <span>Total:</span>
                      <span>{formatCurrency(transaction.total)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Paid:</span>
                      <span>{formatCurrency(transaction.paid)}</span>
                    </div>
                    {transaction.outstanding > 0 && (
                      <div className="flex justify-between text-red-600">
                        <span>Outstanding:</span>
                        <span>{formatCurrency(transaction.outstanding)}</span>
                      </div>
                    )}
                    {transaction.change > 0 && (
                      <div className="flex justify-between text-green-600">
                        <span>Change:</span>
                        <span>{formatCurrency(transaction.change)}</span>
                      </div>
                    )}
                  </div>
                </div>

                <Separator />

                {/* Payment Methods */}
                {transaction.payments.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">Payment Methods</h4>
                    <div className="space-y-2">
                      {transaction.payments.map((payment, idx) => (
                        <div key={idx} className="flex justify-between items-center p-3 bg-muted/30 rounded">
                          <div>
                            <p className="font-medium">{payment.method}</p>
                            {payment.reference && (
                              <p className="text-sm text-muted-foreground">Ref: {payment.reference}</p>
                            )}
                            {payment.note && (
                              <p className="text-sm text-muted-foreground">{payment.note}</p>
                            )}
                          </div>
                          <div className="font-semibold">
                            {formatCurrency(payment.amount)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {transaction.note && (
                  <div>
                    <Label className="text-sm font-medium">Notes</Label>
                    <p className="text-sm text-muted-foreground mt-1">{transaction.note}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onPrint(transaction)}>
            Print Invoice
          </Button>
          <Button variant="outline" onClick={() => onEmail(transaction)}>
            Email Invoice
          </Button>
          <Button onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const PaymentBillingShadcn: React.FC = () => {
  const TRANSACTION_HISTORY_KEY = 'pos_transaction_history_v1';
  
  const [transactions, setTransactions] = useState<SaleRecord[]>([]);
  const [filterStatus] = useState<string>('ALL');
  const [filterDate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTransaction, setSelectedTransaction] = useState<SaleRecord | null>(null);
  const [billingStats, setBillingStats] = useState({
    totalSales: 0,
    paidAmount: 0,
    outstandingAmount: 0,
    completedTransactions: 0,
    partialTransactions: 0,
  });
  const [activeTab, setActiveTab] = useState<string>('transactions');
  const [advancedFilters, setAdvancedFilters] = useState({
    dateRange: { startDate: '', endDate: '' },
    amountRange: { min: '', max: '' },
    paymentMethods: [] as string[],
    statuses: [] as string[],
    customers: [] as string[],
  });
  const [availablePaymentMethods, setAvailablePaymentMethods] = useState<string[]>([]);
  const [availableCustomers, setAvailableCustomers] = useState<string[]>([]);

  // Load transactions from localStorage
  const loadTransactions = () => {
    try {
      const stored = localStorage.getItem(TRANSACTION_HISTORY_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setTransactions(parsed);
          calculateStats(parsed);
          extractFilterOptions(parsed);
        }
      }
    } catch (error) {
      console.error('Error loading transactions:', error);
    }
  };

  // Calculate billing statistics
  const calculateStats = (transactionList: SaleRecord[]) => {
    const stats = transactionList.reduce(
      (acc, transaction) => {
        acc.totalSales += transaction.total;
        acc.paidAmount += transaction.paid;
        acc.outstandingAmount += transaction.outstanding;
        
        if (transaction.status === 'PAID') {
          acc.completedTransactions += 1;
        } else if (transaction.status === 'PARTIAL') {
          acc.partialTransactions += 1;
        }
        
        return acc;
      },
      {
        totalSales: 0,
        paidAmount: 0,
        outstandingAmount: 0,
        completedTransactions: 0,
        partialTransactions: 0,
      }
    );
    
    setBillingStats(stats);
  };

  // Extract filter options from transactions
  const extractFilterOptions = (transactionList: SaleRecord[]) => {
    const methods = new Set<string>();
    const customers = new Set<string>();
    
    transactionList.forEach(transaction => {
      // Add payment methods
      transaction.payments.forEach(payment => {
        methods.add(payment.method);
      });
      
      // Add customers (if they exist)
      if (transaction.customer) {
        customers.add(transaction.customer);
      }
    });
    
    setAvailablePaymentMethods(Array.from(methods));
    setAvailableCustomers(Array.from(customers));
  };
  
  const handleApplyAdvancedFilters = (filters: any) => {
    setAdvancedFilters(filters);
  };
  
  const handlePrintInvoice = (transaction: SaleRecord) => {
    console.log('Printing invoice:', transaction.invoiceNumber);
    window.print();
  };
  
  const handleEmailInvoice = (transaction: SaleRecord) => {
    console.log('Emailing invoice:', transaction.invoiceNumber);
    alert(`Email functionality would send invoice ${transaction.invoiceNumber} to the customer.`);
  };

  // Get filtered transactions
  const getFilteredTransactions = () => {
    return transactions.filter(transaction => {
      // Filter by status
      if (filterStatus !== 'ALL' && transaction.status !== filterStatus) {
        return false;
      }
      
      // Filter by single date
      if (filterDate) {
        const transactionDate = new Date(transaction.timestamp).toISOString().split('T')[0];
        if (transactionDate !== filterDate) {
          return false;
        }
      }
      
      // Filter by search query
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch = (
          transaction.invoiceNumber.toLowerCase().includes(query) ||
          transaction.customer.toLowerCase().includes(query) ||
          transaction.payments.some(p => p.method.toLowerCase().includes(query))
        );
        
        if (!matchesSearch) return false;
      }
      
      // Advanced filters
      if (advancedFilters.dateRange.startDate && advancedFilters.dateRange.endDate) {
        const transactionDate = new Date(transaction.timestamp).getTime();
        const startDate = new Date(advancedFilters.dateRange.startDate).getTime();
        const endDate = new Date(advancedFilters.dateRange.endDate).getTime() + (24 * 60 * 60 * 1000 - 1);
        
        if (transactionDate < startDate || transactionDate > endDate) {
          return false;
        }
      }
      
      if (advancedFilters.amountRange.min || advancedFilters.amountRange.max) {
        const min = advancedFilters.amountRange.min ? parseFloat(advancedFilters.amountRange.min) : 0;
        const max = advancedFilters.amountRange.max ? parseFloat(advancedFilters.amountRange.max) : Infinity;
        
        if (transaction.total < min || transaction.total > max) {
          return false;
        }
      }
      
      if (advancedFilters.paymentMethods.length > 0) {
        const hasMatchingMethod = transaction.payments.some(payment => 
          advancedFilters.paymentMethods.includes(payment.method)
        );
        
        if (!hasMatchingMethod) return false;
      }
      
      if (advancedFilters.statuses.length > 0) {
        if (!advancedFilters.statuses.includes(transaction.status)) {
          return false;
        }
      }
      
      if (advancedFilters.customers.length > 0) {
        if (!advancedFilters.customers.includes(transaction.customer)) {
          return false;
        }
      }
      
      return true;
    });
  };

  // Sort transactions by date (newest first)
  const sortedTransactions = getFilteredTransactions().sort((a, b) => {
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });

  // Load transactions on component mount
  useEffect(() => {
    loadTransactions();
    
    // Listen for storage changes to sync with POS updates
    const handleStorageChange = () => {
      loadTransactions();
    };
    
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'transactions':
        return (
          <div className="space-y-6">
            {/* Advanced Filters - Temporarily simplified */}
            <div className="p-4 border rounded bg-muted">
              <p className="text-sm text-muted-foreground">Advanced Filters temporarily disabled (converting to Shadcn-only)</p>
            </div>
            
            {/* Transaction List */}
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Transaction History</CardTitle>
                    <CardDescription>
                      View and manage all payment transactions
                    </CardDescription>
                  </div>
                  <div className="w-72">
                    <Input
                      type="text"
                      placeholder="Quick search..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {sortedTransactions.length > 0 ? (
                  <div className="rounded-md border overflow-x-auto">
                    <table className="w-full min-w-[800px]">
                      <thead className="border-b bg-muted/50">
                        <tr>
                          <th className="p-3 text-left">Invoice #</th>
                          <th className="p-3 text-left">Date</th>
                          <th className="p-3 text-left">Customer</th>
                          <th className="p-3 text-left">Total</th>
                          <th className="p-3 text-left">Payment Method</th>
                          <th className="p-3 text-left">Status</th>
                          <th className="p-3 text-left">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedTransactions.map((transaction) => (
                          <tr key={transaction.id} className="border-b hover:bg-muted/30">
                            <td className="p-3 font-medium">{transaction.invoiceNumber}</td>
                            <td className="p-3">{new Date(transaction.timestamp).toLocaleDateString()}</td>
                            <td className="p-3">{transaction.customer || 'N/A'}</td>
                            <td className="p-3 font-semibold">{formatCurrency(transaction.total)}</td>
                            <td className="p-3">
                              {transaction.payments.length > 1 
                                ? `Multiple (${transaction.payments.length})` 
                                : transaction.payments[0]?.method || transaction.paymentType}
                            </td>
                            <td className="p-3">
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
                            <td className="p-3">
                              <Button 
                                size="sm" 
                                variant="outline"
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
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>No transactions found matching the selected filters.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        );
      case 'charts':
        return <div className="p-8 text-center text-muted-foreground">Payment Charts temporarily disabled (converting to Shadcn-only)</div>;
      case 'export':
        return <div className="p-8 text-center text-muted-foreground">Export Tools temporarily disabled (converting to Shadcn-only)</div>;
      case 'receivables':
        return <div className="p-8 text-center text-muted-foreground">Accounts Receivable temporarily disabled (converting to Shadcn-only)</div>;
      case 'processors':
        return <div className="p-8 text-center text-muted-foreground">Payment Processors temporarily disabled (converting to Shadcn-only)</div>;
      default:
        return null;
    }
  };
  
  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">Payment & Billing</h1>
          <p className="text-muted-foreground">
            Manage transactions, view analytics, and handle payment processing
          </p>
        </div>
        
        {/* Dashboard Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(billingStats.totalSales)}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Collected</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{formatCurrency(billingStats.paidAmount)}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Outstanding</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{formatCurrency(billingStats.outstandingAmount)}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Completed</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{billingStats.completedTransactions}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Partial</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{billingStats.partialTransactions}</div>
            </CardContent>
          </Card>
        </div>
        
        {/* Tab Navigation */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
            <TabsTrigger value="charts">Analytics</TabsTrigger>
            <TabsTrigger value="export">Export Tools</TabsTrigger>
            <TabsTrigger value="receivables">Receivables</TabsTrigger>
            <TabsTrigger value="processors">Payment Processors</TabsTrigger>
          </TabsList>
          
          <TabsContent value={activeTab} className="mt-6">
            {renderTabContent()}
          </TabsContent>
        </Tabs>
        
        {/* Transaction Details Modal */}
        {selectedTransaction && (
          <TransactionDetails 
            transaction={selectedTransaction}
            onClose={() => setSelectedTransaction(null)}
            onPrint={handlePrintInvoice}
            onEmail={handleEmailInvoice}
          />
        )}
      </div>
    </div>
  );
};

export default PaymentBillingShadcn;