/** SAP GR/IR vs AP billing lane for goods receipts (Odoo: To Bill / Billed). */
export type GrBillingStatus =
    | 'DRAFT_GR'
    | 'TO_INVOICE'
    | 'INVOICED'
    | 'CANCELLED'
    | 'NOT_APPLICABLE';

export interface GrBillingBadgeProps {
    receiptStatus: string;
    billingStatus?: GrBillingStatus | string | null;
    supplierBillNumber?: string | null;
    /** compact = single line for table cells; card = stacked for mobile cards */
    variant?: 'compact' | 'card';
    className?: string;
}

export function resolveGrBillingStatus(
    receiptStatus: string,
    billingStatus?: string | null,
): GrBillingStatus | undefined {
    if (billingStatus) return billingStatus as GrBillingStatus;
    if (receiptStatus === 'DRAFT') return 'DRAFT_GR';
    return undefined;
}

export function GrBillingStatusBadge({
    receiptStatus,
    billingStatus,
    supplierBillNumber,
    variant = 'compact',
    className = '',
}: GrBillingBadgeProps) {
    const billing = resolveGrBillingStatus(receiptStatus, billingStatus);
    const billNum = supplierBillNumber?.trim() || '';

    if (billing === 'DRAFT_GR' || receiptStatus === 'DRAFT') {
        return (
            <span
                className={`text-xs text-gray-500 ${className}`}
                title="Receipt not finalized — supplier invoice not applicable yet"
            >
                —
            </span>
        );
    }
    if (billing === 'CANCELLED' || receiptStatus === 'CANCELLED') {
        return <span className={`text-xs text-gray-400 ${className}`}>—</span>;
    }
    if (billing === 'INVOICED' || billNum) {
        return (
            <div className={`flex ${variant === 'card' ? 'flex-row items-center gap-2 flex-wrap w-full' : 'flex-col gap-0.5'} ${className}`}>
                <span
                    className="inline-flex w-fit px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200/60"
                    title="Supplier bill posted — billed in accounts payable (2100)"
                >
                    Invoiced
                </span>
                {billNum && (
                    <span className="text-xs font-medium text-gray-700 truncate max-w-[140px]" title={billNum}>
                        {billNum}
                    </span>
                )}
            </div>
        );
    }
    if (billing === 'TO_INVOICE' || receiptStatus === 'COMPLETED' || receiptStatus === 'FINALIZED') {
        return (
            <span
                className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-900 ring-1 ring-amber-200/80 ${className}`}
                title="Goods received but not yet billed — GR/IR clearing (2150). Create Supplier Bill on the receipt."
            >
                To invoice
            </span>
        );
    }
    return <span className={`text-xs text-gray-400 ${className}`}>—</span>;
}
