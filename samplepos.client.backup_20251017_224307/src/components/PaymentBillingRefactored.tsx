/**
 * Complete Refactored Payment & Billing Page
 * Modern architecture with React Query, proper error handling, and modular components
 */

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Alert, AlertDescription } from './ui/alert';
import { RefreshCw, AlertCircle, Users, History, CreditCard } from 'lucide-react';
import { Skeleton } from './ui/skeleton';

// Refactored components
import { SummaryCards } from './PaymentBilling/SummaryCards';
import { TransactionHistoryTable } from './PaymentBilling/TransactionHistoryTable';
import { PaymentFormRefactored } from './PaymentBilling/PaymentFormRefactored';

// Custom hooks
import { useCustomers } from './PaymentBilling/hooks/useCustomers';
import { useTransactions, useTransactionStats } from './PaymentBilling/hooks/useTransactions';

export const PaymentBillingRefactored: React.FC = () => {
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<'overview' | 'transactions' | 'payment'>('overview');

  // Fetch data using custom hooks
  const { 
    data: customers = [], 
    isLoading: customersLoading,
    error: customersError,
    refetch: refetchCustomers,
  } = useCustomers();

  const {
    data: transactions = [],
    isLoading: transactionsLoading,
    error: transactionsError,
    refetch: refetchTransactions,
  } = useTransactions(200, selectedCustomerId ? { customerId: selectedCustomerId } : undefined);

  const {
    stats,
    isLoading: statsLoading,
  } = useTransactionStats(selectedCustomerId);

  // Handlers
  const handleRefresh = () => {
    refetchCustomers();
    refetchTransactions();
  };

  const handlePaymentSuccess = () => {
    refetchTransactions();
    setActiveTab('transactions');
  };

  // Error state
  if (customersError || transactionsError) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <div className="font-semibold mb-2">Failed to load data</div>
            <p className="text-sm mb-3">
              {customersError?.message || transactionsError?.message || 'An error occurred while loading billing data'}
            </p>
            <Button variant="outline" size="sm" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Payment & Billing</h1>
          <p className="text-muted-foreground mt-1">
            Manage payments, track transactions, and monitor billing
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Customer Filter */}
          <div className="w-64">
            <Select
              value={selectedCustomerId || 'all'}
              onValueChange={(value) => setSelectedCustomerId(value === 'all' ? undefined : value)}
              disabled={customersLoading}
            >
              <SelectTrigger>
                <SelectValue placeholder="All Customers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Customers</SelectItem>
                {customers.map((customer) => (
                  <SelectItem key={customer.id} value={customer.id}>
                    {customer.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Refresh Button */}
          <Button
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            disabled={transactionsLoading || customersLoading}
          >
            <RefreshCw className={`h-4 w-4 ${(transactionsLoading || customersLoading) ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <SummaryCards
        totalRevenue={stats.totalRevenue}
        totalPaid={stats.totalPaid}
        totalOutstanding={stats.totalOutstanding}
        transactionCount={stats.transactionCount}
        isLoading={statsLoading}
      />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 lg:w-auto">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="transactions" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            <span className="hidden sm:inline">Transactions</span>
          </TabsTrigger>
          <TabsTrigger value="payment" className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            <span className="hidden sm:inline">Record Payment</span>
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Payment Methods Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>Payment Methods</CardTitle>
                <CardDescription>Breakdown by payment method</CardDescription>
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <div className="space-y-3">
                    {[...Array(4)].map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {Object.entries(stats.paymentMethods).length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        No payment data available
                      </p>
                    ) : (
                      Object.entries(stats.paymentMethods)
                        .sort(([, a], [, b]) => b - a)
                        .map(([method, amount]) => (
                          <div key={method} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                                <CreditCard className="h-5 w-5 text-primary" />
                              </div>
                              <div>
                                <p className="font-medium capitalize">{method.replace('_', ' ')}</p>
                                <p className="text-xs text-muted-foreground">
                                  {((amount / stats.totalPaid) * 100).toFixed(1)}% of total
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold">
                                {new Intl.NumberFormat('en-UG', {
                                  style: 'currency',
                                  currency: 'UGX',
                                  minimumFractionDigits: 0,
                                }).format(amount)}
                              </p>
                            </div>
                          </div>
                        ))
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quick Stats */}
            <Card>
              <CardHeader>
                <CardTitle>Quick Statistics</CardTitle>
                <CardDescription>Key metrics at a glance</CardDescription>
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <div className="space-y-3">
                    {[...Array(4)].map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                      <span className="text-sm font-medium text-blue-900">Average Transaction</span>
                      <span className="font-semibold text-blue-900">
                        {new Intl.NumberFormat('en-UG', {
                          style: 'currency',
                          currency: 'UGX',
                          minimumFractionDigits: 0,
                        }).format(stats.averageTransaction)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                      <span className="text-sm font-medium text-green-900">Collection Rate</span>
                      <span className="font-semibold text-green-900">
                        {stats.totalRevenue > 0 
                          ? ((stats.totalPaid / stats.totalRevenue) * 100).toFixed(1)
                          : 0}%
                      </span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-purple-50 rounded-lg">
                      <span className="text-sm font-medium text-purple-900">Total Customers</span>
                      <span className="font-semibold text-purple-900">{customers.length}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-orange-50 rounded-lg">
                      <span className="text-sm font-medium text-orange-900">Active Transactions</span>
                      <span className="font-semibold text-orange-900">{stats.transactionCount}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Transactions Tab */}
        <TabsContent value="transactions">
          <TransactionHistoryTable
            transactions={transactions}
            isLoading={transactionsLoading}
          />
        </TabsContent>

        {/* Payment Tab */}
        <TabsContent value="payment">
          <div className="max-w-2xl mx-auto">
            <PaymentFormRefactored
              customerId={selectedCustomerId}
              onSuccess={handlePaymentSuccess}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

// Default export for lazy loading
export default PaymentBillingRefactored;
