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

export function SupplierReassignmentModal({
    grnId,
    grNumber,
    fromSupplierId,
    fromSupplierName,
    onClose,
    onSuccess,
}: SupplierReassignmentModalProps) {
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

    const runPreview = async () => {
        if (!toSupplierId || !reason.trim()) {
            setError('Select target supplier and enter a reason.');
            return;
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
                setError(data.blockers.join(' '));
            }
        } catch (err: unknown) {
            handleApiError(err, { fallback: 'Preview failed' });
            setError(err instanceof Error ? err.message : 'Preview failed');
        } finally {
            setLoading(false);
        }
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

    return (
        <div className="fixed inset-0 flex items-center justify-center z-[1200] bg-black/40" onClick={onClose}>
            <div
                className="bg-white rounded-xl shadow-2xl max-w-lg w-full m-4 p-6"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <h3 className="text-lg font-bold text-gray-900">Reassign supplier (AP / GR-IR)</h3>
                        <p className="text-sm text-gray-600">
                            {grNumber} — from {fromSupplierName ?? fromSupplierId}
                        </p>
                    </div>
                    <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        ✕
                    </button>
                </div>

                <p className="text-xs text-gray-500 mb-4">
                    Moves open GR/IR clearing (2150) liability between suppliers. Does not change inventory batches or
                    quantities. Blocked when supplier invoices exist.
                </p>

                {error && (
                    <div className="mb-3 text-sm bg-red-50 border border-red-200 text-red-800 rounded-lg p-3">
                        {error}
                    </div>
                )}

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
                    placeholder="Why liability should move to another supplier"
                />

                {preview && preview.blockers.length === 0 && (
                    <div className="mb-4 text-sm bg-gray-50 border rounded-lg p-3">
                        <p>
                            Reclass amount: <strong>{formatCurrency(preview.amount)}</strong> on account 2150
                        </p>
                        <ul className="mt-2 list-disc list-inside text-gray-600">
                            {preview.journalLines.map((l, i) => (
                                <li key={i}>
                                    {l.accountCode} DR {l.debit} CR {l.credit} (supplier {l.entityId.slice(0, 8)}…)
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                <div className="flex justify-end gap-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 border rounded-lg">
                        Cancel
                    </button>
                    {!preview || preview.blockers.length > 0 ? (
                        <button
                            type="button"
                            disabled={loading}
                            onClick={runPreview}
                            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                        >
                            {loading ? 'Checking…' : 'Preview'}
                        </button>
                    ) : (
                        <button
                            type="button"
                            disabled={loading}
                            onClick={runExecute}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                        >
                            {loading ? 'Posting…' : 'Confirm reclass'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
