/**
 * PROOF: origin quota reclaim — PIN login must not require cashiers to clear site data.
 * Reconstructible caches drop first; unsynced / open-check journal stays.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ORIGIN_STORAGE_PROTECTED_KEYS,
  RECONSTRUCTIBLE_CACHE_KEYS,
  evictReconstructibleCaches,
  isQuotaExceededError,
  persistAuthStorage,
  persistLocalStorage,
  reclaimOriginStorage,
} from './originStorageQuota';
import {
  JOURNAL_KEY,
  SYNC_STATE_KEY,
  appendEvent,
  compactSyncedClosedJournal,
  getAllEvents,
  invalidateJournalMemoryCache,
  markSynced,
} from './offlineEventJournal';

function installMemoryLocalStorage() {
  const store = new Map<string, string>();
  const quotaFailKeys = new Set<string>();
  const mem = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      if (quotaFailKeys.has(k)) {
        const err = new Error(
          `Failed to execute 'setItem' on 'Storage': setting the value of '${k}' exceeded the quota.`,
        );
        err.name = 'QuotaExceededError';
        throw err;
      }
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
    _quotaFailKeys: quotaFailKeys,
    _store: store,
  };
  Object.defineProperty(globalThis, 'localStorage', { value: mem, configurable: true });
  vi.stubGlobal('localStorage', mem);
  return mem;
}

const here = dirname(fileURLToPath(import.meta.url));

describe('origin storage quota SSOT', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    invalidateJournalMemoryCache();
  });

  it('detects Chromium quota errors', () => {
    const err = new Error(
      "Failed to execute 'setItem' on 'Storage': setting the value of 'rbac_permissions' exceeded the quota.",
    );
    err.name = 'QuotaExceededError';
    expect(isQuotaExceededError(err)).toBe(true);
    expect(isQuotaExceededError(new Error('nope'))).toBe(false);
  });

  it('evicts reconstructible caches and never touches auth or pending journal keys', () => {
    localStorage.setItem('pos_product_catalog', 'HUGE');
    localStorage.setItem('restaurant_offline_menu', 'HUGE');
    localStorage.setItem('error_logs', '[]');
    localStorage.setItem('auth_token', 'jwt');
    localStorage.setItem('rbac_permissions', '["pos.sell"]');
    localStorage.setItem(JOURNAL_KEY, '[]');
    const n = evictReconstructibleCaches();
    expect(n).toBeGreaterThanOrEqual(3);
    expect(localStorage.getItem('pos_product_catalog')).toBeNull();
    expect(localStorage.getItem('auth_token')).toBe('jwt');
    expect(localStorage.getItem('rbac_permissions')).toBe('["pos.sell"]');
    expect(localStorage.getItem(JOURNAL_KEY)).toBe('[]');
    localStorage.setItem('pos_local_stock', '{"p1":4}');
    localStorage.setItem('pos_persisted_cart_v2', '{"lines":[]}');
    localStorage.setItem('pos_offline_sales', '[{"status":"PENDING_SYNC"}]');
    localStorage.setItem('smarterp_offline_queue', '[]');
    evictReconstructibleCaches();
    expect(localStorage.getItem('pos_local_stock')).toBe('{"p1":4}');
    expect(localStorage.getItem('pos_persisted_cart_v2')).toBe('{"lines":[]}');
    expect(localStorage.getItem('pos_offline_sales')).toBe('[{"status":"PENDING_SYNC"}]');
    expect(localStorage.getItem('smarterp_offline_queue')).toBe('[]');
    for (const k of ORIGIN_STORAGE_PROTECTED_KEYS) {
      expect(RECONSTRUCTIBLE_CACHE_KEYS).not.toContain(k as (typeof RECONSTRUCTIBLE_CACHE_KEYS)[number]);
    }
  });

  it('PIN login persistAuthStorage reclaims catalog then writes rbac', () => {
    localStorage.setItem('pos_product_catalog', 'x'.repeat(1000));
    const mem = globalThis.localStorage as unknown as {
      setItem: (k: string, v: string) => void;
    };
    let firstRbac = true;
    const inner = mem.setItem.bind(mem);
    mem.setItem = (k: string, v: string) => {
      if (k === 'rbac_permissions' && firstRbac) {
        firstRbac = false;
        const err = new Error(
          "Failed to execute 'setItem' on 'Storage': setting the value of 'rbac_permissions' exceeded the quota.",
        );
        err.name = 'QuotaExceededError';
        throw err;
      }
      inner(k, v);
    };
    persistAuthStorage('rbac_permissions', JSON.stringify(['pos.sell', 'restaurant.order']));
    expect(localStorage.getItem('rbac_permissions')).toContain('pos.sell');
    expect(localStorage.getItem('pos_product_catalog')).toBeNull();
  });

  it('persistLocalStorage on quota evicts catalog then retries', () => {
    localStorage.setItem('pos_product_catalog', 'FAT');
    const mem = globalThis.localStorage as unknown as {
      _quotaFailKeys: Set<string>;
      setItem: (k: string, v: string) => void;
    };
    let first = true;
    const inner = mem.setItem.bind(mem);
    mem.setItem = (k: string, v: string) => {
      if (k === 'user' && first) {
        first = false;
        const err = new Error("setting the value of 'user' exceeded the quota.");
        err.name = 'QuotaExceededError';
        throw err;
      }
      inner(k, v);
    };
    persistLocalStorage('user', '{"id":"u1"}');
    expect(localStorage.getItem('user')).toBe('{"id":"u1"}');
    expect(localStorage.getItem('pos_product_catalog')).toBeNull();
  });

  it('compact drops SYNCED closed sales and keeps PENDING + open checks', () => {
    appendEvent({
      eventType: 'SALE_COMPLETED',
      key: 'sale-synced',
      orderId: 'ord-closed',
      offlineId: 'OFF-1',
      lines: [],
      payments: [{ paymentMethod: 'CASH', amount: 1 }],
      subtotal: 1,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 1,
      stockDeductions: [],
      ts: 1,
    });
    markSynced('sale-synced');
    appendEvent({
      eventType: 'SALE_COMPLETED',
      key: 'sale-pending',
      orderId: 'ord-pending',
      offlineId: 'OFF-2',
      lines: [],
      payments: [{ paymentMethod: 'CASH', amount: 2 }],
      subtotal: 2,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 2,
      stockDeductions: [],
      ts: 2,
    });
    appendEvent({
      eventType: 'ORDER_CREATED',
      key: 'open-check',
      orderId: 'ord-open',
      offlineId: 'OFF-3',
      lines: [{ productId: 'p', productName: 'X', sku: '', uom: 'PIECE', quantity: 1, unitPrice: 1, costPrice: 0, subtotal: 1, taxAmount: 0 }],
      tableId: 't1',
      tableCode: 'T1',
      channel: 'DINE_IN',
      ts: 3,
    });
    markSynced('open-check');
    expect(compactSyncedClosedJournal()).toBe(1);
    const keys = getAllEvents().map((e) => e.key).sort();
    expect(keys).toEqual(['open-check', 'sale-pending']);
    expect(localStorage.getItem(SYNC_STATE_KEY)).toBeTruthy();
  });

  it('compact keeps synced ORDER_CREATED when SALE_COMPLETED for that order is still PENDING', () => {
    appendEvent({
      eventType: 'ORDER_CREATED',
      key: 'ord-created',
      orderId: 'ord-pair',
      offlineId: 'OFF-P',
      lines: [{ productId: 'p', productName: 'X', sku: '', uom: 'PIECE', quantity: 1, unitPrice: 1, costPrice: 0, subtotal: 1, taxAmount: 0 }],
      ts: 1,
    });
    markSynced('ord-created');
    appendEvent({
      eventType: 'SALE_COMPLETED',
      key: 'sale-still-pending',
      orderId: 'ord-pair',
      offlineId: 'OFF-P',
      lines: [],
      payments: [{ paymentMethod: 'CASH', amount: 1 }],
      subtotal: 1,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 1,
      stockDeductions: [],
      ts: 2,
    });
    expect(compactSyncedClosedJournal()).toBe(0);
    expect(getAllEvents().map((e) => e.key).sort()).toEqual(['ord-created', 'sale-still-pending']);
  });

  it('persistAuthStorage never throws when quota remains after reclaim', () => {
    const mem = globalThis.localStorage as unknown as {
      setItem: (k: string, v: string) => void;
    };
    const inner = mem.setItem.bind(mem);
    mem.setItem = (k: string, v: string) => {
      if (k === 'rbac_permissions') {
        const err = new Error("setting the value of 'rbac_permissions' exceeded the quota.");
        err.name = 'QuotaExceededError';
        throw err;
      }
      inner(k, v);
    };
    expect(() => persistAuthStorage('rbac_permissions', '["pos.sell"]')).not.toThrow();
    expect(localStorage.getItem('rbac_permissions')).toBeNull();
  });

  it('AuthContext PIN path uses persistAuthStorage for rbac_permissions', () => {
    const pos = readFileSync(resolve(here, '../contexts/AuthContext.tsx'), 'utf8');
    expect(pos).toMatch(/persistAuthStorage\('rbac_permissions'/);
    expect(pos).not.toMatch(/localStorage\.setItem\('rbac_permissions'/);
  });

  it('reclaimOriginStorage is wired from journal compact', () => {
    localStorage.setItem('pos_product_catalog', 'FAT');
    const n = reclaimOriginStorage();
    expect(n).toBeGreaterThanOrEqual(1);
    expect(localStorage.getItem('pos_product_catalog')).toBeNull();
  });
});
