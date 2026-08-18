/**
 * Origin storage quota SSOT (Toast / Square / Odoo POS pattern).
 *
 * Chromium localStorage is ~5–10 MB per origin — independent of Windows disk.
 * Other systems do NOT ask cashiers to "clear cache":
 *   1. Session/auth keys are tiny and always win a write.
 *   2. Reconstructible caches (catalog, menu, logs) are evicted under pressure.
 *   3. Unsynced business journal (PENDING/FAILED/REVIEW + open checks) is never dropped.
 *
 * IndexedDB is the long-term home for catalogs; this layer keeps the current
 * localStorage design from blocking PIN login when caches fill the origin.
 */

export const RECONSTRUCTIBLE_CACHE_KEYS = [
  'pos_product_catalog',
  'pos_catalog_last_sync',
  'pos_tax_snapshot_v1',
  'product_catalog_cache',
  'restaurant_offline_tables',
  'restaurant_offline_stations',
  'restaurant_offline_menu',
  'restaurant_offline_categories',
  'restaurant_offline_waiters',
  'restaurant_offline_cache_meta',
  'error_logs',
  'pos.printBridge.printers.v1',
  'pos.printJobs.delivered.v1',
] as const;

/** Identity / money / lock — never part of automatic cache eviction. */
export const ORIGIN_STORAGE_PROTECTED_KEYS = [
  'auth_token',
  'refresh_token',
  'token_expiry',
  'user',
  'rbac_permissions',
  'offline_login_credentials',
  'offline_login_credential',
  'pos_offline_events',
  'pos_sync_state',
  'smarterp_offline_queue',
  'pos.printJobs.offlineQueue.v1',
  'pos_local_stock',
  'pos_persisted_cart_v2',
  'pos_offline_sales',
  'pos_offline_orders',
  'restaurant_offline_bill_requested',
  'smarterp_device_session_mode',
  'smarterp_actor_lock_v1',
  'auth_login_grace_v1',
] as const;

let extraReclaim: (() => number) | null = null;

/** Journal module registers compact-synced-closed-tickets (avoids import cycles). */
export function registerOriginStorageReclaim(fn: () => number): void {
  extraReclaim = fn;
}

export function isQuotaExceededError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; code?: number | string; message?: string };
  if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
    return true;
  }
  if (e.code === 22 || e.code === 1014 || e.code === '22') return true;
  return /exceeded the quota|quotaexceeded/i.test(String(e.message || ''));
}

export function evictReconstructibleCaches(): number {
  if (typeof localStorage === 'undefined') return 0;
  let removed = 0;
  const protectedSet = new Set<string>(ORIGIN_STORAGE_PROTECTED_KEYS);
  for (const key of RECONSTRUCTIBLE_CACHE_KEYS) {
    if (protectedSet.has(key)) continue;
    try {
      if (localStorage.getItem(key) != null) {
        localStorage.removeItem(key);
        removed += 1;
      }
    } catch {
      /* ignore */
    }
  }
  return removed;
}

/** Drop reconstructible caches, then compact closed/synced journal history. */
export function reclaimOriginStorage(): number {
  const evicted = evictReconstructibleCaches();
  const compacted = extraReclaim ? extraReclaim() : 0;
  if (evicted > 0 || compacted > 0) {
    console.warn(
      `[originStorage] reclaimed caches=${evicted} journalEvents=${compacted} (quota pressure)`,
    );
  }
  return evicted + compacted;
}

export function persistLocalStorage(key: string, value: string): void {
  if (typeof localStorage === 'undefined') {
    throw new Error(`localStorage unavailable writing '${key}'`);
  }
  try {
    localStorage.setItem(key, value);
    return;
  } catch (err) {
    if (!isQuotaExceededError(err)) throw err;
    reclaimOriginStorage();
    localStorage.setItem(key, value);
  }
}

/**
 * Auth/session writes must not fail PIN login. After reclaim, if the origin is
 * still full (huge unsynced journal), keep the value in memory and continue.
 */
export function persistAuthStorage(key: string, value: string): void {
  try {
    persistLocalStorage(key, value);
  } catch (err) {
    if (!isQuotaExceededError(err)) throw err;
    console.error(
      `[originStorage] ${key} not persisted after reclaim — session continues in memory`,
      err,
    );
  }
}
