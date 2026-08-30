/** SAP GR/IR vs AP billing lane for goods receipts (Odoo: To Bill / Billed). */
import {
  resolveGrBillingLane,
  type GrBillingStatus,
} from '@shared/domain/grBillingStatusSsot';

export type { GrBillingStatus };

export interface GrBillingBadgeProps {
  receiptStatus: string;
  billingStatus?: GrBillingStatus | string | null;
  supplierBillNumber?: string | null;
  isReversed?: boolean;
  /** compact = single line for table cells; card = stacked for mobile cards */
  variant?: 'compact' | 'card';
  className?: string;
}

/** @deprecated Prefer resolveGrBillingLane from @shared/domain/grBillingStatusSsot */
export function resolveGrBillingStatus(
  receiptStatus: string,
  billingStatus?: string | null,
  opts?: { isReversed?: boolean | null; supplierBillNumber?: string | null },
): GrBillingStatus {
  return resolveGrBillingLane({
    receiptStatus,
    billingStatus,
    isReversed: opts?.isReversed,
    supplierBillNumber: opts?.supplierBillNumber,
  });
}

export function GrBillingStatusBadge({
  receiptStatus,
  billingStatus,
  supplierBillNumber,
  isReversed,
  variant = 'compact',
  className = '',
}: GrBillingBadgeProps) {
  const billing = resolveGrBillingLane({
    receiptStatus,
    billingStatus,
    isReversed,
    supplierBillNumber,
  });
  const billNum = supplierBillNumber?.trim() || '';

  if (billing === 'DRAFT_GR') {
    return (
      <span
        className={`text-xs text-gray-500 ${className}`}
        title="Receipt not finalized — supplier invoice not applicable yet"
      >
        —
      </span>
    );
  }
  if (billing === 'CANCELLED') {
    return <span className={`text-xs text-gray-400 ${className}`}>—</span>;
  }
  // REVERSED before INVOICED — matches list SQL CASE (sibling bill must not hide reverse)
  if (billing === 'REVERSED') {
    return (
      <span
        className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-slate-100 text-slate-700 ring-1 ring-slate-200/80 ${className}`}
        title="Receipt fully reversed via Return GRN — not billable"
      >
        Reversed
      </span>
    );
  }
  if (billing === 'INVOICED') {
    return (
      <div
        className={`flex ${variant === 'card' ? 'flex-row items-center gap-2 flex-wrap w-full' : 'flex-col gap-0.5'} ${className}`}
      >
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
  if (billing === 'TO_INVOICE') {
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
