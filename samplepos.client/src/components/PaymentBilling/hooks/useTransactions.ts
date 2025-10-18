/**
 * Custom hook for fetching and managing transaction data
 */

import { useQuery } from '@tanstack/react-query';
import * as POSServiceAPI from '../../../services/POSServiceAPI';
import type { Transaction } from '../../../models/Transaction';

export interface TransactionFilters {
  customerId?: string;
  startDate?: Date;
  endDate?: Date;
  paymentMethod?: string;
  status?: string;
  minAmount?: number;
  maxAmount?: number;
}

/**
 * Fetch transactions with optional filters
 */
const fetchTransactions = async (
  limit: number = 50,
  filters?: TransactionFilters
): Promise<Transaction[]> => {
  try {
    const transactions = await POSServiceAPI.getRecentTransactions(limit);
    
    let filtered = transactions;

    // Apply filters
    if (filters?.customerId) {
      filtered = filtered.filter(t => t.customer?.id === filters.customerId);
    }

    if (filters?.startDate) {
      filtered = filtered.filter(t => {
        const txDate = new Date(t.createdAt || '');
        return txDate >= filters.startDate!;
      });
    }

    if (filters?.endDate) {
      filtered = filtered.filter(t => {
        const txDate = new Date(t.createdAt || '');
        return txDate <= filters.endDate!;
      });
    }

    if (filters?.paymentMethod) {
      filtered = filtered.filter(t => 
        t.payment?.method?.toLowerCase() === filters.paymentMethod?.toLowerCase()
      );
    }

    if (filters?.status) {
      filtered = filtered.filter(t => 
        t.status?.toLowerCase() === filters.status?.toLowerCase()
      );
    }

    if (filters?.minAmount !== undefined) {
      filtered = filtered.filter(t => (t.total || 0) >= filters.minAmount!);
    }

    if (filters?.maxAmount !== undefined) {
      filtered = filtered.filter(t => (t.total || 0) <= filters.maxAmount!);
    }

    return filtered;
  } catch (error) {
    console.error('Error fetching transactions:', error);
    throw new Error('Failed to load transactions');
  }
};

/**
 * Hook to fetch transactions with filters
 */
export const useTransactions = (limit: number = 50, filters?: TransactionFilters) => {
  return useQuery({
    queryKey: ['transactions', limit, filters],
    queryFn: () => fetchTransactions(limit, filters),
    staleTime: 30000, // 30 seconds
    gcTime: 300000, // 5 minutes
    retry: 2,
    refetchOnWindowFocus: true,
  });
};

/**
 * Hook to calculate transaction statistics
 */
export const useTransactionStats = (customerId?: string) => {
  const { data: transactions, isLoading } = useTransactions(200, customerId ? { customerId } : undefined);

  const stats = {
    totalRevenue: 0,
    totalPaid: 0,
    totalOutstanding: 0,
    transactionCount: 0,
    averageTransaction: 0,
    paymentMethods: {} as Record<string, number>,
  };

  if (!transactions || transactions.length === 0) {
    return { stats, isLoading };
  }

  stats.transactionCount = transactions.length;
  stats.totalRevenue = transactions.reduce((sum, t) => sum + (t.total || 0), 0);
  stats.totalPaid = transactions.reduce((sum, t) => sum + (t.payment?.amount || 0), 0);
  stats.totalOutstanding = stats.totalRevenue - stats.totalPaid;
  stats.averageTransaction = stats.transactionCount > 0 
    ? stats.totalRevenue / stats.transactionCount 
    : 0;

  // Group by payment method
  transactions.forEach(t => {
    const method = t.payment?.method || 'Unknown';
    stats.paymentMethods[method] = (stats.paymentMethods[method] || 0) + (t.payment?.amount || 0);
  });

  return { stats, isLoading };
};
