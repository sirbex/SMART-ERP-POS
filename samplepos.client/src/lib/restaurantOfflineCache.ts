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

/**
 * Refresh restaurant operational cache from live APIs (call when online).
 */
export async function refreshRestaurantOfflineCache(api: {
  listTables: () => Promise<{ data: { data?: CachedRestaurantTable[] } }>;
  listStations: () => Promise<{ data: { data?: CachedStation[] } }>;
  menuProducts: () => Promise<{ data: { data?: CachedMenuProduct[] } }>;
  menuCategories: () => Promise<{ data: { data?: CachedCategory[] } }>;
  listWaiters: () => Promise<{ data: { data?: CachedWaiter[] } }>;
}): Promise<void> {
  const [tables, stations, products, categories, waiters] = await Promise.all([
    api.listTables(),
    api.listStations(),
    api.menuProducts(),
    api.menuCategories(),
    api.listWaiters(),
  ]);
  cacheRestaurantTables(tables.data.data || []);
  cacheRestaurantStations(stations.data.data || []);
  cacheRestaurantMenu(products.data.data || []);
  cacheRestaurantCategories(categories.data.data || []);
  cacheRestaurantWaiters(waiters.data.data || []);
}
