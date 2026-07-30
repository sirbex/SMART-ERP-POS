/**
 * Phase D — Cashier lockdown: POS-first access, no inventory admin surfaces.
 * Also resolves post-login home for cashiers and restaurant waiters.
 * When restaurant mode is on, cashiers land on Restaurant FOH (not retail /pos).
 */

import { isWarehouseRoutePath } from '../../../shared/utils/warehouseRbac';
import {
  isRestaurantWaiterProfile,
  isWaiterAllowedPath,
  WAITER_HOME_PATH,
} from './restaurantWaiterLockdown';
import { shouldHideRetailPos } from './retailPosVisibility';

export const CASHIER_HOME_PATH = '/pos';
export const CASHIER_RESTAURANT_HOME_PATH = '/restaurant';

export function isCashierRole(role?: string | null): boolean {
  return role === 'CASHIER';
}

export function resolveCashierHomePath(restaurantEnabled?: boolean | null): string {
  return shouldHideRetailPos(restaurantEnabled)
    ? CASHIER_RESTAURANT_HOME_PATH
    : CASHIER_HOME_PATH;
}

/** Paths a cashier may open (prefix rules). Everything else redirects to home. */
export function isCashierAllowedPath(
  pathname: string,
  opts?: { restaurantEnabled?: boolean | null },
): boolean {
  if (isWarehouseRoutePath(pathname)) return false;

  const restaurantMode = shouldHideRetailPos(opts?.restaurantEnabled);
  if (restaurantMode) {
    // Restaurant tenant: FOH only — not retail POS.
    if (pathname === '/pos' || pathname.startsWith('/pos/')) return false;
    if (pathname === '/restaurant' || pathname.startsWith('/restaurant?')) return true;
    // Cashiers do not get kitchen/stations/recipes config — only floor.
    if (pathname.startsWith('/restaurant/')) return false;
  } else if (pathname === '/pos' || pathname.startsWith('/pos/')) {
    return true;
  }

  if (pathname === '/customers' || pathname.startsWith('/customers/')) return true;
  if (pathname === '/sales' || pathname.startsWith('/sales/')) return true;
  // Inventory browse (stock levels / products / batches) — warehouse network stays blocked above.
  if (pathname === '/inventory' || pathname.startsWith('/inventory/')) return true;
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
 * Cashier → POS (or Restaurant when mode on); restaurant waiter → Restaurant FOH; else dashboard / intended.
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
    const home = resolveCashierHomePath(opts.restaurantEnabled);
    if (intendedPath && isCashierAllowedPath(intendedPath, opts)) {
      return intendedPath;
    }
    return home;
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

/** Minimal navigation for cashiers — POS workflow only (Restaurant when mode on). */
export const CASHIER_NAV_ITEMS: CashierNavItem[] = [
  { name: 'Point of Sale', path: '/pos', icon: '🛒' },
  { name: 'Orders Queue', path: '/orders-queue', icon: '📋' },
  { name: 'My Sales', path: '/sales', icon: '💰' },
  { name: 'Customers', path: '/customers', icon: '👥' },
  { name: 'Inventory', path: '/inventory/stock-levels', icon: '📦' },
];

export function resolveCashierNavItems(
  restaurantEnabled?: boolean | null,
): CashierNavItem[] {
  if (!shouldHideRetailPos(restaurantEnabled)) return CASHIER_NAV_ITEMS;
  return [
    { name: 'Restaurant', path: '/restaurant', icon: '🍽️' },
    { name: 'Orders Queue', path: '/orders-queue', icon: '📋' },
    { name: 'My Sales', path: '/sales', icon: '💰' },
    { name: 'Customers', path: '/customers', icon: '👥' },
    { name: 'Inventory', path: '/inventory/stock-levels', icon: '📦' },
  ];
}
