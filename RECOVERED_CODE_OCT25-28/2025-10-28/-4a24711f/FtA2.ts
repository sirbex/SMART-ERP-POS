/**
 * Supplier Payments API
 *
 * Endpoints (backend):
 * - POST /api/supplier-payments
 * - GET  /api/supplier-payments
 * - GET  /api/supplier-payments/:id
 * - GET  /api/supplier-payments/supplier/:supplierId/summary
 */

import api from '@/config/api.config';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

// =============================================
// Types (aligned with backend module responses)
// =============================================

export type SupplierPaymentMethod =
  | 'CASH'
  | 'CARD'
  | 'BANK_TRANSFER'
  | 'CHECK'
  | 'MOBILE_MONEY';

export interface CreateSupplierPaymentRequest {
  supplierId: string; // CUID
  amount: number; // number for request
  paymentDate?: string; // ISO
  paymentMethod: SupplierPaymentMethod;
  referenceNumber?: string;
  checkNumber?: string;
  cardLast4?: string; // max 4
  bankReference?: string;
  notes?: string;
  purchaseOrderIds?: string[]; // optional allocation
}

export interface SupplierPaymentListItem {
  id: string;
  supplier: {
    id: string;
    name: string;
    contactPerson?: string | null;
  };
  amount: string; // decimals returned as string
  paymentDate: string;
  paymentMethod: SupplierPaymentMethod;
  referenceNumber?: string | null;
  checkNumber?: string | null;
  cardLast4?: string | null;
  bankReference?: string | null;
  notes?: string | null;
  processedBy?: { id: string; name: string } | null;
  createdAt: string;
}

export interface SupplierPaymentDetails {
  id: string;
  supplier: {
    id: string;
    name: string;
    contactPerson?: string | null;
    phone?: string | null;
    email?: string | null;
    accountBalance?: string | null;
  };
  amount: string;
  paymentDate: string;
  paymentMethod: SupplierPaymentMethod;
  referenceNumber?: string | null;
  checkNumber?: string | null;
  cardLast4?: string | null;
  bankReference?: string | null;
  notes?: string | null;
  processedBy?: { id: string; name: string; email?: string | null } | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierPaymentSummary {
  supplier: {
    id: string;
    name: string;
    currentBalance: string; // decimal string
    totalPaid: string; // decimal string
    totalPurchased: string; // decimal string
  };
  summary: {
    totalPayments: number;
    totalAmount: string; // decimal string
    averagePayment: string; // decimal string
    periodStart?: string | null;
    periodEnd?: string | null;
  };
  recentPayments: Array<{
    id: string;
    amount: string;
    paymentDate: string;
    paymentMethod: SupplierPaymentMethod;
    referenceNumber?: string | null;
  }>;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface GetSupplierPaymentsParams extends PaginationParams {
  supplierId?: string;
  startDate?: string; // ISO
  endDate?: string; // ISO
  paymentMethod?: SupplierPaymentMethod;
}

export interface PaginatedResponse<T> {
  payments: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// =====================
// API call functions
// =====================

export async function createSupplierPayment(
  request: CreateSupplierPaymentRequest
): Promise<{
  message: string;
  payment: {
    id: string;
    supplierId: string;
    supplierName: string;
    amount: string;
    paymentDate: string;
    paymentMethod: SupplierPaymentMethod;
    referenceNumber?: string | null;
    newBalance: string;
    newTotalPaid: string;
  };
}> {
  const { data } = await api.post('/supplier-payments', request);
  return data;
}

export async function getSupplierPayments(
  params?: GetSupplierPaymentsParams
): Promise<PaginatedResponse<SupplierPaymentListItem>> {
  const { data } = await api.get('/supplier-payments', { params });
  return data;
}

export async function getSupplierPayment(id: string): Promise<SupplierPaymentDetails> {
  const { data } = await api.get(`/supplier-payments/${id}`);
  return data;
}

export async function getSupplierPaymentSummary(
  supplierId: string,
  params?: { startDate?: string; endDate?: string }
): Promise<SupplierPaymentSummary> {
  const { data } = await api.get(`/supplier-payments/supplier/${supplierId}/summary`, {
    params,
  });
  return data;
}

// =====================
// React Query hooks
// =====================

export function useSupplierPayments(params?: GetSupplierPaymentsParams) {
  return useQuery({
    queryKey: ['supplier-payments', params],
    queryFn: () => getSupplierPayments(params),
    staleTime: 30_000,
  });
}

export function useSupplierPaymentDetails(id: string | null | undefined) {
  return useQuery({
    queryKey: ['supplier-payment', id],
    queryFn: () => getSupplierPayment(id!),
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function useSupplierPaymentSummary(
  supplierId: string | null | undefined,
  params?: { startDate?: string; endDate?: string }
) {
  return useQuery({
    queryKey: ['supplier-payment-summary', supplierId, params],
    queryFn: () => getSupplierPaymentSummary(supplierId!, params),
    enabled: !!supplierId,
    staleTime: 30_000,
  });
}

export function useCreateSupplierPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createSupplierPayment,
    onSuccess: (_data, variables) => {
      // Refresh payment lists and supplier summary
      queryClient.invalidateQueries({ queryKey: ['supplier-payments'] });
      if (variables.supplierId) {
        queryClient.invalidateQueries({
          queryKey: ['supplier-payment-summary', variables.supplierId],
        });
        // Also refresh suppliers list/balance if used elsewhere
        queryClient.invalidateQueries({ queryKey: ['suppliers'] });
        queryClient.invalidateQueries({ queryKey: ['supplier', variables.supplierId] });
      }
    },
  });
}

export const supplierPaymentsApi = {
  createSupplierPayment,
  getSupplierPayments,
  getSupplierPayment,
  getSupplierPaymentSummary,
};
