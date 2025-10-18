/**
 * Custom hook for submitting payments
 * Uses React Query mutations with optimistic updates
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as POSServiceAPI from '../../../services/POSServiceAPI';
import type { PaymentMethod } from '../../../models/Transaction';

export interface PaymentSubmission {
  customerId?: string;
  amount: number;
  method: PaymentMethod;
  reference?: string;
  notes?: string;
  invoiceId?: string;
}

export interface PaymentResponse {
  id: string;
  success: boolean;
  message: string;
  transactionId?: string;
  receiptNumber?: string;
}

/**
 * Submit a payment via API
 */
const submitPayment = async (payment: PaymentSubmission): Promise<PaymentResponse> => {
  try {
    // For now, we'll create a simple transaction record
    // In a real app, this would call a dedicated payment endpoint
    const transactionId = await POSServiceAPI.createTransaction({
      items: [], // Payment-only transaction
      customerId: payment.customerId,
      paymentMethod: payment.method,
      paymentAmount: payment.amount,
      changeAmount: 0,
      subtotal: payment.amount,
      taxAmount: 0,
      discountAmount: 0,
      total: payment.amount,
      notes: payment.notes,
    });

    if (!transactionId) {
      throw new Error('Failed to create transaction');
    }

    return {
      id: transactionId,
      success: true,
      message: 'Payment submitted successfully',
      transactionId: transactionId,
      receiptNumber: transactionId,
    };
  } catch (error) {
    console.error('Error submitting payment:', error);
    throw new Error(
      error instanceof Error
        ? `Payment failed: ${error.message}`
        : 'Payment submission failed'
    );
  }
};

/**
 * Hook to submit payments with optimistic updates
 */
export const useSubmitPayment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: submitPayment,
    
    // Optimistic update - update UI immediately before server responds
    onMutate: async (newPayment) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['billingData'] });
      
      // Snapshot previous value
      const previousData = queryClient.getQueryData(['billingData', newPayment.customerId]);
      
      // Optimistically update cache
      queryClient.setQueryData(['billingData', newPayment.customerId], (old: any) => {
        if (!old) return old;
        
        return {
          ...old,
          summary: {
            ...old.summary,
            totalPaid: old.summary.totalPaid + newPayment.amount,
            pendingAmount: old.summary.pendingAmount - newPayment.amount,
          },
        };
      });
      
      return { previousData, newPayment };
    },
    
    // On error, rollback optimistic update
    onError: (_err, newPayment, context: any) => {
      if (context?.previousData) {
        queryClient.setQueryData(
          ['billingData', newPayment.customerId],
          context.previousData
        );
      }
    },
    
    // Always refetch after error or success
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: ['billingData', variables.customerId] });
      queryClient.invalidateQueries({ queryKey: ['paymentHistory'] });
    },
  });
};

/**
 * Hook for validating payment amounts
 */
export const useValidatePayment = (amount: number, maxAmount?: number) => {
  const errors: string[] = [];
  
  if (amount <= 0) {
    errors.push('Payment amount must be greater than zero');
  }
  
  if (maxAmount && amount > maxAmount) {
    errors.push(`Payment amount cannot exceed ${maxAmount.toFixed(2)}`);
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
};
