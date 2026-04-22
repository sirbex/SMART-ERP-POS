/**
 * Offline Event Selectors
 *
 * Pure functions that derive UI state by replaying the immutable event journal.
 * The UI must NEVER read from mutable queues — only from these selectors.
 *
 * All selectors are side-effect-free and deterministic given the same inputs.
 */

import type { PosOfflineEvent, EventLine, SyncStateMap, SyncStatus, SyncStateEntry } from './offlineEventJournal';

// ── Derived Types ─────────────────────────────────────────────

/**
 * Derived view of an offline order, reconstructed by replaying
 * ORDER_CREATED → ORDER_UPDATED → ORDER_CANCELLED / SALE_COMPLETED events.
 */
export interface DerivedOrder {
    /** Stable order ID (shared across all ORDER_* and SALE_COMPLETED events) */
    orderId: string;
    /** Human-readable ID shown in UI */
    offlineId: string;
    customerId?: string;
    notes?: string;
    lines: EventLine[];
    status: 'OPEN' | 'CANCELLED' | 'COMPLETED';
    createdTs: number;
    updatedTs: number;
    /** Sync status of the ORDER_CREATED event key */
    syncStatus: SyncStatus;
    /** Idempotency key of the ORDER_CREATED event */
    key: string;
}

/**
 * Derived view of an offline completed sale, built from a SALE_COMPLETED event.
 * This is what the UI shows in the sync status panel and queue views.
 */
export interface DerivedSale {
    /** Idempotency key of the SALE_COMPLETED event */
    key: string;
    orderId: string;
    offlineId: string;
    customerId?: string;
    lineCount: number;
    totalAmount: number;
    ts: number;
    syncStatus: SyncStatus;
    syncError?: string;
}

// ── Helpers ───────────────────────────────────────────────────

function statusFromEntry(entry: SyncStateEntry | undefined): SyncStatus {
    return entry?.status ?? 'PENDING';
}

// ── Selectors ─────────────────────────────────────────────────

/**
 * Derive the current state of all offline orders by replaying the event journal.
 * Returns only orders that have not been fully completed.
 */
export function deriveOpenOrders(
    events: PosOfflineEvent[],
    syncState: SyncStateMap
): DerivedOrder[] {
    // Map: orderId → latest derived state
    const orderMap = new Map<string, DerivedOrder>();

    // Set of orderIds that have been completed (SALE_COMPLETED) or cancelled
    const completedOrderIds = new Set<string>();
    const cancelledOrderIds = new Set<string>();

    for (const event of events) {
        switch (event.eventType) {
            case 'ORDER_CREATED': {
                const entry = syncState[event.key];
                orderMap.set(event.orderId, {
                    orderId: event.orderId,
                    offlineId: event.offlineId,
                    customerId: event.customerId,
                    notes: event.notes,
                    lines: event.lines,
                    status: 'OPEN',
                    createdTs: event.ts,
                    updatedTs: event.ts,
                    syncStatus: statusFromEntry(entry),
                    key: event.key,
                });
                break;
            }
            case 'ORDER_UPDATED': {
                const existing = orderMap.get(event.orderId);
                if (existing) {
                    orderMap.set(event.orderId, {
                        ...existing,
                        lines: event.lines,
                        customerId: event.customerId ?? existing.customerId,
                        notes: event.notes ?? existing.notes,
                        updatedTs: event.ts,
                    });
                }
                break;
            }
            case 'ORDER_CANCELLED': {
                cancelledOrderIds.add(event.orderId);
                const existing = orderMap.get(event.orderId);
                if (existing) {
                    orderMap.set(event.orderId, { ...existing, status: 'CANCELLED', updatedTs: event.ts });
                }
                break;
            }
            case 'SALE_COMPLETED': {
                completedOrderIds.add(event.orderId);
                const existing = orderMap.get(event.orderId);
                if (existing) {
                    orderMap.set(event.orderId, { ...existing, status: 'COMPLETED', updatedTs: event.ts });
                }
                break;
            }
            default:
                break;
        }
    }

    return Array.from(orderMap.values()).filter(
        (o) => o.status === 'OPEN' && !cancelledOrderIds.has(o.orderId)
    );
}

/**
 * Derive all completed offline sales from SALE_COMPLETED events in the journal.
 * Excludes CANCELLED entries (cancelled before sync).
 */
export function deriveCompletedSales(
    events: PosOfflineEvent[],
    syncState: SyncStateMap
): DerivedSale[] {
    const sales: DerivedSale[] = [];

    for (const event of events) {
        if (event.eventType !== 'SALE_COMPLETED') continue;

        const entry = syncState[event.key];
        const status = statusFromEntry(entry);

        // Skip events that were cancelled before reaching the server
        if (status === 'CANCELLED') continue;

        sales.push({
            key: event.key,
            orderId: event.orderId,
            offlineId: event.offlineId,
            customerId: event.customerId,
            lineCount: event.lines.length,
            totalAmount: event.totalAmount,
            ts: event.ts,
            syncStatus: status,
            syncError: entry?.error,
        });
    }

    return sales;
}

/**
 * Derive the complete state of a single order by replaying all events
 * for that orderId in chronological order.
 *
 * Returns null if no ORDER_CREATED event is found for that orderId.
 */
export function deriveOrderState(
    orderId: string,
    events: PosOfflineEvent[],
    syncState: SyncStateMap
): DerivedOrder | null {
    const orderEvents = events
        .filter((e) =>
            (e.eventType === 'ORDER_CREATED' ||
                e.eventType === 'ORDER_UPDATED' ||
                e.eventType === 'ORDER_CANCELLED' ||
                e.eventType === 'SALE_COMPLETED') &&
            'orderId' in e &&
            e.orderId === orderId
        )
        .sort((a, b) => a.ts - b.ts);

    let derived: DerivedOrder | null = null;

    for (const event of orderEvents) {
        switch (event.eventType) {
            case 'ORDER_CREATED': {
                const entry = syncState[event.key];
                derived = {
                    orderId: event.orderId,
                    offlineId: event.offlineId,
                    customerId: event.customerId,
                    notes: event.notes,
                    lines: event.lines,
                    status: 'OPEN',
                    createdTs: event.ts,
                    updatedTs: event.ts,
                    syncStatus: statusFromEntry(entry),
                    key: event.key,
                };
                break;
            }
            case 'ORDER_UPDATED': {
                if (derived) {
                    derived = {
                        ...derived,
                        lines: event.lines,
                        customerId: event.customerId ?? derived.customerId,
                        notes: event.notes ?? derived.notes,
                        updatedTs: event.ts,
                    };
                }
                break;
            }
            case 'ORDER_CANCELLED': {
                if (derived) {
                    derived = { ...derived, status: 'CANCELLED', updatedTs: event.ts };
                }
                break;
            }
            case 'SALE_COMPLETED': {
                if (derived) {
                    derived = { ...derived, status: 'COMPLETED', updatedTs: event.ts };
                }
                break;
            }
            default:
                break;
        }
    }

    return derived;
}

/**
 * Count events by sync status (for status panel badges).
 */
export function countBySyncStatus(
    events: PosOfflineEvent[],
    syncState: SyncStateMap,
    eventTypes?: PosOfflineEvent['eventType'][]
): Record<SyncStatus, number> {
    const counts: Record<SyncStatus, number> = {
        PENDING: 0,
        SYNCED: 0,
        REVIEW: 0,
        FAILED: 0,
        CANCELLED: 0,
    };

    for (const event of events) {
        if (eventTypes && !eventTypes.includes(event.eventType)) continue;
        const entry = syncState[event.key];
        const status = statusFromEntry(entry);
        counts[status]++;
    }

    return counts;
}
