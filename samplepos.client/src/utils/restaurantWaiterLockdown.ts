/**
 * Restaurant Waiter lockdown — FOH-first access.
 * Waiters operate tables/checks only; kitchen config surfaces stay hidden.
 *
 * Detection (permission profile, not just legacy role):
 * - Has restaurant.order (floor service)
 * - Lacks restaurant.kitchen, restaurant.manage, restaurant.pay
 * - Not ADMIN / MANAGER / CASHIER legacy roles
 */

export const WAITER_HOME_PATH = '/restaurant';

const WAITER_BLOCKED_PREFIXES = [
  '/restaurant/kitchen',
  '/restaurant/stations',
  '/restaurant/recipes',
  '/restaurant/order-tags',
] as const;

export interface WaiterProfileInput {
  role?: string | null;
  permissions?: Iterable<string> | null;
  /** When false, never treat as waiter lockdown (module off). Default true for login. */
  restaurantEnabled?: boolean;
}

function permissionSet(permissions?: Iterable<string> | null): Set<string> {
  if (!permissions) return new Set();
  return permissions instanceof Set ? permissions : new Set(permissions);
}

/**
 * True when this user is a floor waiter — Restaurant FOH only.
 */
export function isRestaurantWaiterProfile(input: WaiterProfileInput): boolean {
  if (input.restaurantEnabled === false) return false;
  const role = (input.role || '').toUpperCase();
  if (role === 'ADMIN' || role === 'MANAGER' || role === 'CASHIER') return false;

  const perms = permissionSet(input.permissions);
  // Explicit WAITER legacy without a permission cache yet (login race)
  if (perms.size === 0) {
    return role === 'WAITER';
  }

  if (!perms.has('restaurant.order')) return false;
  if (perms.has('restaurant.kitchen')) return false;
  if (perms.has('restaurant.manage')) return false;
  if (perms.has('restaurant.pay')) return false;
  // Admins always have broad keys — exclude if they look like system operators
  if (perms.has('admin.update') || perms.has('admin.delete') || perms.has('system.manage')) {
    return false;
  }
  return true;
}

/** Paths a waiter may open. Everything else redirects to Restaurant FOH. */
export function isWaiterAllowedPath(pathname: string): boolean {
  if (WAITER_BLOCKED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return false;
  }
  if (pathname === '/restaurant' || pathname.startsWith('/restaurant?')) return true;
  if (pathname.startsWith('/restaurant/')) {
    // Only the FOH root is allowed under /restaurant/*
    return false;
  }
  if (pathname === '/customers' || pathname.startsWith('/customers/')) return true;
  if (pathname === '/my/quick-login') return true;
  if (pathname === '/login') return true;
  return false;
}

export function isRestaurantConfigPath(pathname: string): boolean {
  return WAITER_BLOCKED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export interface WaiterNavItem {
  name: string;
  path: string;
  icon: string;
}

/** Minimal navigation for waiters — table service only. */
export const WAITER_NAV_ITEMS: WaiterNavItem[] = [
  { name: 'Restaurant', path: '/restaurant', icon: '🍽️' },
  { name: 'Customers', path: '/customers', icon: '👥' },
];
