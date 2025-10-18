/**
 * Transaction History Table Component
 * Displays paginated transaction history with search and filters
 */

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Search, Filter, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { Skeleton } from '../ui/skeleton';
import type { Transaction } from '../../models/Transaction';

interface TransactionHistoryTableProps {
  transactions: Transaction[];
  isLoading?: boolean;
}

export const TransactionHistoryTable: React.FC<TransactionHistoryTableProps> = ({
  transactions = [],
  isLoading = false,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-UG', {
      style: 'currency',
      currency: 'UGX',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-UG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
      completed: { variant: 'default', label: 'Completed' },
      pending: { variant: 'secondary', label: 'Pending' },
      failed: { variant: 'destructive', label: 'Failed' },
      partial: { variant: 'outline', label: 'Partial' },
    };

    const config = statusMap[status?.toLowerCase()] || { variant: 'secondary', label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getPaymentMethodBadge = (method: string) => {
    const methodColors: Record<string, string> = {
      cash: 'bg-green-100 text-green-800',
      card: 'bg-blue-100 text-blue-800',
      'mobile money': 'bg-purple-100 text-purple-800',
      bank: 'bg-orange-100 text-orange-800',
    };

    const colorClass = methodColors[method?.toLowerCase()] || 'bg-gray-100 text-gray-800';
    
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${colorClass}`}>
        {method}
      </span>
    );
  };

  // Filter and search transactions
  const filteredTransactions = useMemo(() => {
    if (!searchTerm) return transactions;

    const lowerSearch = searchTerm.toLowerCase();
    return transactions.filter(t => 
      t.transactionNumber?.toLowerCase().includes(lowerSearch) ||
      t.customer?.name?.toLowerCase().includes(lowerSearch) ||
      t.payment?.method?.toLowerCase().includes(lowerSearch)
    );
  }, [transactions, searchTerm]);

  // Pagination
  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
  const paginatedTransactions = filteredTransactions.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleExport = () => {
    // Create CSV content
    const headers = ['Date', 'Transaction #', 'Customer', 'Amount', 'Paid', 'Outstanding', 'Method', 'Status'];
    const rows = filteredTransactions.map(t => [
      t.createdAt || '',
      t.transactionNumber || t.id,
      t.customer?.name || 'Walk-in',
      t.total || 0,
      t.payment?.amount || 0,
      (t.total || 0) - (t.payment?.amount || 0),
      t.payment?.method || 'N/A',
      t.status || 'Unknown',
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
    ].join('\n');

    // Download CSV
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Transaction History</CardTitle>
            <CardDescription>
              {filteredTransactions.length} transaction{filteredTransactions.length !== 1 ? 's' : ''} found
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search transactions..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-10"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {paginatedTransactions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Receipt className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No transactions found</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3 text-sm font-medium text-muted-foreground">Date</th>
                    <th className="text-left p-3 text-sm font-medium text-muted-foreground">Transaction #</th>
                    <th className="text-left p-3 text-sm font-medium text-muted-foreground">Customer</th>
                    <th className="text-right p-3 text-sm font-medium text-muted-foreground">Amount</th>
                    <th className="text-right p-3 text-sm font-medium text-muted-foreground">Paid</th>
                    <th className="text-right p-3 text-sm font-medium text-muted-foreground">Outstanding</th>
                    <th className="text-left p-3 text-sm font-medium text-muted-foreground">Method</th>
                    <th className="text-left p-3 text-sm font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedTransactions.map((transaction) => {
                    const outstanding = (transaction.total || 0) - (transaction.payment?.amount || 0);
                    return (
                      <tr key={transaction.id} className="border-b hover:bg-muted/50">
                        <td className="p-3 text-sm">
                          {formatDate(transaction.createdAt || '')}
                        </td>
                        <td className="p-3 text-sm font-mono">
                          {transaction.transactionNumber || transaction.id.slice(0, 8)}
                        </td>
                        <td className="p-3 text-sm">
                          {transaction.customer?.name || 'Walk-in Customer'}
                        </td>
                        <td className="p-3 text-sm text-right font-medium">
                          {formatCurrency(transaction.total || 0)}
                        </td>
                        <td className="p-3 text-sm text-right text-green-600">
                          {formatCurrency(transaction.payment?.amount || 0)}
                        </td>
                        <td className="p-3 text-sm text-right text-orange-600">
                          {formatCurrency(outstanding)}
                        </td>
                        <td className="p-3 text-sm">
                          {getPaymentMethodBadge(transaction.payment?.method || 'N/A')}
                        </td>
                        <td className="p-3 text-sm">
                          {getStatusBadge(transaction.status || 'unknown')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <div className="text-sm text-muted-foreground">
                  Page {currentPage} of {totalPages}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
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
