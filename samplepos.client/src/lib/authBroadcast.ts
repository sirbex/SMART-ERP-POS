/**
 * Auth Broadcast — Cross-tab Session Sync
 *
 * Keeps all open tabs consistent when auth state changes in one of them.
 * Uses BroadcastChannel (modern browsers) with a localStorage-based
 * fallback for Safari and older environments.
 *
 * Events broadcast:
 *   LOGOUT          — user clicked logout in any tab → all tabs should logout
 *   TOKEN_REFRESH   — a tab successfully refreshed the token → others can skip their refresh
 *   SESSION_EXPIRED — refresh token is gone/revoked → all tabs must go to /login
 *
 * Usage:
 *   broadcastAuthEvent({ type: 'LOGOUT' });
 *   onAuthBroadcast((event) => { if (event.type === 'LOGOUT') doLogout(); });
 *   setupAuthBroadcastListener(); // call once in AuthProvider
 */

export type AuthBroadcastEvent =
    | { type: 'LOGOUT' }
    | { type: 'TOKEN_REFRESH' }
    | { type: 'SESSION_EXPIRED' };

const CHANNEL_NAME = 'smarterp_auth';
const STORAGE_KEY = 'smarterp_auth_event';

// ── Singleton channel ─────────────────────────────────────────
let _channel: BroadcastChannel | null = null;
const _handlers = new Set<(event: AuthBroadcastEvent) => void>();

function _getChannel(): BroadcastChannel | null {
    if (typeof window === 'undefined') return null;
    if (!('BroadcastChannel' in window)) return null;
    if (!_channel) {
        _channel = new BroadcastChannel(CHANNEL_NAME);
        _channel.onmessage = (e: MessageEvent<AuthBroadcastEvent>) => {
            _dispatch(e.data);
        };
    }
    return _channel;
}

function _dispatch(event: AuthBroadcastEvent): void {
    _handlers.forEach(fn => {
        try { fn(event); } catch { /* never let a handler crash the bus */ }
    });
}

/**
 * Broadcast an auth event to all other tabs.
 * The originating tab does NOT receive the event back (BroadcastChannel
 * semantics); call your own handler directly for in-tab reactions.
 */
export function broadcastAuthEvent(event: AuthBroadcastEvent): void {
    // Primary: BroadcastChannel
    _getChannel()?.postMessage(event);

    // Fallback: storage event (cross-tab, received by OTHER tabs' storage listeners)
    try {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ ...event, _ts: Date.now() })
        );
    } catch { /* storage full — ignore */ }
}

/**
 * Register a handler that fires when any auth event arrives from another tab.
 * Returns an unsubscribe function.
 */
export function onAuthBroadcast(fn: (event: AuthBroadcastEvent) => void): () => void {
    _handlers.add(fn);
    return () => _handlers.delete(fn);
}

/**
 * Install the storage-event fallback listener.
 * Call once from AuthProvider on mount.
 * BroadcastChannel is self-initialised lazily; only the storage fallback
 * needs explicit setup because it requires a window event listener.
 */
export function setupAuthBroadcastListener(): () => void {
    // Ensure BroadcastChannel is open
    _getChannel();

    // Storage fallback (Safari, cross-origin iframes, etc.)
    const onStorage = (e: StorageEvent) => {
        if (e.key !== STORAGE_KEY || !e.newValue) return;
        try {
            const payload = JSON.parse(e.newValue) as AuthBroadcastEvent & { _ts: number };
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { _ts: _ignored, ...event } = payload;
            _dispatch(event as AuthBroadcastEvent);
        } catch { /* malformed payload */ }
    };

    window.addEventListener('storage', onStorage);

    return () => {
        window.removeEventListener('storage', onStorage);
        _channel?.close();
        _channel = null;
    };
}
