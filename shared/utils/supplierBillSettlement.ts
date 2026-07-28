/**
 * Supplier bill settlement breakdown — SAP/Odoo/Tally pattern.
 *
 * Balance due = Invoice total − Payments − Credits applied
 *
 * "Payments" = cash/bank/MoMo allocated to the bill (AmountPaid after ledger sync).
 * "Credits"  = applied supplier credit notes (SCN), including return credits.
 * Never treat credits as "Paid" — that is what confuses operators.
 */

export type SupplierBillSettlementInput = {
  totalAmount: number;
  /** Cash/bank payments only (ledger AmountPaid). */
  amountPaid?: number | null;
  /** Optional explicit sum of applied SCNs. */
  creditsApplied?: number | null;
  /** Stored outstanding / balance due. */
  outstandingBalance?: number | null;
  status?: string | null;
  documentType?: string | null;
};

export type SupplierBillSettlement = {
  invoiceTotal: number;
  payments: number;
  creditsApplied: number;
  balanceDue: number;
  /** True when credits reduced the bill but no cash payment yet. */
  settledByCreditsOnly: boolean;
  /** True when both payments and credits reduced the bill. */
  mixedSettlement: boolean;
  /**
   * Operator-facing status (does not replace stored Status).
   * e.g. "Partially settled" when only credits applied.
   */
  displayStatus: string;
  /** One-line equation for UI tooltips / help. */
  equationHint: string;
};

function money(n: unknown): number {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}

function isCreditNote(documentType?: string | null): boolean {
  return String(documentType || '').toUpperCase() === 'SUPPLIER_CREDIT_NOTE';
}

/**
 * Derive credits when API did not send creditsApplied:
 * gap = total − payments − balanceDue (clamped ≥ 0).
 */
export function deriveCreditsApplied(
  totalAmount: number,
  payments: number,
  balanceDue: number,
): number {
  return Math.max(0, money(totalAmount - payments - balanceDue));
}

export function buildSupplierBillSettlement(
  input: SupplierBillSettlementInput,
): SupplierBillSettlement {
  const invoiceTotal = money(input.totalAmount);
  const payments = money(input.amountPaid);
  const balanceDue = money(
    input.outstandingBalance != null
      ? input.outstandingBalance
      : Math.max(0, invoiceTotal - payments - money(input.creditsApplied)),
  );

  const creditsApplied =
    input.creditsApplied != null && Number.isFinite(Number(input.creditsApplied))
      ? money(input.creditsApplied)
      : deriveCreditsApplied(invoiceTotal, payments, balanceDue);

  const settledByCreditsOnly = creditsApplied > 0.009 && payments <= 0.009 && balanceDue > 0.009;
  const mixedSettlement = creditsApplied > 0.009 && payments > 0.009;

  return {
    invoiceTotal,
    payments,
    creditsApplied,
    balanceDue,
    settledByCreditsOnly,
    mixedSettlement,
    displayStatus: formatSupplierBillDisplayStatus({
      status: input.status,
      documentType: input.documentType,
      payments,
      creditsApplied,
      balanceDue,
    }),
    equationHint: 'Balance due = Invoice total − Payments − Credits applied',
  };
}

export function formatSupplierBillDisplayStatus(input: {
  status?: string | null;
  documentType?: string | null;
  payments: number;
  creditsApplied: number;
  balanceDue: number;
}): string {
  if (isCreditNote(input.documentType)) {
    const s = String(input.status || '').toUpperCase();
    if (s === 'APPLIED' || input.balanceDue <= 0.009) return 'Applied';
    if (s === 'POSTED') return 'On account — apply to bill';
    if (s === 'DRAFT') return 'Draft';
    if (s === 'CANCELLED') return 'Cancelled';
    return String(input.status || 'Credit note');
  }

  const s = String(input.status || '').toUpperCase();
  if (s === 'CANCELLED' || s === 'DELETED' || s === 'VOIDED') return 'Cancelled';
  if (s === 'DRAFT') return 'Draft';
  if (input.balanceDue <= 0.009 || s === 'PAID') return 'Paid';

  if (input.creditsApplied > 0.009 && input.payments <= 0.009) {
    return 'Partially settled';
  }
  if (input.creditsApplied > 0.009 && input.payments > 0.009) {
    return 'Partially paid';
  }
  if (input.payments > 0.009 || s === 'PARTIALLY_PAID' || s === 'PARTIALLYPAID') {
    return 'Partially paid';
  }
  if (s === 'PENDING' || s === 'POSTED' || !s) return 'Open';
  return String(input.status || 'Open');
}

/** Toast / help copy after applying an SCN to open bills. */
export function formatScnApplySuccessMessage(input: {
  applied: number;
  billCount: number;
  residual: number;
  formatMoney: (n: number) => string;
}): string {
  const { applied, billCount, residual, formatMoney } = input;
  if (applied <= 0.009) {
    return 'No open bills available — credit note remains on-account.';
  }
  let msg =
    `Allocated ${formatMoney(applied)} to ${billCount} bill${billCount === 1 ? '' : 's'}. ` +
    `Bill balance due reduced. Supplier AP was already reduced when this credit was posted.`;
  if (residual > 0.009) {
    msg += ` ${formatMoney(residual)} remains on-account.`;
  }
  return msg;
}
