/**
 * Restaurant FOH workspace cache & session isolation SSOT.
 *
 * Guarantees (certified by evidence suite):
 * - Floor query keys include actor identity + online context
 * - Login / logout forces a floor session refresh (no cross-user RQ inheritance)
 * - Offline warm tables never lose a non-empty floor to successful []
 * - Dining empty states are explicit (never silent blank when context known)
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
