/**
 * Session auto-logout policy — SAP/Odoo enterprise pattern.
 *
 * SAP Fiori: idle-only sign-out (SESSION_TIMEOUT_INTERVAL_IN_MINUTES) with a
 * reminder before logout; background polling extends the session while active.
 *
 * Odoo: long-lived sessions (7d default); OCA idle-timeout modules only logout
 * after real browser inactivity, pause on hidden tabs, and sync across tabs.
 *
 * SmartERP:
 * - Never auto-logout on network or transient server (5xx) errors
 * - Idle logout only when genuinely inactive (no input for the full window)
 * - Definitive auth death (revoked/expired refresh, 401 refresh failure) ALWAYS
 *   forces login — even while the user is typing. Deferring left users on the
 *   app with dead tokens and "token expired" toasts (regression, fixed 2026-08).
 *
 * INVARIANT_SESSION_DEATH_LOGIN_v1 — do not remove; structural lock tests require this token.
 */

import type { AxiosError } from 'axios';

export type RefreshErrorKind = 'network' | 'transient_server' | 'definitive_auth' | 'unknown';

const DEFINITIVE_AUTH_PATTERNS = [
  /invalid refresh token/i,
  /refresh token expired/i,
  /token reuse detected/i,
  /no refresh token/i,
  /account is disabled/i,
  /session has been revoked/i,
  /session expired/i,
  /authentication token required/i,
  /jwt expired/i,
  /invalid token/i,
  /unauthorized/i,
];

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  const ax = err as AxiosError<{ error?: string; message?: string }>;
  const data = ax.response?.data;
  if (data && typeof data === 'object') {
    if (typeof data.error === 'string') return data.error;
    if (typeof data.message === 'string') return data.message;
  }
  return String(err ?? '');
}

/** Classify a refresh failure for logout policy decisions. */
export function classifyRefreshError(err: unknown): RefreshErrorKind {
  const isNetworkError =
    err instanceof Error &&
    (!('response' in err) || (err as AxiosError).response == null);
  if (isNetworkError) return 'network';

  const status = (err as AxiosError)?.response?.status;
  const message = extractErrorMessage(err);

  if (status != null && status >= 500) return 'transient_server';

  if (status === 401 || status === 403) {
    if (DEFINITIVE_AUTH_PATTERNS.some((p) => p.test(message))) {
      return 'definitive_auth';
    }
    // Bare 401/403 on refresh = session is dead on the server
    if (status === 401) return 'definitive_auth';
    if (status === 403) return 'definitive_auth';
  }

  if (DEFINITIVE_AUTH_PATTERNS.some((p) => p.test(message))) {
    return 'definitive_auth';
  }

  return 'unknown';
}

export interface AutoLogoutDecisionInput {
  /** User had recent input in any tab/module, or transaction guard open */
  activeOrGuarded: boolean;
  errorKind: RefreshErrorKind;
  hasRefreshToken: boolean;
  /** Explicit user-initiated logout */
  manualLogout?: boolean;
}

/**
 * Whether the app must clear tokens and send the user to /login.
 *
 * Definitive auth failure always returns true — session is dead server-side;
 * staying on a protected screen only yields token-error toasts.
 * Network/5xx never force logout (retry / keepalive).
 */
export function shouldPerformAutoLogout(input: AutoLogoutDecisionInput): boolean {
  if (input.manualLogout) return true;
  if (!input.hasRefreshToken) return true;

  if (input.errorKind === 'network' || input.errorKind === 'transient_server') {
    return false;
  }

  // Session proven dead — activity does not restore a revoked refresh token.
  if (input.errorKind === 'definitive_auth') {
    return true;
  }

  // Unknown: preserve session (retry); do not force logout while active.
  if (input.activeOrGuarded) return false;
  return false;
}

/** Idle timer fired — only logout if user is not active and no guard is open. */
export function shouldPerformIdleLogout(activeOrGuarded: boolean): boolean {
  return !activeOrGuarded;
}

/**
 * Another tab reported SESSION_EXPIRED.
 * Never ignore: peer already proved refresh is dead; this tab must re-login too.
 * (Previously ignored while “active”, which trapped working tabs on dead sessions.)
 */
export function shouldIgnoreCrossTabSessionExpired(_activeOrGuarded: boolean): boolean {
  return false;
}
