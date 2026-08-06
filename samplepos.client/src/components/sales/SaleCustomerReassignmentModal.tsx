import { useEffect, useState } from 'react';
import {
  correctionApi,
  type SaleCustomerReassignmentPreview,
} from '../../services/correctionApi';
import { api } from '../../utils/api';
import { formatCurrency } from '../../utils/currency';
import { handleApiError } from '../../utils/errorHandler';

interface CustomerOption {
  id: string;
  name: string;
}

interface SaleCustomerReassignmentModalProps {
  saleId: string;
  saleNumber: string;
  fromCustomerId: string | null;
  fromCustomerName?: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

type WizardStep = 1 | 2 | 3;

export function SaleCustomerReassignmentModal({
  saleId,
  saleNumber,
  fromCustomerId,
  fromCustomerName,
  onClose,
  onSuccess,
}: SaleCustomerReassignmentModalProps) {
  const [uiStep, setUiStep] = useState<WizardStep>(1);
  const [reason, setReason] = useState('');
  const [toCustomerId, setToCustomerId] = useState('');
  const [search, setSearch] = useState('');
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [preview, setPreview] = useState<SaleCustomerReassignmentPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const q = search.trim();
        const res = await api.get<{ success: boolean; data: Array<Record<string, unknown>> }>(
          q ? `/customers?search=${encodeURIComponent(q)}&limit=40` : '/customers?limit=40',
        );
        const rows = res.data?.data ?? [];
        if (!cancelled) {
          setCustomers(
            rows
              .map((c) => ({
                id: String(c.id ?? ''),
                name: String(c.name ?? c.customerName ?? ''),
              }))
              .filter((c) => c.id && c.id !== fromCustomerId),
          );
        }
      } catch {
        /* list optional */
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, fromCustomerId]);

  const loadPreview = async () => {
    if (!toCustomerId || !reason.trim()) {
      setError('Select the correct customer and enter a reason.');
      return false;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await correctionApi.previewSaleCustomerReassignment({
        saleId,
        fromCustomerId,
        toCustomerId,
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
      await correctionApi.executeSaleCustomerReassignment({
        saleId,
        fromCustomerId,
        toCustomerId,
        reason: reason.trim(),
      });
      onSuccess();
      onClose();
    } catch (err: unknown) {
      handleApiError(err, { fallback: 'Reassignment failed' });
      setError(err instanceof Error ? err.message : 'Reassignment failed');
    } finally {
      setLoading(false);
    }
  };

  const stepLabels = ['Correct customer', 'Review plan', 'Confirm'];

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[1200] bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl max-w-xl w-full m-4 p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-3">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Reassign sale customer</h3>
            <p className="text-sm text-gray-600">
              {saleNumber} — from {fromCustomerName || fromCustomerId || 'Walk-in'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>

        <div className="flex gap-2 mb-4 text-xs">
          {stepLabels.map((label, i) => {
            const n = (i + 1) as WizardStep;
            const active = uiStep === n;
            const done = uiStep > n;
            return (
              <div
                key={label}
                className={`flex-1 rounded px-2 py-1 text-center ${
                  active
                    ? 'bg-violet-100 text-violet-900 font-semibold'
                    : done
                      ? 'bg-green-50 text-green-800'
                      : 'bg-gray-100 text-gray-500'
                }`}
              >
                {n}. {label}
              </div>
            );
          })}
        </div>

        {error && (
          <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        )}

        {uiStep === 1 && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Correct customer</label>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search customers…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2"
              />
              <select
                value={toCustomerId}
                onChange={(e) => setToCustomerId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Select customer…</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason (required)</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="e.g. Billed wrong account — move to BOU"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <p className="text-xs text-gray-500">
              Managers and administrators only. Moves the sale and invoices; reclasses open AR (1200)
              only when entity-tagged. Posted tax snapshots stay immutable — no re-tax. Cash payments
              stay as posted.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-700">
                Cancel
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => void goToReview()}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-violet-700 text-white hover:bg-violet-800 disabled:opacity-50"
              >
                {loading ? 'Checking…' : 'Review plan'}
              </button>
            </div>
          </div>
        )}

        {uiStep === 2 && preview && (
          <div className="space-y-3 text-sm">
            <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
              <div className="font-semibold text-gray-900">
                {preview.fromCustomerName ?? 'Walk-in'} → {preview.toCustomerName}
              </div>
              <div className="text-gray-600 mt-1">Sale total {formatCurrency(preview.saleTotal)}</div>
              {preview.openArAmount > 0.01 && (
                <div className="text-amber-800 mt-1">
                  Open AR to reclass (GL 1200): {formatCurrency(preview.openArAmount)}
                </div>
              )}
              {(preview.invoiceOutstandingAmount ?? 0) > 0.01 &&
                preview.openArAmount <= 0.01 && (
                  <div className="text-gray-600 mt-1">
                    Invoice open residual{' '}
                    {formatCurrency(preview.invoiceOutstandingAmount ?? 0)} moves with customer (no
                    GL reclass).
                  </div>
                )}
              {preview.documentTaxImmutable && (
                <div className="text-gray-500 mt-1 text-xs">Document tax remains as posted.</div>
              )}
            </div>
            <ol className="list-decimal list-inside space-y-1 text-gray-800">
              {preview.wizardSteps.map((s) => (
                <li key={s.code}>
                  <span className="font-medium">{s.title}</span>
                  <span className="text-gray-600"> — {s.description}</span>
                </li>
              ))}
            </ol>
            {preview.invoicesToMove.length > 0 && (
              <div>
                <div className="font-medium text-gray-900 mb-1">Invoices to move</div>
                <ul className="text-xs text-gray-700 space-y-0.5">
                  {preview.invoicesToMove.map((inv) => (
                    <li key={inv.invoiceId}>
                      {inv.invoiceNumber} · total {formatCurrency(inv.totalAmount)} · open{' '}
                      {formatCurrency(inv.outstandingBalance)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {preview.warnings.length > 0 && (
              <ul className="text-xs text-amber-800 list-disc list-inside">
                {preview.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
            <div className="flex justify-between gap-2 pt-2">
              <button type="button" onClick={() => setUiStep(1)} className="px-4 py-2 text-sm text-gray-700">
                Back
              </button>
              <button
                type="button"
                onClick={() => setUiStep(3)}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-violet-700 text-white hover:bg-violet-800"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {uiStep === 3 && preview && (
          <div className="space-y-3 text-sm">
            <p className="text-gray-800">
              Confirm reassignment of <strong>{preview.saleNumber}</strong> to{' '}
              <strong>{preview.toCustomerName}</strong>?
            </p>
            <p className="text-xs text-gray-500">Reason: {reason}</p>
            <div className="flex justify-between gap-2 pt-2">
              <button type="button" onClick={() => setUiStep(2)} className="px-4 py-2 text-sm text-gray-700">
                Back
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => void runExecute()}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-violet-700 text-white hover:bg-violet-800 disabled:opacity-50"
              >
                {loading ? 'Applying…' : 'Confirm reassignment'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
