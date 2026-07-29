/**
 * Behavioral evidence for restaurant FOH auto-logout.
 * Proves decisions + side effects (logout + hard redirect), not source greps.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  decideRestaurantFohAutoLogout,
  performRestaurantFohAutoLogout,
  setRestaurantFohAutoLogoutEnabled,
  takeRestaurantPostQuickLoginPath,
  RESTAURANT_FOH_AUTO_LOGOUT_KEY,
  RESTAURANT_QUICK_LOGIN_HREF,
} from './restaurantFohAutoLogout';

const waiterPerms = ['restaurant.read', 'restaurant.order', 'customers.read', 'customers.create'];
const cashierPerms = [
  'restaurant.read',
  'restaurant.order',
  'restaurant.kitchen',
  'restaurant.pay',
  'pos.create',
];

const memoryStore = new Map<string, string>();

function installMemoryStorage() {
  const api = {
    getItem: (k: string) => memoryStore.get(k) ?? null,
    setItem: (k: string, v: string) => {
      memoryStore.set(k, String(v));
    },
    removeItem: (k: string) => {
      memoryStore.delete(k);
    },
    clear: () => memoryStore.clear(),
  };
  Object.defineProperty(globalThis, 'localStorage', { value: api, configurable: true });
  Object.defineProperty(globalThis, 'sessionStorage', { value: api, configurable: true });
}

describe('restaurant FOH auto-logout (behavioral evidence)', () => {
  beforeEach(() => {
    memoryStore.clear();
    installMemoryStorage();
    setRestaurantFohAutoLogoutEnabled(true);
  });

  it('EVIDENCE: Waiter KOT → decide logout true; Admin KOT → false', () => {
    expect(
      decideRestaurantFohAutoLogout({ kind: 'kot', role: 'STAFF', permissions: waiterPerms }),
    ).toBe(true);
    expect(
      decideRestaurantFohAutoLogout({ kind: 'kot', role: 'CASHIER', permissions: cashierPerms }),
    ).toBe(true);
    expect(
      decideRestaurantFohAutoLogout({ kind: 'kot', role: 'ADMIN', permissions: ['*'] }),
    ).toBe(false);
    expect(
      decideRestaurantFohAutoLogout({ kind: 'kot', role: 'MANAGER', permissions: cashierPerms }),
    ).toBe(false);
  });

  it('EVIDENCE: Waiter bill → logout; Cashier/Admin bill → stay signed in', () => {
    expect(
      decideRestaurantFohAutoLogout({ kind: 'bill', role: 'STAFF', permissions: waiterPerms }),
    ).toBe(true);
    expect(
      decideRestaurantFohAutoLogout({ kind: 'bill', role: 'CASHIER', permissions: cashierPerms }),
    ).toBe(false);
    expect(
      decideRestaurantFohAutoLogout({ kind: 'bill', role: 'ADMIN', permissions: ['*'] }),
    ).toBe(false);
  });

  it('EVIDENCE: performRestaurantFohAutoLogout calls logout + hard redirect to quick-login', () => {
    const logout = vi.fn();
    const assignHref = vi.fn();

    const did = performRestaurantFohAutoLogout(
      { kind: 'kot', role: 'STAFF', permissions: waiterPerms },
      { logout, assignHref, returnPath: '/restaurant' },
    );

    expect(did).toBe(true);
    expect(logout).toHaveBeenCalledTimes(1);
    expect(assignHref).toHaveBeenCalledWith(RESTAURANT_QUICK_LOGIN_HREF);
    expect(takeRestaurantPostQuickLoginPath('/pos')).toBe('/restaurant');
  });

  it('EVIDENCE: perform does nothing for Admin (no logout, no redirect)', () => {
    const logout = vi.fn();
    const assignHref = vi.fn();

    const did = performRestaurantFohAutoLogout(
      { kind: 'bill', role: 'ADMIN', permissions: ['restaurant.order', 'restaurant.pay'] },
      { logout, assignHref },
    );

    expect(did).toBe(false);
    expect(logout).not.toHaveBeenCalled();
    expect(assignHref).not.toHaveBeenCalled();
  });

  it('EVIDENCE: device option OFF blocks all auto-logout', () => {
    setRestaurantFohAutoLogoutEnabled(false);
    expect(localStorage.getItem(RESTAURANT_FOH_AUTO_LOGOUT_KEY)).toBe('0');

    const logout = vi.fn();
    const assignHref = vi.fn();
    const did = performRestaurantFohAutoLogout(
      { kind: 'kot', role: 'STAFF', permissions: waiterPerms },
      { logout, assignHref },
    );

    expect(did).toBe(false);
    expect(logout).not.toHaveBeenCalled();
    expect(assignHref).not.toHaveBeenCalled();
  });

  it('EVIDENCE: Waiter bill still logs out when restaurantEnabled flag is undefined', () => {
    // Simulates FOH page before flag query resolves — must not skip logout.
    expect(
      decideRestaurantFohAutoLogout({
        kind: 'bill',
        role: 'STAFF',
        permissions: waiterPerms,
      }),
    ).toBe(true);
  });

  it('EVIDENCE: FOH page + quick-login wire perform/take (no soft navigate race)', async () => {
    const { readFileSync } = await import('node:fs');
    const { dirname, resolve } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const foh = readFileSync(resolve(root, 'pages/restaurant/RestaurantPosPage.tsx'), 'utf8');
    const quick = readFileSync(resolve(root, 'pages/pos/QuickLoginScreen.tsx'), 'utf8');

    expect(foh).toContain('performRestaurantFohAutoLogout');
    expect(foh).toContain("maybeAutoLogoutAfterPrint('kot')");
    expect(foh).toContain("maybeAutoLogoutAfterPrint('bill')");
    // Soft Router navigate was the race — must not be used for session end.
    expect(foh).not.toMatch(/navigate\(\s*['"]\/quick-login['"]/);
    expect(quick).toContain('takeRestaurantPostQuickLoginPath');
  });
});
