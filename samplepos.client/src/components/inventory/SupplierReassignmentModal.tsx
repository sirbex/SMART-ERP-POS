import { useEffect, useState } from 'react';
import { correctionApi, type SupplierReassignmentPreview } from '../../services/correctionApi';
import { api } from '../../utils/api';
import { formatCurrency } from '../../utils/currency';
import { handleApiError } from '../../utils/errorHandler';

interface SupplierOption {
    id: string;
    name: string;
}

interface SupplierReassignmentModalProps {
    grnId: string;
    grNumber: string;
    fromSupplierId: string;
    fromSupplierName?: string;
    onClose: () => void;
    onSuccess: () => void;
}

type WizardStep = 1 | 2 | 3;

export function SupplierReassignmentModal({
    grnId,
    grNumber,
    fromSupplierId,
    fromSupplierName,
    onClose,
    onSuccess,
}: SupplierReassignmentModalProps) {
    const [uiStep, setUiStep] = useState<WizardStep>(1);
    const [reason, setReason] = useState('');
    const [toSupplierId, setToSupplierId] = useState('');
    const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
    const [preview, setPreview] = useState<SupplierReassignmentPreview | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await api.get<{ success: boolean; data: Array<Record<string, unknown>> }>(
                    '/suppliers?limit=100',
                );
                const rows = res.data?.data ?? [];
                if (!cancelled) {
                    setSuppliers(
                        rows
                            .map((s) => ({
                                id: String(s.id ?? s.Id ?? ''),
                                name: String(s.companyName ?? s.CompanyName ?? s.name ?? ''),
                            }))
                            .filter((s) => s.id && s.id !== fromSupplierId),
                    );
                }
            } catch {
                /* optional list */
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [fromSupplierId]);

    const loadPreview = async () => {
        if (!toSupplierId || !reason.trim()) {
            setError('Select target supplier and enter a reason.');
            return false;
        }
        setError(null);
        setLoading(true);
        try {
            const res = await correctionApi.previewSupplierReassignment({
                grnId,
                fromSupplierId,
                toSupplierId,
                reason: reason.trim(),
            });
            const data = res.data?.data;
            if (!data) throw new Error('No preview data');
            setPreview(data);
            if (data.blockers.length > 0) {
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
            await correctionApi.executeSupplierReassignment({
                grnId,
                fromSupplierId,
                toSupplierId,
                reason: reason.trim(),
                autoReverseInvoices: true,
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

    const stepLabels = ['Correct supplier', 'Review plan', 'Confirm'];

    return (
        <div className="fixed inset-0 flex items-center justify-center z-[1200] bg-black/40" onClick={onClose}>
            <div
                className="bg-white rounded-xl shadow-2xl max-w-xl w-full m-4 p-6 max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex justify-between items-start mb-3">
                    <div>
                        <h3 className="text-lg font-bold text-gray-900">Reassign supplier</h3>
                        <p className="text-sm text-gray-600">
                            {grNumber} — from {fromSupplierName ?? fromSupplierId}
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
                                className={`flex-1 rounded-lg px-2 py-1.5 text-center border ${
                                    active
                                        ? 'bg-indigo-50 border-indigo-300 text-indigo-800 font-medium'
                                        : done
                                          ? 'bg-green-50 border-green-200 text-green-800'
                                          : 'bg-gray-50 border-gray-200 text-gray-500'
                                }`}
                            >
                                {n}. {label}
                            </div>
                        );
                    })}
                </div>

                <p className="text-xs text-gray-500 mb-4">
                    SAP/Odoo-style correction: reverses unpaid vendor bills on this receipt, reopens GR/IR, then moves
                    liability to the correct supplier. Stock and batches are not changed.
                </p>

                {(error || (preview?.blockers?.length ?? 0) > 0) && (
                    <div className="mb-3 text-sm bg-red-50 border border-red-200 text-red-800 rounded-lg p-3">
                        {error && <p className="mb-2">{error}</p>}
                        {preview?.blockers && preview.blockers.length > 0 && (
                            <ul className="list-disc list-inside space-y-1">
                                {preview.blockers.map((b, i) => (
                                    <li key={i}>{b}</li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}

                {uiStep === 1 && (
                    <>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Correct supplier</label>
                        <select
                            className="w-full border rounded-lg px-3 py-2 text-sm mb-3"
                            value={toSupplierId}
                            onChange={(e) => {
                                setToSupplierId(e.target.value);
                                setPreview(null);
                            }}
                        >
                            <option value="">Select supplier…</option>
                            {suppliers.map((s) => (
                                <option key={s.id} value={s.id}>
                                    {s.name}
                                </option>
                            ))}
                        </select>

                        <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                        <textarea
                            className="w-full border rounded-lg px-3 py-2 text-sm mb-4"
                            rows={2}
                            value={reason}
                            onChange={(e) => {
                                setReason(e.target.value);
                                setPreview(null);
                            }}
                            placeholder="e.g. Wrong vendor on PO / invoice"
                        />

                        <div className="flex justify-end gap-2">
                            <button type="button" onClick={onClose} className="px-4 py-2 border rounded-lg">
                                Cancel
                            </button>
                            <button
                                type="button"
                                disabled={loading}
                                onClick={goToReview}
                                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                            >
                                {loading ? 'Checking…' : 'Next: review plan'}
                            </button>
                        </div>
                    </>
                )}

                {uiStep === 2 && preview && (
                    <>
                        <div className="space-y-3 mb-4">
                            {preview.wizardSteps
                                .filter((s) => s.code !== 'COMPLETE')
                                .map((step) => (
                                    <div
                                        key={step.code}
                                        className="border rounded-lg p-3 bg-gray-50 text-sm"
                                    >
                                        <p className="font-medium text-gray-900">
                                            Step {step.order}: {step.title}
                                        </p>
                                        <p className="text-gray-600 mt-1 text-xs">{step.description}</p>
                                        {step.code === 'UNALLOCATE_PAYMENTS' &&
                                            preview.invoicesToReverse.some(
                                                (i) => i.action === 'UNALLOCATE_PAYMENTS_AND_CANCEL',
                                            ) && (
                                                <ul className="mt-2 text-xs list-disc list-inside text-gray-700">
                                                    {preview.invoicesToReverse
                                                        .filter(
                                                            (i) =>
                                                                i.action ===
                                                                'UNALLOCATE_PAYMENTS_AND_CANCEL',
                                                        )
                                                        .map((inv) => (
                                                            <li key={inv.invoiceId}>
                                                                {inv.invoiceNumber} — unapply{' '}
                                                                {formatCurrency(inv.amountPaid ?? 0)}
                                                            </li>
                                                        ))}
                                                </ul>
                                            )}
                                        {step.code === 'REVERSE_INVOICES' &&
                                            preview.invoicesToReverse.length > 0 && (
                                                <ul className="mt-2 text-xs list-disc list-inside text-gray-700">
                                                    {preview.invoicesToReverse.map((inv) => (
                                                        <li key={inv.invoiceId}>
                                                            {inv.invoiceNumber} —{' '}
                                                            {formatCurrency(inv.totalAmount)}
                                                            {inv.isPostedToGl
                                                                ? ' (GL will be reversed)'
                                                                : ' (draft cancel)'}
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        {step.code === 'RECLASS_GRIR' && preview.amount > 0 && (
                                            <ul className="mt-2 text-xs list-disc list-inside text-gray-700">
                                                {preview.journalLines.map((l, i) => (
                                                    <li key={i}>
                                                        {l.accountCode} DR {l.debit} CR {l.credit}
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                ))}
                        </div>

                        {preview.warnings.length > 0 && (
                            <div className="mb-3 text-xs bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-3">
                                <ul className="list-disc list-inside">
                                    {preview.warnings.map((w, i) => (
                                        <li key={i}>{w}</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setUiStep(1)}
                                className="px-4 py-2 border rounded-lg"
                            >
                                Back
                            </button>
                            <button
                                type="button"
                                onClick={() => setUiStep(3)}
                                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                            >
                                Next: confirm
                            </button>
                        </div>
                    </>
                )}

                {uiStep === 3 && preview && (
                    <>
                        <div className="mb-4 text-sm bg-green-50 border border-green-200 rounded-lg p-4">
                            <p className="font-medium text-green-900">Ready to post</p>
                            <p className="text-green-800 mt-1 text-xs">
                                This runs in one transaction:{' '}
                                {preview.invoicesToReverse.some(
                                    (i) => i.action === 'UNALLOCATE_PAYMENTS_AND_CANCEL',
                                )
                                    ? 'unapply payments, '
                                    : ''}
                                {preview.invoicesToReverse.length > 0
                                    ? `reverse ${preview.invoicesToReverse.length} bill(s), then `
                                    : ''}
                                reclass {formatCurrency(preview.amount)} on GR/IR (2150) to{' '}
                                {preview.toSupplierName ?? preview.toSupplierId}.
                            </p>
                        </div>

                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setUiStep(2)}
                                className="px-4 py-2 border rounded-lg"
                            >
                                Back
                            </button>
                            <button
                                type="button"
                                disabled={loading}
                                onClick={runExecute}
                                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                            >
                                {loading ? 'Posting…' : 'Run correction wizard'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
