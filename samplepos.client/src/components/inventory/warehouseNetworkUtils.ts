import type { StoreLocation, StoreType } from '../../../../shared/types/warehouseNetwork';

export interface WarehouseNetworkTreeNode {
  store: StoreLocation;
  children: WarehouseNetworkTreeNode[];
}

const TYPE_ORDER: Record<StoreType, number> = {
  MAIN: 0,
  SELLING: 1,
  TRANSIT: 2,
  RETURN: 3,
  DAMAGE: 4,
  EXPIRED: 5,
};

const SPECIAL_STORE_TYPES = new Set<StoreType>(['TRANSIT', 'EXPIRED', 'DAMAGE', 'RETURN']);

/** Special stores with no on-hand qty are hidden from the network map (they still exist in DB). */
export function filterSpecialStoresWithStock(
  stores: StoreLocation[],
  qtyByStoreId: ReadonlyMap<string, number>,
): StoreLocation[] {
  return stores.filter((store) => {
    const qty = qtyByStoreId.get(store.id) ?? 0;
    return qty > 0.001;
  });
}

export interface StoreNetworkSections {
  /** MAIN warehouse with selling shops nested underneath. */
  warehouseRoots: WarehouseNetworkTreeNode[];
  /** Transit, expired, damage, return — not nested under MAIN. */
  specialStores: StoreLocation[];
}

function sortStores(a: StoreLocation, b: StoreLocation): number {
  const ta = TYPE_ORDER[a.storeType] ?? 99;
  const tb = TYPE_ORDER[b.storeType] ?? 99;
  if (ta !== tb) return ta - tb;
  return a.name.localeCompare(b.name);
}

/**
 * Builds a MAIN-rooted hierarchy for the network map.
 * Stores without parent_store_id attach under MAIN by convention.
 */
export function buildWarehouseNetworkTree(stores: StoreLocation[]): WarehouseNetworkTreeNode[] {
  const active = stores.filter((s) => s.isActive);
  if (active.length === 0) return [];

  const main = active.find((s) => s.storeType === 'MAIN');
  const childrenByParent = new Map<string, StoreLocation[]>();

  for (const store of active) {
    if (store.storeType === 'MAIN') continue;
    const parentId = store.parentStoreId ?? (main ? main.id : null);
    if (!parentId) continue;
    const bucket = childrenByParent.get(parentId) ?? [];
    bucket.push(store);
    childrenByParent.set(parentId, bucket);
  }

  const buildNode = (store: StoreLocation): WarehouseNetworkTreeNode => ({
    store,
    children: (childrenByParent.get(store.id) ?? [])
      .sort(sortStores)
      .map(buildNode),
  });

  if (main) {
    return [buildNode(main)];
  }

  const roots = active.filter((s) => !s.parentStoreId).sort(sortStores);
  return roots.map(buildNode);
}

/**
 * Splits the network into operational warehouse tree vs special-purpose stores.
 */
export function buildStoreNetworkSections(stores: StoreLocation[]): StoreNetworkSections {
  const active = stores.filter((s) => s.isActive);
  const main = active.find((s) => s.storeType === 'MAIN');

  const sellingUnderMain: StoreLocation[] = [];
  const specialStores: StoreLocation[] = [];

  for (const store of active) {
    if (SPECIAL_STORE_TYPES.has(store.storeType)) {
      specialStores.push(store);
      continue;
    }
    if (store.storeType === 'SELLING') {
      sellingUnderMain.push(store);
    }
  }

  sellingUnderMain.sort(sortStores);
  specialStores.sort(sortStores);

  const warehouseRoots: WarehouseNetworkTreeNode[] = main
    ? [
        {
          store: main,
          children: sellingUnderMain.map((shop) => ({ store: shop, children: [] })),
        },
      ]
    : buildWarehouseNetworkTree(active);

  return { warehouseRoots, specialStores };
}
