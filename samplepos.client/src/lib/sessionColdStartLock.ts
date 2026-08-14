/**
 * Cold-start / reboot session lock — Toast / Samba shared-terminal pattern.
 *
 * Chromium localStorage survives power cycles. sessionStorage does NOT survive
 * a true reboot — but Chrome "Continue where you left off" can restore it.
 * SHARED device mode therefore also uses ACTOR_LOCK (localStorage) on pagehide.
 *
 * Policy SSOT: shared/security/deviceSessionPolicySsot.ts
 * Storage failures FAIL CLOSED (treat as cold start / require re-auth).
 */

import {
  AUTH_BOOT_SESSION_KEY,
  roleRequiresReauthGate,
} from '@shared/security/deviceSessionPolicySsot';
import {
  getDeviceSessionMode,
  shouldEnforceDeviceReauthGate,
  COLD_START_QUICK_LOGIN_HREF,
  DeviceSessionIntegrityError,
} from './deviceSessionPolicy';

export { AUTH_BOOT_SESSION_KEY, COLD_START_QUICK_LOGIN_HREF };

function sessionGet(key: string): string | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    return sessionStorage.getItem(key);
  } catch {
    return null; // fail closed via isBrowserColdStart
  }
}

/**
 * Mark tab session trusted. Returns false if not durable (caller may still proceed;
 * next hard navigation will re-gate — fail closed).
 */
export function markBrowserSessionAlive(): boolean {
  try {
    if (typeof sessionStorage === 'undefined') return false;
    sessionStorage.setItem(AUTH_BOOT_SESSION_KEY, '1');
    return sessionStorage.getItem(AUTH_BOOT_SESSION_KEY) === '1';
  } catch {
    return false;
  }
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
 */
export function shouldEnforceColdStartPinGate(input: {
  role: string | null | undefined;
  hasStoredSession: boolean;
}): boolean {
  return shouldEnforceDeviceReauthGate(input);
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
