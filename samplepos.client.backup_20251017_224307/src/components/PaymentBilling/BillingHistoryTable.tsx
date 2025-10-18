/**
 * Billing History Table Component
 * Displays paginated transaction history with responsive design
 */

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { 
  ChevronLeft, 
  ChevronRight, 
  Receipt, 
  RefreshCw,
  AlertCircle,
  Calendar,
  DollarSign 
} from 'lucide-react';
import { usePaymentHistory } from './hooks/useBillingData';
interface BillingHistoryTableProps {
  customerId?: string;
  pageSize?: number;
  className?: string;
}

export const BillingHistoryTable: React.FC<BillingHistoryTableProps> = ({
  customerId,
  pageSize = 10,
  className = '',
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  
  const { 
    data, 
    isLoading, 
    isError, 
    error, 
    refetch,
    isFetching 
  } = usePaymentHistory(customerId, currentPage, pageSize);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline', className: string }> = {
      completed: { variant: 'default', className: 'bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900 dark:text-green-100' },
      pending: { variant: 'secondary', className: 'bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-900 dark:text-amber-100' },
      failed: { variant: 'destructive', className: '' },
      refunded: { variant: 'outline', className: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300' },
    };

    const config = variants[status.toLowerCase()] || variants.pending;
    return (
      <Badge variant={config.variant} className={config.className}>
        {status}
      </Badge>
    );
  };

  const getMethodIcon = (method: string) => {
    const lowerMethod = method.toLowerCase();
    if (lowerMethod.includes('card') || lowerMethod.includes('credit')) {
      return <span className="text-blue-600 dark:text-blue-400">💳</span>;
    }
    if (lowerMethod.includes('cash')) {
      return <span className="text-green-600 dark:text-green-400">💵</span>;
    }
    if (lowerMethod.includes('mobile')) {
      return <span className="text-purple-600 dark:text-purple-400">📱</span>;
    }
    return <span className="text-gray-600 dark:text-gray-400">💰</span>;
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (data && data.data.length === pageSize) {
      setCurrentPage(currentPage + 1);
    }
  };

  if (isLoading) {
    return (
      <Card className={`w-full ${className}`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Payment History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading payment history...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className={`w-full ${className}`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Payment History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="text-sm text-destructive">
              {error?.message || 'Failed to load payment history'}
            </p>
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const payments = data?.data || [];
  const totalPayments = data?.total || 0;
  const hasNextPage = payments.length === pageSize;

  return (
    <Card className={`w-full ${className}`}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Payment History
            </CardTitle>
            <CardDescription>
              {totalPayments > 0 
                ? `Showing ${payments.length} of ${totalPayments} payments`
                : 'No payment history available'
              }
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {payments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-4 text-center">
            <Receipt className="h-12 w-12 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">No Payments Found</p>
              <p className="text-sm text-muted-foreground">
                Payment transactions will appear here once recorded.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reference</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell className="font-medium">
                        {formatDate(payment.date)}
                      </TableCell>
                      <TableCell>{payment.invoiceNumber || '-'}</TableCell>
                      <TableCell className="font-semibold">
                        {formatCurrency(payment.amount)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getMethodIcon(payment.method)}
                          <span className="capitalize">{payment.method}</span>
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(payment.status)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {payment.reference || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden space-y-4">
              {payments.map((payment) => (
                <Card key={payment.id}>
                  <CardContent className="p-4 space-y-3">
                    {/* Header Row */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">
                          {formatDate(payment.date)}
                        </span>
                      </div>
                      {getStatusBadge(payment.status)}
                    </div>

                    {/* Amount Row */}
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                      <span className="text-lg font-semibold">
                        {formatCurrency(payment.amount)}
                      </span>
                    </div>

                    {/* Details Grid */}
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">Method:</span>
                        <div className="flex items-center gap-1 mt-1">
                          {getMethodIcon(payment.method)}
                          <span className="capitalize">{payment.method}</span>
                        </div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Invoice:</span>
                        <p className="mt-1 font-medium">
                          {payment.invoiceNumber || '-'}
                        </p>
                      </div>
                    </div>

                    {/* Reference */}
                    {payment.reference && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">Reference:</span>
                        <p className="mt-1">{payment.reference}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Pagination */}
            {totalPayments > pageSize && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <div className="text-sm text-muted-foreground">
                  Page {currentPage}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePrevPage}
                    disabled={currentPage === 1 || isFetching}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleNextPage}
                    disabled={!hasNextPage || isFetching}
                  >
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};
