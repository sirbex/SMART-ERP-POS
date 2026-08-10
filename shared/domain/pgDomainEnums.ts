/**
 * Postgres domain enum labels SSOT.
 *
 * These MUST match shared/sql/001_initial_schema.sql (and later migrations).
 * Never invent labels (e.g. FINALIZED for goods_receipt_status) — PG throws 22P02.
 *
 * Prefer helpers here over raw string compares across client + server.
 */

// ── Goods receipt (goods_receipt_status) ─────────────────────────────
// Schema: CREATE TYPE goods_receipt_status AS ENUM ('DRAFT', 'COMPLETED', 'CANCELLED');

export const GOODS_RECEIPT_STATUSES = ['DRAFT', 'COMPLETED', 'CANCELLED'] as const;
export type GoodsReceiptStatus = (typeof GOODS_RECEIPT_STATUSES)[number];

/** Posted / finalized GR — inventory + GL have run. SQL: status = 'COMPLETED' only. */
export const GR_POSTED_STATUS: GoodsReceiptStatus = 'COMPLETED';

/** SQL predicate fragment for posted GRs (valid enum labels only). */
export const GR_STATUS_POSTED_SQL = `status = 'COMPLETED'`;

export function isGoodsReceiptStatus(value: unknown): value is GoodsReceiptStatus {
  return (
    typeof value === 'string' &&
    (GOODS_RECEIPT_STATUSES as readonly string[]).includes(value)
  );
}

/** True when GR is posted to inventory (DB COMPLETED). */
export function isGoodsReceiptPosted(status: string | null | undefined): boolean {
  const s = String(status ?? '').trim().toUpperCase();
  // COMPLETED is canonical. FINALIZED is a historic product alias — never SQL it.
  return s === 'COMPLETED' || s === 'FINALIZED';
}

export function isGoodsReceiptDraft(status: string | null | undefined): boolean {
  return String(status ?? '').trim().toUpperCase() === 'DRAFT';
}

export function isGoodsReceiptCancelled(status: string | null | undefined): boolean {
  return String(status ?? '').trim().toUpperCase() === 'CANCELLED';
}

// ── Purchase order (purchase_order_status) ───────────────────────────
// Schema: DRAFT | PENDING | COMPLETED | CANCELLED

export const PURCHASE_ORDER_STATUSES = [
  'DRAFT',
  'PENDING',
  'COMPLETED',
  'CANCELLED',
] as const;
export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];

export function isPurchaseOrderStatus(value: unknown): value is PurchaseOrderStatus {
  return (
    typeof value === 'string' &&
    (PURCHASE_ORDER_STATUSES as readonly string[]).includes(value)
  );
}

// ── Sale (sale_status) ───────────────────────────────────────────────
export const SALE_STATUSES = ['COMPLETED', 'VOID', 'REFUNDED'] as const;
export type SaleStatus = (typeof SALE_STATUSES)[number];

// ── Payment method (payment_method) ──────────────────────────────────
// Base schema + migrations may add CARD, CHEQUE, AIRTEL_MONEY, etc.
// Always compare via ::text in SQL — never COALESCE(enum_col, '').
export const PAYMENT_METHOD_CORE = [
  'CASH',
  'CARD',
  'MOBILE_MONEY',
  'BANK_TRANSFER',
  'CREDIT',
] as const;
export type PaymentMethodCore = (typeof PAYMENT_METHOD_CORE)[number];

/** Credit / AR sale payment methods (text compare only). */
export const AR_CREDIT_PAYMENT_METHODS = ['CREDIT'] as const;

/**
 * Labels that must NEVER appear as PostgreSQL enum literals for goods_receipt_status.
 * Used by integrity proofs (source scan).
 */
export const FORBIDDEN_GOODS_RECEIPT_SQL_STATUS_LITERALS = [
  'FINALIZED',
  'POSTED',
  'OPEN',
  'CLOSED',
  'APPROVED',
] as const;

/**
 * Anti-pattern: COALESCE(pg_enum_column, '') forces '' into the enum type → 22P02.
 * Safe: COALESCE(pg_enum_column::text, '')
 */
export const ENUM_COALESCE_EMPTY_ANTIPATTERN =
  /COALESCE\s*\(\s*[a-zA-Z0-9_."]*payment_method\s*,\s*''\s*\)/i;
