/**
 * Installments API
 * 
 * Handles installment plan management and payment scheduling for credit sales.
 * Aligned with backend endpoints in SamplePOS.Server/src/modules/installments.ts
 * 
 * @module services/api/installmentsApi
 */

import api from '@/config/api.config';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  InstallmentPlan,
  InstallmentPayment,
  ApiResponse,
  PaginatedResponse
} from '@/types/backend';

// ===================================================================
// TYPE DEFINITIONS
// ===================================================================

/**
 * Request to create a new installment plan
 */
export interface CreateInstallmentPlanRequest {
  saleId: string;
  customerId: string;
  totalAmount: number;
  downPayment?: number;
  numberOfInstallments: number;
  frequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY';
  startDate: string;
  interestRate?: number;
  notes?: string;
}

/**
 * Request to record an installment payment
 */
export interface RecordInstallmentPaymentRequest {
  amount: number;
  paymentMethod: 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'MOBILE_MONEY' | 'CHEQUE' | 'OTHER';
  reference?: string;
  notes?: string;
}

/**
 * Query parameters for fetching installment plans
 */
export interface GetInstallmentPlansParams {
  customerId?: string;
  status?: 'ACTIVE' | 'COMPLETED' | 'DEFAULTED' | 'CANCELLED';
  page?: number;
  limit?: number;
}

/**
 * Request to update installment plan
 */
export interface UpdateInstallmentPlanRequest {
  status?: 'ACTIVE' | 'COMPLETED' | 'DEFAULTED' | 'CANCELLED';
  notes?: string;
}

// ===================================================================
// API FUNCTIONS
// ===================================================================

/**
 * Create a new installment plan
 * POST /api/installments
 */
export const createInstallmentPlan = async (
  request: CreateInstallmentPlanRequest
): Promise<InstallmentPlan> => {
  const { data } = await api.post<ApiResponse<InstallmentPlan>>('/installments', request);
  return data.data;
};

/**
 * Get all installment plans with optional filtering
 * GET /api/installments
 */
export const getInstallmentPlans = async (
  params?: GetInstallmentPlansParams
): Promise<PaginatedResponse<InstallmentPlan>> => {
  const { data } = await api.get<PaginatedResponse<InstallmentPlan>>('/installments', { params });
  return data;
};

/**
 * Get single installment plan by ID
 * GET /api/installments/:id
 */
export const getInstallmentPlan = async (id: string): Promise<InstallmentPlan> => {
  const { data } = await api.get<ApiResponse<InstallmentPlan>>(`/installments/${id}`);
  return data.data;
};

/**
 * Record payment for an installment
 * POST /api/installments/:id/payment
 */
export const recordInstallmentPayment = async (
  installmentPlanId: string,
  payment: RecordInstallmentPaymentRequest
): Promise<InstallmentPayment> => {
  const { data } = await api.post<ApiResponse<InstallmentPayment>>(
    `/installments/${installmentPlanId}/payment`,
    payment
  );
  return data.data;
};

/**
 * Update installment plan status
 * PUT /api/installments/:id
 */
export const updateInstallmentPlan = async (
  id: string,
  request: UpdateInstallmentPlanRequest
): Promise<InstallmentPlan> => {
  const { data } = await api.put<ApiResponse<InstallmentPlan>>(`/installments/${id}`, request);
  return data.data;
};

// ===================================================================
// REACT QUERY HOOKS
// ===================================================================

/**
 * Hook to get all installment plans with filtering
 * @example
 * const { data: plans } = useInstallmentPlans({ customerId: '123', status: 'ACTIVE' });
 */
export function useInstallmentPlans(params?: GetInstallmentPlansParams) {
  return useQuery({
    queryKey: ['installmentPlans', params],
    queryFn: () => getInstallmentPlans(params),
    staleTime: 60000, // 1 minute
  });
}

/**
 * Hook to get single installment plan
 * @example
 * const { data: plan } = useInstallmentPlan('plan-123');
 */
export function useInstallmentPlan(id: string | null | undefined) {
  return useQuery({
    queryKey: ['installmentPlan', id],
    queryFn: () => getInstallmentPlan(id!),
    enabled: !!id,
    staleTime: 60000,
  });
}

/**
 * Hook to create installment plan
 * @example
 * const createPlanMutation = useCreateInstallmentPlan();
 * await createPlanMutation.mutateAsync({
 *   saleId: 'sale-123',
 *   customerId: 'customer-456',
 *   totalAmount: 10000,
 *   numberOfInstallments: 12,
 *   frequency: 'MONTHLY',
 *   startDate: '2024-01-01'
 * });
 */
export function useCreateInstallmentPlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createInstallmentPlan,
    onSuccess: (newPlan) => {
      // Invalidate plans list
      queryClient.invalidateQueries({ queryKey: ['installmentPlans'] });
      // Invalidate customer balance (affects credit used)
      queryClient.invalidateQueries({ queryKey: ['customerBalance', newPlan.customerId] });
      queryClient.invalidateQueries({ queryKey: ['customerCreditInfo', newPlan.customerId] });
    },
  });
}

/**
 * Hook to record installment payment
 * @example
 * const paymentMutation = useRecordInstallmentPayment();
 * await paymentMutation.mutateAsync({
 *   installmentPlanId: 'plan-123',
 *   payment: { amount: 500, paymentMethod: 'CASH' }
 * });
 */
export function useRecordInstallmentPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      installmentPlanId,
      payment,
    }: {
      installmentPlanId: string;
      payment: RecordInstallmentPaymentRequest;
    }) => recordInstallmentPayment(installmentPlanId, payment),
    onSuccess: (_, variables) => {
      // Invalidate specific plan
      queryClient.invalidateQueries({ queryKey: ['installmentPlan', variables.installmentPlanId] });
      // Invalidate plans list
      queryClient.invalidateQueries({ queryKey: ['installmentPlans'] });
      // Get the plan to find customerId for invalidation
      const plan = queryClient.getQueryData<InstallmentPlan>([
        'installmentPlan',
        variables.installmentPlanId,
      ]);
      if (plan) {
        queryClient.invalidateQueries({ queryKey: ['customerBalance', plan.customerId] });
        queryClient.invalidateQueries({ queryKey: ['customerTransactions', plan.customerId] });
      }
    },
  });
}

/**
 * Hook to update installment plan
 * @example
 * const updatePlanMutation = useUpdateInstallmentPlan();
 * await updatePlanMutation.mutateAsync({
 *   id: 'plan-123',
 *   request: { status: 'CANCELLED', notes: 'Customer requested cancellation' }
 * });
 */
export function useUpdateInstallmentPlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, request }: { id: string; request: UpdateInstallmentPlanRequest }) =>
      updateInstallmentPlan(id, request),
    onSuccess: (updatedPlan, variables) => {
      // Invalidate specific plan
      queryClient.invalidateQueries({ queryKey: ['installmentPlan', variables.id] });
      // Invalidate plans list
      queryClient.invalidateQueries({ queryKey: ['installmentPlans'] });
      // Invalidate customer data
      queryClient.invalidateQueries({ queryKey: ['customerBalance', updatedPlan.customerId] });
      queryClient.invalidateQueries({ queryKey: ['customerCreditInfo', updatedPlan.customerId] });
    },
  });
}

// Export everything as a namespace for convenience
export const installmentsApi = {
  createInstallmentPlan,
  getInstallmentPlans,
  getInstallmentPlan,
  recordInstallmentPayment,
  updateInstallmentPlan,
};
