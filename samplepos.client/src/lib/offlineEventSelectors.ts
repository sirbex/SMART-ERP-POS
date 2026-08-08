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
    /** Phase 5.1 restaurant */
    channel?: 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';
    tableId?: string;
    tableCode?: string;
    tableName?: string;
    waiterId?: string;
    waiterName?: string;
    guestName?: string | null;
    guestPhone?: string | null;
    deliveryAddress?: string | null;
    pickupLabel?: string | null;
    /** Local status for FOH */
    kotPrinted?: boolean;
    billPrinted?: boolean;
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
                    channel: event.channel,
                    tableId: event.tableId,
                    tableCode: event.tableCode,
                    tableName: event.tableName,
                    waiterId: event.waiterId,
                    waiterName: event.waiterName,
                    guestName: event.guestName,
                    guestPhone: event.guestPhone,
                    deliveryAddress: event.deliveryAddress,
                    pickupLabel: event.pickupLabel,
                    kotPrinted: false,
                    billPrinted: false,
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
                        channel: event.channel ?? existing.channel,
                        tableId: event.tableId ?? existing.tableId,
                        tableCode: event.tableCode ?? existing.tableCode,
                        tableName: event.tableName ?? existing.tableName,
                        waiterId: event.waiterId ?? existing.waiterId,
                        waiterName: event.waiterName ?? existing.waiterName,
                        guestName: event.guestName !== undefined ? event.guestName : existing.guestName,
                        guestPhone: event.guestPhone !== undefined ? event.guestPhone : existing.guestPhone,
                        deliveryAddress:
                            event.deliveryAddress !== undefined
                                ? event.deliveryAddress
                                : existing.deliveryAddress,
                        pickupLabel:
                            event.pickupLabel !== undefined ? event.pickupLabel : existing.pickupLabel,
                    });
                }
                break;
            }
            case 'RESTAURANT_KOT_FIRED': {
                const existing = orderMap.get(event.orderId);
                if (existing) {
                    const sentIds = new Set(event.lines.map((l) => l.lineId));
                    const firedAt = new Date(event.ts).toISOString();
                    orderMap.set(event.orderId, {
                        ...existing,
                        kotPrinted: true,
                        updatedTs: event.ts,
                        lines: existing.lines.map((line) =>
                            line.lineId && sentIds.has(line.lineId)
                                ? { ...line, kitchenSentAt: line.kitchenSentAt || firedAt }
                                : line,
                        ),
                    });
                }
                break;
            }
            case 'RESTAURANT_CHECK_TRANSFERRED': {
                const existing = orderMap.get(event.orderId);
                if (existing) {
                    orderMap.set(event.orderId, {
                        ...existing,
                        tableId: event.toTableId,
                        tableCode: event.toTableCode ?? existing.tableCode,
                        tableName: event.toTableName ?? existing.tableName,
                        channel: event.channel ?? existing.channel,
                        updatedTs: event.ts,
                    });
                }
                break;
            }
            case 'RESTAURANT_CHECK_MERGED': {
                const primary = orderMap.get(event.primaryOrderId);
                const secondary = orderMap.get(event.secondaryOrderId);
                if (primary && secondary) {
                    orderMap.set(event.primaryOrderId, {
                        ...primary,
                        lines: [...primary.lines, ...secondary.lines],
                        updatedTs: event.ts,
                    });
                }
                cancelledOrderIds.add(event.secondaryOrderId);
                if (secondary) {
                    orderMap.set(event.secondaryOrderId, {
                        ...secondary,
                        status: 'CANCELLED',
                        updatedTs: event.ts,
                    });
                }
                break;
            }
            case 'RESTAURANT_CHECK_SPLIT': {
                const source = orderMap.get(event.sourceOrderId);
                if (!source) break;
                const moveSet = new Set(event.lineIds);
                const qtyBy = event.quantityByLineId || {};
                const remaining: typeof source.lines = [];
                for (const l of source.lines) {
                    if (!l.lineId || !moveSet.has(l.lineId)) {
                        remaining.push(l);
                        continue;
                    }
                    const moveQty = qtyBy[l.lineId] ?? l.quantity;
                    if (moveQty >= l.quantity - 1e-9) continue;
                    const left = l.quantity - moveQty;
                    remaining.push({
                        ...l,
                        quantity: left,
                        subtotal: left * l.unitPrice,
                        discountAmount:
                            l.discountAmount != null && l.quantity > 0
                                ? (l.discountAmount * left) / l.quantity
                                : l.discountAmount,
                    });
                }
                const moved =
                    event.movedLines?.length > 0
                        ? event.movedLines
                        : source.lines
                              .filter((l) => l.lineId && moveSet.has(l.lineId))
                              .map((l) => {
                                  const moveQty = qtyBy[l.lineId!] ?? l.quantity;
                                  return {
                                      ...l,
                                      lineId: l.lineId,
                                      quantity: moveQty,
                                      subtotal: moveQty * l.unitPrice,
                                  };
                              });
                orderMap.set(event.sourceOrderId, {
                    ...source,
                    lines: remaining,
                    updatedTs: event.ts,
                });
                const entry = syncState[event.key];
                orderMap.set(event.newOrderId, {
                    orderId: event.newOrderId,
                    offlineId: event.newOfflineId,
                    lines: moved,
                    status: 'OPEN',
                    createdTs: event.ts,
                    updatedTs: event.ts,
                    syncStatus: statusFromEntry(entry),
                    key: event.key,
                    channel: event.channel ?? source.channel,
                    tableId: event.targetTableId,
                    tableCode: event.targetTableCode ?? source.tableCode,
                    tableName: event.targetTableName ?? source.tableName,
                    waiterId: event.waiterId ?? source.waiterId,
                    waiterName: event.waiterName ?? source.waiterName,
                    guestName: event.guestName !== undefined ? event.guestName : source.guestName,
                    guestPhone: event.guestPhone !== undefined ? event.guestPhone : source.guestPhone,
                    deliveryAddress:
                        event.deliveryAddress !== undefined
                            ? event.deliveryAddress
                            : source.deliveryAddress,
                    pickupLabel:
                        event.pickupLabel !== undefined ? event.pickupLabel : source.pickupLabel,
                    kotPrinted: moved.some((l) => !!l.kitchenSentAt),
                    billPrinted: false,
                });
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
                    const d = derived as DerivedOrder;
                    derived = {
                        ...d,
                        lines: (event as { lines: DerivedOrder['lines'] }).lines,
                        customerId: (event as { customerId?: string }).customerId ?? d.customerId,
                        notes: (event as { notes?: string }).notes ?? d.notes,
                        updatedTs: event.ts,
                    };
                }
                break;
            }
            case 'ORDER_CANCELLED': {
                if (derived) {
                    derived = { ...(derived as DerivedOrder), status: 'CANCELLED', updatedTs: event.ts };
                }
                break;
            }
            case 'SALE_COMPLETED': {
                if (derived) {
                    derived = { ...(derived as DerivedOrder), status: 'COMPLETED', updatedTs: event.ts };
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

/**
 * Phase 5.1 — open restaurant checks derived from journal (table-linked ORDER_*).
 */
export function deriveRestaurantOpenChecks(
    events: PosOfflineEvent[],
    syncState: SyncStateMap,
): DerivedOrder[] {
    return deriveOpenOrders(events, syncState).filter(
        (o) => !!o.tableId && (o.channel === 'DINE_IN' || o.channel === 'TAKEAWAY' || o.channel === 'DELIVERY'),
    );
}

/** Active open check for a table (preferred orderId, else latest updated). */
export function deriveRestaurantCheckForTable(
    tableId: string,
    events: PosOfflineEvent[],
    syncState: SyncStateMap,
    preferredOrderId?: string | null,
): DerivedOrder | null {
    const matches = deriveRestaurantOpenChecks(events, syncState)
        .filter((o) => o.tableId === tableId)
        .sort((a, b) => b.updatedTs - a.updatedTs);
    if (preferredOrderId) {
        // Multi-ticket integrity: never fall back to a sibling's lines when a specific
        // ticket was requested. Empty preferred means no snapshot for that ticket yet.
        return matches.find((o) => o.orderId === preferredOrderId) ?? null;
    }
    return matches[0] ?? null;
}

/** Sibling open checks on the same table (excluding preferred/active). */
export function deriveRestaurantSiblingChecks(
    tableId: string,
    events: PosOfflineEvent[],
    syncState: SyncStateMap,
    excludeOrderId?: string | null,
): DerivedOrder[] {
    return deriveRestaurantOpenChecks(events, syncState)
        .filter((o) => o.tableId === tableId && o.orderId !== excludeOrderId)
        .sort((a, b) => a.createdTs - b.createdTs);
}

/** Floor occupancy from journal (tableId → open check). */
export function deriveRestaurantFloorOccupancy(
    events: PosOfflineEvent[],
    syncState: SyncStateMap,
): Map<string, DerivedOrder> {
    const map = new Map<string, DerivedOrder>();
    for (const check of deriveRestaurantOpenChecks(events, syncState)) {
        if (!check.tableId) continue;
        const prev = map.get(check.tableId);
        if (!prev || check.updatedTs >= prev.updatedTs) {
            map.set(check.tableId, check);
        }
    }
    return map;
}

export type DerivedKotStatus = 'SENT' | 'PREPARING' | 'READY' | 'BUMPED';

/** Phase 5.5 — KDS ticket projected from journal (no prices). */
export interface DerivedKitchenTicket {
    id: string;
    kotNumber: string;
    orderId: string;
    orderNumber: string | null;
    tableCode: string | null;
    tableName: string | null;
    waiterName: string | null;
    station: string;
    status: DerivedKotStatus;
    ticketKind?: 'FIRE' | 'VOID';
    firedAt: string;
    orderChannel: string | null;
    guestName: string | null;
    guestPhone?: string | null;
    deliveryAddress?: string | null;
    pickupLabel?: string | null;
    items: Array<{
        id: string;
        productName: string;
        quantity: string;
        lineNotes: string | null;
    }>;
}

const KOT_FLOW: Record<DerivedKotStatus, DerivedKotStatus | null> = {
    SENT: 'PREPARING',
    PREPARING: 'READY',
    READY: 'BUMPED',
    BUMPED: null,
};

export function nextKotStatus(status: DerivedKotStatus): DerivedKotStatus | null {
    return KOT_FLOW[status] ?? null;
}

/**
 * Phase 5.5 — active kitchen board from RESTAURANT_KOT_FIRED + RESTAURANT_KOT_STATUS.
 * Hides tickets for cancelled/paid checks and BUMPED tickets.
 */
export function deriveRestaurantKitchenBoard(
    events: PosOfflineEvent[],
    syncState: SyncStateMap,
    stationFilter?: string | null,
): DerivedKitchenTicket[] {
    const openOrders = new Map(
        deriveOpenOrders(events, syncState).map((o) => [o.orderId, o] as const),
    );
    const tickets = new Map<string, DerivedKitchenTicket>();

    for (const event of events) {
        if (event.eventType === 'RESTAURANT_KOT_FIRED') {
            const order = openOrders.get(event.orderId);
            // Still show if order open; if completed/cancelled, skip
            if (!order || order.status !== 'OPEN') continue;
            tickets.set(event.kotOfflineId, {
                id: event.kotOfflineId,
                kotNumber: event.kotOfflineId,
                orderId: event.orderId,
                orderNumber: order.offlineId,
                tableCode: event.tableCode ?? order.tableCode ?? null,
                tableName: event.tableName ?? order.tableName ?? null,
                waiterName: event.waiterName ?? order.waiterName ?? null,
                station: (event.station || 'KITCHEN').toUpperCase(),
                status: 'SENT',
                ticketKind: event.ticketKind === 'VOID' ? 'VOID' : 'FIRE',
                firedAt: new Date(event.ts).toISOString(),
                orderChannel: event.orderChannel ?? order.channel ?? null,
                guestName: event.guestName ?? order.guestName ?? null,
                guestPhone: order.guestPhone ?? null,
                deliveryAddress: order.deliveryAddress ?? null,
                pickupLabel: order.pickupLabel ?? null,
                items: event.lines.map((l) => ({
                    id: l.lineId,
                    productName: l.productName,
                    quantity: String(l.quantity),
                    lineNotes: l.lineNotes ?? null,
                })),
            });
        }
        if (event.eventType === 'RESTAURANT_KOT_STATUS') {
            const t = tickets.get(event.kotOfflineId);
            if (t) {
                tickets.set(event.kotOfflineId, { ...t, status: event.status });
            }
        }
    }

    const filter = stationFilter?.trim().toUpperCase() || null;
    return Array.from(tickets.values())
        .filter((t) => t.status !== 'BUMPED')
        .filter((t) => openOrders.get(t.orderId)?.status === 'OPEN')
        .filter((t) => !filter || t.station === filter)
        .sort((a, b) => new Date(a.firedAt).getTime() - new Date(b.firedAt).getTime());
}
