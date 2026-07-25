/**
 * Phase 5.1 — Restaurant master-data cache (read-only projections).
 * Transaction truth stays in pos_offline_events — never store open checks here.
 */

const TABLES_KEY = 'restaurant_offline_tables';
const STATIONS_KEY = 'restaurant_offline_stations';
const MENU_KEY = 'restaurant_offline_menu';
const CATEGORIES_KEY = 'restaurant_offline_categories';
const WAITERS_KEY = 'restaurant_offline_waiters';
const META_KEY = 'restaurant_offline_cache_meta';
/** tableId → orderId for offline Bill Requested (FOH maroon) until sync/pay */
const BILL_REQUESTED_KEY = 'restaurant_offline_bill_requested';

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

export function cacheRestaurantTables(tables: CachedRestaurantTable[]): void {
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

function touchMeta(): void {
  writeJson(META_KEY, { lastSyncAt: Date.now() });
}

export function getRestaurantCacheLastSync(): number | null {
  const meta = readJson<{ lastSyncAt?: number }>(META_KEY, {});
  return meta.lastSyncAt ?? null;
}

/** Offline FOH: mark table as Bill Requested (maroon) — mirrors server BILLING. */
export function markRestaurantBillRequestedOffline(tableId: string, orderId: string): void {
  const map = readJson<Record<string, string>>(BILL_REQUESTED_KEY, {});
  map[tableId] = orderId;
  writeJson(BILL_REQUESTED_KEY, map);
}

export function clearRestaurantBillRequestedOffline(tableId: string): void {
  const map = readJson<Record<string, string>>(BILL_REQUESTED_KEY, {});
  if (!(tableId in map)) return;
  delete map[tableId];
  writeJson(BILL_REQUESTED_KEY, map);
}

export function getRestaurantBillRequestedOffline(): Record<string, string> {
  return readJson<Record<string, string>>(BILL_REQUESTED_KEY, {});
}

/**
 * Refresh restaurant operational cache from live APIs (call when online).
 */
type ApiListResult<T> = { data: { data?: T[] | unknown } };

export async function refreshRestaurantOfflineCache(api: {
  listTables: () => Promise<ApiListResult<CachedRestaurantTable>>;
  listStations: () => Promise<ApiListResult<CachedStation>>;
  menuProducts: () => Promise<ApiListResult<CachedMenuProduct>>;
  menuCategories: () => Promise<ApiListResult<CachedCategory>>;
  listWaiters: () => Promise<ApiListResult<CachedWaiter>>;
}): Promise<void> {
  const [tables, stations, products, categories, waiters] = await Promise.all([
    api.listTables(),
    api.listStations(),
    api.menuProducts(),
    api.menuCategories(),
    api.listWaiters(),
  ]);
  cacheRestaurantTables((tables.data.data as CachedRestaurantTable[] | undefined) || []);
  cacheRestaurantStations((stations.data.data as CachedStation[] | undefined) || []);
  cacheRestaurantMenu((products.data.data as CachedMenuProduct[] | undefined) || []);
  cacheRestaurantCategories((categories.data.data as CachedCategory[] | undefined) || []);
  cacheRestaurantWaiters((waiters.data.data as CachedWaiter[] | undefined) || []);
}
