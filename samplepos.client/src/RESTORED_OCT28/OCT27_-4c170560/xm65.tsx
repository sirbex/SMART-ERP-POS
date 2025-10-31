/**
 * Price Override Dialog Component
 * Allows staff to override item price with mandatory reason
 */

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { AlertCircle, DollarSign } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { roundMoney } from '../utils/precision';

interface PriceOverrideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  originalPrice: number;
  currentPrice: number;
  itemName: string;
  onConfirm: (newPrice: number, reason: string) => void;
}

export default function PriceOverrideDialog({
  open,
  onOpenChange,
  originalPrice,
  currentPrice,
  itemName,
  onConfirm,
}: PriceOverrideDialogProps) {
  const [newPrice, setNewPrice] = useState(currentPrice.toString());
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const handleConfirm = () => {
    const price = parseFloat(newPrice);
    
    // Validation: Price must be positive
    if (isNaN(price) || price <= 0) {
      setError('Price must be a positive number');
      return;
    }

    // Validation: Price must be between 10% and 200% of original
    const minPrice = originalPrice * 0.1;
    const maxPrice = originalPrice * 2.0;
    
    if (price < minPrice || price > maxPrice) {
      setError(`Price must be between ${formatCurrency(minPrice)} (10%) and ${formatCurrency(maxPrice)} (200%)`);
      return;
    }

    // Validation: Reason required (min 3 characters)
    if (reason.trim().length < 3) {
      setError('Please provide a reason (minimum 3 characters)');
      return;
    }

    // Success
    onConfirm(roundMoney(price), reason.trim());
    onOpenChange(false);
    
    // Reset state
    setReason('');
    setError('');
  };

  const handleCancel = () => {
    onOpenChange(false);
    setNewPrice(currentPrice.toString());
    setReason('');
    setError('');
  };

  const percentageChange = ((parseFloat(newPrice) - originalPrice) / originalPrice * 100).toFixed(1);
  const isValid = !isNaN(parseFloat(newPrice)) && parseFloat(newPrice) > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Override Price</DialogTitle>
          <DialogDescription>
            Change the price for <span className="font-semibold">{itemName}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Original Price Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-blue-900">Original Price:</span>
              <span className="font-semibold text-blue-900">{formatCurrency(originalPrice)}</span>
            </div>
          </div>

          {/* New Price Input */}
          <div className="space-y-2">
            <Label htmlFor="newPrice">New Price *</Label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                id="newPrice"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={newPrice}
                onChange={(e) => {
                  setNewPrice(e.target.value);
                  setError('');
                }}
                className="pl-10"
                autoFocus
              />
            </div>
            {isValid && (
              <p className={`text-xs ${parseFloat(percentageChange) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {parseFloat(percentageChange) > 0 ? '+' : ''}{percentageChange}% from original price
              </p>
            )}
          </div>

          {/* Reason Input */}
          <div className="space-y-2">
            <Label htmlFor="reason">Reason for Override *</Label>
            <Textarea
              id="reason"
              placeholder="e.g., Customer loyalty, Price match, Damaged item..."
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

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Validation Info */}
          <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
            <p className="text-xs text-amber-900">
              <strong>Note:</strong> Price must be between 10% and 200% of original price. A reason is required for audit purposes.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>
            Apply Override
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
