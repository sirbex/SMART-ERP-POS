/**
 * Offline Event Journal
 *
 * Implements an append-only immutable event log for offline POS operations.
 * Events are NEVER deleted or modified — only appended.
 * Sync status is stored separately in pos_sync_state.
 *
 * Storage layout:
 *   localStorage['pos_offline_events']   — append-only event journal
 *   localStorage['pos_sync_state']       — { [key]: SyncStateEntry }
 *
 * Design principles:
 * - Immutable journal prevents data loss during crashes or SW/FG sync races
 * - Separate sync state means journal replay is always deterministic
 * - Each event carries its own idempotency key for server-side deduplication
 */

// ── Storage Keys ──────────────────────────────────────────────
export const JOURNAL_KEY = 'pos_offline_events';
export const SYNC_STATE_KEY = 'pos_sync_state';

// ── Status Types ──────────────────────────────────────────────
export type SyncStatus = 'PENDING' | 'SYNCED' | 'REVIEW' | 'FAILED' | 'CANCELLED';

export interface SyncStateEntry {
    status: SyncStatus;
    /** Error message for FAILED or REVIEW statuses */
    error?: string;
}

export type SyncStateMap = Record<string, SyncStateEntry>;

// ── Event Shape Types ─────────────────────────────────────────

export interface EventLine {
    productId: string;
    productName: string;
    sku: string;
    uom: string;
    uomId?: string;
    quantity: number;
    unitPrice: number;
    costPrice: number;
    subtotal: number;
    taxAmount: number;
    discountAmount?: number;
}

export interface EventPayment {
    paymentMethod: 'CASH' | 'CARD' | 'MOBILE_MONEY' | 'CREDIT';
    amount: number;
    reference?: string;
}

// ── Discriminated Union Event Type ────────────────────────────

export type PosOfflineEvent =
    | {
        eventType: 'ORDER_CREATED';
        /** Idempotency key — unique per event */
        key: string;
        /** Stable order ID shared across ORDER_* and SALE_COMPLETED events */
        orderId: string;
        /** Human-readable ID shown in UI */
        offlineId: string;
        lines: EventLine[];
        customerId?: string;
        notes?: string;
        ts: number;
    }
    | {
        eventType: 'ORDER_UPDATED';
        key: string;
        orderId: string;
        lines: EventLine[];
        customerId?: string;
        notes?: string;
        ts: number;
    }
    | {
        eventType: 'ORDER_CANCELLED';
        key: string;
        orderId: string;
        reason?: string;
        ts: number;
    }
    | {
        eventType: 'PAYMENT_ADDED';
        key: string;
        orderId: string;
        payments: EventPayment[];
        subtotal: number;
        discountAmount: number;
        taxAmount: number;
        totalAmount: number;
        stockDeductions: Array<{ productId: string; quantity: number }>;
        ts: number;
    }
    | {
        eventType: 'SALE_COMPLETED';
        key: string;
        orderId: string;
        /** Human-readable ID shown in UI */
        offlineId: string;
        // Fully denormalized sale data for deterministic sync (no event replay required)
        customerId?: string;
        lines: EventLine[];
        payments: EventPayment[];
        subtotal: number;
        discountAmount: number;
        taxAmount: number;
        totalAmount: number;
        /** Track which products/quantities to restore if the sale is cancelled */
        stockDeductions: Array<{ productId: string; quantity: number }>;
        ts: number;
    }
    | {
        eventType: 'SALE_VOIDED';
        key: string;
        saleId: string;
        reason: string;
        ts: number;
    };

// ── Internal Helpers ──────────────────────────────────────────

function readJournal(): PosOfflineEvent[] {
    try {
        const raw = localStorage.getItem(JOURNAL_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as PosOfflineEvent[]) : [];
    } catch {
        return [];
    }
}

function writeJournal(events: PosOfflineEvent[]): void {
    localStorage.setItem(JOURNAL_KEY, JSON.stringify(events));
}

function readSyncState(): SyncStateMap {
    try {
        const raw = localStorage.getItem(SYNC_STATE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return typeof parsed === 'object' && parsed !== null
            ? (parsed as SyncStateMap)
            : {};
    } catch {
        return {};
    }
}

function writeSyncState(state: SyncStateMap): void {
    localStorage.setItem(SYNC_STATE_KEY, JSON.stringify(state));
}

// ── Public API ────────────────────────────────────────────────

/**
 * Append an event to the immutable journal.
 * - Idempotent: calling with the same key twice is a no-op
 * - Initialises sync state entry as PENDING on first append
 */
export function appendEvent(event: PosOfflineEvent): void {
    const journal = readJournal();
    // Guard: never append the same event key twice
    if (journal.some((e) => e.key === event.key)) return;
    writeJournal([...journal, event]);

    const state = readSyncState();
    if (!(event.key in state)) {
        state[event.key] = { status: 'PENDING' };
        writeSyncState(state);
    }
}

/** Return all events in the journal (read-only snapshot). */
export function getAllEvents(): PosOfflineEvent[] {
    return readJournal();
}

/**
 * Return all events whose sync state is PENDING or FAILED.
 * Events with no state entry are treated as PENDING.
 */
export function getUnsyncedEvents(): PosOfflineEvent[] {
    const journal = readJournal();
    const state = readSyncState();
    return journal.filter((e) => {
        const entry = state[e.key];
        const s = entry?.status ?? 'PENDING';
        return s === 'PENDING' || s === 'FAILED';
    });
}

/** Mark an event as successfully synced (idempotent). */
export function markSynced(key: string): void {
    const state = readSyncState();
    state[key] = { status: 'SYNCED' };
    writeSyncState(state);
}

/** Mark an event as requiring manual review (e.g. stock conflict). */
export function markReview(key: string, error?: string): void {
    const state = readSyncState();
    state[key] = { status: 'REVIEW', error };
    writeSyncState(state);
}

/** Mark an event as permanently failed. */
export function markFailed(key: string, error?: string): void {
    const state = readSyncState();
    state[key] = { status: 'FAILED', error };
    writeSyncState(state);
}

/** Cancel an unsynced event (prevents it from ever being synced). */
export function markCancelled(key: string): void {
    const state = readSyncState();
    state[key] = { status: 'CANCELLED' };
    writeSyncState(state);
}

/**
 * Reset FAILED or REVIEW events back to PENDING for retry.
 * Optionally pass specific keys; if omitted, resets all.
 */
export function resetToPending(keys?: string[]): void {
    const state = readSyncState();
    const targets = keys ?? Object.keys(state);
    for (const key of targets) {
        const entry = state[key];
        if (entry?.status === 'FAILED' || entry?.status === 'REVIEW') {
            state[key] = { status: 'PENDING' };
        }
    }
    writeSyncState(state);
}

/** Get sync status for a single event key. */
export function getSyncStatus(key: string): SyncStatus {
    const state = readSyncState();
    return state[key]?.status ?? 'PENDING';
}

/** Get sync state entry (status + optional error) for a single key. */
export function getSyncEntry(key: string): SyncStateEntry {
    const state = readSyncState();
    return state[key] ?? { status: 'PENDING' };
}

/** Return the full sync state map. */
export function getAllSyncState(): SyncStateMap {
    return readSyncState();
}

/**
 * Clear the entire journal and sync state.
 * USE WITH CAUTION — this permanently discards all offline events.
 * Intended for "Clear All Data" / dev reset flows only.
 */
export function clearEventJournal(): void {
    localStorage.removeItem(JOURNAL_KEY);
    localStorage.removeItem(SYNC_STATE_KEY);
}

/** Generate a unique idempotency key for a new event. */
export function generateEventKey(): string {
    return `ofl_${Date.now()}_${Math.random().toString(36).substr(2, 12)}`;
}

// ── Migration: Old pos_offline_sales → Event Journal ─────────

/**
 * One-time migration: converts any PENDING_SYNC entries from the legacy
 * pos_offline_sales array into SALE_COMPLETED events in the new journal.
 *
 * Safe to call repeatedly — already-migrated keys are skipped via the
 * idempotent appendEvent guard. Does NOT remove the old queue.
 */
export function migrateLegacyOfflineSales(): void {
    try {
        const raw = localStorage.getItem('pos_offline_sales');
        if (!raw) return;
        const sales: Array<{
            idempotencyKey: string;
            offlineId: string;
            timestamp: number;
            status: string;
            data: {
                customerId?: string;
                lineItems: Array<{
                    productId: string;
                    productName: string;
                    sku?: string;
                    uom?: string;
                    uomId?: string;
                    quantity: number;
                    unitPrice: number;
                    costPrice: number;
                    subtotal: number;
                    taxAmount: number;
                    discountAmount?: number;
                }>;
                paymentLines: EventPayment[];
                subtotal: number;
                discountAmount?: number;
                taxAmount: number;
                totalAmount: number;
            };
            stockDeductions?: Array<{ productId: string; quantity: number }>;
        }> = JSON.parse(raw);

        if (!Array.isArray(sales)) return;

        for (const sale of sales) {
            if (sale.status !== 'PENDING_SYNC') continue;
            if (!sale.idempotencyKey || !sale.offlineId) continue;

            const event: PosOfflineEvent = {
                eventType: 'SALE_COMPLETED',
                key: sale.idempotencyKey,
                orderId: sale.offlineId,
                offlineId: sale.offlineId,
                customerId: sale.data.customerId,
                lines: sale.data.lineItems.map((item) => ({
                    productId: item.productId,
                    productName: item.productName,
                    sku: item.sku ?? '',
                    uom: item.uom ?? 'PIECE',
                    uomId: item.uomId,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    costPrice: item.costPrice,
                    subtotal: item.subtotal,
                    taxAmount: item.taxAmount,
                    discountAmount: item.discountAmount,
                })),
                payments: sale.data.paymentLines,
                subtotal: sale.data.subtotal,
                discountAmount: sale.data.discountAmount ?? 0,
                taxAmount: sale.data.taxAmount,
                totalAmount: sale.data.totalAmount,
                stockDeductions: sale.stockDeductions ?? [],
                ts: sale.timestamp,
            };

            appendEvent(event);
        }
    } catch {
        // Migration is best-effort — never throw
    }
}

/**
 * One-time migration: converts any PENDING_SYNC entries from the legacy
 * pos_offline_orders array into ORDER_CREATED events in the new journal.
 */
export function migrateLegacyOfflineOrders(): void {
    try {
        const raw = localStorage.getItem('pos_offline_orders');
        if (!raw) return;
        const orders: Array<{
            idempotencyKey: string;
            offlineId: string;
            timestamp: number;
            status: string;
            data: {
                customerId?: string;
                items: Array<{
                    productId: string;
                    productName: string;
                    quantity: number;
                    unitPrice: number;
                    discountAmount?: number;
                    uomId?: string;
                }>;
                notes?: string;
            };
        }> = JSON.parse(raw);

        if (!Array.isArray(orders)) return;

        for (const order of orders) {
            if (order.status !== 'PENDING_SYNC') continue;
            if (!order.idempotencyKey || !order.offlineId) continue;

            const event: PosOfflineEvent = {
                eventType: 'ORDER_CREATED',
                key: order.idempotencyKey,
                orderId: order.offlineId,
                offlineId: order.offlineId,
                lines: order.data.items.map((item) => ({
                    productId: item.productId,
                    productName: item.productName,
                    sku: '',
                    uom: 'PIECE',
                    uomId: item.uomId,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    costPrice: 0,
                    subtotal: item.quantity * item.unitPrice - (item.discountAmount ?? 0),
                    taxAmount: 0,
                    discountAmount: item.discountAmount,
                })),
                customerId: order.data.customerId,
                notes: order.data.notes,
                ts: order.timestamp,
            };

            appendEvent(event);
        }
    } catch {
        // Migration is best-effort — never throw
    }
}
