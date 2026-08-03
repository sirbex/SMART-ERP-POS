/**
 * Phase 5.1 — Restaurant master-data cache (read-only projections).
 * Transaction truth stays in pos_offline_events — never store open checks here.
 */

import { shouldPersistRestaurantTablesCache } from './restaurantFloorSession';

const TABLES_KEY = 'restaurant_offline_tables';
const STATIONS_KEY = 'restaurant_offline_stations';
const MENU_KEY = 'restaurant_offline_menu';
const CATEGORIES_KEY = 'restaurant_offline_categories';
const WAITERS_KEY = 'restaurant_offline_waiters';
const META_KEY = 'restaurant_offline_cache_meta';
/**
 * tableId → orderId[] for Bill Requested (per check).
 * Legacy values were a single orderId string — normalized on read.
 */
const BILL_REQUESTED_KEY = 'restaurant_offline_bill_requested';

function normalizeBillRequestedMap(
  raw: Record<string, string | string[]>,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [tableId, value] of Object.entries(raw || {})) {
    if (Array.isArray(value)) {
      out[tableId] = value.filter((id) => typeof id === 'string' && id.length > 0);
    } else if (typeof value === 'string' && value.length > 0) {
      out[tableId] = [value];
    }
  }
  return out;
}

export interface CachedRestaurantTable {
  id: string;
  code: string;
  name: string;
  zone: string;
  seats: number;
  status: 'FREE' | 'OCCUPIED' | 'BILLING';
  currentOrderId: string | null;
  orderNumber?: string | null;
  orderTotal?: string | null;
  guestName?: string | null;
  orderChannel?: string | null;
  waiterId?: string | null;
  waiterName?: string | null;
}

export interface CachedStation {
  id: string;
  code: string;
  name: string;
  printerName: string | null;
  sortOrder: number;
  isActive: boolean;
  isDefault: boolean;
}

export interface CachedMenuProduct {
  id: string;
  name: string;
  sellingPrice: string;
  categoryId: string | null;
  categoryName: string | null;
  kitchenStation: string | null;
  sku?: string | null;
  /** From products.product_type — service dishes must not consume parent stock offline */
  productType?: 'inventory' | 'consumable' | 'service' | string;
}

export interface CachedCategory {
  id: string;
  name: string;
  productCount: number;
}

export interface CachedWaiter {
  id: string;
  fullName: string;
  email: string;
  role: string;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

/**
 * Persist offline tables projection.
 * Never replace a non-empty warm floor with successful [] (session isolation SSOT).
 */
export function cacheRestaurantTables(tables: CachedRestaurantTable[]): void {
  const previous = readJson<CachedRestaurantTable[]>(TABLES_KEY, []);
  if (!shouldPersistRestaurantTablesCache(previous, tables)) return;
  writeJson(TABLES_KEY, tables);
  touchMeta();
}

export function getCachedRestaurantTables(): CachedRestaurantTable[] {
  return readJson(TABLES_KEY, []);
}

export function cacheRestaurantStations(stations: CachedStation[]): void {
  writeJson(STATIONS_KEY, stations);
  touchMeta();
}

export function getCachedRestaurantStations(): CachedStation[] {
  return readJson(STATIONS_KEY, []);
}

export function cacheRestaurantMenu(products: CachedMenuProduct[]): void {
  writeJson(MENU_KEY, products);
  touchMeta();
}

export function getCachedRestaurantMenu(): CachedMenuProduct[] {
  return readJson(MENU_KEY, []);
}

export function cacheRestaurantCategories(categories: CachedCategory[]): void {
  writeJson(CATEGORIES_KEY, categories);
  touchMeta();
}

export function getCachedRestaurantCategories(): CachedCategory[] {
  return readJson(CATEGORIES_KEY, []);
}

export function cacheRestaurantWaiters(waiters: CachedWaiter[]): void {
  writeJson(WAITERS_KEY, waiters);
  touchMeta();
}

export function getCachedRestaurantWaiters(): CachedWaiter[] {
  return readJson(WAITERS_KEY, []);
}

/** Paint a table FREE in the offline tables cache (after pay/cancel/void). */
export function paintRestaurantTableFreeOffline(tableId: string): void {
  if (!tableId) return;
  const tables = getCachedRestaurantTables();
  if (tables.length === 0) return;
  let changed = false;
  const next = tables.map((t) => {
    if (t.id !== tableId) return t;
    if (t.status === 'FREE' && !t.currentOrderId) return t;
    changed = true;
    return {
      ...t,
      status: 'FREE' as const,
      currentOrderId: null,
      orderNumber: null,
      orderTotal: null,
      guestName: null,
      orderChannel: null,
      waiterId: null,
      waiterName: null,
    };
  });
  if (changed) cacheRestaurantTables(next);
}

function touchMeta(): void {
  writeJson(META_KEY, { lastSyncAt: Date.now() });
}

export function getRestaurantCacheLastSync(): number | null {
  const meta = readJson<{ lastSyncAt?: number }>(META_KEY, {});
  return meta.lastSyncAt ?? null;
}

/** Offline FOH: mark this check Bill Requested (per order on multi-ticket tables). */
export function markRestaurantBillRequestedOffline(tableId: string, orderId: string): void {
  const map = normalizeBillRequestedMap(
    readJson<Record<string, string | string[]>>(BILL_REQUESTED_KEY, {}),
  );
  const set = new Set(map[tableId] || []);
  set.add(orderId);
  map[tableId] = [...set];
  writeJson(BILL_REQUESTED_KEY, map);
}

/** Clear one check's bill flag, or the whole table when orderId omitted. */
export function clearRestaurantBillRequestedOffline(tableId: string, orderId?: string): void {
  const map = normalizeBillRequestedMap(
    readJson<Record<string, string | string[]>>(BILL_REQUESTED_KEY, {}),
  );
  if (!(tableId in map)) return;
  if (!orderId) {
    delete map[tableId];
  } else {
    map[tableId] = (map[tableId] || []).filter((id) => id !== orderId);
    if (map[tableId].length === 0) delete map[tableId];
  }
  writeJson(BILL_REQUESTED_KEY, map);
}

export function getRestaurantBillRequestedOffline(): Record<string, string[]> {
  return normalizeBillRequestedMap(
    readJson<Record<string, string | string[]>>(BILL_REQUESTED_KEY, {}),
  );
}

export function isRestaurantOrderBillRequestedOffline(
  tableId: string | null | undefined,
  orderId: string | null | undefined,
): boolean {
  if (!tableId || !orderId) return false;
  return (getRestaurantBillRequestedOffline()[tableId] || []).includes(orderId);
}

/**
 * Refresh restaurant operational cache from live APIs (call when online).
 */
type ApiListResult<T> = { data: { data?: T[] | unknown } };

type SilentOpts = { silentErrorToast?: boolean };

export async function refreshRestaurantOfflineCache(api: {
  listTables: (params?: { includeInactive?: boolean }, config?: SilentOpts) => Promise<ApiListResult<CachedRestaurantTable>>;
  listStations: (params?: { includeInactive?: boolean }, config?: SilentOpts) => Promise<ApiListResult<CachedStation>>;
  menuProducts: (params?: { categoryId?: string }, config?: SilentOpts) => Promise<ApiListResult<CachedMenuProduct>>;
  menuCategories: (config?: SilentOpts) => Promise<ApiListResult<CachedCategory>>;
  listWaiters: (config?: SilentOpts) => Promise<ApiListResult<CachedWaiter>>;
}): Promise<void> {
  // Per-call isolation — one failing endpoint must not blank the whole FOH warm
  // or spam global "Server error" toasts on partial failures.
  const quiet = { silentErrorToast: true } as const;
  const settled = await Promise.allSettled([
    api.listTables(undefined, quiet),
    api.listStations(undefined, quiet),
    api.menuProducts(undefined, quiet),
    api.menuCategories(quiet),
    api.listWaiters(quiet),
  ]);
  /**
   * Only overwrite a cache slice when that endpoint succeeded — never blank warm FOH on blips.
   * Tables also refuse empty overwrite of non-empty warm (cacheRestaurantTables guard).
   */
  const writeIfFulfilled = <T,>(
    i: number,
    write: (rows: T[]) => void,
  ): void => {
    const r = settled[i];
    if (r.status !== 'fulfilled') return;
    write(((r.value.data.data as T[] | undefined) || []) as T[]);
  };
  writeIfFulfilled<CachedRestaurantTable>(0, cacheRestaurantTables);
  writeIfFulfilled<CachedStation>(1, cacheRestaurantStations);
  writeIfFulfilled<CachedMenuProduct>(2, cacheRestaurantMenu);
  writeIfFulfilled<CachedCategory>(3, cacheRestaurantCategories);
  writeIfFulfilled<CachedWaiter>(4, cacheRestaurantWaiters);

  // Multistore: keep offline stock mirror on the shop/SELLING catalog (same as retail POS).
  try {
    const { syncProductCatalog } = await import('../services/offlineCatalogService');
    await syncProductCatalog();
  } catch {
    // Non-fatal — restaurant FOH can still open from menu cache.
  }
}
