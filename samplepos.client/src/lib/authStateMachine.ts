/**
 * Auth State Machine
 *
 * Provides an explicit AUTHENTICATED | REFRESHING | EXPIRED state so every
 * part of the app can react to auth transitions consistently — without each
 * file maintaining its own boolean flags.
 *
 * Key guarantees:
 * - Only ONE state transition can be in-flight at a time.
 * - Any request that arrives while state is REFRESHING will await the in-progress
 *   refresh rather than spawning a second one (freeze-and-resume pattern).
 * - EXPIRED state rejects all waiters immediately so the user is never frozen
 *   with a pending request that will never succeed.
 */

export type AuthStateValue = 'AUTHENTICATED' | 'REFRESHING' | 'EXPIRED';

let _current: AuthStateValue = 'AUTHENTICATED';

// Subscribers notified on every state change
type StateListener = (next: AuthStateValue, prev: AuthStateValue) => void;
const _listeners = new Set<StateListener>();

// Waiters parked while state === REFRESHING
type Waiter = { resolve: () => void; reject: (err: Error) => void };
const _waiters: Waiter[] = [];

/**
 * Read the current auth state.
 */
export function getAuthState(): AuthStateValue {
    return _current;
}

/**
 * Transition to a new state and notify all listeners + waiters.
 */
export function setAuthState(next: AuthStateValue): void {
    if (_current === next) return;
    const prev = _current;
    _current = next;

    // Notify subscribers
    _listeners.forEach(fn => {
        try { fn(next, prev); } catch { /* never let a subscriber crash the state machine */ }
    });

    // Flush waiters
    if (next === 'AUTHENTICATED') {
        const pending = _waiters.splice(0);
        pending.forEach(w => w.resolve());
    } else if (next === 'EXPIRED') {
        const pending = _waiters.splice(0);
        const err = new Error('Session expired');
        pending.forEach(w => w.reject(err));
    }
    // REFRESHING: waiters accumulate — do nothing yet
}

/**
 * Subscribe to auth state changes.
 * Returns an unsubscribe function.
 */
export function onAuthStateChange(fn: StateListener): () => void {
    _listeners.add(fn);
    return () => _listeners.delete(fn);
}

/**
 * Returns a promise that resolves when state is (or becomes) AUTHENTICATED.
 * Rejects immediately if state is EXPIRED.
 * Suspends if state is REFRESHING — caller will resume once refresh completes.
 *
 * This is the core mechanism for "freeze and replay" during token refresh:
 * any request interceptor can `await waitForAuthenticated()` and the request
 * will hold until the refresh resolves.
 */
export function waitForAuthenticated(): Promise<void> {
    if (_current === 'AUTHENTICATED') return Promise.resolve();
    if (_current === 'EXPIRED') return Promise.reject(new Error('Session expired'));

    // REFRESHING — park the caller until state changes
    return new Promise<void>((resolve, reject) => {
        _waiters.push({ resolve, reject });
    });
}

/**
 * Reset state to AUTHENTICATED (e.g. after fresh login).
 * Used by AuthContext.login() to ensure a clean start.
 */
export function resetAuthState(): void {
    setAuthState('AUTHENTICATED');
}
