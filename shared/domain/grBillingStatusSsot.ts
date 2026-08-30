/**
 * Goods Receipt billing-lane SSOT (SAP GR/IR ↔ AP / Odoo To Bill).
 *
 * Priority must match goodsReceiptRepository.listGRs CASE:
 *   DRAFT → CANCELLED → REVERSED → INVOICED → TO_INVOICE → NOT_APPLICABLE
 *
 * REVERSED always wins over a supplier bill number (incl. PO-sibling bill links).
 * Filters TO_INVOICE / INVOICED / REVERSED are mutually exclusive on the list API.
 */

export type GrBillingStatus =
  | 'DRAFT_GR'
  | 'TO_INVOICE'
  | 'INVOICED'
  | 'REVERSED'
  | 'CANCELLED'
  | 'NOT_APPLICABLE';

/** List/API filter values (subset of lanes that are filterable). */
export type GrBillingStatusFilter = 'TO_INVOICE' | 'INVOICED' | 'REVERSED';

export const GR_BILLING_STATUS_FILTERS: readonly GrBillingStatusFilter[] = [
  'TO_INVOICE',
  'INVOICED',
  'REVERSED',
] as const;

export interface GrBillingLaneInput {
  receiptStatus?: string | null;
  /** Server lane when already projected (list API). */
  billingStatus?: string | null;
  isReversed?: boolean | null;
  supplierBillNumber?: string | null;
}

/**
 * Resolve display / action lane. Prefer server billingStatus when present,
 * but never let a bill number override an explicit REVERSED / isReversed flag.
 */
export function resolveGrBillingLane(input: GrBillingLaneInput): GrBillingStatus {
  const receipt = String(input.receiptStatus || '').toUpperCase();
  const billed = Boolean(String(input.supplierBillNumber || '').trim());
  const reversed = Boolean(input.isReversed) || String(input.billingStatus || '').toUpperCase() === 'REVERSED';

  if (receipt === 'DRAFT' || input.billingStatus === 'DRAFT_GR') return 'DRAFT_GR';
  if (receipt === 'CANCELLED' || input.billingStatus === 'CANCELLED') return 'CANCELLED';
  if (reversed) return 'REVERSED';

  const fromServer = String(input.billingStatus || '').toUpperCase();
  if (fromServer === 'INVOICED' || fromServer === 'TO_INVOICE' || fromServer === 'NOT_APPLICABLE') {
    return fromServer as GrBillingStatus;
  }

  if (billed) return 'INVOICED';
  if (receipt === 'COMPLETED') return 'TO_INVOICE';
  return 'NOT_APPLICABLE';
}

/** Fully reversed uninvoiced (or billed-then-reversed) — never create AP from this GR. */
export function isGrBillingReversed(input: GrBillingLaneInput): boolean {
  return resolveGrBillingLane(input) === 'REVERSED';
}

/** True when Create Supplier Bill is the correct next step for this receipt. */
export function canCreateSupplierBillFromGr(input: GrBillingLaneInput): boolean {
  return resolveGrBillingLane(input) === 'TO_INVOICE';
}
