/**
 * Supplier return (RGRN) worklist SSOT.
 *
 * Nested under Goods Receipts: Inventory → Goods Receipts → Returns tab.
 * Rule: POSTED without active SCN = needs attention (clear 2160 / reduce AP via SCN).
 */

export type SupplierReturnActionStatus =
  | 'DRAFT'
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
  if (!hasScn && !hasBill) return 'NEED_BILL';
  if (!hasScn) return 'NEED_SCN';
  if (['POSTED', 'OPEN', 'DRAFT'].includes(scnSt)) return 'HAS_SCN';
  return 'COMPLETE';
}

/** True when list default / needsAttention filter should include this row. */
export function isSupplierReturnNeedsAttention(row: SupplierReturnWorklistRow): boolean {
  return String(row.status || '').toUpperCase() === 'POSTED' && !row.hasCreditNote;
}

export function canCreateSupplierCreditNoteFromReturn(row: SupplierReturnWorklistRow): boolean {
  return (
    String(row.status || '').toUpperCase() === 'POSTED' &&
    !row.hasCreditNote &&
    Boolean(row.hasSupplierBill)
  );
}

export function mustBillBeforeSupplierCreditNote(row: SupplierReturnWorklistRow): boolean {
  return (
    String(row.status || '').toUpperCase() === 'POSTED' &&
    !row.hasCreditNote &&
    !row.hasSupplierBill
  );
}

export const SUPPLIER_RETURN_ACTION_LABELS: Record<SupplierReturnActionStatus, string> = {
  DRAFT: 'Draft',
  NEED_BILL: 'Need supplier bill',
  NEED_SCN: 'Need credit note',
  HAS_SCN: 'Apply credit note',
  COMPLETE: 'Done',
};
