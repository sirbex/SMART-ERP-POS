/**
 * Global session activity — ALL modules, ALL tabs (enterprise SSOT).
 *
 * Odoo OCA pattern: sync last-activity timestamp across browser tabs via
 * localStorage so typing in any tab keeps every tab's session alive.
 */

/** Align with AuthContext idle timeout — user is "working" within this window. */
export const ACTIVE_SESSION_WINDOW_MS = 60 * 60 * 1000;

const ACTIVITY_STORAGE_KEY = 'smarterp_last_activity_at';

export { ACTIVITY_STORAGE_KEY };

let lastActivityAt = Date.now();
let transactionGuardDepth = 0;
let lastPersistAt = 0;
const PERSIST_THROTTLE_MS = 2000;

export function touchSessionActivity(): void {
  const now = Date.now();
  lastActivityAt = now;
  if (now - lastPersistAt >= PERSIST_THROTTLE_MS) {
    lastPersistAt = now;
    try {
      localStorage.setItem(ACTIVITY_STORAGE_KEY, String(now));
    } catch {
      /* private browsing / quota */
    }
  }
}

export function getLastActivityAt(): number {
  return lastActivityAt;
}

/** Read peer-tab activity from localStorage (same-origin). */
export function readPeerTabActivityAt(): number {
  try {
    const raw = localStorage.getItem(ACTIVITY_STORAGE_KEY);
    if (!raw) return 0;
    const ts = parseInt(raw, 10);
    return Number.isNaN(ts) ? 0 : ts;
  } catch {
    return 0;
  }
}

/** Effective activity = max(this tab, any peer tab). */
export function getEffectiveLastActivityAt(): number {
  return Math.max(lastActivityAt, readPeerTabActivityAt());
}

export function syncActivityFromPeerTab(storedValue: string | null): void {
  if (!storedValue) return;
  const ts = parseInt(storedValue, 10);
  if (!Number.isNaN(ts) && ts > lastActivityAt) {
    lastActivityAt = ts;
  }
}

/** Subscribe to cross-tab activity updates (Odoo multi-tab sync). */
export function initCrossTabActivitySync(): () => void {
  syncActivityFromPeerTab(localStorage.getItem(ACTIVITY_STORAGE_KEY));
  const handler = (e: StorageEvent) => {
    if (e.key === ACTIVITY_STORAGE_KEY) {
      syncActivityFromPeerTab(e.newValue);
    }
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}

export function setTransactionGuardDepth(depth: number): void {
  transactionGuardDepth = depth;
}

export function isTransactionGuardActive(): boolean {
  return transactionGuardDepth > 0;
}

/** User is actively working or has a transactional panel open. */
export function shouldKeepSessionAlive(maxIdleMs: number): boolean {
  if (transactionGuardDepth > 0) return true;
  return Date.now() - getEffectiveLastActivityAt() < maxIdleMs;
}

/** True when auto-logout must be suppressed — global, all modules/tabs. */
export function isUserActiveOrGuarded(
  maxIdleMs: number = ACTIVE_SESSION_WINDOW_MS,
): boolean {
  return shouldKeepSessionAlive(maxIdleMs);
}

/** @internal Test-only reset — clears in-memory + localStorage activity. */
export function __resetSessionActivityForTests(inactiveSinceMs = ACTIVE_SESSION_WINDOW_MS + 60_000): void {
  const stale = Date.now() - inactiveSinceMs;
  lastActivityAt = stale;
  lastPersistAt = 0;
  transactionGuardDepth = 0;
  try {
    localStorage.removeItem(ACTIVITY_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export { IDLE_SESSION_ACTIVITY_EVENTS, GLOBAL_SESSION_ACTIVITY_EVENTS } from './sessionActivityEvents';
