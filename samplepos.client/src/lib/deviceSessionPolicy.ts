/**
 * Client binding for device session policy SSOT.
 *
 * Integrity contract:
 * - Storage errors FAIL CLOSED (assume actor locked / refuse silent restore).
 * - Mode writes are verified durable or throw DeviceSessionIntegrityError.
 * - Session wipe is verified or throw — never "clear and hope".
 * - Unload RT revoke is best-effort by browser constraint; boot wipe is mandatory.
 */

import {
  ACTOR_LOCK_KEY,
  AUTH_BOOT_SESSION_KEY,
  AUTH_SESSION_WIPE_KEYS,
  COLD_START_QUICK_LOGIN_HREF,
  DEVICE_SESSION_MODE_KEY,
  DeviceSessionIntegrityError,
  assertAuthSessionCleared,
  assertDeviceSessionModeStored,
  idleTimeoutMsForMode,
  isActorLockRawSet,
  isDeviceSessionMode,
  resolveDeviceSessionMode,
  shouldForceReauthOnBoot,
  type DeviceSessionMode,
} from '@shared/security/deviceSessionPolicySsot';

export {
  ACTOR_LOCK_KEY,
  AUTH_BOOT_SESSION_KEY,
  AUTH_SESSION_WIPE_KEYS,
  COLD_START_QUICK_LOGIN_HREF,
  DEVICE_SESSION_MODE_KEY,
  DeviceSessionIntegrityError,
  idleTimeoutMsForMode,
  type DeviceSessionMode,
};

function readLocal(key: string): string | null {
  if (typeof localStorage === 'undefined') {
    throw new DeviceSessionIntegrityError(`localStorage unavailable reading '${key}'`);
  }
  return localStorage.getItem(key);
}

function writeLocal(key: string, value: string): void {
  if (typeof localStorage === 'undefined') {
    throw new DeviceSessionIntegrityError(`localStorage unavailable writing '${key}'`);
  }
  localStorage.setItem(key, value);
}

function removeLocal(key: string): void {
  if (typeof localStorage === 'undefined') {
    throw new DeviceSessionIntegrityError(`localStorage unavailable removing '${key}'`);
  }
  localStorage.removeItem(key);
}

function isBrowserColdStartLocal(): boolean {
  try {
    if (typeof sessionStorage === 'undefined') return true; // fail closed → cold
    return sessionStorage.getItem(AUTH_BOOT_SESSION_KEY) !== '1';
  } catch {
    return true; // fail closed → cold
  }
}

export function getDeviceSessionMode(): DeviceSessionMode {
  let stored: string | null = null;
  try {
    stored = typeof localStorage !== 'undefined' ? localStorage.getItem(DEVICE_SESSION_MODE_KEY) : null;
  } catch {
    // Unreadable storage → SHARED (secure default), never PERSONAL
    return 'SHARED';
  }
  const envRaw =
    typeof import.meta !== 'undefined'
      ? (import.meta as ImportMeta & { env?: Record<string, string> }).env
          ?.VITE_DEVICE_SESSION_MODE
      : undefined;
  return resolveDeviceSessionMode({ stored, envRaw });
}

/**
 * Persist device mode — fail-loud if value invalid or write not durable.
 */
export function setDeviceSessionMode(mode: DeviceSessionMode): void {
  if (!isDeviceSessionMode(mode)) {
    throw new DeviceSessionIntegrityError(`Invalid device session mode '${String(mode)}'`);
  }
  try {
    writeLocal(DEVICE_SESSION_MODE_KEY, mode);
    const roundTrip = readLocal(DEVICE_SESSION_MODE_KEY);
    if (roundTrip !== mode) {
      throw new DeviceSessionIntegrityError(
        `Device mode write not durable (wrote '${mode}', read '${roundTrip}')`,
      );
    }
    assertDeviceSessionModeStored(roundTrip);
  } catch (err) {
    if (err instanceof DeviceSessionIntegrityError) throw err;
    throw new DeviceSessionIntegrityError(
      `Cannot persist device session mode: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * FAIL CLOSED: storage errors / unreadable lock ⇒ treat as locked.
 */
export function isActorLockSet(): boolean {
  try {
    if (typeof localStorage === 'undefined') return true;
    return isActorLockRawSet(localStorage.getItem(ACTOR_LOCK_KEY));
  } catch {
    return true;
  }
}

/**
 * Set actor lock. Returns true only when durable.
 * Callers MUST wipe session tokens if this returns false (fail closed).
 */
export function setActorLock(): boolean {
  try {
    writeLocal(ACTOR_LOCK_KEY, '1');
    if (!isActorLockRawSet(readLocal(ACTOR_LOCK_KEY))) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Clear actor lock after successful login. Fail-loud if still set after remove.
 */
export function clearActorLock(): void {
  try {
    removeLocal(ACTOR_LOCK_KEY);
    const left = readLocal(ACTOR_LOCK_KEY);
    if (isActorLockRawSet(left)) {
      throw new DeviceSessionIntegrityError('Actor lock still present after clear');
    }
  } catch (err) {
    if (err instanceof DeviceSessionIntegrityError) throw err;
    throw new DeviceSessionIntegrityError(
      `Cannot clear actor lock: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export function shouldEnforceDeviceReauthGate(input: {
  role: string | null | undefined;
  hasStoredSession: boolean;
  withinLoginGrace?: boolean;
}): boolean {
  return shouldForceReauthOnBoot({
    mode: getDeviceSessionMode(),
    role: input.role,
    hasStoredSession: input.hasStoredSession,
    actorLockSet: isActorLockSet(),
    isBrowserColdStart: isBrowserColdStartLocal(),
    withinLoginGrace: input.withinLoginGrace === true,
  });
}

/**
 * Verify JWT/identity keys are gone after clearTokens().
 * Throws DeviceSessionIntegrityError — never silently continue authenticated.
 */
export function assertSessionWiped(): void {
  assertAuthSessionCleared((key) => {
    try {
      if (typeof localStorage === 'undefined') {
        throw new Error('unavailable');
      }
      return localStorage.getItem(key);
    } catch {
      throw new Error('unreadable');
    }
  });
}

/**
 * Best-effort revoke on unload (browser may kill the request).
 * Boot-path wipe remains the mandatory control — this is defense-in-depth only.
 * Never throws (unload must not crash the tab).
 */
export function beaconRevokeRefreshToken(refreshToken: string | null | undefined): void {
  if (!refreshToken || typeof navigator === 'undefined') return;
  const baseUrl =
    (typeof import.meta !== 'undefined' &&
      (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_API_BASE_URL) ||
    '/api';
  const url = `${baseUrl}/auth/token/revoke`;
  const body = JSON.stringify({ refreshToken });
  try {
    if (typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' });
      const queued = navigator.sendBeacon(url, blob);
      if (queued) return;
    }
  } catch {
    /* fall through to keepalive fetch */
  }
  try {
    void fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      credentials: 'include',
      keepalive: true,
    }).catch(() => {
      /* unload / offline — non-blocking by browser constraint */
    });
  } catch {
    /* unload — non-blocking */
  }
}

/**
 * SHARED unload handler: durable actor lock, else wipe tokens immediately.
 * Returns whether the lock was durable (false ⇒ tokens must already be wiped by caller).
 */
export function lockSharedSessionOnUnload(input: {
  mode: DeviceSessionMode;
  clearSession: () => void;
  refreshToken: string | null | undefined;
}): { lockDurable: boolean } {
  if (input.mode !== 'SHARED') {
    return { lockDurable: true };
  }
  const lockDurable = setActorLock();
  if (!lockDurable) {
    // Cannot persist lock → fail closed: destroy session material now.
    input.clearSession();
  }
  beaconRevokeRefreshToken(input.refreshToken);
  return { lockDurable };
}
