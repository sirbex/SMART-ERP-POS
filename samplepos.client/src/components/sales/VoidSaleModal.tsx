import { useState, useEffect, useRef } from 'react';
import { api } from '../../utils/api';
import { extractApiError } from '../../utils/extractApiError';
import { formatCurrency } from '../../utils/currency';

interface VoidSaleModalProps {
    saleId: string;
    saleNumber: string;
    totalAmount: number;
    onClose: () => void;
    onSuccess: () => void;
}

export function VoidSaleModal({ saleId, saleNumber, totalAmount, onClose, onSuccess }: VoidSaleModalProps) {
    const [reason, setReason] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [confirmed, setConfirmed] = useState(false);
    const modalRef = useRef<HTMLDivElement>(null);
    const reasonRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKeyDown);
        reasonRef.current?.focus();
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const handleVoid = async () => {
        if (!reason.trim()) {
            setError('A reason is required to void a sale');
            return;
        }
        if (reason.trim().length < 5) {
            setError('Reason must be at least 5 characters');
            return;
        }

        setError(null);
        setIsSubmitting(true);
        try {
            await api.sales.voidSale(saleId, { reason: reason.trim() });
            onSuccess();
        } catch (err: unknown) {
            setError(extractApiError(err, 'Failed to void sale'));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="void-modal-title"
        >
            <div ref={modalRef} className="bg-white rounded-lg max-w-lg w-full mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-200 bg-red-50 rounded-t-lg">
                    <div className="flex-shrink-0 w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                        <svg className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                        </svg>
                    </div>
                    <div>
                        <h3 id="void-modal-title" className="text-lg font-semibold text-red-900">Void Sale</h3>
                        <p className="text-sm text-red-700">This action cannot be undone</p>
                    </div>
                </div>

                {/* Body */}
                <div className="px-6 py-5 space-y-4">
                    {/* Sale Info */}
                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                        <div className="flex justify-between items-center">
                            <div>
                                <div className="text-sm text-gray-500">Sale Number</div>
                                <div className="font-semibold text-gray-900">{saleNumber}</div>
                            </div>
                            <div className="text-right">
                                <div className="text-sm text-gray-500">Total Amount</div>
                                <div className="font-semibold text-gray-900">{formatCurrency(totalAmount)}</div>
                            </div>
                        </div>
                    </div>

                    {/* Warning */}
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                        <strong>Warning:</strong> Voiding this sale will reverse all inventory movements and create reversal GL entries. The sale will be permanently marked as VOID.
                    </div>

                    {/* Reason */}
                    <div>
                        <label htmlFor="void-reason" className="block text-sm font-medium text-gray-700 mb-1">
                            Reason for voiding <span className="text-red-500">*</span>
                        </label>
                        <textarea
                            ref={reasonRef}
                            id="void-reason"
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 text-sm resize-none"
                            placeholder="e.g., Duplicate entry, customer cancelled immediately, wrong items entered..."
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            disabled={isSubmitting}
                        />
                    </div>

                    {/* Confirmation Checkbox */}
                    <label className="flex items-start gap-3 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={confirmed}
                            onChange={(e) => setConfirmed(e.target.checked)}
                            className="mt-0.5 h-4 w-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
                            disabled={isSubmitting}
                        />
                        <span className="text-sm text-gray-700">
                            I confirm that I want to void sale <strong>{saleNumber}</strong> for{' '}
                            <strong>{formatCurrency(totalAmount)}</strong>. This action is irreversible.
                        </span>
                    </label>

                    {error && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                            {error}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-lg">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 text-gray-700 font-medium text-sm"
                        disabled={isSubmitting}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleVoid}
                        disabled={isSubmitting || !confirmed || !reason.trim()}
                        className="px-5 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm flex items-center gap-2"
                    >
                        {isSubmitting ? (
                            <>
                                <span className="animate-spin">⏳</span>
                                Voiding...
                            </>
                        ) : (
                            <>
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                </svg>
                                Void Sale
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
