/**
 * SSOT integrity — device session policy (pure + client fail-closed bindings).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ACTOR_LOCK_KEY,
  AUTH_BOOT_SESSION_KEY,
  AUTH_SESSION_WIPE_KEYS,
  DeviceSessionIntegrityError,
  assertAuthSessionCleared,
  assertDeviceSessionModeStored,
  idleTimeoutMsForMode,
  isActorLockRawSet,
  resolveDeviceSessionMode,
  roleRequiresReauthGate,
  shouldForceReauthOnBoot,
} from '@shared/security/deviceSessionPolicySsot';
import {
  assertSessionWiped,
  clearActorLock,
  getDeviceSessionMode,
  isActorLockSet,
  lockSharedSessionOnUnload,
  setActorLock,
  setDeviceSessionMode,
} from './deviceSessionPolicy';
import { clearTokens } from '../hooks/useTokenRefresh';

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

describe('deviceSessionPolicySsot integrity', () => {
  it('defaults to SHARED; garbage never becomes PERSONAL', () => {
    expect(resolveDeviceSessionMode({ stored: null, envRaw: null })).toBe('SHARED');
    expect(resolveDeviceSessionMode({ stored: 'nope', envRaw: null })).toBe('SHARED');
    expect(resolveDeviceSessionMode({ stored: null, envRaw: 'typo' })).toBe('SHARED');
    expect(resolveDeviceSessionMode({ stored: 'PERSONAL', envRaw: null })).toBe('PERSONAL');
  });

  it('assertDeviceSessionModeStored fails loud on garbage', () => {
    expect(() => assertDeviceSessionModeStored('HACKED')).toThrow(DeviceSessionIntegrityError);
  });

  it('idleTimeoutMsForMode rejects invalid mode', () => {
    expect(() => idleTimeoutMsForMode('NOPE' as 'SHARED')).toThrow(DeviceSessionIntegrityError);
  });

  it('idle is 60 minutes for SHARED and PERSONAL', () => {
    expect(idleTimeoutMsForMode('SHARED')).toBe(60 * 60 * 1000);
    expect(idleTimeoutMsForMode('PERSONAL')).toBe(60 * 60 * 1000);
  });

  it('boot gate: soft-reload grace allows same-tab F5 (warm session)', () => {
    expect(
      shouldForceReauthOnBoot({
        mode: 'SHARED',
        role: 'CASHIER',
        hasStoredSession: true,
        actorLockSet: true,
        isBrowserColdStart: false,
        withinSoftReloadGrace: true,
      }),
    ).toBe(false);
  });

  it('boot gate: soft-reload grace never bypasses cold start + actor lock', () => {
    expect(
      shouldForceReauthOnBoot({
        mode: 'SHARED',
        role: 'CASHIER',
        hasStoredSession: true,
        actorLockSet: true,
        isBrowserColdStart: true,
        withinSoftReloadGrace: true,
      }),
    ).toBe(true);
  });

  it('SHARED gates all roles; PERSONAL only floor', () => {
    expect(roleRequiresReauthGate({ mode: 'SHARED', role: 'ADMIN' })).toBe(true);
    expect(roleRequiresReauthGate({ mode: 'PERSONAL', role: 'ADMIN' })).toBe(false);
    expect(roleRequiresReauthGate({ mode: 'PERSONAL', role: 'CASHIER' })).toBe(true);
  });

  it('actor lock raw: empty unlocked; any marker locked', () => {
    expect(isActorLockRawSet(null)).toBe(false);
    expect(isActorLockRawSet('1')).toBe(true);
    expect(isActorLockRawSet('corrupt')).toBe(true);
  });

  it('boot gate: actor lock beats restored sessionStorage', () => {
    expect(
      shouldForceReauthOnBoot({
        mode: 'SHARED',
        role: 'ADMIN',
        hasStoredSession: true,
        actorLockSet: true,
        isBrowserColdStart: false,
      }),
    ).toBe(true);
  });

  it('boot gate: login grace never wipes (even actor lock + cold)', () => {
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
  });

  it('assertAuthSessionCleared fails loud on leftovers', () => {
    expect(() =>
      assertAuthSessionCleared((k) => (k === 'auth_token' ? 'jwt' : null)),
    ).toThrow(/auth_token/);
    expect(AUTH_SESSION_WIPE_KEYS).toContain('refresh_token');
    expect(AUTH_BOOT_SESSION_KEY).toBe('auth_boot_session_v1');
  });
});

describe('deviceSessionPolicy client fail-closed', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: memoryStorage(),
      configurable: true,
    });
    Object.defineProperty(globalThis, 'sessionStorage', {
      value: memoryStorage(),
      configurable: true,
    });
  });

  it('setDeviceSessionMode round-trips or throws', () => {
    setDeviceSessionMode('PERSONAL');
    expect(getDeviceSessionMode()).toBe('PERSONAL');
    expect(() => setDeviceSessionMode('KIOSK' as 'SHARED')).toThrow(DeviceSessionIntegrityError);
  });

  it('isActorLockSet fails closed when storage throws', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('blocked');
        },
        removeItem: () => {
          throw new Error('blocked');
        },
      },
      configurable: true,
    });
    expect(isActorLockSet()).toBe(true);
  });

  it('setActorLock durable; unload wipe when lock fails', () => {
    expect(setActorLock()).toBe(true);
    expect(localStorage.getItem(ACTOR_LOCK_KEY)).toBe('1');
    clearActorLock();
    expect(localStorage.getItem(ACTOR_LOCK_KEY)).toBeNull();

    localStorage.setItem('auth_token', 'jwt-must-die');
    localStorage.setItem('refresh_token', 'rt-must-die');
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (k: string) => (k === ACTOR_LOCK_KEY ? null : memoryStorage().getItem(k)),
        setItem: () => {
          throw new Error('quota');
        },
        removeItem: (k: string) => {
          /* allow wipe path via clearTokens which uses removeItem */
          void k;
        },
      },
      configurable: true,
    });

    // Rebuild a storage that fails setItem for lock but clearTokens still works
    const mem = new Map<string, string>([
      ['auth_token', 'jwt-must-die'],
      ['refresh_token', 'rt-must-die'],
    ]);
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
        setItem: (k: string, v: string) => {
          if (k === ACTOR_LOCK_KEY) throw new Error('quota');
          mem.set(k, v);
        },
        removeItem: (k: string) => {
          mem.delete(k);
        },
      },
      configurable: true,
    });

    const result = lockSharedSessionOnUnload({
      mode: 'SHARED',
      clearSession: clearTokens,
    });
    expect(result.lockDurable).toBe(false);
    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(localStorage.getItem('refresh_token')).toBeNull();
  });

  it('durable SHARED unload wipes tokens (browser close = logout)', () => {
    localStorage.setItem('auth_token', 'jwt-live');
    localStorage.setItem('refresh_token', 'rt-live');
    const result = lockSharedSessionOnUnload({
      mode: 'SHARED',
      clearSession: clearTokens,
      refreshToken: 'rt-live',
      destroySession: true,
    });
    expect(result.lockDurable).toBe(true);
    expect(result.sessionDestroyed).toBe(true);
    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(localStorage.getItem('refresh_token')).toBeNull();
    expect(localStorage.getItem(ACTOR_LOCK_KEY)).toBe('1');
  });

  it('bfcache freeze (destroySession:false) is a no-op (no lock, no wipe)', () => {
    localStorage.setItem('auth_token', 'jwt-bfcache');
    localStorage.setItem('refresh_token', 'rt-bfcache');
    clearActorLock();
    const result = lockSharedSessionOnUnload({
      mode: 'SHARED',
      clearSession: clearTokens,
      refreshToken: 'rt-bfcache',
      destroySession: false,
    });
    expect(result.sessionDestroyed).toBe(false);
    expect(localStorage.getItem('auth_token')).toBe('jwt-bfcache');
    expect(localStorage.getItem(ACTOR_LOCK_KEY)).toBeNull();
  });

  it('PERSONAL unload does not wipe', () => {
    localStorage.setItem('auth_token', 'jwt-office');
    const result = lockSharedSessionOnUnload({
      mode: 'PERSONAL',
      clearSession: clearTokens,
      refreshToken: 'rt',
      destroySession: true,
    });
    expect(result.sessionDestroyed).toBe(false);
    expect(localStorage.getItem('auth_token')).toBe('jwt-office');
  });

  it('assertSessionWiped fails loud if JWT remains', () => {
    localStorage.setItem('auth_token', 'still-here');
    expect(() => assertSessionWiped()).toThrow(DeviceSessionIntegrityError);
    clearTokens();
    expect(() => assertSessionWiped()).not.toThrow();
  });
});
