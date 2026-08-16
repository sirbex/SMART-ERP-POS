/**
 * PROOF — Successful login must stay authenticated (no instant logout bounce).
 *
 * Root cause: login() dispatched `auth-changed` → AuthProvider re-ran initAuth()
 * which re-applied SHARED cold-start / actor-lock wipe → /quick-login.
 *
 * Gates:
 * L1  AuthProvider must NOT listen for same-tab auth-changed → initAuth
 * L2  login() marks login grace before authenticated paint
 * L3  shouldForceReauthOnBoot honours withinLoginGrace
 * L4  markLoginGrace / isWithinLoginGrace wired in sessionColdStartLock
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { shouldForceReauthOnBoot } from '@shared/security/deviceSessionPolicySsot';
import {
  isWithinLoginGrace,
  markLoginGrace,
  shouldEnforceColdStartPinGate,
} from '../lib/sessionColdStartLock';
import { setActorLock } from '../lib/deviceSessionPolicy';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(resolve(here, rel), 'utf8');

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

describe('PROOF login must not false-logout', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'sessionStorage', {
      value: memoryStorage(),
      configurable: true,
    });
    Object.defineProperty(globalThis, 'localStorage', {
      value: memoryStorage(),
      configurable: true,
    });
  });

  it('L1 AuthContext: no same-tab auth-changed → initAuth', () => {
    const auth = read('../contexts/AuthContext.tsx');
    expect(auth).not.toMatch(/addEventListener\(\s*['"]auth-changed['"]/);
    expect(auth).toMatch(/dispatchEvent\(\s*new Event\(\s*['"]auth-changed['"]\s*\)\s*\)/);
    expect(auth).toMatch(/addEventListener\(\s*['"]storage['"]/);
  });

  it('L2 login marks cross-tab grace + clears lock BEFORE writing tokens', () => {
    const auth = read('../contexts/AuthContext.tsx');
    const loginIdx = auth.indexOf('const login = async');
    expect(loginIdx).toBeGreaterThan(-1);
    const loginFn = auth.slice(loginIdx, loginIdx + 2200);
    expect(loginFn).toMatch(/markLoginGrace\(\)/);
    expect(loginFn).toMatch(/clearActorLock\(\)/);
    expect(loginFn.indexOf('markLoginGrace()')).toBeLessThan(loginFn.indexOf('storeTokens'));
    expect(loginFn.indexOf('markLoginGrace()')).toBeLessThan(loginFn.indexOf("setItem('auth_token'"));
    expect(loginFn.indexOf('clearActorLock()')).toBeLessThan(loginFn.indexOf('fetchPermissionKeys'));
    expect(loginFn.indexOf('markLoginGrace()')).toBeLessThan(loginFn.indexOf('markBrowserSessionAlive()'));
  });

  it('L2b grace is durable in localStorage (cross-tab PC peers)', () => {
    const lock = read('../lib/sessionColdStartLock.ts');
    expect(lock).toMatch(/localSet\(AUTH_LOGIN_GRACE_KEY/);
    expect(lock).toMatch(/localGet\(AUTH_LOGIN_GRACE_KEY\)\s*\?\?\s*sessionGet\(AUTH_LOGIN_GRACE_KEY\)/);
  });

  it('L3 SSOT: withinLoginGrace short-circuits wipe', () => {
    expect(
      shouldForceReauthOnBoot({
        mode: 'SHARED',
        role: 'CASHIER',
        hasStoredSession: true,
        actorLockSet: true,
        isBrowserColdStart: true,
        withinLoginGrace: true,
      }),
    ).toBe(false);
    expect(
      shouldForceReauthOnBoot({
        mode: 'SHARED',
        role: 'CASHIER',
        hasStoredSession: true,
        actorLockSet: true,
        isBrowserColdStart: true,
        withinLoginGrace: false,
      }),
    ).toBe(true);
  });

  it('L4 client gate: markLoginGrace blocks enforce even with actor lock', () => {
    setActorLock();
    expect(shouldEnforceColdStartPinGate({ role: 'CASHIER', hasStoredSession: true })).toBe(true);
    markLoginGrace();
    expect(isWithinLoginGrace()).toBe(true);
    expect(shouldEnforceColdStartPinGate({ role: 'CASHIER', hasStoredSession: true })).toBe(false);
  });
});
