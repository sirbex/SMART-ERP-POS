import { beforeEach, describe, expect, it } from 'vitest';
import {
  AUTH_BOOT_SESSION_KEY,
  isBrowserColdStart,
  markBrowserSessionAlive,
  roleRequiresColdStartPinGate,
  shouldEnforceColdStartPinGate,
} from './sessionColdStartLock';

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

function installMemoryStorage() {
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: memoryStorage(),
    configurable: true,
  });
  Object.defineProperty(globalThis, 'localStorage', {
    value: memoryStorage(),
    configurable: true,
  });
}

describe('sessionColdStartLock', () => {
  beforeEach(() => {
    installMemoryStorage();
  });

  it('EVIDENCE: cold start until markBrowserSessionAlive', () => {
    expect(isBrowserColdStart()).toBe(true);
    markBrowserSessionAlive();
    expect(isBrowserColdStart()).toBe(false);
    expect(sessionStorage.getItem(AUTH_BOOT_SESSION_KEY)).toBe('1');
  });

  it('EVIDENCE: cashier/waiter/staff require PIN gate; admin/manager do not', () => {
    expect(roleRequiresColdStartPinGate('CASHIER')).toBe(true);
    expect(roleRequiresColdStartPinGate('WAITER')).toBe(true);
    expect(roleRequiresColdStartPinGate('STAFF')).toBe(true);
    expect(roleRequiresColdStartPinGate('ACCOUNTANT')).toBe(true);
    expect(roleRequiresColdStartPinGate('ADMIN')).toBe(false);
    expect(roleRequiresColdStartPinGate('MANAGER')).toBe(false);
  });

  it('EVIDENCE: enforce only on cold start with a stored session', () => {
    expect(
      shouldEnforceColdStartPinGate({ role: 'CASHIER', hasStoredSession: true }),
    ).toBe(true);
    markBrowserSessionAlive();
    expect(
      shouldEnforceColdStartPinGate({ role: 'CASHIER', hasStoredSession: true }),
    ).toBe(false);
    sessionStorage.clear();
    expect(
      shouldEnforceColdStartPinGate({ role: 'ADMIN', hasStoredSession: true }),
    ).toBe(false);
    expect(
      shouldEnforceColdStartPinGate({ role: 'CASHIER', hasStoredSession: false }),
    ).toBe(false);
  });
});
