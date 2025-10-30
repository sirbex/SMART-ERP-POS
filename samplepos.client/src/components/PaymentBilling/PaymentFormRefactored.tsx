/**
 * Payment Form Component
 * Handles payment processing with validation and reference checking
 */

import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Textarea } from '../ui/textarea';
import { Alert, AlertDescription } from '../ui/alert';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import TransactionServiceAPI from '../../services/TransactionServiceAPI';

const transactionService = new TransactionServiceAPI();

interface PaymentFormRefactoredProps {
  customerId?: string;
  onSuccess?: () => void;
}

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'mobile_money', label: 'Mobile Money' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'check', label: 'Check' },
];

export const PaymentFormRefactored: React.FC<PaymentFormRefactoredProps> = ({
  customerId,
  onSuccess,
}) => {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    amount: '',
    method: 'cash',
    reference: '',
    notes: '',
  });
  const [validationError, setValidationError] = useState<string>('');

  const recordPaymentMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const payment = {
        customerId: customerId || 'walk-in',
        amount: parseFloat(data.amount),
        paymentMethod: data.method,
        reference: data.reference || undefined,
        notes: data.notes || undefined,
      };

      return transactionService.recordPayment(payment);
    },
    onSuccess: () => {
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['billingData'] });
      
      // Reset form
      setFormData({
        amount: '',
        method: 'cash',
        reference: '',
        notes: '',
      });
      setValidationError('');
      
      onSuccess?.();
    },
    onError: (error: any) => {
      console.error('Payment recording failed:', error);
      setValidationError(error.message || 'Failed to record payment');
    },
  });

  const validateReference = (method: string, reference: string): string | null => {
    if (!reference) {
      // Reference is optional for cash
      if (method === 'cash') return null;
      return null; // Allow empty reference for now
    }

    switch (method) {
      case 'mobile_money':
        if (!/^[A-Z0-9]{8,}$/i.test(reference)) {
          return 'Mobile Money reference should be at least 8 alphanumeric characters';
        }
        break;
      case 'card':
        if (!/^\d{4}$/.test(reference)) {
          return 'Card reference should be the last 4 digits';
        }
        break;
      case 'bank_transfer':
        if (!/^[A-Za-z0-9]{6,}$/.test(reference)) {
          return 'Bank reference should be at least 6 alphanumeric characters';
        }
        break;
      case 'check':
        if (!/^\d{4,}$/.test(reference)) {
          return 'Check number should be at least 4 digits';
        }
        break;
    }

    return null;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError('');

    // Validate amount
    const amount = parseFloat(formData.amount);
    if (isNaN(amount) || amount <= 0) {
      setValidationError('Please enter a valid amount');
      return;
    }

    // Validate reference if provided
    const refError = validateReference(formData.method, formData.reference);
    if (refError) {
      setValidationError(refError);
      return;
    }

    recordPaymentMutation.mutate(formData);
  };

  const handleFieldChange = (field: keyof typeof formData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setValidationError(''); // Clear validation error on change
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Record Payment</CardTitle>
        <CardDescription>
          Enter payment details to record a transaction
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Amount */}
          <div className="space-y-2">
            <Label htmlFor="amount">Amount (UGX) *</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              min="0"
              placeholder="Enter amount"
              value={formData.amount}
              onChange={(e) => handleFieldChange('amount', e.target.value)}
              required
              disabled={recordPaymentMutation.isPending}
            />
          </div>

          {/* Payment Method */}
          <div className="space-y-2">
            <Label htmlFor="method">Payment Method *</Label>
            <Select
              value={formData.method}
              onValueChange={(value) => handleFieldChange('method', value)}
              disabled={recordPaymentMutation.isPending}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((method) => (
                  <SelectItem key={method.value} value={method.value}>
                    {method.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Reference Number */}
          <div className="space-y-2">
            <Label htmlFor="reference">
              Reference Number
              {formData.method !== 'cash' && (
                <span className="text-muted-foreground text-xs ml-2">
                  ({formData.method === 'card' ? 'Last 4 digits' : 
                    formData.method === 'mobile_money' ? 'Transaction code' :
                    formData.method === 'check' ? 'Check number' : 
                    'Transaction reference'})
                </span>
              )}
            </Label>
            <Input
              id="reference"
              type="text"
              placeholder={
                formData.method === 'card' ? 'e.g., 1234' :
                formData.method === 'mobile_money' ? 'e.g., ABC12345678' :
                formData.method === 'check' ? 'e.g., 123456' :
                formData.method === 'bank_transfer' ? 'e.g., TRX123456' :
                'Optional'
              }
              value={formData.reference}
              onChange={(e) => handleFieldChange('reference', e.target.value.toUpperCase())}
              disabled={recordPaymentMutation.isPending}
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (Optional)</Label>
            <Textarea
              id="notes"
              placeholder="Add any additional notes..."
              value={formData.notes}
              onChange={(e) => handleFieldChange('notes', e.target.value)}
              disabled={recordPaymentMutation.isPending}
              rows={3}
            />
          </div>

          {/* Validation Error */}
          {validationError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{validationError}</AlertDescription>
            </Alert>
          )}

          {/* Success Message */}
          {recordPaymentMutation.isSuccess && !recordPaymentMutation.isPending && (
            <Alert className="bg-green-50 text-green-900 border-green-200">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription>Payment recorded successfully!</AlertDescription>
            </Alert>
          )}

          {/* Submit Button */}
          <Button
            type="submit"
            className="w-full"
            disabled={recordPaymentMutation.isPending}
          >
            {recordPaymentMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Recording Payment...
              </>
            ) : (
              'Record Payment'
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
