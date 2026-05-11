/**
 * Offline Mutation Queue — Crash-safe general-purpose request buffer
 *
 * Separate from the POS offline event journal (offlineEventJournal.ts), which
 * is a purpose-built append-only log for ORDER/SALE events.  This queue handles
 * any non-GET mutation that fails because the device is offline, allowing it
 * to be replayed automatically when the connection is restored.
 *
 * Design:
 * - Mutations are persisted to localStorage BEFORE being sent (crash-safe).
 * - Each entry carries the idempotency key already attached by utils/api.ts
 *   so server-side deduplication prevents double-processing on replay.
 * - Only state-changing methods (POST/PUT/PATCH/DELETE) are queued.
 * - Auth and reporting endpoints are explicitly excluded.
 * - Entries older than MAX_AGE_MS are discarded on load (stale data guard).
 * - Queue is bounded to MAX_SIZE to prevent unbounded localStorage growth.
 *
 * Replay is triggered by:
 *   - window 'online' event
 *   - Successful token refresh
 *   - Tab becoming visible (visibilitychange)
 *
 * Usage:
 *   // In axios response interceptor (network error on mutation):
 *   enqueueOfflineRequest({ method, url, data, headers, idempotencyKey });
 *
 *   // In useTokenRefresh / AuthContext on reconnect:
 *   flushOfflineQueue(axiosInstance);
 */

import type { AxiosInstance } from 'axios';

// ── Constants ─────────────────────────────────────────────────
const QUEUE_KEY = 'smarterp_offline_queue';
const MAX_SIZE = 50;
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

// ── URLs that should never be queued ─────────────────────────
// Auth, read-only, reporting, and file endpoints are excluded.
const EXCLUDED_PATTERNS = [
    '/auth/',
    '/token/',
    '/reports/',
    '/dashboard/',
    '/reconciliation/',
    '/health',
];

function isQueueable(method: string, url: string): boolean {
    const m = method.toUpperCase();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(m)) return false;
    if (EXCLUDED_PATTERNS.some(p => url.includes(p))) return false;
    return true;
}

// ── Types ─────────────────────────────────────────────────────
export interface QueuedRequest {
    /** Idempotency key — same one attached by api.ts X-Idempotency-Key header */
    id: string;
    method: string;
    url: string;
    /** Serialisable payload only — no File/Blob */
    data?: unknown;
    /** Subset of headers safe to persist (no Authorization — re-attached on replay) */
    contentType: string;
    timestamp: number;
}

// ── Persistence helpers ───────────────────────────────────────
function loadQueue(): QueuedRequest[] {
    try {
        const raw = localStorage.getItem(QUEUE_KEY);
        if (!raw) return [];
        const all: QueuedRequest[] = JSON.parse(raw);
        const cutoff = Date.now() - MAX_AGE_MS;
        return all.filter(r => r.timestamp > cutoff);
    } catch (err) {
        console.error('[offlineRequestQueue] queue corrupt — discarding all entries:', err);
        return [];
    }
}

function saveQueue(queue: QueuedRequest[]): void {
    try {
        localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    } catch (err) {
        console.warn('[offlineRequestQueue] localStorage full — queue not persisted:', err);
    }
}

// ── Public API ────────────────────────────────────────────────

/**
 * Add a failed mutation to the offline queue.
 * No-op if the request method/URL is not queueable.
 */
export function enqueueOfflineRequest(params: {
    method: string;
    url: string;
    data?: unknown;
    contentType?: string;
    idempotencyKey: string;
}): void {
    if (!isQueueable(params.method, params.url)) return;

    const queue = loadQueue();

    // Deduplicate by idempotency key
    if (queue.some(r => r.id === params.idempotencyKey)) return;

    // Enforce max size (drop oldest)
    if (queue.length >= MAX_SIZE) {
        queue.splice(0, queue.length - MAX_SIZE + 1);
    }

    queue.push({
        id: params.idempotencyKey,
        method: params.method,
        url: params.url,
        data: params.data,
        contentType: params.contentType ?? 'application/json',
        timestamp: Date.now(),
    });

    saveQueue(queue);
}

/**
 * Remove a successfully replayed (or cancelled) entry from the queue.
 */
export function dequeueOfflineRequest(idempotencyKey: string): void {
    const queue = loadQueue().filter(r => r.id !== idempotencyKey);
    saveQueue(queue);
}

/**
 * How many requests are waiting to be replayed.
 */
export function offlineQueueSize(): number {
    return loadQueue().length;
}

/**
 * Replay all queued requests against the provided axios instance.
 * Successfully replayed requests are removed; failures are left for the next
 * flush attempt.  Does nothing if the device is still offline.
 */
export async function flushOfflineQueue(axiosInstance: AxiosInstance): Promise<void> {
    if (!navigator.onLine) return;

    const queue = loadQueue();
    if (queue.length === 0) return;

    for (const req of queue) {
        try {
            await axiosInstance.request({
                method: req.method,
                url: req.url,
                data: req.data,
                headers: {
                    'Content-Type': req.contentType,
                    'X-Idempotency-Key': req.id,
                    'X-Offline-Replay': 'true',
                },
            });
            // Success — remove from queue
            dequeueOfflineRequest(req.id);
        } catch (err) {
            console.warn('[offlineRequestQueue] flush failed for', req.id, '— will retry on next flush:', err);
            break;
        }
    }
}

/**
 * Register the automatic flush triggers:
 *   • window 'online' event
 *   • document 'visibilitychange' (tab becomes active)
 *
 * Returns a cleanup function.  Call from AuthProvider useEffect.
 */
export function setupOfflineQueueAutoFlush(axiosInstance: AxiosInstance): () => void {
    const onOnline = () => flushOfflineQueue(axiosInstance);
    const onVisible = () => { if (!document.hidden) flushOfflineQueue(axiosInstance); };

    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
        window.removeEventListener('online', onOnline);
        document.removeEventListener('visibilitychange', onVisible);
    };
}
