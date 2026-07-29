/**
 * Restaurant FOH auto-logout after print / KOT — shared waiter terminal pattern.
 *
 * Rules (when device option is ON — default):
 * - After KOT (kitchen and/or bar): logout unless ADMIN or MANAGER
 * - After guest bill: logout for waiter/waitress profiles
 *
 * Uses hard navigation to /quick-login so React Router's unauthenticated `*`
 * catch-all cannot win the race and bounce staff to /login instead.
 */

import { isRestaurantWaiterProfile, type WaiterProfileInput } from './restaurantWaiterLockdown';

export const RESTAURANT_FOH_AUTO_LOGOUT_KEY = 'restaurant_foh_auto_logout_after_print';
export const RESTAURANT_POST_QUICK_LOGIN_PATH_KEY = 'restaurant_post_quick_login_path';
export const RESTAURANT_QUICK_LOGIN_HREF = '/quick-login';

function storageGet(kind: 'localStorage' | 'sessionStorage', key: string): string | null {
  try {
    const store = globalThis[kind];
    if (!store) return null;
    return store.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(kind: 'localStorage' | 'sessionStorage', key: string, value: string): void {
  try {
    const store = globalThis[kind];
    if (!store) return;
    store.setItem(key, value);
  } catch {
    /* private mode */
  }
}

function storageRemove(kind: 'localStorage' | 'sessionStorage', key: string): void {
  try {
    const store = globalThis[kind];
    if (!store) return;
    store.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Default ON — waiter terminals should rotate staff after print. */
export function isRestaurantFohAutoLogoutEnabled(): boolean {
  const raw = storageGet('localStorage', RESTAURANT_FOH_AUTO_LOGOUT_KEY);
  if (raw === null) return true;
  return raw === '1' || raw === 'true';
}

export function setRestaurantFohAutoLogoutEnabled(enabled: boolean): void {
  storageSet('localStorage', RESTAURANT_FOH_AUTO_LOGOUT_KEY, enabled ? '1' : '0');
}

export function isAdminOrManagerRole(role?: string | null): boolean {
  const r = (role || '').toUpperCase();
  return r === 'ADMIN' || r === 'MANAGER';
}

/**
 * KOT / kitchen-bar print: rotate session for everyone except admin & manager.
 */
export function shouldAutoLogoutAfterKot(role?: string | null): boolean {
  if (!isRestaurantFohAutoLogoutEnabled()) return false;
  return !isAdminOrManagerRole(role);
}

/**
 * Guest bill print: rotate session for waiter/waitress FOH profiles only.
 * On the restaurant page, treat restaurantEnabled as true when deciding (FOH is open).
 */
export function shouldAutoLogoutAfterBill(input: WaiterProfileInput): boolean {
  if (!isRestaurantFohAutoLogoutEnabled()) return false;
  if (isAdminOrManagerRole(input.role)) return false;
  return isRestaurantWaiterProfile({
    ...input,
    // Bill only fires from Restaurant FOH — never require the async flag to be true.
    restaurantEnabled: input.restaurantEnabled !== false,
  });
}

export function stashRestaurantPostQuickLoginPath(path = '/restaurant'): void {
  storageSet('sessionStorage', RESTAURANT_POST_QUICK_LOGIN_PATH_KEY, path);
}

export function takeRestaurantPostQuickLoginPath(fallback = '/pos'): string {
  const path = storageGet('sessionStorage', RESTAURANT_POST_QUICK_LOGIN_PATH_KEY);
  storageRemove('sessionStorage', RESTAURANT_POST_QUICK_LOGIN_PATH_KEY);
  if (path === '/restaurant' || path?.startsWith('/restaurant')) return path;
  return fallback;
}

export type FohAutoLogoutKind = 'kot' | 'bill';

export type FohAutoLogoutDecisionInput = {
  kind: FohAutoLogoutKind;
  role?: string | null;
  permissions?: Iterable<string> | null;
};

/**
 * Pure decision — used by FOH handlers and by behavioral evidence tests.
 */
export function decideRestaurantFohAutoLogout(input: FohAutoLogoutDecisionInput): boolean {
  if (input.kind === 'kot') return shouldAutoLogoutAfterKot(input.role);
  return shouldAutoLogoutAfterBill({
    role: input.role,
    permissions: input.permissions,
    restaurantEnabled: true,
  });
}

export type FohAutoLogoutDeps = {
  logout: () => void;
  /** Hard navigation target (defaults to location.assign). */
  assignHref?: (href: string) => void;
  returnPath?: string;
};

/**
 * Execute session end for shared FOH terminal.
 * Returns true when logout+redirect ran.
 */
export function performRestaurantFohAutoLogout(
  input: FohAutoLogoutDecisionInput,
  deps: FohAutoLogoutDeps,
): boolean {
  if (!decideRestaurantFohAutoLogout(input)) return false;
  stashRestaurantPostQuickLoginPath(deps.returnPath || '/restaurant');
  deps.logout();
  const assign =
    deps.assignHref ||
    ((href: string) => {
      if (typeof window !== 'undefined' && window.location) {
        window.location.assign(href);
      }
    });
  assign(RESTAURANT_QUICK_LOGIN_HREF);
  return true;
}
