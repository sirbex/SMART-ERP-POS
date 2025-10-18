/**
 * Payments API
 * 
 * Handles payment recording, allocation, refunds, and payment management.
 * Aligned with backend endpoints in SamplePOS.Server/src/modules/payments.ts
 * 
 * @module services/api/paymentsApi
 */

import api from '@/config/api.config';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Payment,
  ApiResponse,
  PaginatedResponse,
  PaymentMethod,
  PaymentStatus
} from '@/types/backend';

// ===================================================================
// TYPE DEFINITIONS
// ===================================================================

/**
 * Request to record a new payment
 */
export interface RecordPaymentRequest {
  customerId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  reference?: string;
  notes?: string;
  paymentDate?: string;
}

/**
 * Request to allocate a payment to one or more sales
 */
export interface AllocatePaymentRequest {
  paymentId: string;
  allocations: Array<{
    saleId: string;
    amount: number;
  }>;
}

/**
 * Request to process a refund
 */
export interface RefundPaymentRequest {
  paymentId: string;
  amount: number;
  reason: string;
  refundMethod?: PaymentMethod;
}

/**
 * Bulk allocation request
 */
export interface BulkAllocatePaymentsRequest {
  customerId: string;
  allocations: Array<{
    paymentId: string;
    saleId: string;
    amount: number;
  }>;
}

/**
 * Query parameters for fetching payments
 */
export interface GetPaymentsParams {
  customerId?: string;
  status?: PaymentStatus;
  paymentMethod?: PaymentMethod;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

/**
 * Query parameters for unallocated payments
 */
export interface GetUnallocatedPaymentsParams {
  customerId?: string;
  page?: number;
  limit?: number;
}

// ===================================================================
// API FUNCTIONS
// ===================================================================

/**
 * Record a new payment from customer
 * POST /api/payments/record
 */
export const recordPayment = async (request: RecordPaymentRequest): Promise<Payment> => {
  const { data } = await api.post<ApiResponse<Payment>>('/payments/record', request);
  return data.data;
};

/**
 * Allocate payment to one or more sales
 * POST /api/payments/allocate
 */
export const allocatePayment = async (request: AllocatePaymentRequest): Promise<Payment> => {
  const { data } = await api.post<ApiResponse<Payment>>('/payments/allocate', request);
  return data.data;
};

/**
 * Get customer payments with filtering
 * GET /api/payments/customer/:customerId
 */
export const getCustomerPayments = async (
  customerId: string,
  params?: Omit<GetPaymentsParams, 'customerId'>
): Promise<PaginatedResponse<Payment>> => {
  const { data } = await api.get<PaginatedResponse<Payment>>(
    `/payments/customer/${customerId}`,
    { params }
  );
  return data;
};

/**
 * Process payment refund
 * POST /api/payments/refund
 */
export const refundPayment = async (request: RefundPaymentRequest): Promise<Payment> => {
  const { data } = await api.post<ApiResponse<Payment>>('/payments/refund', request);
  return data.data;
};

/**
 * Get unallocated payments (payments not yet applied to sales)
 * GET /api/payments/unallocated
 */
export const getUnallocatedPayments = async (
  params?: GetUnallocatedPaymentsParams
): Promise<PaginatedResponse<Payment>> => {
  const { data } = await api.get<PaginatedResponse<Payment>>('/payments/unallocated', { params });
  return data;
};

/**
 * Bulk allocate multiple payments to sales
 * POST /api/payments/bulk-allocate
 */
export const bulkAllocatePayments = async (
  request: BulkAllocatePaymentsRequest
): Promise<Payment[]> => {
  const { data } = await api.post<ApiResponse<Payment[]>>('/payments/bulk-allocate', request);
  return data.data;
};

// ===================================================================
// REACT QUERY HOOKS
// ===================================================================

/**
 * Hook to get customer payments with filtering
 * @example
 * const { data: payments } = useCustomerPayments('customer-123', {
 *   status: 'COMPLETED',
 *   startDate: '2024-01-01'
 * });
 */
export function useCustomerPayments(
  customerId: string | null | undefined,
  params?: Omit<GetPaymentsParams, 'customerId'>
) {
  return useQuery({
    queryKey: ['customerPayments', customerId, params],
    queryFn: () => getCustomerPayments(customerId!, params),
    enabled: !!customerId,
    staleTime: 30000, // 30 seconds
  });
}

/**
 * Hook to get unallocated payments
 * @example
 * const { data: unallocatedPayments } = useUnallocatedPayments({ customerId: '123' });
 */
export function useUnallocatedPayments(params?: GetUnallocatedPaymentsParams) {
  return useQuery({
    queryKey: ['unallocatedPayments', params],
    queryFn: () => getUnallocatedPayments(params),
    staleTime: 30000,
  });
}

/**
 * Hook to record a payment
 * @example
 * const recordPaymentMutation = useRecordPayment();
 * await recordPaymentMutation.mutateAsync({
 *   customerId: 'customer-123',
 *   amount: 5000,
 *   paymentMethod: 'CASH',
 *   reference: 'RCPT-001'
 * });
 */
export function useRecordPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: recordPayment,
    onSuccess: (newPayment) => {
      // Invalidate customer payments
      queryClient.invalidateQueries({ queryKey: ['customerPayments', newPayment.customerId] });
      // Invalidate unallocated payments
      queryClient.invalidateQueries({ queryKey: ['unallocatedPayments'] });
      // Invalidate customer balance
      queryClient.invalidateQueries({ queryKey: ['customerBalance', newPayment.customerId] });
      queryClient.invalidateQueries({ queryKey: ['customerTransactions', newPayment.customerId] });
    },
  });
}

/**
 * Hook to allocate payment to sales
 * @example
 * const allocateMutation = useAllocatePayment();
 * await allocateMutation.mutateAsync({
 *   paymentId: 'payment-123',
 *   allocations: [
 *     { saleId: 'sale-1', amount: 1000 },
 *     { saleId: 'sale-2', amount: 500 }
 *   ]
 * });
 */
export function useAllocatePayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: allocatePayment,
    onSuccess: (allocatedPayment) => {
      // Invalidate payments
      queryClient.invalidateQueries({ queryKey: ['customerPayments', allocatedPayment.customerId] });
      queryClient.invalidateQueries({ queryKey: ['unallocatedPayments'] });
      // Invalidate customer data
      queryClient.invalidateQueries({ queryKey: ['customerBalance', allocatedPayment.customerId] });
      queryClient.invalidateQueries({ queryKey: ['customerTransactions', allocatedPayment.customerId] });
      queryClient.invalidateQueries({ queryKey: ['customerAging', allocatedPayment.customerId] });
    },
  });
}

/**
 * Hook to process payment refund
 * @example
 * const refundMutation = useRefundPayment();
 * await refundMutation.mutateAsync({
 *   paymentId: 'payment-123',
 *   amount: 500,
 *   reason: 'Customer requested refund',
 *   refundMethod: 'BANK_TRANSFER'
 * });
 */
export function useRefundPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: refundPayment,
    onSuccess: (refundedPayment) => {
      // Invalidate payments
      queryClient.invalidateQueries({ queryKey: ['customerPayments', refundedPayment.customerId] });
      // Invalidate customer data
      queryClient.invalidateQueries({ queryKey: ['customerBalance', refundedPayment.customerId] });
      queryClient.invalidateQueries({ queryKey: ['customerTransactions', refundedPayment.customerId] });
    },
  });
}

/**
 * Hook to bulk allocate payments
 * @example
 * const bulkAllocateMutation = useBulkAllocatePayments();
 * await bulkAllocateMutation.mutateAsync({
 *   customerId: 'customer-123',
 *   allocations: [
 *     { paymentId: 'payment-1', saleId: 'sale-1', amount: 1000 },
 *     { paymentId: 'payment-2', saleId: 'sale-2', amount: 500 }
 *   ]
 * });
 */
export function useBulkAllocatePayments() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: bulkAllocatePayments,
    onSuccess: (_, variables) => {
      // Invalidate payments for customer
      queryClient.invalidateQueries({ queryKey: ['customerPayments', variables.customerId] });
      queryClient.invalidateQueries({ queryKey: ['unallocatedPayments'] });
      // Invalidate customer data
      queryClient.invalidateQueries({ queryKey: ['customerBalance', variables.customerId] });
      queryClient.invalidateQueries({ queryKey: ['customerTransactions', variables.customerId] });
      queryClient.invalidateQueries({ queryKey: ['customerAging', variables.customerId] });
    },
  });
}

// Export everything as a namespace for convenience
export const paymentsApi = {
  recordPayment,
  allocatePayment,
  getCustomerPayments,
  refundPayment,
  getUnallocatedPayments,
  bulkAllocatePayments,
};
