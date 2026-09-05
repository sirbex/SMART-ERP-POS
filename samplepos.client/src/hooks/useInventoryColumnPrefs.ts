import { useCallback, useMemo, useState } from 'react';
import {
  catalogForWorklist,
  defaultsForWorklist,
  inventoryColumnStorageKey,
  resolveVisibleColumnIds,
  type InventoryWorklistId,
} from '@shared/inventory/inventoryWorklistColumnsSsot';
import { persistLocalStorage } from '../lib/originStorageQuota';

function readStoredIds(worklistId: InventoryWorklistId): string[] | null {
  try {
    const raw = localStorage.getItem(inventoryColumnStorageKey(worklistId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : null;
  } catch {
    return null;
  }
}

export type UseInventoryColumnPrefsOptions = {
  /** When false, omit Store from catalog (company / non-multistore views). */
  includeStore?: boolean;
};

/**
 * Per-user inventory worklist column visibility (localStorage).
 */
export function useInventoryColumnPrefs(
  worklistId: InventoryWorklistId,
  options: UseInventoryColumnPrefsOptions = {},
) {
  const includeStore = options.includeStore !== false;
  const catalogOpts = useMemo(() => ({ includeStore }), [includeStore]);

  const catalog = useMemo(
    () => catalogForWorklist(worklistId, catalogOpts),
    [worklistId, catalogOpts],
  );

  const [selectedRaw, setSelectedRaw] = useState<string[]>(() =>
    resolveVisibleColumnIds(worklistId, readStoredIds(worklistId), catalogOpts),
  );

  const visibleIds = useMemo(
    () => resolveVisibleColumnIds(worklistId, selectedRaw, catalogOpts),
    [worklistId, selectedRaw, catalogOpts],
  );

  const persist = useCallback(
    (next: string[]) => {
      const healed = resolveVisibleColumnIds(worklistId, next, catalogOpts);
      setSelectedRaw(healed);
      try {
        persistLocalStorage(inventoryColumnStorageKey(worklistId), JSON.stringify(healed));
      } catch {
        /* ignore quota */
      }
    },
    [worklistId, catalogOpts],
  );

  const show = useCallback((columnId: string) => visibleIds.includes(columnId), [visibleIds]);

  const toggle = useCallback(
    (columnId: string) => {
      const def = catalog.find((c) => c.id === columnId);
      if (def?.required) return;
      if (visibleIds.includes(columnId)) {
        persist(visibleIds.filter((id) => id !== columnId));
      } else {
        persist([...visibleIds, columnId]);
      }
    },
    [catalog, visibleIds, persist],
  );

  const resetDefaults = useCallback(() => {
    persist(defaultsForWorklist(worklistId, catalogOpts));
  }, [worklistId, catalogOpts, persist]);

  return {
    catalog,
    visibleIds,
    show,
    toggle,
    resetDefaults,
    visibleCount: visibleIds.length,
    totalCount: catalog.length,
  };
}
