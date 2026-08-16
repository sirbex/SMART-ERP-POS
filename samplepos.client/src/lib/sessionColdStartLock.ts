/**
 * Cold-start / reboot session lock — Toast / Samba shared-terminal pattern.
 *
 * Chromium localStorage survives power cycles. sessionStorage does NOT survive
 * a true reboot — but Chrome "Continue where you left off" can restore it.
 * SHARED device mode therefore also uses ACTOR_LOCK (localStorage) on close
 * (with full session wipe) so the next opener cannot inherit the prior actor.
 *
 * Policy SSOT: shared/security/deviceSessionPolicySsot.ts
 * Storage failures FAIL CLOSED (treat as cold start / require re-auth).
 */

import {
  AUTH_BOOT_SESSION_KEY,
  AUTH_LOGIN_GRACE_KEY,
  AUTH_LOGIN_GRACE_MS,
  roleRequiresReauthGate,
} from '@shared/security/deviceSessionPolicySsot';
import {
  getDeviceSessionMode,
  shouldEnforceDeviceReauthGate,
  COLD_START_QUICK_LOGIN_HREF,
  DeviceSessionIntegrityError,
} from './deviceSessionPolicy';

export {
  AUTH_BOOT_SESSION_KEY,
  AUTH_LOGIN_GRACE_KEY,
  AUTH_LOGIN_GRACE_MS,
  COLD_START_QUICK_LOGIN_HREF,
};

function sessionGet(key: string): string | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    return sessionStorage.getItem(key);
  } catch {
    return null; // fail closed via isBrowserColdStart
  }
}

function sessionSet(key: string, value: string): boolean {
  try {
    if (typeof sessionStorage === 'undefined') return false;
    sessionStorage.setItem(key, value);
    return sessionStorage.getItem(key) === value;
  } catch {
    return false;
  }
}

function localGet(key: string): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function localSet(key: string, value: string): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.setItem(key, value);
    return localStorage.getItem(key) === value;
  } catch {
    return false;
  }
}

function localRemove(key: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/**
 * Mark tab session trusted. Returns false if not durable (caller may still proceed;
 * next hard navigation will re-gate — fail closed).
 */
export function markBrowserSessionAlive(): boolean {
  return sessionSet(AUTH_BOOT_SESSION_KEY, '1');
}

/**
 * Call at the start of a successful login — blocks cold-start wipe for AUTH_LOGIN_GRACE_MS.
 * Writes localStorage (cross-tab) + sessionStorage (same-tab). PC multi-tab login depends
 * on localStorage so a peer tab's storage→initAuth cannot wipe the new session.
 */
export function markLoginGrace(): boolean {
  const stamp = String(Date.now());
  const crossTab = localSet(AUTH_LOGIN_GRACE_KEY, stamp);
  const sameTab = sessionSet(AUTH_LOGIN_GRACE_KEY, stamp);
  return crossTab || sameTab;
}

/** Remove grace markers (logout / definitive wipe). */
export function clearLoginGrace(): void {
  localRemove(AUTH_LOGIN_GRACE_KEY);
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(AUTH_LOGIN_GRACE_KEY);
  } catch {
    /* ignore */
  }
}

export function isWithinLoginGrace(now = Date.now()): boolean {
  // Prefer localStorage so peer tabs see the same grace window after login.
  const raw = localGet(AUTH_LOGIN_GRACE_KEY) ?? sessionGet(AUTH_LOGIN_GRACE_KEY);
  if (!raw) return false;
  const t = Number(raw);
  if (!Number.isFinite(t)) return false;
  const ok = now - t >= 0 && now - t < AUTH_LOGIN_GRACE_MS;
  if (!ok) clearLoginGrace();
  return ok;
}

/** True when boot marker absent or unreadable (fail closed → cold). */
export function isBrowserColdStart(): boolean {
  return sessionGet(AUTH_BOOT_SESSION_KEY) !== '1';
}

/**
 * Role gate under current device mode.
 * SHARED ⇒ all roles; PERSONAL ⇒ ADMIN/MANAGER may silent-restore.
 */
export function roleRequiresColdStartPinGate(role: string | null | undefined): boolean {
  return roleRequiresReauthGate({ mode: getDeviceSessionMode(), role });
}

/**
 * Enforce re-auth on boot when device policy / actor lock / cold start requires it.
 * Honours login grace so auth-changed → initAuth cannot bounce a fresh login.
 */
export function shouldEnforceColdStartPinGate(input: {
  role: string | null | undefined;
  hasStoredSession: boolean;
}): boolean {
  return shouldEnforceDeviceReauthGate({
    ...input,
    withinLoginGrace: isWithinLoginGrace(),
  });
}

export function coldStartMode() {
  return getDeviceSessionMode();
}

/** Fail-loud helper for tests/admin: boot key must match SSOT. */
export function assertColdStartKeyAligned(): void {
  if (AUTH_BOOT_SESSION_KEY !== 'auth_boot_session_v1') {
    throw new DeviceSessionIntegrityError(
      `AUTH_BOOT_SESSION_KEY drift: '${AUTH_BOOT_SESSION_KEY}'`,
    );
  }
}
