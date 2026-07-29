/**
 * Phase D — Cashier lockdown: POS-first access, no inventory admin surfaces.
 * Also resolves post-login home for cashiers and restaurant waiters.
 */

import { isWarehouseRoutePath } from '../../../shared/utils/warehouseRbac';
import {
  isRestaurantWaiterProfile,
  isWaiterAllowedPath,
  WAITER_HOME_PATH,
} from './restaurantWaiterLockdown';

export const CASHIER_HOME_PATH = '/pos';

export function isCashierRole(role?: string | null): boolean {
  return role === 'CASHIER';
}

/** Paths a cashier may open (prefix rules). Everything else redirects to POS. */
export function isCashierAllowedPath(pathname: string): boolean {
  if (isWarehouseRoutePath(pathname)) return false;
  if (pathname === '/pos' || pathname.startsWith('/pos/')) return true;
  if (pathname === '/customers' || pathname.startsWith('/customers/')) return true;
  if (pathname === '/sales' || pathname.startsWith('/sales/')) return true;
  if (pathname === '/orders-queue') return true;
  if (/^\/orders\/[^/]+\/pay$/.test(pathname)) return true;
  if (pathname === '/my/quick-login') return true;
  return false;
}

export type PostLoginPathInput = {
  role?: string | null;
  permissions?: Iterable<string> | null;
  restaurantEnabled?: boolean;
};

/**
 * Where to land after login.
 * Cashier → POS; restaurant waiter → Restaurant FOH; else dashboard / intended.
 */
export function resolvePostLoginPath(
  roleOrOpts: string | undefined | null | PostLoginPathInput,
  intendedPath?: string,
): string {
  const opts: PostLoginPathInput =
    roleOrOpts && typeof roleOrOpts === 'object'
      ? roleOrOpts
      : { role: roleOrOpts ?? undefined };

  if (isCashierRole(opts.role)) {
    if (intendedPath && isCashierAllowedPath(intendedPath)) {
      return intendedPath;
    }
    return CASHIER_HOME_PATH;
  }

  if (isRestaurantWaiterProfile(opts)) {
    if (intendedPath && isWaiterAllowedPath(intendedPath)) {
      return intendedPath;
    }
    return WAITER_HOME_PATH;
  }

  return intendedPath || '/dashboard';
}

export interface CashierNavItem {
  name: string;
  path: string;
  icon: string;
}

/** Minimal navigation for cashiers — POS workflow only. */
export const CASHIER_NAV_ITEMS: CashierNavItem[] = [
  { name: 'Point of Sale', path: '/pos', icon: '🛒' },
  { name: 'Orders Queue', path: '/orders-queue', icon: '📋' },
  { name: 'My Sales', path: '/sales', icon: '💰' },
  { name: 'Customers', path: '/customers', icon: '👥' },
];
