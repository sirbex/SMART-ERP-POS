/**
 * Restaurant Workspace Cache & Session Isolation Certification
 *
 * Proves:
 * - Query keys isolated by user identity + online context
 * - Login/logout forces floor session refresh (no User B inherits User A RQ)
 * - Offline warm never replaced by successful []
 * - myTablesOnly / ownership cannot leave a silent blank dining room
 * - Every login path wires refreshRestaurantFloorSession
 * - Journal FREE paint cannot hide peer-unowned free tables online
 *
 * Behavioral pure functions + source contracts. No speculation.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RESTAURANT_TABLES_QUERY_PREFIX,
  RESTAURANT_WAITERS_QUERY_PREFIX,
  refreshRestaurantFloorSession,
  resolveDiningFloorEmptyState,
  restaurantTablesQueryKey,
  restaurantWaitersQueryKey,
  shouldPaintJournalOccupancyOnServerFree,
  shouldPersistRestaurantTablesCache,
} from '../lib/restaurantFloorSession';
import {
  cacheRestaurantTables,
  getCachedRestaurantTables,
  type CachedRestaurantTable,
} from '../lib/restaurantOfflineCache';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');

function readRepo(rel: string) {
  return readFileSync(resolve(repoRoot, rel), 'utf8');
}

function installMemoryLocalStorage() {
  const store = new Map<string, string>();
  const ls = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
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
  };
  vi.stubGlobal('localStorage', ls);
  return ls;
}

const sampleTable = (id: string, code: string): CachedRestaurantTable => ({
  id,
  code,
  name: code,
  zone: 'MAIN',
  seats: 4,
  status: 'FREE',
  currentOrderId: null,
});

describe('Restaurant workspace cache & session isolation certification', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
  });

  // ── Query key isolation ───────────────────────────────────────────
  it('EVIDENCE: tables/waiters keys include actor id + isOnline; differ per user', () => {
    const aOnline = restaurantTablesQueryKey('user-a', true);
    const bOnline = restaurantTablesQueryKey('user-b', true);
    const aOffline = restaurantTablesQueryKey('user-a', false);

    expect(aOnline).toEqual(['restaurant', 'tables', 'user-a', true]);
    expect(bOnline).toEqual(['restaurant', 'tables', 'user-b', true]);
    expect(aOnline).not.toEqual(bOnline);
    expect(aOnline).not.toEqual(aOffline);

    const wa = restaurantWaitersQueryKey('user-a', true);
    const wb = restaurantWaitersQueryKey('user-b', true);
    expect(wa[2]).toBe('user-a');
    expect(wb[2]).toBe('user-b');
    expect(wa).not.toEqual(wb);

    // Prefix still works for invalidateQueries partial match
    expect(aOnline.slice(0, 2)).toEqual([...RESTAURANT_TABLES_QUERY_PREFIX]);
    expect(wa.slice(0, 2)).toEqual([...RESTAURANT_WAITERS_QUERY_PREFIX]);
  });

  it('EVIDENCE: User B never inherits User A React Query floor after session refresh', () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const keyA = restaurantTablesQueryKey('user-a', true);
    const keyB = restaurantTablesQueryKey('user-b', true);
    const tablesA = [{ id: 't1', code: 'T1' }];
    const tablesB = [{ id: 't2', code: 'T2' }];

    qc.setQueryData(keyA, tablesA);
    qc.setQueryData(keyB, tablesB);
    expect(qc.getQueryData(keyA)).toEqual(tablesA);
    expect(qc.getQueryData(keyB)).toEqual(tablesB);

    // Simulate A logout → B login boundary
    refreshRestaurantFloorSession(qc);

    expect(qc.getQueryData(keyA)).toBeUndefined();
    expect(qc.getQueryData(keyB)).toBeUndefined();
    // Keys remain isolated after re-populate
    qc.setQueryData(keyB, tablesB);
    expect(qc.getQueryData(keyA)).toBeUndefined();
    expect(qc.getQueryData(keyB)).toEqual(tablesB);
  });

  // ── Offline cache empty guard ─────────────────────────────────────
  it('EVIDENCE: offline cache never replaces a valid floor with []', () => {
    expect(shouldPersistRestaurantTablesCache([sampleTable('1', 'T1')], [])).toBe(false);
    expect(shouldPersistRestaurantTablesCache([], [])).toBe(true);
    expect(
      shouldPersistRestaurantTablesCache([], [sampleTable('1', 'T1')]),
    ).toBe(true);
    expect(
      shouldPersistRestaurantTablesCache(
        [sampleTable('1', 'T1')],
        [sampleTable('1', 'T1'), sampleTable('2', 'T2')],
      ),
    ).toBe(true);
    expect(shouldPersistRestaurantTablesCache([sampleTable('1', 'T1')], null)).toBe(
      false,
    );

    cacheRestaurantTables([sampleTable('t1', 'T1'), sampleTable('t2', 'T2')]);
    expect(getCachedRestaurantTables()).toHaveLength(2);

    // Attempt empty overwrite (waiter filtered [] / failed warm success)
    cacheRestaurantTables([]);
    expect(getCachedRestaurantTables()).toHaveLength(2);
    expect(getCachedRestaurantTables().map((t) => t.code).sort()).toEqual(['T1', 'T2']);
  });

  // ── Explicit empty state (no silent blank) ────────────────────────
  it('EVIDENCE: myTablesOnly / ownership never silently blank when server has tables', () => {
    const filtered = resolveDiningFloorEmptyState({
      isLoading: false,
      isError: false,
      isOnline: true,
      serverTableCount: 8,
      diningVisibleCount: 0,
      myTablesOnly: true,
      canEditOthers: false,
    });
    expect(filtered.isEmpty).toBe(true);
    expect(filtered.reason).toBe('filtered_ownership');
    expect(filtered.message).toBeTruthy();
    expect(filtered.message!.length).toBeGreaterThan(20);

    const myOnly = resolveDiningFloorEmptyState({
      isLoading: false,
      isError: false,
      isOnline: true,
      serverTableCount: 8,
      diningVisibleCount: 0,
      myTablesOnly: true,
      canEditOthers: true,
    });
    expect(myOnly.reason).toBe('filtered_my_tables');
    expect(myOnly.message).toMatch(/My tables only/i);

    const hasTiles = resolveDiningFloorEmptyState({
      isLoading: false,
      isError: false,
      isOnline: true,
      serverTableCount: 8,
      diningVisibleCount: 3,
      myTablesOnly: true,
      canEditOthers: false,
    });
    expect(hasTiles.isEmpty).toBe(false);
    expect(hasTiles.message).toBeNull();
  });

  it('EVIDENCE: genuine empty server and offline cache miss explain themselves', () => {
    const empty = resolveDiningFloorEmptyState({
      isLoading: false,
      isError: false,
      isOnline: true,
      serverTableCount: 0,
      diningVisibleCount: 0,
      myTablesOnly: false,
      canEditOthers: true,
    });
    expect(empty.reason).toBe('server_empty');
    expect(empty.message).toMatch(/No dining tables/i);

    const offlineMiss = resolveDiningFloorEmptyState({
      isLoading: false,
      isError: false,
      isOnline: false,
      serverTableCount: 0,
      diningVisibleCount: 0,
      myTablesOnly: false,
      canEditOthers: true,
    });
    expect(offlineMiss.reason).toBe('offline_cache_miss');
    expect(offlineMiss.message).toMatch(/offline cache/i);

    const loading = resolveDiningFloorEmptyState({
      isLoading: true,
      isError: false,
      isOnline: true,
      serverTableCount: 0,
      diningVisibleCount: 0,
      myTablesOnly: false,
      canEditOthers: true,
    });
    expect(loading.reason).toBe('loading');
  });

  // ── Journal overlay cannot steal FREE tables from peers online ────
  it('EVIDENCE: peer ofl_ord journal cannot hide server-FREE tables online', () => {
    // Peer local check on FREE table → do not paint OCCUPIED
    expect(
      shouldPaintJournalOccupancyOnServerFree({
        isOnline: true,
        serverStatus: 'FREE',
        journalOrderId: 'ofl_ord_peer',
        isJournalLocalOrderId: true,
        journalWaiterId: 'waiter-b',
        actorUserId: 'waiter-a',
      }),
    ).toBe(false);

    // Actor's own local check on FREE → still paint (they own the open ticket)
    expect(
      shouldPaintJournalOccupancyOnServerFree({
        isOnline: true,
        serverStatus: 'FREE',
        journalOrderId: 'ofl_ord_mine',
        isJournalLocalOrderId: true,
        journalWaiterId: 'waiter-a',
        actorUserId: 'waiter-a',
      }),
    ).toBe(true);

    // Non-local ghost on FREE online → never paint (reconcile path)
    expect(
      shouldPaintJournalOccupancyOnServerFree({
        isOnline: true,
        serverStatus: 'FREE',
        journalOrderId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        isJournalLocalOrderId: false,
        journalWaiterId: 'waiter-b',
        actorUserId: 'waiter-a',
      }),
    ).toBe(false);

    // Server OCCUPIED still paints journal
    expect(
      shouldPaintJournalOccupancyOnServerFree({
        isOnline: true,
        serverStatus: 'OCCUPIED',
        journalOrderId: 'ofl_ord_x',
        isJournalLocalOrderId: true,
        journalWaiterId: 'waiter-b',
        actorUserId: 'waiter-a',
      }),
    ).toBe(true);
  });

  // ── Source contracts (wiring) ─────────────────────────────────────
  it('EVIDENCE gate: login and logout always refresh restaurant floor session', () => {
    const auth = readRepo('samplepos.client/src/contexts/AuthContext.tsx');
    expect(auth).toMatch(/refreshRestaurantFloorSession/);
    expect(auth).toMatch(/useQueryClient/);
    // Both login success path and logout cleanup
    const loginIdx = auth.indexOf('setIsAuthenticated(true)');
    const refreshAfterLogin = auth.indexOf('refreshRestaurantFloorSession', loginIdx);
    expect(refreshAfterLogin).toBeGreaterThan(loginIdx);

    const logoutBody = auth.slice(auth.indexOf('const logout = useCallback'));
    expect(logoutBody).toMatch(/refreshRestaurantFloorSession\(queryClient\)/);
  });

  it('EVIDENCE gate: RestaurantPosPage uses isolated keys, forced remount refresh, empty state', () => {
    const pos = readRepo('samplepos.client/src/pages/restaurant/RestaurantPosPage.tsx');
    expect(pos).toMatch(/restaurantTablesQueryKey\(user\?\.id,\s*isOnline\)/);
    expect(pos).toMatch(/restaurantWaitersQueryKey\(user\?\.id,\s*isOnline\)/);
    expect(pos).toMatch(/refetchOnMount:\s*['"]always['"]/);
    expect(pos).toMatch(/staleTime:\s*0/);
    expect(pos).toMatch(/enabled:\s*!!restaurantEnabled\s*&&\s*!!user\?\.id/);
    expect(pos).toMatch(/resolveDiningFloorEmptyState/);
    expect(pos).toMatch(/shouldPaintJournalOccupancyOnServerFree/);
    expect(pos).toMatch(/data-dining-floor-empty/);
    expect(pos).toMatch(/data-dining-floor-empty-message/);
    // Must not use legacy identity-free tables key
    expect(pos).not.toMatch(/queryKey:\s*\[\s*['"]restaurant['"]\s*,\s*['"]tables['"]\s*,\s*isOnline\s*\]/);
  });

  it('EVIDENCE gate: offline cache module uses SSOT empty-write protection', () => {
    const cache = readRepo('samplepos.client/src/lib/restaurantOfflineCache.ts');
    expect(cache).toMatch(/shouldPersistRestaurantTablesCache/);
    expect(cache).toMatch(/export function cacheRestaurantTables/);
    const fn = cache.slice(cache.indexOf('export function cacheRestaurantTables'));
    expect(fn).toMatch(/shouldPersistRestaurantTablesCache\(previous,\s*tables\)/);
  });

  it('EVIDENCE: session helpers module is the SSOT for floor isolation rules', () => {
    const ssot = readRepo('samplepos.client/src/lib/restaurantFloorSession.ts');
    expect(ssot).toMatch(/export function restaurantTablesQueryKey/);
    expect(ssot).toMatch(/export function refreshRestaurantFloorSession/);
    expect(ssot).toMatch(/export function shouldPersistRestaurantTablesCache/);
    expect(ssot).toMatch(/export function resolveDiningFloorEmptyState/);
    expect(ssot).toMatch(/export function shouldPaintJournalOccupancyOnServerFree/);
    expect(ssot).toMatch(/removeQueries/);
  });
});
