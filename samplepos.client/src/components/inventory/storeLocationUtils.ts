import type { StoreLocation } from '../../../../shared/types/warehouseNetwork';

/** O(1) label lookup — build once at page level, not per table row. */
export function buildStoreLabelMap(
  stores: StoreLocation[],
): ReadonlyMap<string, string> {
  return new Map(stores.map((s) => [s.id, `${s.name} (${s.code})`]));
}

export function resolveStoreLabel(
  labelMap: ReadonlyMap<string, string>,
  storeId: string | null | undefined,
): string {
  if (!storeId) return '—';
  return labelMap.get(storeId) ?? '—';
}
