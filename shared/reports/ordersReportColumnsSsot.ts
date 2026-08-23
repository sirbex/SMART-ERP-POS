/**
 * Orders report column SSOT — screen, CSV, and PDF must resolve the same ids.
 * resolveVisibleColumns / resolvePdfColumnIds never return empty (fail-closed to defaults).
 */

export type OrdersReportMode = 'all' | 'cancelled';

export type OrdersReportColumnDef = {
  id: string;
  label: string;
  money?: boolean;
  count?: boolean;
  datetime?: boolean;
  default?: boolean;
  /** Prefer in cancelled-mode defaults */
  cancelledDefault?: boolean;
  /** Hide from "all" catalog when true (still allowed if persisted) */
  cancelledOnly?: boolean;
};

export const ORDERS_REPORT_COLUMNS: OrdersReportColumnDef[] = [
  { id: 'orderNumber', label: 'Order #', default: true, cancelledDefault: true },
  { id: 'orderDate', label: 'Order date', default: true, cancelledDefault: true },
  { id: 'status', label: 'Status', default: true },
  { id: 'customerName', label: 'Customer', default: true, cancelledDefault: true },
  { id: 'totalAmount', label: 'Amount', money: true, default: true, cancelledDefault: true },
  { id: 'discountAmount', label: 'Discount', money: true },
  { id: 'itemCount', label: 'Items', count: true, default: true, cancelledDefault: true },
  { id: 'createdBy', label: 'Created by', default: true, cancelledDefault: true },
  { id: 'assignedCashier', label: 'Cashier' },
  { id: 'completedAt', label: 'Completed at', datetime: true },
  { id: 'cancelledAt', label: 'Cancelled at', datetime: true, cancelledOnly: true, cancelledDefault: true },
  { id: 'cancelledBy', label: 'Cancelled by', cancelledOnly: true, cancelledDefault: true },
  { id: 'cancelReason', label: 'Cancel reason', cancelledOnly: true, cancelledDefault: true },
  { id: 'notes', label: 'Notes', default: true, cancelledDefault: true },
  { id: 'createdAt', label: 'Created at', datetime: true },
];

const ALL_IDS = new Set(ORDERS_REPORT_COLUMNS.map((c) => c.id));

export const ORDERS_REPORT_DEFAULT_ALL: string[] = ORDERS_REPORT_COLUMNS.filter(
  (c) => c.default && !c.cancelledOnly,
).map((c) => c.id);

export const ORDERS_REPORT_DEFAULT_CANCELLED: string[] = ORDERS_REPORT_COLUMNS.filter(
  (c) => c.cancelledDefault,
).map((c) => c.id);

export function catalogForMode(mode: OrdersReportMode): OrdersReportColumnDef[] {
  if (mode === 'cancelled') {
    return ORDERS_REPORT_COLUMNS.filter(
      (c) => c.id !== 'status' && c.id !== 'completedAt' && c.id !== 'assignedCashier',
    );
  }
  return ORDERS_REPORT_COLUMNS;
}

export function defaultsForMode(mode: OrdersReportMode): string[] {
  return mode === 'cancelled' ? [...ORDERS_REPORT_DEFAULT_CANCELLED] : [...ORDERS_REPORT_DEFAULT_ALL];
}

/** Drop unknown ids; keep catalog order; never return empty. */
export function resolveVisibleColumns(
  selected: string[] | null | undefined,
  mode: OrdersReportMode,
): string[] {
  const catalog = catalogForMode(mode);
  const allowed = new Set(catalog.map((c) => c.id));
  const picked = (selected || [])
    .map((id) => String(id || '').trim())
    .filter((id) => allowed.has(id));
  // Preserve catalog order for stable table/export
  const ordered = catalog.map((c) => c.id).filter((id) => picked.includes(id));
  if (ordered.length === 0) return defaultsForMode(mode);
  return ordered;
}

/** PDF: parse comma list; unknown ids dropped; empty → mode defaults. */
export function resolvePdfColumnIds(
  columnsParam: string | null | undefined,
  mode: OrdersReportMode,
): string[] {
  const parts = String(columnsParam || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((id) => ALL_IDS.has(id));
  return resolveVisibleColumns(parts.length ? parts : null, mode);
}

export function sanitizePersistedColumns(
  selected: string[] | null | undefined,
  mode: OrdersReportMode,
): string[] {
  return resolveVisibleColumns(selected, mode);
}
