/**
 * Custom hook for fetching billing and payment data
 * Uses React Query for caching, refetching, and state management
 */

import { useQuery } from '@tanstack/react-query';
import * as POSServiceAPI from '../../../services/POSServiceAPI';
import type { Transaction } from '../../../models/Transaction';

// Type definitions
export interface BillingCustomer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  balance: number;
  creditLimit?: number;
}

export interface BillingSummary {
  totalDue: number;
  totalPaid: number;
  pendingAmount: number;
  lastPaymentDate?: string;
  lastPaymentAmount?: number;
  overdueAmount: number;
  invoiceCount: number;
}

export interface PaymentHistory {
  id: string;
  date: string;
  amount: number;
  method: string;
  status: string;
  invoiceNumber?: string;
  reference?: string;
  notes?: string;
}

export interface BillingData {
  customer: BillingCustomer;
  summary: BillingSummary;
  history: PaymentHistory[];
  recentInvoices: {
    id: string;
    invoiceNumber: string;
    date: string;
    amount: number;
    paid: number;
    outstanding: number;
    status: string;
  }[];
}

/**
 * Fetch billing data for a specific customer
 */
const fetchBillingData = async (customerId?: string): Promise<BillingData> => {
  try {
    // If no customer ID provided, get all recent transactions
    if (!customerId) {
      const transactions = await POSServiceAPI.getRecentTransactions(50);
      
      // Calculate summary from transactions
      const totalDue = transactions.reduce((sum: number, t: Transaction) => sum + (t.total || 0), 0);
      const totalPaid = transactions.reduce((sum: number, t: Transaction) => sum + (t.payment?.amount || 0), 0);
      const pendingAmount = totalDue - totalPaid;

      return {
        customer: {
          id: 'all',
          name: 'All Customers',
          balance: pendingAmount,
        },
        summary: {
          totalDue,
          totalPaid,
          pendingAmount,
          overdueAmount: 0,
          invoiceCount: transactions.length,
        },
        history: transactions.map((t: Transaction) => ({
          id: t.id,
          date: t.createdAt || '',
          amount: t.payment?.amount || 0,
          method: t.payment?.method || 'cash',
          status: t.status || 'completed',
          invoiceNumber: t.transactionNumber || t.id,
          reference: t.payment?.reference,
        })),
        recentInvoices: transactions.map((t: Transaction) => ({
          id: t.id,
          invoiceNumber: t.transactionNumber || t.id,
          date: t.createdAt || '',
          amount: t.total || 0,
          paid: t.payment?.amount || 0,
          outstanding: (t.total || 0) - (t.payment?.amount || 0),
          status: t.status || 'pending',
        })),
      };
    }

    // Fetch customer-specific data
    const customer = await POSServiceAPI.getCustomer(customerId);
    if (!customer) {
      throw new Error(`Customer with ID ${customerId} not found`);
    }

    const transactions = await POSServiceAPI.getRecentTransactions(50);
    
    // Filter transactions for this customer
    const customerTransactions = transactions.filter((t: Transaction) => t.customer?.id === customerId);

    const totalDue = customerTransactions.reduce((sum: number, t: Transaction) => sum + (t.total || 0), 0);
    const totalPaid = customerTransactions.reduce((sum: number, t: Transaction) => sum + (t.payment?.amount || 0), 0);
    const pendingAmount = totalDue - totalPaid;

    return {
      customer: {
        id: customer.id || customerId,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        balance: customer.balance || pendingAmount,
      },
      summary: {
        totalDue,
        totalPaid,
        pendingAmount,
        lastPaymentDate: customerTransactions[0]?.createdAt,
        lastPaymentAmount: customerTransactions[0]?.payment?.amount,
        overdueAmount: 0,
        invoiceCount: customerTransactions.length,
      },
      history: customerTransactions.map((t: Transaction) => ({
        id: t.id,
        date: t.createdAt || '',
        amount: t.payment?.amount || 0,
        method: t.payment?.method || 'cash',
        status: t.status || 'completed',
        invoiceNumber: t.transactionNumber || t.id,
        reference: t.payment?.reference,
      })),
      recentInvoices: customerTransactions.map((t: Transaction) => ({
        id: t.id,
        invoiceNumber: t.transactionNumber || t.id,
        date: t.createdAt || '',
        amount: t.total || 0,
        paid: t.payment?.amount || 0,
        outstanding: (t.total || 0) - (t.payment?.amount || 0),
        status: t.status || 'pending',
      })),
    };
  } catch (error) {
    console.error('Error fetching billing data:', error);
    throw new Error(
      error instanceof Error 
        ? `Failed to load billing data: ${error.message}` 
        : 'Failed to load billing data'
    );
  }
};

/**
 * Hook to fetch and cache billing data
 */
export const useBillingData = (customerId?: string) => {
  return useQuery({
    queryKey: ['billingData', customerId],
    queryFn: () => fetchBillingData(customerId),
    staleTime: 30000, // Consider data fresh for 30 seconds
    gcTime: 300000, // Keep unused data in cache for 5 minutes
    retry: 2, // Retry failed requests twice
    refetchOnWindowFocus: true, // Refetch when user returns to tab
  });
};

/**
 * Hook to fetch payment history with pagination
 */
export const usePaymentHistory = (customerId?: string, page = 1, limit = 20) => {
  return useQuery({
    queryKey: ['paymentHistory', customerId, page, limit],
    queryFn: async () => {
      const allData = await fetchBillingData(customerId);
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      
      return {
        data: allData.history.slice(startIndex, endIndex),
        total: allData.history.length,
        page,
        limit,
        totalPages: Math.ceil(allData.history.length / limit),
      };
    },
    staleTime: 60000,
    gcTime: 300000,
  });
};
