/**
 * PROOF — Toast/Samba keep-last dining floor (no vanish-then-show).
 *
 * Exercises the SAME query factory the FOH page uses, through TanStack
 * QueryObserver (real isLoading / isPlaceholderData / data). Not regex,
 * not assumed RQ semantics.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  QueryClient,
  QueryObserver,
  type QueryObserverResult,
} from '@tanstack/react-query';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildRestaurantTablesQueryOptions,
  commitRestaurantTablesResult,
  refreshRestaurantFloorSession,
  resolveDiningFloorEmptyState,
  restaurantTablesPlaceholder,
  restaurantTablesQueryKey,
} from './restaurantFloorSession';
import {
  cacheRestaurantTables,
  getCachedRestaurantTables,
  type CachedRestaurantTable,
} from './restaurantOfflineCache';
import { evictReconstructibleCaches, RECONSTRUCTIBLE_CACHE_KEYS } from './originStorageQuota';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');

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

function table(
  id: string,
  code: string,
  status: 'FREE' | 'OCCUPIED' = 'FREE',
): CachedRestaurantTable {
  return {
    id,
    code,
    name: code,
    zone: 'MAIN',
    seats: 4,
    status,
    currentOrderId: status === 'OCCUPIED' ? `ord-${id}` : null,
  };
}

function floorView(result: QueryObserverResult<CachedRestaurantTable[]>, isOnline = true) {
  const rows = result.data || [];
  return resolveDiningFloorEmptyState({
    isLoading: result.isLoading,
    isError: result.isError,
    isOnline,
    serverTableCount: rows.length,
    diningVisibleCount: rows.length,
    myTablesOnly: false,
    canEditOthers: true,
  });
}

async function waitForResult(
  observer: QueryObserver<CachedRestaurantTable[]>,
  pred: (r: QueryObserverResult<CachedRestaurantTable[]>) => boolean,
  ms = 2000,
): Promise<QueryObserverResult<CachedRestaurantTable[]>> {
  const current = observer.getCurrentResult();
  if (pred(current)) return current;
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      unsub();
      reject(new Error(`floor observer timeout: ${JSON.stringify({
        status: observer.getCurrentResult().status,
        isLoading: observer.getCurrentResult().isLoading,
        isPlaceholderData: observer.getCurrentResult().isPlaceholderData,
        len: observer.getCurrentResult().data?.length,
      })}`));
    }, ms);
    const unsub = observer.subscribe((r) => {
      if (pred(r)) {
        clearTimeout(t);
        unsub();
        resolve(r);
      }
    });
  });
}

describe('FOH keep-last floor — QueryObserver proofs', () => {
  let qc: QueryClient;
  const observers: QueryObserver<CachedRestaurantTable[]>[] = [];

  function hooks(partial: {
    userId?: string;
    isOnline?: boolean;
    enabled?: boolean;
    fetchOnline?: () => Promise<readonly CachedRestaurantTable[]>;
    isBackendUnavailable?: (err: unknown) => boolean;
  } = {}) {
    return buildRestaurantTablesQueryOptions<CachedRestaurantTable>({
      userId: partial.userId ?? 'waiter-b',
      isOnline: partial.isOnline ?? true,
      enabled: partial.enabled ?? true,
      fetchOnline: partial.fetchOnline ?? (async () => getCachedRestaurantTables()),
      getCached: () => getCachedRestaurantTables(),
      persistCache: (rows) => cacheRestaurantTables(rows),
      isBackendUnavailable: partial.isBackendUnavailable ?? (() => false),
      pollIntervalMs: false,
    });
  }

  function observe(opts: ReturnType<typeof hooks>) {
    const observer = new QueryObserver(qc, { ...opts, retry: false });
    observers.push(observer);
    observer.subscribe(() => {});
    return observer;
  }

  beforeEach(() => {
    installMemoryLocalStorage();
    qc = new QueryClient({
      defaultOptions: { queries: { retry: false, refetchInterval: false } },
    });
  });

  afterEach(() => {
    while (observers.length) observers.pop()?.destroy();
    qc.clear();
  });

  it('commitRestaurantTablesResult never returns [] over a warm floor', () => {
    const warm = [table('t1', 'T1'), table('t2', 'T2')];
    expect(commitRestaurantTablesResult([], warm).map((t) => t.code)).toEqual(['T1', 'T2']);
    expect(commitRestaurantTablesResult(null, warm)).toHaveLength(2);
    expect(commitRestaurantTablesResult(undefined, warm)).toHaveLength(2);
    const occupied = [table('t1', 'T1', 'OCCUPIED')];
    expect(commitRestaurantTablesResult(occupied, warm)[0]!.status).toBe('OCCUPIED');
    expect(commitRestaurantTablesResult([], [])).toEqual([]);
  });

  it('PIN wipe: RQ empty + warm cache ⇒ tiles stay (not loading empty)', async () => {
    const warm = [table('t1', 'T1'), table('t2', 'T2')];
    cacheRestaurantTables(warm);
    qc.setQueryData(restaurantTablesQueryKey('waiter-a', true), warm);
    qc.setQueryData(['restaurant', 'check', 't1', 'ord-t1', true], { order: { id: 'ord-t1' } });

    refreshRestaurantFloorSession(qc);
    expect(qc.getQueryData(restaurantTablesQueryKey('waiter-a', true))).toBeUndefined();
    expect(qc.getQueryData(['restaurant', 'check', 't1', 'ord-t1', true])).toBeUndefined();
    expect(getCachedRestaurantTables()).toHaveLength(2);

    let release!: (rows: CachedRestaurantTable[]) => void;
    const fetchOnline = () =>
      new Promise<CachedRestaurantTable[]>((r) => {
        release = r;
      });

    const observer = observe(hooks({ userId: 'waiter-b', fetchOnline }));
    const first = observer.getCurrentResult();
    expect(first.isPlaceholderData).toBe(true);
    expect(first.isLoading).toBe(false);
    expect(first.data?.map((t) => t.code).sort()).toEqual(['T1', 'T2']);
    const view = floorView(first);
    expect(view.isEmpty).toBe(false);
    expect(view.reason).toBe('none');
    expect(view.message).toBeNull();

    release([table('t1', 'T1', 'OCCUPIED'), table('t2', 'T2')]);
    const done = await waitForResult(observer, (r) => r.isSuccess && r.isPlaceholderData === false);
    expect(done.data?.[0]?.status).toBe('OCCUPIED');
    expect(floorView(done).isEmpty).toBe(false);
  });

  it('no cache + RQ wipe ⇒ loading empty until fetch — then tiles (honest gap)', async () => {
    expect(getCachedRestaurantTables()).toEqual([]);
    refreshRestaurantFloorSession(qc);

    let release!: (rows: CachedRestaurantTable[]) => void;
    const fetchOnline = () =>
      new Promise<CachedRestaurantTable[]>((r) => {
        release = r;
      });
    const observer = observe(hooks({ fetchOnline }));
    const first = observer.getCurrentResult();
    expect(restaurantTablesPlaceholder(undefined, [])).toBeUndefined();
    expect(first.data).toBeUndefined();
    expect(first.isLoading).toBe(true);
    const loading = floorView(first);
    expect(loading.isEmpty).toBe(true);
    expect(loading.reason).toBe('loading');
    expect(loading.message).toMatch(/Loading tables/i);

    release([table('t1', 'T1')]);
    const done = await waitForResult(observer, (r) => (r.data?.length ?? 0) > 0 && !r.isPlaceholderData);
    expect(floorView(done).isEmpty).toBe(false);
    expect(done.data?.[0]?.code).toBe('T1');
  });

  it('quota evicts restaurant_offline_tables ⇒ no fake floor, then listTables paints', async () => {
    expect(RECONSTRUCTIBLE_CACHE_KEYS).toContain('restaurant_offline_tables');
    cacheRestaurantTables([table('t1', 'T1')]);
    expect(getCachedRestaurantTables()).toHaveLength(1);
    evictReconstructibleCaches();
    expect(localStorage.getItem('restaurant_offline_tables')).toBeNull();
    expect(getCachedRestaurantTables()).toEqual([]);

    let release!: (rows: CachedRestaurantTable[]) => void;
    const observer = observe(
      hooks({
        fetchOnline: () =>
          new Promise<CachedRestaurantTable[]>((r) => {
            release = r;
          }),
      }),
    );
    expect(observer.getCurrentResult().isLoading).toBe(true);
    expect(floorView(observer.getCurrentResult()).reason).toBe('loading');

    release([table('t1', 'T1'), table('t3', 'T3')]);
    const done = await waitForResult(observer, (r) => (r.data?.length ?? 0) === 2);
    expect(done.data?.map((t) => t.code).sort()).toEqual(['T1', 'T3']);
    expect(floorView(done).isEmpty).toBe(false);
  });

  it('successful [] over warm floor does not blank tiles (commit + persist guard)', async () => {
    cacheRestaurantTables([table('t1', 'T1'), table('t2', 'T2')]);
    const observer = observe(hooks({ fetchOnline: async () => [] }));
    const done = await waitForResult(observer, (r) => r.isSuccess && r.isPlaceholderData === false);
    expect(done.data).toHaveLength(2);
    expect(done.data?.map((t) => t.code).sort()).toEqual(['T1', 'T2']);
    expect(getCachedRestaurantTables()).toHaveLength(2);
    expect(floorView(done).isEmpty).toBe(false);
  });

  it('true empty tenant (no warm) accepts [] as server_empty', async () => {
    const observer = observe(hooks({ fetchOnline: async () => [] }));
    const done = await waitForResult(observer, (r) => r.isSuccess);
    expect(done.data).toEqual([]);
    const view = floorView(done);
    expect(view.isEmpty).toBe(true);
    expect(view.reason).toBe('server_empty');
    expect(view.message).toMatch(/No dining tables/i);
  });

  it('backend unavailable + warm cache returns cache (no blank)', async () => {
    cacheRestaurantTables([table('t1', 'T1')]);
    const observer = observe(
      hooks({
        fetchOnline: async () => {
          throw new Error('ECONNREFUSED');
        },
        isBackendUnavailable: () => true,
      }),
    );
    const done = await waitForResult(observer, (r) => r.isSuccess);
    expect(done.data).toHaveLength(1);
    expect(done.data?.[0]?.code).toBe('T1');
    expect(floorView(done).isEmpty).toBe(false);
  });

  it('offline queryFn is the warm cache (sync, no vanish)', async () => {
    cacheRestaurantTables([table('t4', 'T4')]);
    const observer = observe(
      hooks({
        isOnline: false,
        fetchOnline: async () => {
          throw new Error('must not call online fetch while offline');
        },
      }),
    );
    const done = await waitForResult(observer, (r) => r.isSuccess);
    expect(done.data?.[0]?.code).toBe('T4');
    expect(floorView(done, false).isEmpty).toBe(false);
  });

  it('online→offline key change keeps last floor via previous or cache', async () => {
    const onlineRows = [table('t1', 'T1', 'OCCUPIED')];
    cacheRestaurantTables(onlineRows);
    const online = observe(hooks({ userId: 'w1', isOnline: true, fetchOnline: async () => onlineRows }));
    await waitForResult(online, (r) => r.isSuccess && r.data?.[0]?.status === 'OCCUPIED');

    const offline = observe(
      hooks({
        userId: 'w1',
        isOnline: false,
        fetchOnline: async () => {
          throw new Error('offline must not fetch');
        },
      }),
    );
    const done = await waitForResult(offline, (r) => (r.data?.length ?? 0) > 0);
    expect(done.data?.[0]?.code).toBe('T1');
    expect(floorView(done, false).isEmpty).toBe(false);
  });

  it('User B placeholder is tenant cache, not User A check payload', async () => {
    cacheRestaurantTables([table('t1', 'T1')]);
    qc.setQueryData(['restaurant', 'check', 't1', 'secret-a', true], {
      order: { id: 'secret-a', waiterId: 'waiter-a' },
    });
    refreshRestaurantFloorSession(qc);
    expect(qc.getQueryData(['restaurant', 'check', 't1', 'secret-a', true])).toBeUndefined();

    const observer = observe(
      hooks({
        userId: 'waiter-b',
        fetchOnline: () => new Promise(() => {}),
      }),
    );
    const first = observer.getCurrentResult();
    expect(first.data?.[0]?.id).toBe('t1');
    expect(JSON.stringify(first.data)).not.toMatch(/secret-a/);
  });

  it('FOH page executes the shared query factory (no private queryFn fork)', () => {
    const pos = readFileSync(resolve(repoRoot, 'src/pages/restaurant/RestaurantPosPage.tsx'), 'utf8');
    expect(pos).toMatch(/buildRestaurantTablesQueryOptions\s*</);
    expect(pos).toMatch(/persistCache:\s*\(rows\)\s*=>\s*cacheRestaurantTables\(rows\)/);
    expect(pos).toMatch(/getCached:\s*\(\)\s*=>\s*getCachedRestaurantTables\(\)/);
    expect(pos).not.toMatch(
      /queryKey:\s*restaurantTablesQueryKey\(user\?\.id,\s*isOnline\),\s*\n\s*queryFn:/,
    );
  });
});
