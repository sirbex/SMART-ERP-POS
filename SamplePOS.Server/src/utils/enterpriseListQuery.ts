/**
 * Enterprise list query helpers — server-side sort/filter across full dataset (not page-local).
 * Whitelist column maps prevent SQL injection in ORDER BY.
 */

export type SortOrder = 'asc' | 'desc';

export type ActiveStatusFilter = 'active' | 'inactive' | 'all';

export interface EnterpriseListQuery {
  sortBy?: string;
  sortOrder?: SortOrder;
  outstandingOnly?: boolean;
  balanceGt?: number;
  stockGt?: boolean;
  paymentTerms?: string;
  search?: string;
  /** Supplier (and similar master) list: active (default) | inactive | all */
  status?: ActiveStatusFilter;
}

export function parseSortOrder(raw?: string): SortOrder {
  return raw?.toLowerCase() === 'asc' ? 'asc' : 'desc';
}

export function sqlSortOrder(order?: SortOrder): 'ASC' | 'DESC' {
  return order === 'asc' ? 'ASC' : 'DESC';
}

/** Pick whitelisted SQL expression for ORDER BY. */
export function pickSortColumn(
  sortBy: string | undefined,
  map: Record<string, string>,
  fallbackKey: string,
): string {
  if (sortBy && map[sortBy]) return map[sortBy];
  return map[fallbackKey] ?? Object.values(map)[0];
}

export function parseBoolQuery(v: unknown): boolean {
  return v === true || v === 'true' || v === '1' || v === 1;
}

export function parseOptionalFloat(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : undefined;
}

/** Replace table alias in open-item balance SQL fragments. */
export function aliasTableSql(sql: string, fromAlias: string, toAlias: string): string {
  return sql.replace(new RegExp(`\\b${fromAlias}\\.`, 'g'), `${toAlias}.`);
}
