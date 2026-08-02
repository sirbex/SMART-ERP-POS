/**
 * Cold-start / reboot session lock — Toast / Samba shared-terminal pattern.
 *
 * Chromium localStorage survives power cycles, so AuthContext can silently restore
 * the last user. sessionStorage does NOT survive reboot — use it as the boot gate.
 *
 * Shared POS roles must PIN (quick-login) after reboot; ADMIN/MANAGER keep ERP restore.
 */

export const AUTH_BOOT_SESSION_KEY = 'auth_boot_session_v1';
export const COLD_START_QUICK_LOGIN_HREF = '/quick-login';

function sessionGet(key: string): string | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function sessionSet(key: string, value: string): void {
  try {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
}

/** True once this browser tab/session has completed a trusted auth boot or login. */
export function markBrowserSessionAlive(): void {
  sessionSet(AUTH_BOOT_SESSION_KEY, '1');
}

export function isBrowserColdStart(): boolean {
  return sessionGet(AUTH_BOOT_SESSION_KEY) !== '1';
}

/**
 * Roles that must re-authenticate after reboot / browser restart.
 * Back-office ADMIN/MANAGER keep durable restore (SAP/Odoo office PCs).
 */
export function roleRequiresColdStartPinGate(role: string | null | undefined): boolean {
  const r = String(role || '')
    .trim()
    .toUpperCase();
  if (!r) return true;
  if (r === 'ADMIN' || r === 'MANAGER') return false;
  // Cashiers, waiters, floor staff, accountants on shared terminals
  return true;
}

export function shouldEnforceColdStartPinGate(input: {
  role: string | null | undefined;
  hasStoredSession: boolean;
}): boolean {
  if (!input.hasStoredSession) return false;
  if (!isBrowserColdStart()) return false;
  return roleRequiresColdStartPinGate(input.role);
}
