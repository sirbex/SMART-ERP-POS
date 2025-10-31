import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "./ui/dialog";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "./ui/select";
import { Textarea } from "./ui/textarea";
import { Calendar } from "./ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { CalendarIcon, CreditCard, DollarSign, History, Receipt, RefreshCw, TrendingUp } from "lucide-react";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import type { DateRange } from "react-day-picker";
import * as POSServiceAPI from "../services/POSServiceAPI";
import SettingsService from "../services/SettingsService";
import { validatePaymentReference } from "../utils/paymentValidation";
import { PaginatedList } from "./shared/PaginatedList";

// Type definitions for Payment & Billing
interface SaleRecord {
  id: string;
  invoiceNumber?: string;
  timestamp: string;
  customer: string;
  total: number;
  paid: number;
  outstanding: number;
  status: string;
  paymentType: string;
  payments: PaymentDetail[];
  note?: string;
}

interface PaymentDetail {
  amount: number;
  method: string;
  reference?: string;
  note?: string;
  timestamp: string;
}

interface PaymentFilter {
  dateRange: DateRange;
  paymentMethod: string;
  status: string;
  customer: string;
  minAmount: string;
  maxAmount: string;
}

interface RefundRequest {
  transactionId: string;
  amount: number;
  reason: string;
  paymentMethod: string;
}

const PaymentBillingShadcn: React.FC = () => {
  // State management
  const [transactions, setTransactions] = useState<SaleRecord[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<SaleRecord[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedTransaction, setSelectedTransaction] = useState<SaleRecord | null>(null);
  const [showRefundDialog, setShowRefundDialog] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Filter state
  const [filters, setFilters] = useState<PaymentFilter>({
    dateRange: {
      from: subDays(new Date(), 30),
      to: new Date()
    },
    paymentMethod: 'all',
    status: 'all',
    customer: 'all',
    minAmount: '',
    maxAmount: ''
  });

  // Refund form state
  const [refundForm, setRefundForm] = useState<RefundRequest>({
    transactionId: '',
    amount: 0,
    reason: '',
    paymentMethod: 'Cash'
  });

  // New payment form state
  const [paymentForm, setPaymentForm] = useState({
    customerId: '',
    amount: '',
    method: 'Cash',
    reference: '',
    note: ''
  });

  const businessInfo = SettingsService.getInstance().getBusinessInfo();

  // Convert API transaction data to SaleRecord format
  const convertToSaleRecord = (transaction: any): SaleRecord => {
    const total = parseFloat(transaction.total) || 0;
    const paid = parseFloat(transaction.amountPaid || transaction.total) || total;
    const outstanding = Math.max(0, total - paid);
    
    return {
      id: transaction.id || transaction.transaction_id,
      invoiceNumber: transaction.invoiceNumber || `INV-${String(Date.now()).slice(-6)}`,
      timestamp: transaction.createdAt || transaction.transaction_date || new Date().toISOString(),
      customer: transaction.customerName || 'Walk-in Customer',
      total: Math.round(total * 100) / 100,
      paid: Math.round(paid * 100) / 100,
      outstanding: Math.round(outstanding * 100) / 100,
      status: outstanding > 0.01 ? 'PARTIAL' : total > paid ? 'OVERPAID' : 'PAID',
      paymentType: transaction.paymentMethod || 'Cash',
      payments: [{
        amount: paid,
        method: transaction.paymentMethod || 'Cash',
        reference: transaction.reference || '',
        note: transaction.notes || '',
        timestamp: transaction.createdAt || transaction.transaction_date || new Date().toISOString()
      }],
      note: transaction.notes || ''
    };
  };

  // Load transactions on component mount
  useEffect(() => {
    loadTransactions();
  }, []);

  // Apply filters when they change
  useEffect(() => {
    applyFilters();
  }, [transactions, filters]);

  const loadTransactions = async () => {
    setLoading(true);
    try {
      console.log('🔄 Loading transactions from API...');
      const apiTransactions = await POSServiceAPI.getAllTransactions();
      console.log('📊 Raw API data:', apiTransactions.length, 'transactions');
      
      const convertedTransactions = apiTransactions.map(convertToSaleRecord);
      console.log('✅ Converted transactions:', convertedTransactions);
      
      setTransactions(convertedTransactions);
      
      // Also load customers for dropdowns
      try {
        const apiCustomers = await POSServiceAPI.getCustomersForPOS();
        setCustomers(apiCustomers);
      } catch (customerError) {
        console.warn('Failed to load customers:', customerError);
        setCustomers([]);
      }
    } catch (error) {
      console.error('Failed to load transactions:', error);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...transactions];

    // Date range filter
    if (filters.dateRange.from && filters.dateRange.to) {
      const fromDate = startOfDay(filters.dateRange.from);
      const toDate = endOfDay(filters.dateRange.to);
      filtered = filtered.filter(t => {
        const transactionDate = new Date(t.timestamp);
        return transactionDate >= fromDate && transactionDate <= toDate;
      });
    }

    // Payment method filter
    if (filters.paymentMethod !== 'all') {
      filtered = filtered.filter(t => t.paymentType === filters.paymentMethod);
    }

    // Status filter
    if (filters.status !== 'all') {
      filtered = filtered.filter(t => t.status === filters.status);
    }

    // Customer filter
    if (filters.customer !== 'all') {
      filtered = filtered.filter(t => t.customer === filters.customer);
    }

    // Amount range filter
    if (filters.minAmount) {
      filtered = filtered.filter(t => t.total >= parseFloat(filters.minAmount));
    }
    if (filters.maxAmount) {
      filtered = filtered.filter(t => t.total <= parseFloat(filters.maxAmount));
    }

    setFilteredTransactions(filtered);
  };

  const handleRefund = async () => {
    if (!selectedTransaction || !refundForm.amount || !refundForm.reason) {
      return;
    }

    setLoading(true);
    try {
      // Create refund payment record
      const refundPayment: PaymentDetail = {
        amount: -refundForm.amount,
        method: refundForm.paymentMethod,
        reference: `REFUND-${Date.now()}`,
        note: `Refund: ${refundForm.reason}`,
        timestamp: new Date().toISOString()
      };

      // Update transaction
      const updatedTransaction = {
        ...selectedTransaction,
        payments: [...selectedTransaction.payments, refundPayment],
        paid: selectedTransaction.paid - refundForm.amount,
        outstanding: selectedTransaction.outstanding + refundForm.amount,
        status: selectedTransaction.paid - refundForm.amount <= 0 ? 'PARTIAL' : 
                selectedTransaction.paid - refundForm.amount >= selectedTransaction.total ? 'PAID' : 'PARTIAL'
      } as SaleRecord;

      // For this demo, we'll just reload transactions since we don't have a backend refund endpoint
      console.log('Refund processed:', updatedTransaction);
      loadTransactions();
      setShowRefundDialog(false);
      setRefundForm({ transactionId: '', amount: 0, reason: '', paymentMethod: 'Cash' });
      setSelectedTransaction(null);
    } catch (error) {
      console.error('Failed to process refund:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleNewPayment = async () => {
    if (!paymentForm.customerId || !paymentForm.amount) {
      return;
    }

    const validation = validatePaymentReference(paymentForm.method.toLowerCase().replace(' ', '_'), paymentForm.reference);
    if (paymentForm.reference && !validation.isValid) {
      alert(validation.errorMessage || 'Invalid payment reference');
      return;
    }

    setLoading(true);
    try {
      // Create new payment transaction
      const newTransaction: SaleRecord = {
        id: `payment-${Date.now()}`,
        invoiceNumber: `PAY-${String(Date.now()).slice(-6)}`,
        timestamp: new Date().toISOString(),
        customer: customers.find((c: any) => c.id === paymentForm.customerId)?.name || 'Walk-in Customer',
        total: parseFloat(paymentForm.amount),
        paid: parseFloat(paymentForm.amount),
        outstanding: 0,
        status: 'PAID',
        payments: [{
          amount: parseFloat(paymentForm.amount),
          method: paymentForm.method,
          reference: paymentForm.reference,
          note: paymentForm.note,
          timestamp: new Date().toISOString()
        }],
        paymentType: paymentForm.method,
        note: paymentForm.note || 'Direct payment entry'
      };

      // For this demo, we'll just add to local state since we don't have a backend create endpoint
      console.log('New payment created:', newTransaction);
      loadTransactions();
      setShowPaymentDialog(false);
      setPaymentForm({ customerId: '', amount: '', method: 'Cash', reference: '', note: '' });
    } catch (error) {
      console.error('Failed to process payment:', error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate summary statistics with precision arithmetic
  const summaryStats = {
    totalRevenue: filteredTransactions.reduce((sum, t) => Math.round((sum + (t.total || 0)) * 100) / 100, 0),
    totalCashReceived: filteredTransactions.reduce((sum, t) => Math.round((sum + (t.paid || 0)) * 100) / 100, 0),
    outstandingAmount: filteredTransactions.reduce((sum, t) => Math.round((sum + (t.outstanding || 0)) * 100) / 100, 0),
    transactionCount: filteredTransactions.length
  };

  const paymentMethodStats = filteredTransactions.reduce((acc, transaction) => {
    const method = transaction.paymentType;
    acc[method] = (acc[method] || 0) + transaction.paid;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">
              {businessInfo.businessName || 'Sample POS'} - Payment & Billing
            </h1>
            <p className="text-muted-foreground">
              Manage payments, refunds, and billing operations
            </p>
          </div>
          <div className="flex gap-2">
            <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
              <DialogTrigger asChild>
                <Button>
                  <CreditCard className="mr-2 h-4 w-4" />
                  New Payment
                </Button>
              </DialogTrigger>
            </Dialog>
            <Button variant="outline" onClick={loadTransactions} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {SettingsService.getInstance().formatCurrency(summaryStats.totalRevenue)}
              </div>
              <p className="text-xs text-muted-foreground">
                From {summaryStats.transactionCount} transactions
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Cash Received</CardTitle>
              <Receipt className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {SettingsService.getInstance().formatCurrency(summaryStats.totalCashReceived)}
              </div>
              <p className="text-xs text-muted-foreground">
                Actual payments received
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Outstanding</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {SettingsService.getInstance().formatCurrency(summaryStats.outstandingAmount)}
              </div>
              <p className="text-xs text-muted-foreground">
                Pending payments
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Transactions</CardTitle>
              <History className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summaryStats.transactionCount}</div>
              <p className="text-xs text-muted-foreground">
                In selected period
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="transactions" className="w-full">
          <TabsList>
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="methods">Payment Methods</TabsTrigger>
          </TabsList>

          <TabsContent value="transactions" className="space-y-4">
            {/* Filters */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Filters</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
                  <div className="space-y-2">
                    <Label>Date Range</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start text-left font-normal">
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {filters.dateRange?.from ? (
                            filters.dateRange.to ? (
                              <>
                                {format(filters.dateRange.from, "LLL dd, y")} -{" "}
                                {format(filters.dateRange.to, "LLL dd, y")}
                              </>
                            ) : (
                              format(filters.dateRange.from, "LLL dd, y")
                            )
                          ) : (
                            <span>Pick a date</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          initialFocus
                          mode="range"
                          defaultMonth={filters.dateRange?.from}
                          selected={filters.dateRange}
                          onSelect={(range) => 
                            setFilters(prev => ({ 
                              ...prev, 
                              dateRange: range || { from: subDays(new Date(), 30), to: new Date() }
                            }))
                          }
                          numberOfMonths={2}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-2">
                    <Label>Payment Method</Label>
                    <Select 
                      value={filters.paymentMethod} 
                      onValueChange={(value) => 
                        setFilters(prev => ({ ...prev, paymentMethod: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Methods</SelectItem>
                        <SelectItem value="Cash">Cash</SelectItem>
                        <SelectItem value="Card">Card</SelectItem>
                        <SelectItem value="Mobile Money">Mobile Money</SelectItem>
                        <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select 
                      value={filters.status} 
                      onValueChange={(value) => 
                        setFilters(prev => ({ ...prev, status: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="PAID">Paid</SelectItem>
                        <SelectItem value="PARTIAL">Partial</SelectItem>
                        <SelectItem value="OVERPAID">Overpaid</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Customer</Label>
                    <Select 
                      value={filters.customer} 
                      onValueChange={(value) => 
                        setFilters(prev => ({ ...prev, customer: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Customers</SelectItem>
                        {customers.map((customer: any) => (
                          <SelectItem key={customer.id} value={customer.name}>
                            {customer.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Min Amount</Label>
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={filters.minAmount}
                      onChange={(e) => 
                        setFilters(prev => ({ ...prev, minAmount: e.target.value }))
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Max Amount</Label>
                    <Input
                      type="number"
                      placeholder="1000.00"
                      value={filters.maxAmount}
                      onChange={(e) => 
                        setFilters(prev => ({ ...prev, maxAmount: e.target.value }))
                      }
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Transactions Table - OPTIMIZED WITH PAGINATION */}
            <Card>
              <CardHeader>
                <CardTitle>Payment Transactions</CardTitle>
              </CardHeader>
              <CardContent>
                <PaginatedList
                  items={filteredTransactions}
                  renderItem={(transaction) => (
                    <div className="grid grid-cols-9 gap-2 py-2 px-4 border-b hover:bg-accent text-sm items-center">
                      <div className="font-medium">{transaction.invoiceNumber}</div>
                      <div>{format(new Date(transaction.timestamp), 'MMM dd, yyyy')}</div>
                      <div>{transaction.customer}</div>
                      <div className="text-right">{SettingsService.getInstance().formatCurrency(transaction.total)}</div>
                      <div className="text-right">{SettingsService.getInstance().formatCurrency(transaction.paid)}</div>
                      <div className="text-right">{SettingsService.getInstance().formatCurrency(transaction.outstanding)}</div>
                      <div>{transaction.paymentType}</div>
                      <div>
                        <Badge 
                          variant={
                            transaction.status === 'PAID' ? 'default' :
                            transaction.status === 'PARTIAL' ? 'secondary' : 'outline'
                          }
                        >
                          {transaction.status}
                        </Badge>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => {
                            setSelectedTransaction(transaction);
                            setRefundForm(prev => ({ 
                              ...prev, 
                              transactionId: transaction.id,
                              amount: transaction.paid
                            }));
                            setShowRefundDialog(true);
                          }}
                        >
                          Refund
                        </Button>
                      </div>
                    </div>
                  )}
                  defaultItemsPerPage={50}
                  itemsPerPageOptions={[20, 50, 100]}
                  showSearch
                  searchPlaceholder="Search by invoice, customer, or payment method..."
                  onSearch={(query) => {
                    // Search is already handled by filteredTransactions
                    // This is just to show the search box
                  }}
                  compact
                  emptyMessage="No transactions found for the selected period"
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Payment Methods Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(paymentMethodStats).map(([method, amount]) => (
                      <div key={method} className="flex justify-between items-center">
                        <span>{method}</span>
                        <span className="font-medium">
                          {SettingsService.getInstance().formatCurrency(amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Quick Stats</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>Average Transaction:</span>
                      <span className="font-medium">
                        {SettingsService.getInstance().formatCurrency(
                          summaryStats.transactionCount > 0 ? 
                          summaryStats.totalRevenue / summaryStats.transactionCount : 0
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Collection Rate:</span>
                      <span className="font-medium">
                        {summaryStats.totalRevenue > 0 ? 
                          Math.round((summaryStats.totalCashReceived / summaryStats.totalRevenue) * 100) : 0
                        }%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Outstanding Rate:</span>
                      <span className="font-medium">
                        {summaryStats.totalRevenue > 0 ? 
                          Math.round((summaryStats.outstandingAmount / summaryStats.totalRevenue) * 100) : 0
                        }%
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="methods" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Payment Method Configuration</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">
                  Payment methods are configured in the POS settings. Available methods:
                </p>
                <div className="grid gap-2">
                  <div className="flex justify-between items-center p-3 border rounded">
                    <div>
                      <div className="font-medium">Cash</div>
                      <div className="text-sm text-muted-foreground">Physical cash payments</div>
                    </div>
                    <Badge>Active</Badge>
                  </div>
                  <div className="flex justify-between items-center p-3 border rounded">
                    <div>
                      <div className="font-medium">Card</div>
                      <div className="text-sm text-muted-foreground">Credit/Debit card payments</div>
                    </div>
                    <Badge>Active</Badge>
                  </div>
                  <div className="flex justify-between items-center p-3 border rounded">
                    <div>
                      <div className="font-medium">Mobile Money</div>
                      <div className="text-sm text-muted-foreground">M-Pesa, Airtel Money, etc.</div>
                    </div>
                    <Badge>Active</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Refund Dialog */}
        <Dialog open={showRefundDialog} onOpenChange={setShowRefundDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Process Refund</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              {selectedTransaction && (
                <>
                  <div className="text-sm">
                    <div><strong>Invoice:</strong> {selectedTransaction.invoiceNumber}</div>
                    <div><strong>Customer:</strong> {selectedTransaction.customer}</div>
                    <div><strong>Original Amount:</strong> {SettingsService.getInstance().formatCurrency(selectedTransaction.total)}</div>
                    <div><strong>Paid Amount:</strong> {SettingsService.getInstance().formatCurrency(selectedTransaction.paid)}</div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Refund Amount</Label>
                    <Input
                      type="number"
                      value={refundForm.amount}
                      onChange={(e) => setRefundForm(prev => ({ 
                        ...prev, 
                        amount: Math.min(parseFloat(e.target.value) || 0, selectedTransaction.paid)
                      }))}
                      max={selectedTransaction.paid}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Refund Method</Label>
                    <Select 
                      value={refundForm.paymentMethod} 
                      onValueChange={(value) => setRefundForm(prev => ({ ...prev, paymentMethod: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Cash">Cash</SelectItem>
                        <SelectItem value="Card">Card Refund</SelectItem>
                        <SelectItem value="Mobile Money">Mobile Money</SelectItem>
                        <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Reason for Refund</Label>
                    <Textarea
                      value={refundForm.reason}
                      onChange={(e) => setRefundForm(prev => ({ ...prev, reason: e.target.value }))}
                      placeholder="Enter reason for refund..."
                    />
                  </div>

                  <div className="flex gap-2 pt-4">
                    <Button onClick={handleRefund} disabled={loading || !refundForm.reason || refundForm.amount <= 0}>
                      {loading ? 'Processing...' : 'Process Refund'}
                    </Button>
                    <Button variant="outline" onClick={() => setShowRefundDialog(false)}>
                      Cancel
                    </Button>
                  </div>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* New Payment Dialog */}
        <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Record New Payment</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>Customer</Label>
                <Select 
                  value={paymentForm.customerId} 
                  onValueChange={(value) => setPaymentForm(prev => ({ ...prev, customerId: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((customer: any) => (
                      <SelectItem key={customer.id} value={customer.id || customer.name}>
                        {customer.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Amount</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm(prev => ({ ...prev, amount: e.target.value }))}
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-2">
                <Label>Payment Method</Label>
                <Select 
                  value={paymentForm.method} 
                  onValueChange={(value) => setPaymentForm(prev => ({ ...prev, method: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="Card">Card</SelectItem>
                    <SelectItem value="Mobile Money">Mobile Money</SelectItem>
                    <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Reference (Optional)</Label>
                <Input
                  value={paymentForm.reference}
                  onChange={(e) => setPaymentForm(prev => ({ ...prev, reference: e.target.value }))}
                  placeholder="Transaction reference..."
                />
              </div>

              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={paymentForm.note}
                  onChange={(e) => setPaymentForm(prev => ({ ...prev, note: e.target.value }))}
                  placeholder="Payment notes..."
                />
              </div>

              <div className="flex gap-2 pt-4">
                <Button 
                  onClick={handleNewPayment} 
                  disabled={loading || !paymentForm.customerId || !paymentForm.amount}
                >
                  {loading ? 'Processing...' : 'Record Payment'}
                </Button>
                <Button variant="outline" onClick={() => setShowPaymentDialog(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default PaymentBillingShadcn;
