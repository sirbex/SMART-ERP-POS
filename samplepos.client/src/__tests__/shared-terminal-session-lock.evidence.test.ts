/**
 * EVIDENCE: close-without-logout must not hand the next browser opener
 * the previous actor's session (SHARED device mode — enterprise default).
 *
 * Integrity: fail-closed storage, verified wipe, no silent restore.
 *
 * Run:
 *   npx vitest run src/__tests__/shared-terminal-session-lock.evidence.test.ts src/lib/deviceSessionPolicy.integrity.test.ts src/lib/sessionColdStartLock.test.ts
 * Generates: PROOF_SHARED_TERMINAL_SESSION_LOCK.md + .json (repo root)
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ACTOR_LOCK_KEY,
  AUTH_BOOT_SESSION_KEY,
  AUTH_SESSION_WIPE_KEYS,
  DEVICE_SESSION_MODE_KEY,
  DeviceSessionIntegrityError,
  SHARED_IDLE_TIMEOUT_MS,
  PERSONAL_IDLE_TIMEOUT_MS,
  assertAuthSessionCleared,
  idleTimeoutMsForMode,
  resolveDeviceSessionMode,
  roleRequiresReauthGate,
  shouldForceReauthOnBoot,
} from '@shared/security/deviceSessionPolicySsot';
import {
  shouldEnforceColdStartPinGate,
  markBrowserSessionAlive,
  roleRequiresColdStartPinGate,
} from '../lib/sessionColdStartLock';
import {
  assertSessionWiped,
  setActorLock,
  clearActorLock,
  setDeviceSessionMode,
  getDeviceSessionMode,
  isActorLockSet,
  lockSharedSessionOnUnload,
  beaconRevokeRefreshToken,
} from '../lib/deviceSessionPolicy';
import { clearTokens } from '../hooks/useTokenRefresh';

const here = dirname(fileURLToPath(import.meta.url));
const clientRoot = resolve(here, '../..');
const repoRoot = resolve(clientRoot, '..');

type Gate = { id: string; ok: boolean; detail: string };
const gates: Gate[] = [];

function gate(id: string, ok: boolean, detail: string) {
  gates.push({ id, ok, detail });
  expect.soft({ id, ok, detail }).toEqual({ id, ok: true, detail });
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

describe('PROOF: Shared terminal session lock', () => {
  it('SSOT defaults to SHARED (max security)', () => {
    gate(
      'DEFAULT_SHARED',
      resolveDeviceSessionMode({ stored: null, envRaw: null }) === 'SHARED',
      'unset storage/env → SHARED',
    );
    gate(
      'GARBAGE_NOT_PERSONAL',
      resolveDeviceSessionMode({ stored: 'HACK', envRaw: null }) === 'SHARED',
      'invalid stored mode never becomes PERSONAL',
    );
    gate(
      'IDLE_SHARED_3M',
      idleTimeoutMsForMode('SHARED') === SHARED_IDLE_TIMEOUT_MS &&
        SHARED_IDLE_TIMEOUT_MS === 3 * 60 * 1000,
      `${SHARED_IDLE_TIMEOUT_MS}ms`,
    );
    gate(
      'IDLE_PERSONAL_60M',
      idleTimeoutMsForMode('PERSONAL') === PERSONAL_IDLE_TIMEOUT_MS,
      `${PERSONAL_IDLE_TIMEOUT_MS}ms`,
    );
  });

  it('SHARED: close-without-logout → actor lock → next opener cannot inherit', () => {
    markBrowserSessionAlive();
    gate(
      'SAME_SESSION_OK',
      shouldEnforceColdStartPinGate({ role: 'CASHIER', hasStoredSession: true }) === false,
      'alive browser session may continue',
    );

    gate('ACTOR_LOCK_SET_OK', setActorLock() === true, 'durable lock');
    gate('ACTOR_LOCK_SET', localStorage.getItem(ACTOR_LOCK_KEY) === '1', ACTOR_LOCK_KEY);

    gate(
      'NEXT_OPENER_BLOCKED',
      shouldForceReauthOnBoot({
        mode: 'SHARED',
        role: 'CASHIER',
        hasStoredSession: true,
        actorLockSet: true,
        isBrowserColdStart: false,
      }) === true,
      'actor lock beats restored sessionStorage',
    );
    gate(
      'NEXT_OPENER_ADMIN_BLOCKED',
      shouldEnforceColdStartPinGate({ role: 'ADMIN', hasStoredSession: true }) === true,
      'SHARED never silent-restores admin either',
    );

    clearActorLock();
    markBrowserSessionAlive();
    gate(
      'AFTER_RELOGIN',
      shouldEnforceColdStartPinGate({ role: 'CASHIER', hasStoredSession: true }) === false,
      'fresh login clears lock and may operate',
    );
  });

  it('fail-closed: storage error ⇒ locked; wipe verified; unload wipe if lock fails', () => {
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
    gate('FAIL_CLOSED_LOCK_READ', isActorLockSet() === true, 'unreadable storage ⇒ locked');

    Object.defineProperty(globalThis, 'localStorage', {
      value: memoryStorage(),
      configurable: true,
    });
    localStorage.setItem('auth_token', 'leak');
    gate(
      'WIPE_ASSERT_FAILS_LOUD',
      (() => {
        try {
          assertSessionWiped();
          return false;
        } catch (e) {
          return e instanceof DeviceSessionIntegrityError;
        }
      })(),
      'leftover JWT throws DeviceSessionIntegrityError',
    );
    clearTokens();
    gate(
      'WIPE_ASSERT_PASS',
      (() => {
        try {
          assertSessionWiped();
          return true;
        } catch {
          return false;
        }
      })(),
      'clearTokens + assertSessionWiped',
    );

    const mem = new Map<string, string>([
      ['auth_token', 'jwt'],
      ['refresh_token', 'rt'],
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
    const unloaded = lockSharedSessionOnUnload({
      mode: 'SHARED',
      clearSession: clearTokens,
      refreshToken: 'rt',
    });
    gate('UNLOAD_LOCK_FAIL_WIPES', unloaded.lockDurable === false, 'lock not durable');
    gate(
      'UNLOAD_TOKENS_GONE',
      localStorage.getItem('auth_token') === null && localStorage.getItem('refresh_token') === null,
      'fail-closed wipe on unload',
    );
  });

  it('SHARED roles all require re-auth; PERSONAL only floor roles', () => {
    gate('SHARED_ALL', roleRequiresReauthGate({ mode: 'SHARED', role: 'ADMIN' }) === true, 'admin');
    setDeviceSessionMode('PERSONAL');
    gate('MODE_PERSONAL', getDeviceSessionMode() === 'PERSONAL', DEVICE_SESSION_MODE_KEY);
    gate(
      'PERSONAL_ADMIN_OK',
      roleRequiresColdStartPinGate('ADMIN') === false,
      'office admin restore',
    );
    gate(
      'PERSONAL_FLOOR_GATE',
      roleRequiresColdStartPinGate('CASHIER') === true,
      'floor still gated',
    );
  });

  it('structural: AuthContext integrity wiring (no silent gate wipe)', () => {
    const auth = readFileSync(join(clientRoot, 'src/contexts/AuthContext.tsx'), 'utf8');
    const policy = readFileSync(join(clientRoot, 'src/lib/deviceSessionPolicy.ts'), 'utf8');
    const ssot = readFileSync(
      join(repoRoot, 'shared/security/deviceSessionPolicySsot.ts'),
      'utf8',
    );
    const lock = readFileSync(join(clientRoot, 'src/lib/sessionColdStartLock.ts'), 'utf8');

    gate(
      'AUTH_WIPE_ASSERT',
      auth.includes('assertSessionWiped()') && auth.includes('clearTokens()'),
      'boot gate verifies wipe',
    );
    gate(
      'AUTH_UNLOAD_SSOT',
      auth.includes('lockSharedSessionOnUnload') && policy.includes('lockSharedSessionOnUnload'),
      'unload uses SSOT helper',
    );
    gate(
      'AUTH_IDLE_MODE',
      auth.includes('idleTimeoutMsForMode') && auth.includes('getDeviceSessionMode'),
      'idle follows device mode',
    );
    gate(
      'AUTH_CLEAR_LOCK_BEFORE_AUTH',
      (() => {
        const loginIdx = auth.indexOf('const login = async');
        const loginFn = loginIdx >= 0 ? auth.slice(loginIdx, loginIdx + 2200) : '';
        return (
          loginFn.includes('markLoginGrace()') &&
          loginFn.includes('clearActorLock()') &&
          loginFn.indexOf('markLoginGrace()') < loginFn.indexOf('fetchPermissionKeys') &&
          loginFn.indexOf('clearActorLock()') < loginFn.indexOf('setIsAuthenticated(true)') &&
          /localSet\(AUTH_LOGIN_GRACE_KEY/.test(lock)
        );
      })(),
      'cross-tab grace + lock cleared before authenticated paint',
    );
    gate(
      'AUTH_NO_SAME_TAB_INIT_ON_AUTH_CHANGED',
      !/auth-changed[\s\S]{0,80}initAuth\(\)/.test(auth) &&
        auth.includes("window.dispatchEvent(new Event('auth-changed'))") &&
        !auth.includes("addEventListener('auth-changed'"),
      'same-tab auth-changed must not re-initAuth (login bounce)',
    );
    gate(
      'POLICY_FAIL_CLOSED',
      policy.includes('FAIL CLOSED') && policy.includes('return true') && policy.includes('isActorLockSet'),
      'lock read errors ⇒ locked',
    );
    gate(
      'SSOT_INTEGRITY_ERROR',
      ssot.includes('DeviceSessionIntegrityError') && ssot.includes('assertAuthSessionCleared'),
      'integrity error type',
    );
    gate(
      'BOOT_KEY_SSOT',
      lock.includes('AUTH_BOOT_SESSION_KEY') &&
        ssot.includes(`'${AUTH_BOOT_SESSION_KEY}'`) &&
        !policy.includes("export const AUTH_BOOT_SESSION_KEY = 'auth_boot_session_v1'"),
      'boot key owned by SSOT (no client fork)',
    );
    gate(
      'WIPE_KEY_CATALOG',
      AUTH_SESSION_WIPE_KEYS.length >= 5 && AUTH_SESSION_WIPE_KEYS.includes('auth_token'),
      'wipe key catalog',
    );
    const lockFn = policy.slice(
      policy.indexOf('export function isActorLockSet'),
      policy.indexOf('export function setActorLock'),
    );
    gate(
      'NO_EMPTY_CATCH_LOCK_OPEN',
      lockFn.includes('return true') && !lockFn.includes('return false'),
      'isActorLockSet must not fail-open',
    );
  });

  it('beacon helper is unload-safe (best-effort only)', () => {
    let threw = false;
    try {
      beaconRevokeRefreshToken('rt-test-token');
    } catch {
      threw = true;
    }
    gate('BEACON_SAFE', threw === false, 'unload-safe');
    gate(
      'ASSERT_CLEARED_HELPER',
      (() => {
        try {
          assertAuthSessionCleared(() => null);
          return true;
        } catch {
          return false;
        }
      })(),
      'empty session passes assert',
    );
  });
});

afterAll(() => {
  const pass = gates.filter((g) => g.ok).length;
  const failCount = gates.filter((g) => !g.ok).length;
  const verdict = failCount === 0 ? 'PASS' : 'FAIL';
  const iso = new Date().toISOString();

  const md = [
    `# PROOF: Shared terminal session lock`,
    ``,
    `- Date: ${iso}`,
    `- Runner: \`npx vitest run src/__tests__/shared-terminal-session-lock.evidence.test.ts src/lib/deviceSessionPolicy.integrity.test.ts\``,
    `- Gates: ${pass}/${gates.length} pass (${failCount} fail)`,
    `- Verdict: **${verdict}**`,
    ``,
    `## Problem`,
    ``,
    `User logs in, closes the browser without logout. Next person opens the same browser and is silently restored as the previous actor.`,
    ``,
    `## Controls (SHARED default) — fail closed`,
    ``,
    `1. **Actor lock** (\`${ACTOR_LOCK_KEY}\`) on \`pagehide\`/\`beforeunload\` — survives Chrome session restore.`,
    `2. **Boot gate** clears JWT, **asserts wipe**, redirects to \`/quick-login\`.`,
    `3. **Storage errors ⇒ locked** (never fail-open into prior actor).`,
    `4. **Lock write failure ⇒ immediate token wipe** on unload.`,
    `5. **Short idle** (${SHARED_IDLE_TIMEOUT_MS / 60000} min) on SHARED.`,
    `6. **PERSONAL** opt-in only via verified mode write / env.`,
    `7. Unload RT revoke is best-effort (browser constraint); boot wipe is mandatory.`,
    ``,
    `## Gates`,
    ``,
    ...gates.map((g) => `- [${g.ok ? 'x' : ' '}] \`${g.id}\` — ${g.detail}`),
    ``,
  ].join('\n');

  const json = {
    proof: 'SHARED_TERMINAL_SESSION_LOCK',
    integrity: 'FAIL_CLOSED',
    date: iso,
    verdict,
    pass,
    fail: failCount,
    gates,
  };

  writeFileSync(join(repoRoot, 'PROOF_SHARED_TERMINAL_SESSION_LOCK.md'), md);
  writeFileSync(join(repoRoot, 'PROOF_SHARED_TERMINAL_SESSION_LOCK.json'), JSON.stringify(json, null, 2));
});
