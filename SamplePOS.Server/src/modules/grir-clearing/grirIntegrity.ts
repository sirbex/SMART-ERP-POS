/**
 * GR/IR integrity SSOT — shared predicates and F.13 pair selection.
 * Preview and Run Auto-Match must use the same selection rules.
 */

/** Default tolerance % (matches F.13 UI default of 2). */
export const F13_DEFAULT_TOLERANCE_PERCENT = 2;

/**
 * Active supplier invoice (excludes soft-void statuses used in live tenants).
 * Alias: si
 */
export const SI_ACTIVE_SQL = `
  si.deleted_at IS NULL
  AND COALESCE(si.document_type, 'SUPPLIER_INVOICE') = 'SUPPLIER_INVOICE'
  AND COALESCE(si."Status", '') NOT IN (
    'Cancelled', 'CANCELLED', 'Voided', 'VOIDED', 'Void', 'VOID'
  )
`.replace(/\s+/g, ' ').trim();

/**
 * Multi-path GR ↔ bill link (same paths as createInvoiceFromGRN / billing SSOT).
 * Aliases: gr, si
 */
export const SI_LINKS_GR_SQL = `
  (
    EXISTS (
      SELECT 1 FROM supplier_invoice_grn_links sigl
      WHERE sigl.grn_id = gr.id AND sigl.invoice_id = si."Id"
    )
    OR (
      gr.purchase_order_id IS NOT NULL
      AND si."PurchaseOrderId" IS NOT NULL
      AND si."PurchaseOrderId" = gr.purchase_order_id
    )
    OR (
      NULLIF(TRIM(si."InternalReferenceNumber"), '') IS NOT NULL
      AND (
        TRIM(si."InternalReferenceNumber") = gr.receipt_number
        OR si."InternalReferenceNumber" ILIKE '%' || gr.receipt_number || '%'
      )
    )
  )
`.replace(/\s+/g, ' ').trim();

/** GR has at least one received quantity line. */
export const GR_HAS_LINES_SQL = `
  EXISTS (
    SELECT 1 FROM goods_receipt_items gri0
    WHERE gri0.goods_receipt_id = gr.id
      AND COALESCE(gri0.received_quantity, 0) > 0
  )
`.replace(/\s+/g, ' ').trim();

export type RawMatchPair = {
  gr_id: string;
  invoice_id: string;
  gr_line_total: string | number;
  amount_diff: string | number;
  invoice_total?: string | number;
};

/**
 * 1:1 greedy selection within tolerance % of GR amount.
 * Input must already be ordered exact-first, then smallest abs diff.
 */
export function selectF13Pairs<T extends RawMatchPair>(
  raw: T[],
  tolerancePercent: number = F13_DEFAULT_TOLERANCE_PERCENT,
): T[] {
  const tol =
    Number.isFinite(tolerancePercent) && tolerancePercent >= 0
      ? tolerancePercent
      : F13_DEFAULT_TOLERANCE_PERCENT;

  const usedGr = new Set<string>();
  const usedInv = new Set<string>();
  const selected: T[] = [];

  for (const candidate of raw) {
    const grAmount = Number(candidate.gr_line_total) || 0;
    const diff = Number(candidate.amount_diff) || 0;
    if (grAmount > 0) {
      if ((diff / grAmount) * 100 > tol) continue;
    } else if (diff > 0.01) {
      continue;
    }
    if (usedGr.has(candidate.gr_id) || usedInv.has(candidate.invoice_id)) continue;
    usedGr.add(candidate.gr_id);
    usedInv.add(candidate.invoice_id);
    selected.push(candidate);
  }
  return selected;
}

/** Whitelist of MR11 work-list statuses (never interpolate raw query strings). */
export const OPEN_STATUS_WHITELIST = new Set([
  'UNMATCHED',
  'MATCHED',
  'VARIANCE',
  'CLEARED',
]);

export function normalizeOpenStatusFilter(raw?: string | null): string | null {
  if (!raw || !String(raw).trim()) return null;
  const s = String(raw).trim().toUpperCase();
  if (s === 'PARTIALLY_MATCHED') return 'VARIANCE';
  if (OPEN_STATUS_WHITELIST.has(s)) return s;
  return null;
}
