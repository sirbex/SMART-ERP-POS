// DiscountDialog - Apply discount to cart or line item

import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import Decimal from 'decimal.js';
import { calculateDiscountAmount } from '@shared/zod/discount';
import type { DiscountType, DiscountScope } from '@shared/zod/discount';

interface DiscountDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (discount: {
    type: DiscountType;
    scope: DiscountScope;
    value: number;
    reason: string;
    lineItemIndex?: number;
  }) => void;
  originalAmount: number;
  lineItemIndex?: number; // If provided, applies to line item
  userRole: 'ADMIN' | 'MANAGER' | 'CASHIER' | 'STAFF';
}

const ROLE_LIMITS: Record<'ADMIN' | 'MANAGER' | 'CASHIER' | 'STAFF', number> = {
  ADMIN: 100,
  MANAGER: 50,
  CASHIER: 10,
  STAFF: 5,
};

export default function DiscountDialog({
  isOpen,
  onClose,
  onApply,
  originalAmount,
  lineItemIndex,
  userRole,
}: DiscountDialogProps) {
  const [discountType, setDiscountType] = useState<DiscountType>('PERCENTAGE');
  const [discountValue, setDiscountValue] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const valueInputRef = useRef<HTMLInputElement>(null);
  const reasonInputRef = useRef<HTMLInputElement>(null);

  const userLimit = ROLE_LIMITS[userRole] || 0;

  // Calculate discount preview
  const discountAmount = discountValue
    ? calculateDiscountAmount(originalAmount, discountType, parseFloat(discountValue))
    : 0;
  const finalAmount = new Decimal(originalAmount).minus(discountAmount).toNumber();

  // Calculate percentage for limit checking
  const discountPercentage =
    discountType === 'PERCENTAGE'
      ? parseFloat(discountValue || '0')
      : new Decimal(discountAmount).dividedBy(originalAmount).times(100).toNumber();

  const requiresApproval = discountPercentage > userLimit;

  // Reset form when opened
  useEffect(() => {
    if (isOpen) {
      setDiscountType('PERCENTAGE');
      setDiscountValue('');
      setReason('');
      setError('');
      setTimeout(() => valueInputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Keyboard shortcuts handled via onKeyDown on dialog container
  // (avoids stale closure issues with useEffect + window listener)
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const handleApply = () => {
    setError('');

    // Validation
    if (!discountValue || parseFloat(discountValue) <= 0) {
      setError('Please enter a valid discount value');
      return;
    }

    if (discountAmount > originalAmount) {
      setError('Discount cannot exceed original amount');
      return;
    }

    if (!reason || reason.trim().length < 5) {
      setError('Please provide a reason (minimum 5 characters)');
      reasonInputRef.current?.focus();
      return;
    }

    // Apply discount
    onApply({
      type: discountType,
      scope: lineItemIndex !== undefined ? 'LINE_ITEM' : 'CART',
      value: parseFloat(discountValue),
      reason: reason.trim(),
      lineItemIndex,
    });

    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            handleApply();
          }
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">
            Apply Discount {lineItemIndex !== undefined && '(Line Item)'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Discount Type */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Discount Type
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => setDiscountType('PERCENTAGE')}
              className={`flex-1 py-2 px-4 rounded border ${discountType === 'PERCENTAGE'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
            >
              Percentage (%)
            </button>
            <button
              onClick={() => setDiscountType('FIXED_AMOUNT')}
              className={`flex-1 py-2 px-4 rounded border ${discountType === 'FIXED_AMOUNT'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
            >
              Fixed Amount (UGX)
            </button>
          </div>
        </div>

        {/* Discount Value */}
        <div className="mb-4">
          <label htmlFor="discount-value" className="block text-sm font-medium text-gray-700 mb-1">
            {discountType === 'PERCENTAGE' ? 'Discount Percentage' : 'Discount Amount'}
          </label>
          <input
            ref={valueInputRef}
            id="discount-value"
            type="number"
            min="0"
            max={discountType === 'PERCENTAGE' ? '100' : originalAmount.toString()}
            step={discountType === 'PERCENTAGE' ? '1' : '100'}
            value={discountValue}
            onChange={(e) => setDiscountValue(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder={discountType === 'PERCENTAGE' ? 'Enter percentage (0-100)' : 'Enter amount'}
          />
          {discountType === 'PERCENTAGE' && (
            <p className="text-xs text-gray-500 mt-1">
              Your limit: {userLimit}% {requiresApproval && '(Manager approval required)'}
            </p>
          )}
        </div>

        {/* Reason */}
        <div className="mb-4">
          <label htmlFor="discount-reason" className="block text-sm font-medium text-gray-700 mb-1">
            Reason <span className="text-red-500">*</span>
          </label>
          <input
            ref={reasonInputRef}
            id="discount-reason"
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Enter reason for discount (minimum 5 characters)"
          />
          <p className="text-xs text-gray-500 mt-1">
            Required for audit trail
          </p>
        </div>

        {/* Preview */}
        <div className="bg-gray-50 rounded p-4 mb-4">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Preview</h3>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Original Amount:</span>
              <span className="font-medium">UGX {originalAmount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-red-600">
              <span>Discount ({discountPercentage.toFixed(1)}%):</span>
              <span className="font-medium">-UGX {discountAmount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-gray-200">
              <span className="font-semibold text-gray-900">Final Amount:</span>
              <span className="font-bold text-green-600">UGX {finalAmount.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Manager Approval Warning */}
        {requiresApproval && (
          <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mb-4">
            <p className="text-sm text-yellow-800">
              ⚠️ This discount exceeds your limit and requires manager approval before sale completion.
            </p>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded p-3 mb-4">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2 px-4 border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={!discountValue || !reason}
            className="flex-1 py-2 px-4 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            Apply Discount
          </button>
        </div>

        <p className="text-xs text-gray-500 mt-3 text-center">
          Keyboard: <kbd>Enter</kbd> to apply, <kbd>Esc</kbd> to cancel
        </p>
      </div>
    </div>
  );
}
