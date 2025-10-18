/**
 * Payment Summary Component
 * Displays customer information and billing totals
 */

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Separator } from '../ui/separator';
import { DollarSign, User, Mail, Phone, CreditCard, AlertCircle } from 'lucide-react';
import type { BillingCustomer, BillingSummary } from './hooks/useBillingData';

interface PaymentSummaryProps {
  customer: BillingCustomer;
  summary: BillingSummary;
  className?: string;
}

export const PaymentSummary: React.FC<PaymentSummaryProps> = ({
  customer,
  summary,
  className = '',
}) => {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <Card className={`w-full ${className}`}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Customer Information
          </span>
          {customer.balance > 0 && (
            <Badge variant="destructive" className="text-xs">
              Balance Due
            </Badge>
          )}
        </CardTitle>
        <CardDescription>Billing summary and account status</CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Customer Details */}
        <div className="space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Customer Name</p>
              <p className="text-lg font-semibold">{customer.name}</p>
            </div>
            <Badge variant="outline" className="text-xs">
              ID: {customer.id}
            </Badge>
          </div>

          {customer.email && (
            <div className="flex items-center gap-2 text-sm">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span>{customer.email}</span>
            </div>
          )}

          {customer.phone && (
            <div className="flex items-center gap-2 text-sm">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span>{customer.phone}</span>
            </div>
          )}
        </div>

        <Separator />

        {/* Billing Summary */}
        <div className="space-y-4">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Billing Summary
          </h4>

          <div className="grid grid-cols-1 gap-3">
            {/* Total Due */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20">
              <div>
                <p className="text-xs font-medium text-blue-600 dark:text-blue-400">Total Billed</p>
                <p className="text-lg font-bold text-blue-700 dark:text-blue-300">
                  {formatCurrency(summary.totalDue)}
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-blue-500 opacity-50" />
            </div>

            {/* Total Paid */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-green-50 dark:bg-green-950/20">
              <div>
                <p className="text-xs font-medium text-green-600 dark:text-green-400">Total Paid</p>
                <p className="text-lg font-bold text-green-700 dark:text-green-300">
                  {formatCurrency(summary.totalPaid)}
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-green-500 opacity-50" />
            </div>

            {/* Pending Amount */}
            {summary.pendingAmount > 0 && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border-2 border-amber-200 dark:border-amber-800">
                <div>
                  <p className="text-xs font-medium text-amber-600 dark:text-amber-400">Outstanding Balance</p>
                  <p className="text-xl font-bold text-amber-700 dark:text-amber-300">
                    {formatCurrency(summary.pendingAmount)}
                  </p>
                </div>
                <AlertCircle className="h-8 w-8 text-amber-500" />
              </div>
            )}

            {/* Paid in Full */}
            {summary.pendingAmount === 0 && summary.totalDue > 0 && (
              <div className="flex items-center justify-center p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border-2 border-green-200 dark:border-green-800">
                <p className="text-sm font-semibold text-green-700 dark:text-green-300">
                  ✓ Account Paid in Full
                </p>
              </div>
            )}
          </div>
        </div>

        <Separator />

        {/* Additional Details */}
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total Invoices</span>
            <span className="font-medium">{summary.invoiceCount}</span>
          </div>

          {summary.lastPaymentDate && (
            <>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Last Payment</span>
                <span className="font-medium">{formatDate(summary.lastPaymentDate)}</span>
              </div>
              {summary.lastPaymentAmount && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last Payment Amount</span>
                  <span className="font-medium">{formatCurrency(summary.lastPaymentAmount)}</span>
                </div>
              )}
            </>
          )}

          {summary.overdueAmount > 0 && (
            <div className="flex justify-between text-red-600 dark:text-red-400">
              <span className="font-medium">Overdue Amount</span>
              <span className="font-bold">{formatCurrency(summary.overdueAmount)}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
