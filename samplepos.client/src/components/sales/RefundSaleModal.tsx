import { useState, useEffect, useRef, useMemo } from 'react';
import { api } from '../../utils/api';
import { extractApiError } from '../../utils/extractApiError';
import { formatCurrency } from '../../utils/currency';
import Decimal from 'decimal.js';

interface RefundItem {
    saleItemId: string;
    productName: string;
    quantity: number;
    refundedQty: number;
    unitPrice: number;
    maxRefundable: number;
    selected: boolean;
    refundQuantity: number;
}

interface RefundSaleModalProps {
    saleId: string;
    saleNumber: string;
    totalAmount: number;
    items: {
        id?: string;
        productName?: string;
        product_name?: string;
        quantity: number | string;
        qty?: number | string;
        unitPrice?: number | string;
        unit_price?: number | string;
        price?: number | string;
        refundedQty?: number | string;
        refunded_qty?: number | string;
        totalPrice?: number | string;
        total_price?: number | string;
    }[];
    onClose: () => void;
    onSuccess: () => void;
}

export function RefundSaleModal({ saleId, saleNumber, totalAmount, items, onClose, onSuccess }: RefundSaleModalProps) {
    const [reason, setReason] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successResult, setSuccessResult] = useState<{
        refundNumber: string;
        totalAmount: number;
        isFullRefund: boolean;
        itemsRestored: number;
    } | null>(null);
    const modalRef = useRef<HTMLDivElement>(null);

    // Build refundable items list
    const [refundItems, setRefundItems] = useState<RefundItem[]>(() =>
        items
            .filter((item) => item.id) // Only items with IDs can be refunded
            .map((item) => {
                const qty = Number(item.quantity || item.qty || 0);
                const refundedQty = Number(item.refundedQty || item.refunded_qty || 0);
                const maxRefundable = qty - refundedQty;
                return {
                    saleItemId: item.id!,
                    productName: item.productName || item.product_name || 'Unknown Product',
                    quantity: qty,
                    refundedQty,
                    unitPrice: Number(item.unitPrice || item.unit_price || item.price || 0),
                    maxRefundable,
                    selected: false,
                    refundQuantity: maxRefundable, // Default to max when selected
                };
            })
            .filter((item) => item.maxRefundable > 0) // Only show items with remaining refundable qty
    );

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const toggleItem = (idx: number) => {
        setRefundItems((prev) =>
            prev.map((item, i) =>
                i === idx ? { ...item, selected: !item.selected } : item
            )
        );
    };

    const updateQuantity = (idx: number, qty: number) => {
        setRefundItems((prev) =>
            prev.map((item, i) =>
                i === idx
                    ? { ...item, refundQuantity: Math.max(1, Math.min(qty, item.maxRefundable)) }
                    : item
            )
        );
    };

    const selectAll = () => {
        const allSelected = refundItems.every((i) => i.selected);
        setRefundItems((prev) =>
            prev.map((item) => ({
                ...item,
                selected: !allSelected,
                refundQuantity: !allSelected ? item.maxRefundable : item.refundQuantity,
            }))
        );
    };

    const selectedItems = useMemo(() => refundItems.filter((i) => i.selected), [refundItems]);

    const refundTotal = useMemo(() => {
        return selectedItems.reduce((sum, item) => {
            return new Decimal(sum).plus(new Decimal(item.unitPrice).times(item.refundQuantity)).toNumber();
        }, 0);
    }, [selectedItems]);

    const isFullRefund = useMemo(() => {
        return refundItems.length > 0 && refundItems.every(
            (item) => item.selected && item.refundQuantity === item.maxRefundable
        );
    }, [refundItems]);

    const handleRefund = async () => {
        if (selectedItems.length === 0) {
            setError('Select at least one item to refund');
            return;
        }
        if (!reason.trim()) {
            setError('A reason is required for the refund');
            return;
        }
        if (reason.trim().length < 5) {
            setError('Reason must be at least 5 characters');
            return;
        }

        setError(null);
        setIsSubmitting(true);
        try {
            const response = await api.sales.refundSale(saleId, {
                items: selectedItems.map((item) => ({
                    saleItemId: item.saleItemId,
                    quantity: item.refundQuantity,
                })),
                reason: reason.trim(),
            });
            const data = response.data.data as {
                refund: { refundNumber: string; totalAmount: number | string };
                isFullRefund: boolean;
                itemsRestored: number;
            };
            setSuccessResult({
                refundNumber: data.refund.refundNumber,
                totalAmount: Number(data.refund.totalAmount),
                isFullRefund: data.isFullRefund,
                itemsRestored: data.itemsRestored,
            });
        } catch (err: unknown) {
            setError(extractApiError(err, 'Failed to process refund'));
        } finally {
            setIsSubmitting(false);
        }
    };

    // Success state
    if (successResult) {
        return (
            <div
                className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]"
                onClick={(e) => { if (e.target === e.currentTarget) onSuccess(); }}
                role="dialog"
                aria-modal="true"
            >
                <div className="bg-white rounded-lg max-w-md w-full mx-4 shadow-xl">
                    <div className="px-6 py-8 text-center">
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">Refund Processed</h3>
                        <p className="text-sm text-gray-600 mb-4">
                            {successResult.isFullRefund ? 'Full' : 'Partial'} refund has been successfully processed.
                        </p>
                        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 mb-4 space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">Refund Number</span>
                                <span className="font-mono font-semibold text-gray-900">{successResult.refundNumber}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">Refund Amount</span>
                                <span className="font-semibold text-gray-900">{formatCurrency(successResult.totalAmount)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">Items Restored</span>
                                <span className="font-semibold text-gray-900">{successResult.itemsRestored}</span>
                            </div>
                        </div>
                        <button
                            onClick={onSuccess}
                            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm"
                        >
                            Done
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="refund-modal-title"
        >
            <div ref={modalRef} className="bg-white rounded-lg max-w-2xl w-full mx-4 shadow-xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-200 bg-amber-50 rounded-t-lg flex-shrink-0">
                    <div className="flex-shrink-0 w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                        <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                        </svg>
                    </div>
                    <div className="flex-1">
                        <h3 id="refund-modal-title" className="text-lg font-semibold text-amber-900">Refund Sale</h3>
                        <p className="text-sm text-amber-700">{saleNumber} &middot; {formatCurrency(totalAmount)}</p>
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                    {refundItems.length === 0 ? (
                        <div className="bg-gray-50 rounded-lg p-6 text-center text-gray-500">
                            <p className="font-medium">No refundable items</p>
                            <p className="text-sm mt-1">All items in this sale have already been fully refunded.</p>
                        </div>
                    ) : (
                        <>
                            {/* Select All */}
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-gray-700">
                                    Select items to refund ({selectedItems.length} of {refundItems.length})
                                </span>
                                <button
                                    type="button"
                                    onClick={selectAll}
                                    className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                                >
                                    {refundItems.every((i) => i.selected) ? 'Deselect All' : 'Select All (Full Refund)'}
                                </button>
                            </div>

                            {/* Item List */}
                            <div className="border border-gray-200 rounded-lg divide-y divide-gray-200">
                                {refundItems.map((item, idx) => (
                                    <div
                                        key={item.saleItemId}
                                        className={`p-4 transition-colors ${item.selected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                                    >
                                        <div className="flex items-start gap-3">
                                            <input
                                                type="checkbox"
                                                checked={item.selected}
                                                onChange={() => toggleItem(idx)}
                                                className="mt-1 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                                disabled={isSubmitting}
                                            />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between">
                                                    <span className="font-medium text-gray-900 truncate">{item.productName}</span>
                                                    <span className="text-sm font-semibold text-gray-900 ml-2 flex-shrink-0">
                                                        {formatCurrency(new Decimal(item.unitPrice).times(item.selected ? item.refundQuantity : 0).toNumber())}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                                                    <span>Unit price: {formatCurrency(item.unitPrice)}</span>
                                                    <span>Sold: {item.quantity}</span>
                                                    {item.refundedQty > 0 && (
                                                        <span className="text-amber-600">Already refunded: {item.refundedQty}</span>
                                                    )}
                                                    <span className="text-blue-600">Refundable: {item.maxRefundable}</span>
                                                </div>
                                                {/* Quantity selector — visible when item is selected */}
                                                {item.selected && (
                                                    <div className="mt-3 flex items-center gap-2">
                                                        <label className="text-xs text-gray-600">Refund qty:</label>
                                                        <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
                                                            <button
                                                                type="button"
                                                                onClick={() => updateQuantity(idx, item.refundQuantity - 1)}
                                                                className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-medium"
                                                                disabled={isSubmitting || item.refundQuantity <= 1}
                                                            >
                                                                −
                                                            </button>
                                                            <input
                                                                type="number"
                                                                min={1}
                                                                max={item.maxRefundable}
                                                                value={item.refundQuantity}
                                                                onChange={(e) => updateQuantity(idx, parseInt(e.target.value) || 1)}
                                                                className="w-14 text-center text-sm border-x border-gray-300 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                                                disabled={isSubmitting}
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => updateQuantity(idx, item.refundQuantity + 1)}
                                                                className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-medium"
                                                                disabled={isSubmitting || item.refundQuantity >= item.maxRefundable}
                                                            >
                                                                +
                                                            </button>
                                                        </div>
                                                        <span className="text-xs text-gray-400">of {item.maxRefundable}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Refund Summary */}
                            {selectedItems.length > 0 && (
                                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                                    <div className="flex justify-between items-center">
                                        <div>
                                            <div className="text-sm text-gray-500">
                                                {isFullRefund ? 'Full Refund' : 'Partial Refund'} &middot; {selectedItems.length} item{selectedItems.length !== 1 ? 's' : ''}
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-sm text-gray-500">Refund Total</div>
                                            <div className="text-xl font-bold text-gray-900">{formatCurrency(refundTotal)}</div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Reason */}
                            <div>
                                <label htmlFor="refund-reason" className="block text-sm font-medium text-gray-700 mb-1">
                                    Reason for refund <span className="text-red-500">*</span>
                                </label>
                                <textarea
                                    id="refund-reason"
                                    rows={2}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-sm resize-none"
                                    placeholder="e.g., Customer returned defective item, wrong product delivered..."
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    disabled={isSubmitting}
                                />
                            </div>
                        </>
                    )}

                    {error && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                            {error}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-lg flex-shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 text-gray-700 font-medium text-sm"
                        disabled={isSubmitting}
                    >
                        Cancel
                    </button>
                    {refundItems.length > 0 && (
                        <button
                            type="button"
                            onClick={handleRefund}
                            disabled={isSubmitting || selectedItems.length === 0 || !reason.trim()}
                            className="px-5 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm flex items-center gap-2"
                        >
                            {isSubmitting ? (
                                <>
                                    <span className="animate-spin">⏳</span>
                                    Processing...
                                </>
                            ) : (
                                <>
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                    </svg>
                                    Process Refund ({formatCurrency(refundTotal)})
                                </>
                            )}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
