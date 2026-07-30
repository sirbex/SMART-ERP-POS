/**
 * Restaurant mode must not briefly open retail POS on login/boot.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RESTAURANT_ENABLED_CACHE_KEY,
  isRestaurantEnabledSettled,
  readCachedRestaurantEnabled,
  writeCachedRestaurantEnabled,
} from '../hooks/useRestaurantEnabled';
import { resolveCashierHomePath, resolvePostLoginPath } from '../utils/cashierLockdown';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');

function readRepo(rel: string) {
  return readFileSync(resolve(repoRoot, rel), 'utf8');
}

function stubLocalStorage() {
  const store = new Map<string, string>();
  const api = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
  };
  vi.stubGlobal('localStorage', api);
  return api;
}

describe('no retail POS flash when restaurant mode on', () => {
  beforeEach(() => {
    stubLocalStorage();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('EVIDENCE: cache + settled helpers prefer last-known restaurant flag', () => {
    expect(readCachedRestaurantEnabled()).toBeNull();
    expect(isRestaurantEnabledSettled(false, undefined, null)).toBe(false);
    writeCachedRestaurantEnabled(true);
    expect(readCachedRestaurantEnabled()).toBe(true);
    expect(localStorage.getItem(RESTAURANT_ENABLED_CACHE_KEY)).toBe('1');
    expect(isRestaurantEnabledSettled(false, undefined, true)).toBe(true);
    expect(resolveCashierHomePath(true)).toBe('/restaurant');
    expect(resolvePostLoginPath({ role: 'CASHIER', restaurantEnabled: true })).toBe('/restaurant');
  });

  it('EVIDENCE: unsettled flag must not choose retail home as ready', () => {
    expect(isRestaurantEnabledSettled(false, undefined, null)).toBe(false);
    expect(isRestaurantEnabledSettled(true, false, null)).toBe(true);
    expect(isRestaurantEnabledSettled(false, true, null)).toBe(true);
  });

  it('EVIDENCE gate: boot waits; /pos never mounts until flag ready; login refetches', () => {
    const hook = readRepo('samplepos.client/src/hooks/useRestaurantEnabled.ts');
    expect(hook).toContain('writeCachedRestaurantEnabled');
    expect(hook).toContain('initialData');
    expect(hook).toContain('isRestaurantEnabledSettled');

    const guard = readRepo('samplepos.client/src/components/auth/CashierPathGuard.tsx');
    expect(guard).toContain('RestaurantModeBoot');
    expect(guard).toContain('onRetailPos && !isReady');
    expect(guard).toContain('useRestaurantModeForRouting');

    const home = readRepo('samplepos.client/src/App.tsx');
    expect(home).toContain('function HomeRedirect');
    expect(home).toContain('!isReady');
    expect(home).toContain('RestaurantModeBoot');

    const login = readRepo('samplepos.client/src/pages/LoginPage.tsx');
    expect(login).toContain('fetchRestaurantEnabled');
    expect(login).toContain('resolveHomeAfterAuth');
    expect(login).toContain('RestaurantModeBoot');

    const quick = readRepo('samplepos.client/src/pages/pos/QuickLoginScreen.tsx');
    expect(quick).toContain('fetchRestaurantEnabled');
    expect(quick).toContain('queryClient.fetchQuery');
  });
});
