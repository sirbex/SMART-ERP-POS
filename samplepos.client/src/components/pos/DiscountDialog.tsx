// DiscountDialog - Apply discount to cart or line item (AdaptiveDialog Phase 3)

import { useState, useEffect, useRef } from 'react';
import Decimal from 'decimal.js';
import { calculateDiscountAmount } from '@shared/zod/discount';
import type { DiscountType, DiscountScope } from '@shared/zod/discount';
import {
  AdaptiveDialog,
  AdaptiveFormField,
  AdaptiveFormLayout,
} from '../adaptive';
import { NumericSoftKeyboardInput } from '../keyboard/NumericSoftKeyboardInput';

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
  lineItemIndex?: number;
  maxDiscountPercent: number;
}

const touchControl =
  'w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[var(--layout-touch-target)]';

export default function DiscountDialog({
  isOpen,
  onClose,
  onApply,
  originalAmount,
  lineItemIndex,
  maxDiscountPercent,
}: DiscountDialogProps) {
  const [discountType, setDiscountType] = useState<DiscountType>('PERCENTAGE');
  const [discountValue, setDiscountValue] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const valueInputRef = useRef<HTMLInputElement>(null);
  const reasonInputRef = useRef<HTMLInputElement>(null);

  const userLimit = maxDiscountPercent;

  const discountAmount = discountValue
    ? calculateDiscountAmount(originalAmount, discountType, parseFloat(discountValue))
    : 0;
  const finalAmount = new Decimal(originalAmount).minus(discountAmount).toNumber();

  const discountPercentage =
    discountType === 'PERCENTAGE'
      ? parseFloat(discountValue || '0')
      : new Decimal(discountAmount).dividedBy(originalAmount || 1).times(100).toNumber();

  const requiresApproval = discountPercentage > userLimit;

  useEffect(() => {
    if (isOpen) {
      setDiscountType('PERCENTAGE');
      setDiscountValue('');
      setReason('');
      setError('');
      setTimeout(() => valueInputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleApply = () => {
    setError('');

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

    onApply({
      type: discountType,
      scope: lineItemIndex !== undefined ? 'LINE_ITEM' : 'CART',
      value: parseFloat(discountValue),
      reason: reason.trim(),
      lineItemIndex,
    });

    onClose();
  };

  return (
    <AdaptiveDialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      size="sm"
      title={`Apply Discount${lineItemIndex !== undefined ? ' (Line Item)' : ''}`}
      description="Enter a discount value and audit reason. Manager approval may be required above your limit."
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 px-4 border border-gray-300 rounded text-gray-700 hover:bg-gray-50 min-h-[var(--layout-touch-target)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!discountValue || !reason}
            className="flex-1 py-2 px-4 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed min-h-[var(--layout-touch-target)]"
          >
            Apply Discount
          </button>
        </>
      }
    >
      <div
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            handleApply();
          }
        }}
      >
        <AdaptiveFormLayout>
          <AdaptiveFormField span="full">
            <label className="block text-sm font-medium text-gray-700 mb-2">Discount Type</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDiscountType('PERCENTAGE')}
                className={`flex-1 py-2 px-4 rounded border min-h-[var(--layout-touch-target)] ${
                  discountType === 'PERCENTAGE'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                Percentage (%)
              </button>
              <button
                type="button"
                onClick={() => setDiscountType('FIXED_AMOUNT')}
                className={`flex-1 py-2 px-4 rounded border min-h-[var(--layout-touch-target)] ${
                  discountType === 'FIXED_AMOUNT'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                Fixed Amount (UGX)
              </button>
            </div>
          </AdaptiveFormField>

          <AdaptiveFormField span="full">
            <label htmlFor="discount-value" className="block text-sm font-medium text-gray-700 mb-1">
              {discountType === 'PERCENTAGE' ? 'Discount Percentage' : 'Discount Amount'}
            </label>
            <NumericSoftKeyboardInput
              inputRef={valueInputRef}
              id="discount-value"
              mode="decimal"
              min={0}
              max={discountType === 'PERCENTAGE' ? 100 : originalAmount}
              value={discountValue}
              onChange={setDiscountValue}
              className={touchControl}
              placeholder={discountType === 'PERCENTAGE' ? 'Enter percentage (0-100)' : 'Enter amount'}
              aria-label={discountType === 'PERCENTAGE' ? 'Discount percentage' : 'Discount amount'}
            />
            {discountType === 'PERCENTAGE' && (
              <p className="text-xs text-gray-500 mt-1">
                Your limit: {userLimit}% {requiresApproval && '(Manager approval required)'}
              </p>
            )}
          </AdaptiveFormField>

          <AdaptiveFormField span="full">
            <label htmlFor="discount-reason" className="block text-sm font-medium text-gray-700 mb-1">
              Reason <span className="text-red-500">*</span>
            </label>
            <input
              ref={reasonInputRef}
              id="discount-reason"
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={touchControl}
              placeholder="Enter reason for discount (minimum 5 characters)"
            />
            <p className="text-xs text-gray-500 mt-1">Required for audit trail</p>
          </AdaptiveFormField>

          <AdaptiveFormField span="full">
            <div className="bg-gray-50 rounded p-4">
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
          </AdaptiveFormField>

          {requiresApproval && (
            <AdaptiveFormField span="full">
              <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                <p className="text-sm text-yellow-800">
                  This discount exceeds your limit and requires manager approval before sale completion.
                </p>
              </div>
            </AdaptiveFormField>
          )}

          {error && (
            <AdaptiveFormField span="full">
              <div className="bg-red-50 border border-red-200 rounded p-3">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            </AdaptiveFormField>
          )}
        </AdaptiveFormLayout>

        <p className="text-xs text-gray-500 mt-3 text-center">
          Keyboard: <kbd>Enter</kbd> to apply, <kbd>Esc</kbd> to cancel
        </p>
      </div>
    </AdaptiveDialog>
  );
}
