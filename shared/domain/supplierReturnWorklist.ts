/**
 * Supplier return (RGRN) worklist SSOT.
 *
 * Nested under Goods Receipts: Inventory → Goods Receipts → Returns tab.
 *
 * Accounting forks:
 * - Uninvoiced return / uninvoiced full reverse: stock + GR/IR cleared on post.
 *   No AP was created → no supplier bill, no SCN. Action = COMPLETE.
 * - Invoiced return: AP exists → POSTED without SCN = NEED_SCN (clear 2160 / reduce AP).
 *
 * Never tell operators to "Bill on GR first" just to unlock a credit note for an
 * uninvoiced reverse — that path invents AP after the receipt was already unwound.
 */

export type SupplierReturnActionStatus =
  | 'DRAFT'
  /** @deprecated not emitted — kept for older clients; use COMPLETE for uninvoiced */
  | 'NEED_BILL'
  | 'NEED_SCN'
  | 'HAS_SCN'
  | 'COMPLETE';

/** Parent receiving desk (inventory top nav: Goods Receipts). */
export const RECEIVING_RECEIPTS_ROUTE = '/inventory/goods-receipts';

/**
 * Supplier return worklist — sibling of receipts, not a top inventory tab.
 * @deprecated old path `/inventory/supplier-returns` redirects here
 */
export const SUPPLIER_RETURNS_ROUTE = '/inventory/goods-receipts/returns';

export const SUPPLIER_RETURNS_API = 'return-grn';
export const SUPPLIER_RETURNS_DEFAULT_FILTER = 'attention' as const;

export interface SupplierReturnWorklistRow {
  status: 'DRAFT' | 'POSTED' | string;
  hasCreditNote?: boolean | null;
  hasSupplierBill?: boolean | null;
  /** When present, used to distinguish open vs applied SCN */
  creditNoteStatus?: string | null;
  /** Optional: reason or flag from uninvoiced reverse orchestration */
  reason?: string | null;
}

/**
 * Next step for a return on the all-supplier worklist.
 * Mirrors CASE in returnGrnRepository.list — keep SQL in sync; evidence test locks both.
 */
export function resolveSupplierReturnActionStatus(
  row: SupplierReturnWorklistRow,
): SupplierReturnActionStatus {
  const status = String(row.status || '').toUpperCase();
  const hasScn = Boolean(row.hasCreditNote);
  const hasBill = Boolean(row.hasSupplierBill);
  const scnSt = String(row.creditNoteStatus || '').toUpperCase();

  if (status === 'DRAFT') return 'DRAFT';
  // Uninvoiced return / reverse: nothing left to bill or credit
  if (!hasScn && !hasBill) return 'COMPLETE';
  if (!hasScn) return 'NEED_SCN';
  if (['POSTED', 'OPEN', 'DRAFT'].includes(scnSt)) return 'HAS_SCN';
  return 'COMPLETE';
}

/**
 * Default "Needs attention" filter: invoiced returns still waiting for SCN only.
 * Uninvoiced reversals must not clutter this list.
 */
export function isSupplierReturnNeedsAttention(row: SupplierReturnWorklistRow): boolean {
  return (
    String(row.status || '').toUpperCase() === 'POSTED' &&
    !row.hasCreditNote &&
    Boolean(row.hasSupplierBill)
  );
}

export function canCreateSupplierCreditNoteFromReturn(row: SupplierReturnWorklistRow): boolean {
  return (
    String(row.status || '').toUpperCase() === 'POSTED' &&
    !row.hasCreditNote &&
    Boolean(row.hasSupplierBill)
  );
}

/**
 * Never force "create a bill so you can create an SCN" on uninvoiced returns.
 * SCN only applies when AP already exists on the source GR.
 */
export function mustBillBeforeSupplierCreditNote(_row: SupplierReturnWorklistRow): boolean {
  return false;
}

/** True when this RGRN was the orchestrated full reverse (with or without prior bill). */
export function isUninvoicedReceiptReversal(row: Pick<SupplierReturnWorklistRow, 'reason'>): boolean {
  const r = String(row.reason || '');
  return r.includes('[Full reverse]') || r.includes('[Uninvoiced reversal]');
}

export const SUPPLIER_RETURN_ACTION_LABELS: Record<SupplierReturnActionStatus, string> = {
  DRAFT: 'Draft',
  NEED_BILL: 'Need supplier bill',
  NEED_SCN: 'Need credit note',
  HAS_SCN: 'Apply credit note',
  COMPLETE: 'Done',
};

export function supplierReturnActionLabel(
  row: SupplierReturnWorklistRow,
  status: SupplierReturnActionStatus = resolveSupplierReturnActionStatus(row),
): string {
  if (status === 'COMPLETE' && isUninvoicedReceiptReversal(row)) {
    return 'Reversal complete';
  }
  if (status === 'COMPLETE' && !row.hasSupplierBill) {
    return 'Done (no bill)';
  }
  return SUPPLIER_RETURN_ACTION_LABELS[status];
}
