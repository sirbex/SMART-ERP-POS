/**
 * EVIDENCE: after reboot / browser cold start, shared POS roles must not silently
 * restore the last user — AuthContext enforces PIN gate → /quick-login.
 * Plus notification SSOT: no duplicate FOH toasts; ownership 403 keeps waiter copy.
 *
 * Run: npx vitest run src/__tests__/session-cold-start-lock.evidence.test.ts src/lib/sessionColdStartLock.test.ts
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AxiosError } from 'axios';
import { RESTAURANT_CHECK_OWNED_MESSAGE } from '@shared/utils/restaurantCheckOwnership';

vi.mock('react-hot-toast', () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));

import toast from 'react-hot-toast';
import {
  HandledApiError,
  resolveUserFacingApiNotification,
  toastApiError,
  friendlyHttpErrorMessage,
} from '../utils/errorHandler';
import {
  isBrowserColdStart,
  markBrowserSessionAlive,
  roleRequiresColdStartPinGate,
  shouldEnforceColdStartPinGate,
} from '../lib/sessionColdStartLock';

const root = resolve(__dirname, '..');

function read(rel: string): string {
  return readFileSync(resolve(root, rel), 'utf8');
}

function memoryStorage() {
  const mem = new Map<string, string>();
  return {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => {
      mem.set(k, String(v));
    },
    removeItem: (k: string) => {
      mem.delete(k);
    },
    clear: () => mem.clear(),
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() {
      return mem.size;
    },
  };
}

function makeAxiosError(status: number, apiError: string): AxiosError {
  return {
    isAxiosError: true,
    response: {
      status,
      data: { success: false, error: apiError },
      headers: {},
      config: {} as AxiosError['config'],
      statusText: 'Error',
    },
    config: {} as AxiosError['config'],
    message: `Request failed with status code ${status}`,
    name: 'AxiosError',
    toJSON: () => ({}),
  } as unknown as AxiosError;
}

describe('EVIDENCE — cold-start PIN gate (reboot walk-up)', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'sessionStorage', {
      value: memoryStorage(),
      configurable: true,
    });
    vi.mocked(toast.error).mockClear();
  });

  it('structural: AuthContext wires clearTokens + quick-login hard-nav', () => {
    const lock = read('lib/sessionColdStartLock.ts');
    const auth = read('contexts/AuthContext.tsx');

    expect(lock).toMatch(/shouldEnforceColdStartPinGate/);
    expect(lock).toMatch(/roleRequiresColdStartPinGate/);
    expect(lock).toMatch(/isBrowserColdStart/);
    expect(lock).toMatch(/markBrowserSessionAlive/);
    expect(lock).toMatch(/COLD_START_QUICK_LOGIN_HREF/);

    expect(auth).toMatch(/shouldEnforceColdStartPinGate/);
    expect(auth).toMatch(/clearTokens\(\)/);
    expect(auth).toMatch(/COLD_START_QUICK_LOGIN_HREF/);
    expect(auth).toMatch(/markBrowserSessionAlive\(\)/);
  });

  it('runtime: cold start enforces PIN for cashier; admin restores; alive clears gate', () => {
    expect(isBrowserColdStart()).toBe(true);
    expect(
      shouldEnforceColdStartPinGate({ role: 'CASHIER', hasStoredSession: true }),
    ).toBe(true);
    expect(
      shouldEnforceColdStartPinGate({ role: 'WAITER', hasStoredSession: true }),
    ).toBe(true);
    expect(
      shouldEnforceColdStartPinGate({ role: 'ADMIN', hasStoredSession: true }),
    ).toBe(false);
    expect(roleRequiresColdStartPinGate('MANAGER')).toBe(false);

    markBrowserSessionAlive();
    expect(isBrowserColdStart()).toBe(false);
    expect(
      shouldEnforceColdStartPinGate({ role: 'CASHIER', hasStoredSession: true }),
    ).toBe(false);
  });

  it('structural: FOH mutations use toastApiError (no toast.error(apiErr))', () => {
    const pos = read('pages/restaurant/RestaurantPosPage.tsx');
    expect(pos).toMatch(/toastApiError/);
    expect(pos).not.toMatch(/toast\.error\(apiErr\(/);
    expect(pos).toMatch(/getStructuredErrorMessage/);
  });

  it('runtime: ownership 403 keeps waiter body + Table in use title', () => {
    expect(friendlyHttpErrorMessage(403, RESTAURANT_CHECK_OWNED_MESSAGE)).toBe(
      RESTAURANT_CHECK_OWNED_MESSAGE,
    );
    const note = resolveUserFacingApiNotification(
      makeAxiosError(403, RESTAURANT_CHECK_OWNED_MESSAGE),
    );
    expect(note.title).toBe('Table in use');
    expect(note.message).toBe(RESTAURANT_CHECK_OWNED_MESSAGE);
    expect(note.toastId).toBe('app-forbidden-ownership');
    expect(note.message).not.toMatch(/status code/i);
  });

  it('runtime: toastApiError skips HandledApiError (no duplicate popup)', () => {
    toastApiError(new HandledApiError(RESTAURANT_CHECK_OWNED_MESSAGE));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('structural: App + errorHandler ownership toast chrome', () => {
    const handler = read('utils/errorHandler.ts');
    const app = read('App.tsx');
    expect(handler).toMatch(/friendlyHttpErrorMessage\(403, parsed\.message/);
    expect(handler).toMatch(/Table in use/);
    expect(app).toMatch(/Table in use/);
    expect(app).toMatch(/app-forbidden-ownership/);
  });
});
