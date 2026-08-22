// TaxOverrideDialog — privileged DocumentTax override (Phase 5)

import { useEffect, useState } from 'react';
import type { DocumentTaxOverride, TaxOverrideMode } from '@shared/zod/taxOverride';
import {
  AdaptiveDialog,
  AdaptiveFormField,
  AdaptiveFormLayout,
} from '../adaptive';
import { NumericSoftKeyboardInput } from '../keyboard/NumericSoftKeyboardInput';

interface TaxOverrideDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (override: DocumentTaxOverride) => void;
  currentTax: number;
  defaultRate?: number;
}

const touchControl =
  'w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[var(--layout-touch-target)]';

export default function TaxOverrideDialog({
  isOpen,
  onClose,
  onApply,
  currentTax,
  defaultRate = 18,
}: TaxOverrideDialogProps) {
  const [mode, setMode] = useState<TaxOverrideMode>('FORCE_EXEMPT');
  const [rate, setRate] = useState(String(defaultRate));
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setMode('FORCE_EXEMPT');
      setRate(String(defaultRate));
      setReason('');
      setError('');
    }
  }, [isOpen, defaultRate]);

  const handleApply = () => {
    setError('');
    const trimmed = reason.trim();
    if (trimmed.length < 5) {
      setError('Reason is required (at least 5 characters)');
      return;
    }
    if (mode === 'FORCE_RATE') {
      const n = parseFloat(rate);
      if (Number.isNaN(n) || n < 0) {
        setError('Enter a valid non-negative tax rate');
        return;
      }
      onApply({ mode, rate: n, reason: trimmed });
    } else {
      onApply({ mode, reason: trimmed });
    }
    onClose();
  };

  return (
    <AdaptiveDialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Override tax"
      description={`Current computed tax: ${currentTax.toLocaleString()}. Requires sales.tax_override and will be audited.`}
      size="md"
      footer={
        <div className="flex justify-end gap-2 w-full">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg min-h-[var(--layout-touch-target)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="px-4 py-2 bg-amber-600 text-white rounded-lg min-h-[var(--layout-touch-target)] hover:bg-amber-700"
          >
            Apply override
          </button>
        </div>
      }
    >
      <AdaptiveFormLayout>
        <AdaptiveFormField span="full">
          <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="tax-override-mode">
            Override mode
          </label>
          <select
            id="tax-override-mode"
            className={touchControl}
            value={mode}
            onChange={(e) => setMode(e.target.value as TaxOverrideMode)}
            data-tax-override-mode="true"
          >
            <option value="FORCE_EXEMPT">Force exempt (0 tax)</option>
            <option value="FORCE_RATE">Force rate %</option>
          </select>
        </AdaptiveFormField>
        {mode === 'FORCE_RATE' && (
          <AdaptiveFormField span="full">
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="tax-override-rate">
              Tax rate (%)
            </label>
            <NumericSoftKeyboardInput
              id="tax-override-rate"
              mode="decimal"
              min={0}
              className={touchControl}
              value={rate}
              onChange={setRate}
              data-tax-override-rate="true"
              aria-label="Tax rate percent"
            />
          </AdaptiveFormField>
        )}
        <AdaptiveFormField span="full">
          <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="tax-override-reason">
            Reason (required)
          </label>
          <input
            id="tax-override-reason"
            type="text"
            className={touchControl}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Diplomatic exemption letter on file"
            maxLength={500}
            data-tax-override-reason="true"
          />
        </AdaptiveFormField>
        {error && (
          <AdaptiveFormField span="full">
            <p className="text-sm text-red-600">{error}</p>
          </AdaptiveFormField>
        )}
      </AdaptiveFormLayout>
    </AdaptiveDialog>
  );
}
