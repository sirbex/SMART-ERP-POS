/**
 * Full GR reverse SSOT — one click unwinds unpaid bills + stock + PO.
 *
 * When an operator fully reverses a posted goods receipt:
 * 1. Auto-cancel linked *unpaid* supplier bills + reverse GL.
 * 2. Post full Return GRN (inventory + GR/IR) — only when stock is still on hand.
 * 3. Mark GR reversed (not billable).
 * 4. PO → DRAFT so the user can manage again.
 *
 * Hard blocks (no silent unwind):
 * - Any payment already allocated to a linked bill (paid / partially paid).
 * - Any quantity sold or otherwise consumed from the receipt lots.
 *
 * Never send operators on a bill→SCN→apply loop for a full reverse.
 * Partial returns against an open bill still use Return + SCN.
 */

export const GR_FULL_REVERSE_REASON_PREFIX = '[Full reverse]';
/** @deprecated legacy prefix — still recognized on return worklist */
export const GR_UNINVOICED_REVERSE_REASON_PREFIX = '[Uninvoiced reversal]';

export function isFullReceiptReverseReason(reason: string | null | undefined): boolean {
  const r = String(reason || '');
  return (
    r.includes(GR_FULL_REVERSE_REASON_PREFIX) ||
    r.includes(GR_UNINVOICED_REVERSE_REASON_PREFIX)
  );
}

/** Only unpaid bills may be auto-cancelled on full reverse. */
export type GrLinkedBillAutoCancelAction = 'REVERSE_AND_CANCEL';

export interface GrLinkedBillForReverse {
  id: string;
  invoiceNumber: string;
  documentType?: string | null;
  amountPaid?: number;
  creditsApplied?: number;
  totalAmount?: number;
  outstandingBalance?: number;
  isPostedToGl?: boolean;
  status?: string | null;
}

export interface GrLinkedBillCancelPlan {
  invoiceId: string;
  invoiceNumber: string;
  action: GrLinkedBillAutoCancelAction;
  amountPaid: number;
}

function invoiceLooksPaid(inv: GrLinkedBillForReverse): boolean {
  const paid = Number(inv.amountPaid ?? 0);
  if (paid > 0.01) return true;
  const status = String(inv.status || '').toUpperCase().replace(/\s+/g, '_');
  return status === 'PAID' || status === 'PARTIALLY_PAID' || status === 'PARTIAL';
}

/**
 * Plan which bills to auto-cancel for a full GR reverse.
 * Only pass invoices DIRECTLY linked to this GR (not PO siblings).
 * Paid / partially paid bills are blockers — reverse is not allowed.
 */
export function planSupplierBillsForGrFullReverse(invoices: GrLinkedBillForReverse[]): {
  toCancel: GrLinkedBillCancelPlan[];
  blockers: string[];
  warnings: string[];
} {
  const toCancel: GrLinkedBillCancelPlan[] = [];
  const blockers: string[] = [];
  const warnings: string[] = [];

  for (const inv of invoices) {
    const docType = String(inv.documentType || '').toUpperCase();
    if (docType === 'OPENING_BALANCE') {
      blockers.push(
        `Opening balance ${inv.invoiceNumber} is linked — cancel it from Supplier Payments first.`,
      );
      continue;
    }
    if (docType === 'SUPPLIER_CREDIT_NOTE' || docType === 'SUPPLIER_DEBIT_NOTE') {
      blockers.push(
        `Credit/debit note ${inv.invoiceNumber} is linked — resolve it before full reverse.`,
      );
      continue;
    }

    const credits = Number(inv.creditsApplied ?? 0);
    if (credits > 0.01) {
      blockers.push(
        `Bill ${inv.invoiceNumber} has credit notes applied — unapply them before full reverse.`,
      );
      continue;
    }

    if (invoiceLooksPaid(inv)) {
      blockers.push(
        `Bill ${inv.invoiceNumber} has payments applied — cannot reverse this goods receipt. Unallocate or refund payments first, or use Return to Supplier + credit note.`,
      );
      continue;
    }

    const paid = Number(inv.amountPaid ?? 0);
    const outstanding = Number(inv.outstandingBalance ?? 0);
    const total = Number(inv.totalAmount ?? 0);
    if (outstanding <= 0.01 && total <= 0.01 && paid <= 0.01) {
      continue;
    }

    toCancel.push({
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      action: 'REVERSE_AND_CANCEL',
      amountPaid: paid,
    });
    warnings.push(
      `Bill ${inv.invoiceNumber} will be cancelled and GL reversed automatically.`,
    );
  }

  return { toCancel, blockers, warnings };
}
