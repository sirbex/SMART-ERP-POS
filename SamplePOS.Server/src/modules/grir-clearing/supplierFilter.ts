/**
 * GR/IR supplier filter: accept UUID or free-text name/code.
 * UI lets operators type "sal…" — never bind that to a UUID column.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SupplierFilter =
  | { mode: 'none' }
  | { mode: 'id'; supplierId: string }
  | { mode: 'search'; supplierSearch: string };

export function resolveSupplierFilter(raw?: string | null): SupplierFilter {
  const v = typeof raw === 'string' ? raw.trim() : '';
  if (!v) return { mode: 'none' };
  if (UUID_RE.test(v)) return { mode: 'id', supplierId: v };
  return { mode: 'search', supplierSearch: v };
}

export function isUuid(value?: string | null): boolean {
  return resolveSupplierFilter(value).mode === 'id';
}
