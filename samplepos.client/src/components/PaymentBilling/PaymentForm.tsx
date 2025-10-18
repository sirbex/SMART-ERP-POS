/**
 * Payment Form Component
 * Form for submitting payments with validation
 */

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Textarea } from '../ui/textarea';
import { Alert, AlertDescription } from '../ui/alert';
import { CheckCircle2, CreditCard, Loader2, AlertCircle } from 'lucide-react';
import { useSubmitPayment, useValidatePayment, type PaymentSubmission } from './hooks/useSubmitPayment';
import type { PaymentMethod } from '../../models/Transaction';

interface PaymentFormProps {
  customerId?: string;
  maxAmount?: number;
  onSuccess?: (transactionId: string) => void;
  className?: string;
}

export const PaymentForm: React.FC<PaymentFormProps> = ({
  customerId,
  maxAmount,
  onSuccess,
  className = '',
}) => {
  const [amount, setAmount] = useState<string>('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  
  const { mutate: submitPayment, isPending, isSuccess, error } = useSubmitPayment();
  const validation = useValidatePayment(parseFloat(amount) || 0, maxAmount);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validation.isValid) {
      return;
    }

    const payment: PaymentSubmission = {
      customerId,
      amount: parseFloat(amount),
      method,
      reference: reference || undefined,
      notes: notes || undefined,
    };

    submitPayment(payment, {
      onSuccess: (response) => {
        // Reset form
        setAmount('');
        setReference('');
        setNotes('');
        
        // Call success callback
        onSuccess?.(response.transactionId || '');
      },
    });
  };

  const formatCurrency = (value: string) => {
    const num = parseFloat(value);
    if (isNaN(num)) return '';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(num);
  };

  return (
    <Card className={`w-full ${className}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Submit Payment
        </CardTitle>
        <CardDescription>
          {maxAmount 
            ? `Enter payment amount (max: ${formatCurrency(maxAmount.toString())})`
            : 'Enter payment details below'
          }
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Amount Input */}
          <div className="space-y-2">
            <Label htmlFor="amount">
              Payment Amount <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                $
              </span>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                max={maxAmount}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="pl-7"
                required
                disabled={isPending}
              />
            </div>
            {amount && parseFloat(amount) > 0 && (
              <p className="text-sm text-muted-foreground">
                Amount: {formatCurrency(amount)}
              </p>
            )}
          </div>

          {/* Payment Method */}
          <div className="space-y-2">
            <Label htmlFor="method">
              Payment Method <span className="text-red-500">*</span>
            </Label>
            <Select value={method} onValueChange={(value) => setMethod(value as PaymentMethod)}>
              <SelectTrigger id="method" disabled={isPending}>
                <SelectValue placeholder="Select payment method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="card">Credit/Debit Card</SelectItem>
                <SelectItem value="credit">Store Credit</SelectItem>
                <SelectItem value="mobile">Mobile Payment</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Reference Number */}
          {(method === 'card' || method === 'mobile' || method === 'other') && (
            <div className="space-y-2">
              <Label htmlFor="reference">
                Reference Number
                {method === 'card' && <span className="text-muted-foreground text-xs ml-2">(e.g., last 4 digits)</span>}
              </Label>
              <Input
                id="reference"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder={method === 'card' ? '****1234' : 'Transaction reference'}
                disabled={isPending}
              />
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (Optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any additional notes about this payment..."
              rows={3}
              disabled={isPending}
            />
          </div>

          {/* Validation Errors */}
          {!validation.isValid && amount && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <ul className="list-disc list-inside space-y-1">
                  {validation.errors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* API Error */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {error.message || 'Failed to submit payment. Please try again.'}
              </AlertDescription>
            </Alert>
          )}

          {/* Success Message */}
          {isSuccess && (
            <Alert className="bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
              <AlertDescription className="text-green-700 dark:text-green-300">
                Payment submitted successfully!
              </AlertDescription>
            </Alert>
          )}

          {/* Submit Button */}
          <Button
            type="submit"
            className="w-full"
            disabled={isPending || !validation.isValid || !amount}
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing Payment...
              </>
            ) : (
              <>
                <CreditCard className="mr-2 h-4 w-4" />
                Submit Payment
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
