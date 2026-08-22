/**
 * Restaurant FOH workspace cache & session isolation SSOT.
 *
 * Guarantees (certified by evidence suite):
 * - Floor query keys include actor identity + online context
 * - Login / logout forces a floor session refresh (no cross-user RQ inheritance)
 * - Offline warm tables never lose a non-empty floor to successful []
 * - Dining empty states are explicit (never silent blank when context known)
 * - Tables query keeps last non-empty floor (placeholder) across PIN RQ wipe
 */

import type { QueryClient } from '@tanstack/react-query';

/** Prefix matches invalidateQueries({ queryKey: ['restaurant', 'tables'] }) */
export const RESTAURANT_TABLES_QUERY_PREFIX = ['restaurant', 'tables'] as const;
export const RESTAURANT_WAITERS_QUERY_PREFIX = ['restaurant', 'waiters'] as const;

/**
 * Isolated floor tables key — userId prevents User B from inheriting User A's
 * React Query entry under the global 5-minute staleTime.
 */
export function restaurantTablesQueryKey(
  userId: string | null | undefined,
  isOnline: boolean,
): readonly ['restaurant', 'tables', string, boolean] {
  return ['restaurant', 'tables', userId?.trim() || 'anon', isOnline] as const;
}

export function restaurantWaitersQueryKey(
  userId: string | null | undefined,
  isOnline: boolean,
): readonly ['restaurant', 'waiters', string, boolean] {
  return ['restaurant', 'waiters', userId?.trim() || 'anon', isOnline] as const;
}

/**
 * Keep-last-floor seed (Toast / Samba / Square): never paint an empty dining
 * grid while a refetch is in flight if we already have a warm floor.
 *
 * Login still calls `refreshRestaurantFloorSession` (drops React Query) so
 * User B cannot inherit User A's check payloads. Tables themselves are a
 * tenant floor — seed from localStorage cache when RQ is empty.
 *
 * Never return []: that would look like a successful empty tenant and hide
 * the loading / cache-miss empty states.
 */
export function restaurantTablesPlaceholder<T>(
  previous: readonly T[] | undefined,
  cached: readonly T[],
): T[] | undefined {
  if (Array.isArray(previous) && previous.length > 0) return previous as T[];
  if (Array.isArray(cached) && cached.length > 0) return cached as T[];
  return undefined;
}

/**
 * Toast / Samba: a 200 with [] must not blank a warm floor (proxy glitch,
 * empty RBAC payload). True empty tenant: warm is also empty → [].
 */
export function commitRestaurantTablesResult<T>(
  incoming: readonly T[] | null | undefined,
  warm: readonly T[],
): T[] {
  const next = Array.isArray(incoming) ? [...incoming] : [];
  if (next.length === 0 && Array.isArray(warm) && warm.length > 0) {
    return [...warm] as T[];
  }
  return next as T[];
}

export type RestaurantTablesQueryHooks<T> = {
  userId: string | null | undefined;
  isOnline: boolean;
  enabled: boolean;
  fetchOnline: () => Promise<readonly T[]>;
  getCached: () => readonly T[];
  persistCache: (rows: T[]) => void;
  isBackendUnavailable: (err: unknown) => boolean;
  /** Tests pass false so Vitest does not keep a 15s poll alive. */
  pollIntervalMs?: number | false;
};

/**
 * Dining-tables useQuery options — page and proofs must share this factory.
 * Login still removeQueries; placeholder + commit keep tiles painted.
 */
export function buildRestaurantTablesQueryOptions<T>(args: RestaurantTablesQueryHooks<T>) {
  const poll =
    args.pollIntervalMs !== undefined
      ? args.pollIntervalMs
      : args.isOnline
        ? 15_000
        : false;

  return {
    queryKey: restaurantTablesQueryKey(args.userId, args.isOnline),
    queryFn: async (): Promise<T[]> => {
      if (!args.isOnline) {
        return [...args.getCached()] as T[];
      }
      try {
        const incoming = await args.fetchOnline();
        const rows = Array.isArray(incoming) ? ([...incoming] as T[]) : [];
        args.persistCache(rows);
        return commitRestaurantTablesResult(rows, args.getCached());
      } catch (err) {
        if (args.isBackendUnavailable(err)) {
          const cached = [...args.getCached()] as T[];
          if (cached.length > 0) return cached;
        }
        throw err;
      }
    },
    enabled: args.enabled,
    staleTime: 10_000,
    refetchOnMount: true as const,
    refetchInterval: poll,
    placeholderData: (previousData: T[] | undefined) =>
      restaurantTablesPlaceholder(previousData, args.getCached()),
    retry: (failureCount: number, error: unknown) => {
      if (args.isBackendUnavailable(error)) return failureCount < 6;
      const status =
        (error as { httpStatus?: number; response?: { status?: number } })?.httpStatus ??
        (error as { response?: { status?: number } })?.response?.status;
      if (status && status >= 400 && status < 500) return false;
      return failureCount < 1;
    },
    retryDelay: (attempt: number) => Math.min(500 * 2 ** attempt, 8_000),
  };
}

/**
 * On every auth boundary: drop cached floor payloads then mark for refetch.
 * removeQueries first so remount never paints the previous actor's list.
 */
export function refreshRestaurantFloorSession(queryClient: QueryClient): void {
  queryClient.removeQueries({ queryKey: [...RESTAURANT_TABLES_QUERY_PREFIX] });
  queryClient.removeQueries({ queryKey: [...RESTAURANT_WAITERS_QUERY_PREFIX] });
  // Checks are table-scoped and may carry waiter-sensitive sibling paint.
  queryClient.removeQueries({ queryKey: ['restaurant', 'check'] });
  void queryClient.invalidateQueries({ queryKey: [...RESTAURANT_TABLES_QUERY_PREFIX] });
  void queryClient.invalidateQueries({ queryKey: [...RESTAURANT_WAITERS_QUERY_PREFIX] });
  void queryClient.invalidateQueries({ queryKey: ['restaurant', 'check'] });
}

/**
 * Offline warm-slice rule: never replace a valid floor with an empty success payload.
 * True empty tenants still persist [] when previous warm is also empty.
 */
export function shouldPersistRestaurantTablesCache(
  previous: readonly unknown[],
  next: readonly unknown[] | null | undefined,
): boolean {
  if (!Array.isArray(next)) return false;
  if (previous.length > 0 && next.length === 0) return false;
  return true;
}

export type DiningFloorEmptyReason =
  | 'none'
  | 'loading'
  | 'error'
  | 'offline_cache_miss'
  | 'server_empty'
  | 'filtered_my_tables'
  | 'filtered_ownership';

export type DiningFloorEmptyState = {
  isEmpty: boolean;
  reason: DiningFloorEmptyReason;
  /** User-visible copy when isEmpty — null only when not empty. */
  message: string | null;
};

/**
 * Explicit empty-state for the dining grid — never silent when we know why.
 * Service-lane strip is separate; this only governs dining tiles.
 */
export function resolveDiningFloorEmptyState(input: {
  isLoading: boolean;
  isError: boolean;
  isOnline: boolean;
  /** Rows from last successful tables query (pre client filter). */
  serverTableCount: number;
  /** Dining tiles after myTablesOnly + service exclusion. */
  diningVisibleCount: number;
  myTablesOnly: boolean;
  canEditOthers: boolean;
}): DiningFloorEmptyState {
  if (input.isLoading && input.serverTableCount === 0) {
    return { isEmpty: true, reason: 'loading', message: 'Loading tables…' };
  }
  if (input.isError && input.serverTableCount === 0) {
    return {
      isEmpty: true,
      reason: 'error',
      message: 'Failed to load tables. Check connection and try again.',
    };
  }
  if (input.diningVisibleCount > 0) {
    return { isEmpty: false, reason: 'none', message: null };
  }
  if (input.serverTableCount === 0) {
    if (!input.isOnline) {
      return {
        isEmpty: true,
        reason: 'offline_cache_miss',
        message:
          'No tables in offline cache. Connect once while restaurant mode is on to warm the floor.',
      };
    }
    return {
      isEmpty: true,
      reason: 'server_empty',
      message: 'No dining tables yet. Use Add table (manage) or create tables in setup.',
    };
  }
  // Server returned rows but none paint as dining after filters.
  if (input.myTablesOnly || !input.canEditOthers) {
    return {
      isEmpty: true,
      reason: input.canEditOthers ? 'filtered_my_tables' : 'filtered_ownership',
      message: input.canEditOthers
        ? 'My tables only is on — free tables and your occupied tables are hidden or none are free/yours. Turn off “My tables only” to see the full floor.'
        : 'No free tables and no tables assigned to you. Peer occupied tables are hidden. Ask a manager to reassign, or wait for a free table.',
    };
  }
  return {
    isEmpty: true,
    reason: 'server_empty',
    message: 'No dining tables to show (service counters only, or filtered).',
  };
}

/**
 * Online floor: peer local-only journal checks must not steal FREE tables from other staff.
 * Owner of an ofl_ord_* check still sees their local open ticket on a server-FREE table.
 */
export function shouldPaintJournalOccupancyOnServerFree(input: {
  isOnline: boolean;
  serverStatus: string;
  journalOrderId: string | null | undefined;
  isJournalLocalOrderId: boolean;
  journalWaiterId: string | null | undefined;
  actorUserId: string | null | undefined;
}): boolean {
  if (!input.isOnline) return true;
  if (input.serverStatus !== 'FREE') return true;
  // Online + server FREE: only keep occupancy for the actor's own local-only check.
  if (!input.isJournalLocalOrderId) return false;
  if (!input.actorUserId || !input.journalWaiterId) return false;
  return input.journalWaiterId === input.actorUserId;
}

/**
 * Precise floor money (2dp) — table tiles must match ticket strip without refresh.
 */
export function roundFloorMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function sumTicketTabTotals(
  tabs: ReadonlyArray<{ totalAmount?: string | number | null }>,
): number {
  return roundFloorMoney(tabs.reduce((s, t) => s + (Number(t.totalAmount) || 0), 0));
}

export type FloorTicketTabLike = {
  id: string;
  orderNumber: string;
  totalAmount: string | number;
};

export type FloorTableFigurePatch = {
  openCheckCount: number;
  openChecksTotal: string | null;
  orderTotal: string | null;
  status: 'FREE' | 'OCCUPIED';
  currentOrderId: string | null;
  orderNumber: string | null;
};

/**
 * Derive floor tile figures from open ticket tabs (party SSOT).
 * Empty tabs ⇒ FREE; otherwise OCCUPIED with exact count + summed totals.
 */
export function floorFiguresFromTicketTabs(
  tabs: ReadonlyArray<FloorTicketTabLike>,
): FloorTableFigurePatch {
  const open = tabs.filter((t) => !!t?.id);
  if (open.length === 0) {
    return {
      openCheckCount: 0,
      openChecksTotal: null,
      orderTotal: null,
      status: 'FREE',
      currentOrderId: null,
      orderNumber: null,
    };
  }
  const total = sumTicketTabTotals(open);
  const totalStr = total.toFixed(2);
  const focus = open[open.length - 1]!;
  return {
    openCheckCount: open.length,
    openChecksTotal: totalStr,
    orderTotal: totalStr,
    status: 'OCCUPIED',
    currentOrderId: focus.id,
    orderNumber: focus.orderNumber || null,
  };
}

/**
 * Patch one table row inside a tables query payload (immutable).
 */
export function patchTableRowFloorFigures<T extends { id: string }>(
  rows: readonly T[] | null | undefined,
  tableId: string,
  figures: FloorTableFigurePatch,
): T[] {
  const list = Array.isArray(rows) ? [...rows] : [];
  return list.map((t) =>
    t.id === tableId
      ? ({
          ...t,
          status: figures.status,
          openCheckCount: figures.openCheckCount,
          openChecksTotal: figures.openChecksTotal,
          orderTotal: figures.orderTotal,
          currentOrderId: figures.currentOrderId,
          orderNumber: figures.orderNumber,
          ...(figures.status === 'FREE'
            ? { guestName: null, waiterId: null, waiterName: null }
            : {}),
        } as T)
      : t,
  );
}
