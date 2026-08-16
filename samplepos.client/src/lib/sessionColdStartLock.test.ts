import { beforeEach, describe, expect, it } from 'vitest';
import {
  AUTH_BOOT_SESSION_KEY,
  isBrowserColdStart,
  isWithinLoginGrace,
  markBrowserSessionAlive,
  markLoginGrace,
  roleRequiresColdStartPinGate,
  shouldEnforceColdStartPinGate,
} from './sessionColdStartLock';
import {
  ACTOR_LOCK_KEY,
  DEVICE_SESSION_MODE_KEY,
  setActorLock,
  clearActorLock,
  setDeviceSessionMode,
} from './deviceSessionPolicy';

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

  it('EVIDENCE SHARED default: every role requires re-auth gate', () => {
    // Default mode is SHARED (max security for walk-up terminals)
    expect(roleRequiresColdStartPinGate('CASHIER')).toBe(true);
    expect(roleRequiresColdStartPinGate('WAITER')).toBe(true);
    expect(roleRequiresColdStartPinGate('STAFF')).toBe(true);
    expect(roleRequiresColdStartPinGate('ACCOUNTANT')).toBe(true);
    expect(roleRequiresColdStartPinGate('ADMIN')).toBe(true);
    expect(roleRequiresColdStartPinGate('MANAGER')).toBe(true);
  });

  it('EVIDENCE PERSONAL: admin/manager may silent-restore; floor roles may not', () => {
    setDeviceSessionMode('PERSONAL');
    expect(roleRequiresColdStartPinGate('CASHIER')).toBe(true);
    expect(roleRequiresColdStartPinGate('ADMIN')).toBe(false);
    expect(roleRequiresColdStartPinGate('MANAGER')).toBe(false);
  });

  it('EVIDENCE: enforce on cold start with stored session (SHARED)', () => {
    expect(
      shouldEnforceColdStartPinGate({ role: 'CASHIER', hasStoredSession: true }),
    ).toBe(true);
    expect(
      shouldEnforceColdStartPinGate({ role: 'ADMIN', hasStoredSession: true }),
    ).toBe(true);
    markBrowserSessionAlive();
    expect(
      shouldEnforceColdStartPinGate({ role: 'CASHIER', hasStoredSession: true }),
    ).toBe(false);
    expect(
      shouldEnforceColdStartPinGate({ role: 'CASHIER', hasStoredSession: false }),
    ).toBe(false);
  });

  it('EVIDENCE: actor lock forces re-auth even after Chrome session restore', () => {
    markBrowserSessionAlive();
    expect(
      shouldEnforceColdStartPinGate({ role: 'CASHIER', hasStoredSession: true }),
    ).toBe(false);
    setActorLock();
    expect(localStorage.getItem(ACTOR_LOCK_KEY)).toBe('1');
    expect(
      shouldEnforceColdStartPinGate({ role: 'CASHIER', hasStoredSession: true }),
    ).toBe(true);
    expect(
      shouldEnforceColdStartPinGate({ role: 'ADMIN', hasStoredSession: true }),
    ).toBe(true);
    clearActorLock();
    expect(
      shouldEnforceColdStartPinGate({ role: 'CASHIER', hasStoredSession: true }),
    ).toBe(false);
  });

  it('EVIDENCE: login grace blocks cold-start wipe even with actor lock / cold boot', () => {
    setActorLock();
    expect(
      shouldEnforceColdStartPinGate({ role: 'CASHIER', hasStoredSession: true }),
    ).toBe(true);
    markLoginGrace();
    expect(isWithinLoginGrace()).toBe(true);
    expect(localStorage.getItem('auth_login_grace_v1')).toBeTruthy();
    expect(
      shouldEnforceColdStartPinGate({ role: 'CASHIER', hasStoredSession: true }),
    ).toBe(false);
    expect(
      shouldEnforceColdStartPinGate({ role: 'ADMIN', hasStoredSession: true }),
    ).toBe(false);
  });

  it('EVIDENCE: login grace survives without sessionStorage (peer PC tab)', () => {
    markLoginGrace();
    // Peer tabs do not share sessionStorage — only localStorage.
    sessionStorage.removeItem('auth_login_grace_v1');
    expect(isWithinLoginGrace()).toBe(true);
    expect(
      shouldEnforceColdStartPinGate({ role: 'CASHIER', hasStoredSession: true }),
    ).toBe(false);
  });

  it('EVIDENCE PERSONAL cold start: admin restores, cashier gated', () => {
    setDeviceSessionMode('PERSONAL');
    expect(localStorage.getItem(DEVICE_SESSION_MODE_KEY)).toBe('PERSONAL');
    expect(
      shouldEnforceColdStartPinGate({ role: 'ADMIN', hasStoredSession: true }),
    ).toBe(false);
    expect(
      shouldEnforceColdStartPinGate({ role: 'CASHIER', hasStoredSession: true }),
    ).toBe(true);
  });
});
