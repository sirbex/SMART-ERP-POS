/**
 * Enterprise session proof — GLOBAL rule: no auto-logout while typing in any
 * module, any tab, any screen (SAP/Odoo aligned).
 *
 * Complements session-reliability.spec.ts with cross-tab sync, all activity
 * events, module-agnostic policy matrix, and 401-handler integration.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const _store: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => _store[key] ?? null,
  setItem: (key: string, value: string) => { _store[key] = value; },
  removeItem: (key: string) => { delete _store[key]; },
  clear: () => { Object.keys(_store).forEach((k) => delete _store[k]); },
};
// @ts-expect-error test env
global.localStorage = localStorageMock;

const _windowListeners: Record<string, Array<(e: Event) => void>> = {};
const windowMock = {
  addEventListener: (type: string, fn: (e: Event) => void) => {
    (_windowListeners[type] ??= []).push(fn);
  },
  removeEventListener: (type: string, fn: (e: Event) => void) => {
    _windowListeners[type] = (_windowListeners[type] ?? []).filter((h) => h !== fn);
  },
  dispatchEvent: (event: Event) => {
    for (const fn of _windowListeners[event.type] ?? []) fn(event);
    return true;
  },
  location: { pathname: '/dashboard', href: '' },
};
// @ts-expect-error test env
global.window = windowMock;

class MockStorageEvent extends Event {
  key: string | null;
  newValue: string | null;
  constructor(type: string, init: { key?: string; newValue?: string | null }) {
    super(type);
    this.key = init.key ?? null;
    this.newValue = init.newValue ?? null;
  }
}
// @ts-expect-error test env
global.StorageEvent = MockStorageEvent;

vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
    create: vi.fn(() => ({
      post: vi.fn(),
      interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
    })),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
}));

import {
  touchSessionActivity,
  getEffectiveLastActivityAt,
  readPeerTabActivityAt,
  syncActivityFromPeerTab,
  initCrossTabActivitySync,
  setTransactionGuardDepth,
  isUserActiveOrGuarded,
  ACTIVE_SESSION_WINDOW_MS,
  GLOBAL_SESSION_ACTIVITY_EVENTS,
  __resetSessionActivityForTests,
} from '../lib/sessionActivity';
import {
  classifyRefreshError,
  shouldPerformAutoLogout,
  shouldPerformIdleLogout,
  shouldIgnoreCrossTabSessionExpired,
} from '../lib/sessionLogoutPolicy';
import {
  storeTokens,
  clearTokens,
  build401Handler,
  getAccessToken,
  resetAuthState,
} from '../hooks/useTokenRefresh';

const ERP_MODULES = [
  'Sales / POS',
  'Purchase Orders',
  'Goods Receipts',
  'Supplier Payments',
  'Customer Payments',
  'Banking',
  'Journal Entries',
  'Chart of Accounts',
  'Inventory Adjustments',
  'Products',
  'Customers',
  'Suppliers',
  'Reports',
  'Settings',
  'Expenses',
  'CRM',
  'HR',
  'Delivery',
] as const;

describe('Enterprise — global activity events (all modules)', () => {
  it('registers deliberate interaction events only (not passive mousemove/scroll)', () => {
    expect(GLOBAL_SESSION_ACTIVITY_EVENTS).toContain('keydown');
    expect(GLOBAL_SESSION_ACTIVITY_EVENTS).toContain('input');
    expect(GLOBAL_SESSION_ACTIVITY_EVENTS).toContain('mousedown');
    expect(GLOBAL_SESSION_ACTIVITY_EVENTS).toContain('paste');
    expect(GLOBAL_SESSION_ACTIVITY_EVENTS).toContain('compositionstart');
    expect(GLOBAL_SESSION_ACTIVITY_EVENTS).not.toContain('mousemove');
    expect(GLOBAL_SESSION_ACTIVITY_EVENTS).not.toContain('scroll');
    expect(GLOBAL_SESSION_ACTIVITY_EVENTS.length).toBeGreaterThanOrEqual(8);
  });
});

describe('Enterprise — cross-tab activity sync (Odoo pattern)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    __resetSessionActivityForTests();
    setTransactionGuardDepth(0);
    touchSessionActivity();
  });

  afterEach(() => {
    vi.useRealTimers();
    setTransactionGuardDepth(0);
  });

  it('touchSessionActivity persists timestamp to localStorage', () => {
    vi.advanceTimersByTime(3000);
    touchSessionActivity();
    const stored = localStorage.getItem('smarterp_last_activity_at');
    expect(stored).not.toBeNull();
    expect(parseInt(stored!, 10)).toBeGreaterThan(0);
  });

  it('peer tab typing keeps this tab active via getEffectiveLastActivityAt', () => {
    vi.advanceTimersByTime(ACTIVE_SESSION_WINDOW_MS - 60_000);
    touchSessionActivity();
    const peerTs = String(Date.now());
    syncActivityFromPeerTab(peerTs);
    expect(getEffectiveLastActivityAt()).toBe(parseInt(peerTs, 10));
    expect(isUserActiveOrGuarded()).toBe(true);
  });

  it('initCrossTabActivitySync picks up storage events from other tabs', () => {
    const cleanup = initCrossTabActivitySync();
    vi.advanceTimersByTime(ACTIVE_SESSION_WINDOW_MS - 30_000);
    touchSessionActivity();
    const peerNow = String(Date.now());
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'smarterp_last_activity_at',
        newValue: peerNow,
      }),
    );
    expect(readPeerTabActivityAt()).toBe(parseInt(peerNow, 10));
    expect(isUserActiveOrGuarded()).toBe(true);
    cleanup();
  });

  it('tab B typing protects tab A from idle logout policy', () => {
    vi.advanceTimersByTime(ACTIVE_SESSION_WINDOW_MS - 5000);
    touchSessionActivity();
    syncActivityFromPeerTab(String(Date.now()));
    expect(shouldPerformIdleLogout(isUserActiveOrGuarded())).toBe(false);
  });
});

describe('Enterprise — module-agnostic auto-logout policy matrix', () => {
  const base = { hasRefreshToken: true, manualLogout: false };

  for (const moduleName of ERP_MODULES) {
    it(`${moduleName}: active user + network error → NO auto-logout`, () => {
      touchSessionActivity();
      expect(
        shouldPerformAutoLogout({
          ...base,
          activeOrGuarded: isUserActiveOrGuarded(),
          errorKind: 'network',
        }),
      ).toBe(false);
    });

    it(`${moduleName}: active user + server 500 → NO auto-logout`, () => {
      touchSessionActivity();
      expect(
        shouldPerformAutoLogout({
          ...base,
          activeOrGuarded: isUserActiveOrGuarded(),
          errorKind: 'transient_server',
        }),
      ).toBe(false);
    });

    it(`${moduleName}: active user + definitive auth → deferred (NO auto-logout)`, () => {
      touchSessionActivity();
      expect(
        shouldPerformAutoLogout({
          ...base,
          activeOrGuarded: isUserActiveOrGuarded(),
          errorKind: 'definitive_auth',
        }),
      ).toBe(false);
    });
  }

  it('genuinely idle user (all tabs) + definitive auth → logout allowed', () => {
    vi.useFakeTimers();
    __resetSessionActivityForTests();
    expect(isUserActiveOrGuarded()).toBe(false);
    expect(
      shouldPerformAutoLogout({
        ...base,
        activeOrGuarded: false,
        errorKind: 'definitive_auth',
      }),
    ).toBe(true);
    vi.useRealTimers();
  });

  it('genuinely idle user + network error → still NO auto-logout (retry pattern)', () => {
    expect(
      shouldPerformAutoLogout({
        ...base,
        activeOrGuarded: false,
        errorKind: 'network',
      }),
    ).toBe(false);
  });
});

describe('Enterprise — 401 handler integration (active user protected)', () => {
  beforeEach(() => {
    localStorage.clear();
    resetAuthState();
    storeTokens('access-active', 'refresh-active', 3600);
    vi.stubGlobal('navigator', { ...navigator, onLine: true });
  });

  afterEach(() => {
    clearTokens();
    resetAuthState();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('build401Handler does NOT clear tokens on 500 refresh failure while user is active', async () => {
    touchSessionActivity();
    localStorage.setItem('token_expiry', String(Date.now() - 1000));

    const refreshSpy = vi.spyOn(
      await import('../hooks/useTokenRefresh'),
      'refreshAccessToken',
    ).mockRejectedValue({
      response: { status: 500, data: { error: 'Internal server error' } },
    });

    const mockInstance = vi.fn();
    const handler = build401Handler(mockInstance as never);

    const error401 = {
      response: { status: 401 },
      config: { url: '/api/sales', headers: {}, _retry: false },
    };

    try {
      await handler(error401 as never);
    } catch {
      /* expected */
    }
    expect(getAccessToken()).toBe('access-active');
    expect(localStorage.getItem('auth_token')).toBe('access-active');
    refreshSpy.mockRestore();
  });

  it('idle user policy allows logout on definitive refresh failure (after 60m zero input)', () => {
    __resetSessionActivityForTests();
    expect(isUserActiveOrGuarded()).toBe(false);
    expect(
      shouldPerformAutoLogout({
        hasRefreshToken: true,
        activeOrGuarded: false,
        errorKind: 'definitive_auth',
      }),
    ).toBe(true);
  });
});

describe('Enterprise — cross-tab SESSION_EXPIRED while working', () => {
  it('working tab ignores peer SESSION_EXPIRED broadcast', () => {
    touchSessionActivity();
    expect(shouldIgnoreCrossTabSessionExpired(isUserActiveOrGuarded())).toBe(true);
  });

  it('idle tab honors peer SESSION_EXPIRED broadcast', () => {
    __resetSessionActivityForTests();
    expect(shouldIgnoreCrossTabSessionExpired(isUserActiveOrGuarded())).toBe(false);
  });
});

describe('Enterprise — refresh error classification accuracy', () => {
  it('classifies token reuse as definitive_auth', () => {
    expect(
      classifyRefreshError({
        response: {
          status: 401,
          data: { error: 'Token reuse detected. All sessions have been revoked for security.' },
        },
      }),
    ).toBe('definitive_auth');
  });

  it('classifies 503 as transient_server', () => {
    expect(
      classifyRefreshError({
        response: { status: 503, data: { error: 'Service unavailable' } },
      }),
    ).toBe('transient_server');
  });

  it('classifies ECONNABORTED as network', () => {
    expect(classifyRefreshError(new Error('Network Error'))).toBe('network');
  });
});
