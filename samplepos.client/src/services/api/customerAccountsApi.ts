/**
 * Customer Accounts API
 * 
 * Handles customer account management, credit operations, and balance tracking.
 * Aligned with backend endpoints in SamplePOS.Server/src/modules/customerAccounts.ts
 * 
 * @module services/api/customerAccountsApi
 */

import api from '@/config/api.config';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CustomerBalance,
  CustomerCreditInfo,
  CustomerAging,
  CustomerTransaction,
  ApiResponse,
  PaginatedResponse
} from '@/types/backend';

// ===================================================================
// API FUNCTIONS
// ===================================================================

/**
 * Get customer balance summary
 * GET /api/customers/:id/balance
 */
export const getCustomerBalance = async (customerId: string): Promise<CustomerBalance> => {
  const { data } = await api.get<ApiResponse<CustomerBalance>>(`/customers/${customerId}/balance`);
  return data.data;
};

/**
 * Make a deposit to customer account
 * POST /api/customers/:id/deposit
 */
export interface DepositRequest {
  amount: number;
  paymentMethod: 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'MOBILE_MONEY' | 'CHEQUE' | 'OTHER';
  reference?: string;
  notes?: string;
}

export const makeDeposit = async (
  customerId: string,
  deposit: DepositRequest
): Promise<CustomerBalance> => {
  const { data } = await api.post<ApiResponse<CustomerBalance>>(
    `/customers/${customerId}/deposit`,
    deposit
  );
  return data.data;
};

/**
 * Get customer credit information
 * GET /api/customers/:id/credit-info
 */
export const getCustomerCreditInfo = async (customerId: string): Promise<CustomerCreditInfo> => {
  const { data } = await api.get<ApiResponse<CustomerCreditInfo>>(
    `/customers/${customerId}/credit-info`
  );
  return data.data;
};

/**
 * Adjust customer credit limit
 * POST /api/customers/:id/adjust-credit
 */
export interface AdjustCreditRequest {
  newCreditLimit: number;
  reason: string;
}

export const adjustCreditLimit = async (
  customerId: string,
  request: AdjustCreditRequest
): Promise<CustomerCreditInfo> => {
  const { data } = await api.post<ApiResponse<CustomerCreditInfo>>(
    `/customers/${customerId}/adjust-credit`,
    request
  );
  return data.data;
};

/**
 * Get customer transactions
 * GET /api/customers/:id/transactions
 */
export interface TransactionsQueryParams {
  startDate?: string;
  endDate?: string;
  type?: 'SALE' | 'PAYMENT' | 'DEPOSIT' | 'CREDIT' | 'REFUND' | 'ADJUSTMENT';
  page?: number;
  limit?: number;
}

export const getCustomerTransactions = async (
  customerId: string,
  params?: TransactionsQueryParams
): Promise<PaginatedResponse<CustomerTransaction>> => {
  const { data } = await api.get<PaginatedResponse<CustomerTransaction>>(
    `/customers/${customerId}/transactions`,
    { params }
  );
  return data;
};

/**
 * Make a payment on customer account
 * POST /api/customers/:id/payment
 */
export interface PaymentRequest {
  amount: number;
  paymentMethod: 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'MOBILE_MONEY' | 'CHEQUE' | 'OTHER';
  reference?: string;
  notes?: string;
  applyToSales?: string[]; // Array of sale IDs to apply payment to
}

export const makePayment = async (
  customerId: string,
  payment: PaymentRequest
): Promise<CustomerBalance> => {
  const { data } = await api.post<ApiResponse<CustomerBalance>>(
    `/customers/${customerId}/payment`,
    payment
  );
  return data.data;
};

/**
 * Get customer aging report
 * GET /api/customers/:id/aging
 */
export const getCustomerAging = async (customerId: string): Promise<CustomerAging> => {
  const { data } = await api.get<ApiResponse<CustomerAging>>(`/customers/${customerId}/aging`);
  return data.data;
};

/**
 * Get account statement
 * GET /api/customers/:id/statement
 */
export interface StatementQueryParams {
  startDate?: string;
  endDate?: string;
}

export const getAccountStatement = async (
  customerId: string,
  params?: StatementQueryParams
): Promise<PaginatedResponse<CustomerTransaction>> => {
  const { data } = await api.get<PaginatedResponse<CustomerTransaction>>(
    `/customers/${customerId}/statement`,
    { params }
  );
  return data;
};

// ===================================================================
// REACT QUERY HOOKS
// ===================================================================

/**
 * Hook to get customer balance
 * @example
 * const { data: balance, isLoading, error } = useCustomerBalance('customer-123');
 */
export function useCustomerBalance(customerId: string | null | undefined) {
  return useQuery({
    queryKey: ['customerBalance', customerId],
    queryFn: () => getCustomerBalance(customerId!),
    enabled: !!customerId,
    staleTime: 30000, // 30 seconds
  });
}

/**
 * Hook to get customer credit info
 * @example
 * const { data: creditInfo } = useCustomerCreditInfo('customer-123');
 */
export function useCustomerCreditInfo(customerId: string | null | undefined) {
  return useQuery({
    queryKey: ['customerCreditInfo', customerId],
    queryFn: () => getCustomerCreditInfo(customerId!),
    enabled: !!customerId,
    staleTime: 60000, // 1 minute
  });
}

/**
 * Hook to get customer transactions
 * @example
 * const { data: transactions } = useCustomerTransactions('customer-123', {
 *   startDate: '2024-01-01',
 *   type: 'SALE'
 * });
 */
export function useCustomerTransactions(
  customerId: string | null | undefined,
  params?: TransactionsQueryParams
) {
  return useQuery({
    queryKey: ['customerTransactions', customerId, params],
    queryFn: () => getCustomerTransactions(customerId!, params),
    enabled: !!customerId,
    staleTime: 30000,
  });
}

/**
 * Hook to get customer aging
 * @example
 * const { data: aging } = useCustomerAging('customer-123');
 */
export function useCustomerAging(customerId: string | null | undefined) {
  return useQuery({
    queryKey: ['customerAging', customerId],
    queryFn: () => getCustomerAging(customerId!),
    enabled: !!customerId,
    staleTime: 300000, // 5 minutes
  });
}

/**
 * Hook to get account statement
 * @example
 * const { data: statement } = useAccountStatement('customer-123', {
 *   startDate: '2024-01-01',
 *   endDate: '2024-12-31'
 * });
 */
export function useAccountStatement(
  customerId: string | null | undefined,
  params?: StatementQueryParams
) {
  return useQuery({
    queryKey: ['accountStatement', customerId, params],
    queryFn: () => getAccountStatement(customerId!, params),
    enabled: !!customerId,
    staleTime: 60000,
  });
}

/**
 * Hook to make a deposit
 * @example
 * const depositMutation = useMakeDeposit();
 * await depositMutation.mutateAsync({ customerId: '123', deposit: {...} });
 */
export function useMakeDeposit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ customerId, deposit }: { customerId: string; deposit: DepositRequest }) =>
      makeDeposit(customerId, deposit),
    onSuccess: (_, variables) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['customerBalance', variables.customerId] });
      queryClient.invalidateQueries({ queryKey: ['customerTransactions', variables.customerId] });
      queryClient.invalidateQueries({ queryKey: ['accountStatement', variables.customerId] });
    },
  });
}

/**
 * Hook to make a payment
 * @example
 * const paymentMutation = useMakePayment();
 * await paymentMutation.mutateAsync({ customerId: '123', payment: {...} });
 */
export function useMakePayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ customerId, payment }: { customerId: string; payment: PaymentRequest }) =>
      makePayment(customerId, payment),
    onSuccess: (_, variables) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['customerBalance', variables.customerId] });
      queryClient.invalidateQueries({ queryKey: ['customerTransactions', variables.customerId] });
      queryClient.invalidateQueries({ queryKey: ['customerCreditInfo', variables.customerId] });
      queryClient.invalidateQueries({ queryKey: ['accountStatement', variables.customerId] });
    },
  });
}

/**
 * Hook to adjust credit limit
 * @example
 * const adjustCreditMutation = useAdjustCreditLimit();
 * await adjustCreditMutation.mutateAsync({ 
 *   customerId: '123', 
 *   request: { newCreditLimit: 5000, reason: 'Good payment history' } 
 * });
 */
export function useAdjustCreditLimit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ customerId, request }: { customerId: string; request: AdjustCreditRequest }) =>
      adjustCreditLimit(customerId, request),
    onSuccess: (_, variables) => {
      // Invalidate credit-related queries
      queryClient.invalidateQueries({ queryKey: ['customerCreditInfo', variables.customerId] });
      queryClient.invalidateQueries({ queryKey: ['customerBalance', variables.customerId] });
    },
  });
}

// Export everything as a namespace for convenience
export const customerAccountsApi = {
  getCustomerBalance,
  makeDeposit,
  getCustomerCreditInfo,
  adjustCreditLimit,
  getCustomerTransactions,
  makePayment,
  getCustomerAging,
  getAccountStatement,
};
