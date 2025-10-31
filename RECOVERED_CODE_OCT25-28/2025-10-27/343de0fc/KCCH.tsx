/**
 * Discount Dialog Component
 * Allows adding discount to cart item with reason for >5%
 */

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { AlertCircle, Percent } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { roundMoney, multiplyMoney } from '../utils/precision';

interface DiscountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemName: string;
  itemPrice: number;
  itemQuantity: number;
  currentDiscount: number;
  onConfirm: (discountAmount: number, reason: string | null) => void;
}

export default function DiscountDialog({
  open,
  onOpenChange,
  itemName,
  itemPrice,
  itemQuantity,
  currentDiscount,
  onConfirm,
}: DiscountDialogProps) {
  const lineTotal = multiplyMoney(itemPrice, itemQuantity);
  const [discountAmount, setDiscountAmount] = useState(currentDiscount.toString());
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const handleConfirm = () => {
    const discount = parseFloat(discountAmount);
    
    // Validation: Discount must be non-negative
    if (isNaN(discount) || discount < 0) {
      setError('Discount must be a non-negative number');
      return;
    }

    // Validation: Discount cannot exceed line total
    if (discount > lineTotal) {
      setError(`Discount cannot exceed line total of ${formatCurrency(lineTotal)}`);
      return;
    }

    // Calculate discount percentage
    const discountPercentage = (discount / lineTotal) * 100;

    // Validation: Reason required if discount > 5%
    if (discountPercentage > 5 && reason.trim().length < 3) {
      setError('Discount over 5% requires a reason (minimum 3 characters)');
      return;
    }

    // Success
    const finalReason = discountPercentage > 5 ? reason.trim() : null;
    onConfirm(roundMoney(discount), finalReason);
    onOpenChange(false);
    
    // Reset state
    setReason('');
    setError('');
  };

  const handleCancel = () => {
    onOpenChange(false);
    setDiscountAmount(currentDiscount.toString());
    setReason('');
    setError('');
  };

  const discountValue = parseFloat(discountAmount) || 0;
  const discountPercentage = lineTotal > 0 ? (discountValue / lineTotal * 100).toFixed(1) : '0.0';
  const requiresReason = parseFloat(discountPercentage) > 5;
  const finalAmount = roundMoney(lineTotal - discountValue);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Apply Discount</DialogTitle>
          <DialogDescription>
            Add discount for <span className="font-semibold">{itemName}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Line Total Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-sm text-blue-900">Line Total:</span>
                <span className="font-semibold text-blue-900">{formatCurrency(lineTotal)}</span>
              </div>
              <div className="flex justify-between items-center text-xs text-blue-700">
                <span>{itemQuantity} × {formatCurrency(itemPrice)}</span>
              </div>
            </div>
          </div>

          {/* Discount Amount Input */}
          <div className="space-y-2">
            <Label htmlFor="discountAmount">Discount Amount</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">$</span>
              <Input
                id="discountAmount"
                type="number"
                step="0.01"
                min="0"
                max={lineTotal}
                placeholder="0.00"
                value={discountAmount}
                onChange={(e) => {
                  setDiscountAmount(e.target.value);
                  setError('');
                }}
                className="pl-8"
                autoFocus
              />
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center gap-1 text-sm text-gray-500">
                <Percent className="h-3 w-3" />
                {discountPercentage}%
              </div>
            </div>
            {discountValue > 0 && (
              <p className="text-xs text-green-600">
                New total: {formatCurrency(finalAmount)}
              </p>
            )}
          </div>

          {/* Reason Input - Conditional */}
          {requiresReason && (
            <div className="space-y-2">
              <Label htmlFor="reason" className="flex items-center gap-2">
                Reason for Discount *
                <span className="text-xs font-normal text-amber-600">(Required for &gt;5%)</span>
              </Label>
              <Textarea
                id="reason"
                placeholder="e.g., Loyalty reward, Bulk discount, Promotion..."
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  setError('');
                }}
                rows={3}
                className="resize-none"
              />
              <p className="text-xs text-gray-500">
                Minimum 3 characters required
              </p>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Info Message */}
          <div className={`${requiresReason ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'} border rounded-md p-3`}>
            <p className="text-xs text-gray-700">
              {requiresReason ? (
                <>
                  <strong className="text-amber-900">Note:</strong> Discounts over 5% require a reason for audit purposes.
                </>
              ) : (
                <>
                  <strong>Tip:</strong> Discounts up to 5% don't require a reason. Current: {discountPercentage}%
                </>
              )}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>
            Apply Discount
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
