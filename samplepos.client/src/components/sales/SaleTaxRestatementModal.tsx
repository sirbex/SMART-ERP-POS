import { useEffect, useState } from 'react';
import {
  correctionApi,
  type SaleTaxRestatementPreview,
} from '../../services/correctionApi';
import { formatCurrency } from '../../utils/currency';
import { handleApiError } from '../../utils/errorHandler';

interface SaleTaxRestatementModalProps {
  saleId: string;
  saleNumber: string;
  onClose: () => void;
  onSuccess: () => void;
}

type WizardStep = 1 | 2;

export function SaleTaxRestatementModal({
  saleId,
  saleNumber,
  onClose,
  onSuccess,
}: SaleTaxRestatementModalProps) {
  const [uiStep, setUiStep] = useState<WizardStep>(1);
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState<SaleTaxRestatementPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Reset when sale changes
    setPreview(null);
    setUiStep(1);
    setError(null);
  }, [saleId]);

  const loadPreview = async () => {
    if (!reason.trim() || reason.trim().length < 5) {
      setError('Enter a brief reason (at least 5 characters).');
      return false;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await correctionApi.previewSaleTaxRestatement({
        saleId,
        reason: reason.trim(),
      });
      const data = res.data?.data;
      if (!data) throw new Error('No preview data');
      setPreview(data);
      if (data.blockers.length > 0) {
        setError(data.blockers.join(' '));
        return false;
      }
      return true;
    } catch (err: unknown) {
      handleApiError(err, { fallback: 'Preview failed' });
      setError(err instanceof Error ? err.message : 'Preview failed');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const goToReview = async () => {
    const ok = await loadPreview();
    if (ok) setUiStep(2);
  };

  const runExecute = async () => {
    if (!preview || preview.blockers.length > 0) return;
    setLoading(true);
    setError(null);
    try {
      await correctionApi.executeSaleTaxRestatement({
        saleId,
        reason: reason.trim(),
      });
      onSuccess();
      onClose();
    } catch (err: unknown) {
      handleApiError(err, { fallback: 'Tax restatement failed' });
      setError(err instanceof Error ? err.message : 'Tax restatement failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[1200] bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl max-w-xl w-full m-4 p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-3">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Apply omitted VAT</h3>
            <p className="text-sm text-gray-600">
              {saleNumber} — recompute tax from products + customer (no void)
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>

        {error && (
          <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        )}

        {uiStep === 1 && (
          <div className="space-y-3">
            <p className="text-sm text-gray-700">
              Use this when a posted sale/invoice missed output VAT, but products are VAT-liable and
              the customer is not exempt. The invoice keeps its identity; tax and amount due are
              updated and a correction journal posts Tax Payable.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason (required)</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="e.g. System missed VAT on Abdominal support; product is liable @ 18%"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => void goToReview()}
                className="px-4 py-2 bg-emerald-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {loading ? 'Calculating…' : 'Preview changes'}
              </button>
            </div>
          </div>
        )}

        {uiStep === 2 && preview && (
          <div className="space-y-3">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
              <div className="flex justify-between">
                <span>Posted tax</span>
                <span className="font-medium">{formatCurrency(preview.postedTax)}</span>
              </div>
              <div className="flex justify-between">
                <span>New tax</span>
                <span className="font-medium">{formatCurrency(preview.newTax)}</span>
              </div>
              <div className="flex justify-between text-emerald-900 font-semibold">
                <span>VAT to add</span>
                <span>{formatCurrency(preview.taxDelta)}</span>
              </div>
              <div className="flex justify-between mt-1 pt-1 border-t border-emerald-200">
                <span>New total</span>
                <span className="font-medium">{formatCurrency(preview.newTotal)}</span>
              </div>
              {preview.taxInclusive && (
                <p className="text-xs text-emerald-800 mt-1">
                  Tax-inclusive prices: total stays the same; VAT is split from revenue in GL.
                </p>
              )}
            </div>

            {preview.lines.some((l) => l.newTax !== l.postedTax) && (
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-1">Lines</p>
                <ul className="text-sm space-y-1 max-h-40 overflow-y-auto">
                  {preview.lines.map((l) => (
                    <li key={l.saleItemId} className="flex justify-between gap-2">
                      <span className="truncate">{l.productName || l.productId || 'Item'}</span>
                      <span className="shrink-0 text-gray-700">
                        {formatCurrency(l.postedTax)} → {formatCurrency(l.newTax)}
                        {l.taxRate > 0 ? ` (${l.taxRate}%)` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {preview.invoices.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-1">Invoices</p>
                <ul className="text-sm space-y-1">
                  {preview.invoices.map((inv) => (
                    <li key={inv.invoiceId} className="flex justify-between gap-2">
                      <span>{inv.invoiceNumber}</span>
                      <span>
                        due → {formatCurrency(inv.newAmountDue)} · total {formatCurrency(inv.newTotal)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {preview.warnings.length > 0 && (
              <ul className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 space-y-1">
                {preview.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}

            <div className="flex justify-between gap-2 pt-2">
              <button
                type="button"
                onClick={() => setUiStep(1)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm"
              >
                Back
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => void runExecute()}
                className="px-4 py-2 bg-emerald-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {loading ? 'Applying…' : 'Apply VAT restatement'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
