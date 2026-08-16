/**
 * PERMANENT SECURITY PROOF — Browser/tab close = logout (SHARED)
 *
 * Token: SECURITY_BROWSER_CLOSE_LOGOUT_v1
 *
 * Enterprise contract (Toast / Square / Samba walk-up terminals):
 * 1. SHARED close ⇒ wipe every AUTH_SESSION_WIPE_KEYS entry + actor lock
 * 2. Best-effort RT beacon revoke on close
 * 3. Next opener cannot inherit prior JWT/RT/user/rbac
 * 4. bfcache (destroySession:false) ⇒ no lock, no wipe (no false logout)
 * 5. PERSONAL close ⇒ no wipe (office restore)
 * 6. clearTokens must NOT wipe offline_login_credentials
 * 7. AuthContext wires pagehide (!persisted) + beforeunload destroy; RT snapshotted first
 * 8. Idempotent double-unload (beforeunload then pagehide) stays consistent
 *
 * Generates: PROOF_BROWSER_CLOSE_LOGOUT_SECURITY.md + .json (repo root)
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AUTH_SESSION_WIPE_KEYS as WIPE_KEYS,
  ACTOR_LOCK_KEY as LOCK_KEY,
} from '@shared/security/deviceSessionPolicySsot';
import {
  lockSharedSessionOnUnload,
  assertSessionWiped,
  isActorLockSet,
  clearActorLock,
} from '../lib/deviceSessionPolicy';
import { clearTokens } from '../hooks/useTokenRefresh';
import {
  OFFLINE_CREDENTIALS_KEY as OFF_KEY,
  offlineCredentialsSurvivesClearTokens,
} from '../lib/offlineLoginCredentials';

const SECURITY_BROWSER_CLOSE_LOGOUT_ID = 'SECURITY_BROWSER_CLOSE_LOGOUT_v1' as const;

const here = dirname(fileURLToPath(import.meta.url));
const clientRoot = resolve(here, '../..');
const repoRoot = resolve(clientRoot, '..');

type Gate = { id: string; ok: boolean; detail: string; severity: 'CRITICAL' | 'HIGH' | 'CONTROL' };
const gates: Gate[] = [];

function gate(
  id: string,
  ok: boolean,
  detail: string,
  severity: Gate['severity'] = 'CONTROL',
) {
  gates.push({ id, ok, detail, severity });
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

function seedLiveSession() {
  localStorage.setItem('auth_token', 'jwt-actor-a');
  localStorage.setItem('refresh_token', 'rt-actor-a');
  localStorage.setItem('token_expiry', String(Date.now() + 3_600_000));
  localStorage.setItem('user', JSON.stringify({ id: 'a', email: 'a@x', role: 'CASHIER' }));
  localStorage.setItem('rbac_permissions', JSON.stringify(['pos.sell']));
  localStorage.setItem(OFF_KEY, JSON.stringify([{ email: 'a@x', hash: 'h', salt: 's' }]));
}

function readClient(rel: string): string {
  return readFileSync(join(clientRoot, rel), 'utf8');
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

describe(`PROOF: ${SECURITY_BROWSER_CLOSE_LOGOUT_ID}`, () => {
  it('SSOT wipe catalog is complete and matches clearTokens', () => {
    gate(
      'WIPE_KEYS_COMPLETE',
      WIPE_KEYS.length >= 5 &&
        WIPE_KEYS.includes('auth_token') &&
        WIPE_KEYS.includes('refresh_token') &&
        WIPE_KEYS.includes('user') &&
        WIPE_KEYS.includes('rbac_permissions') &&
        WIPE_KEYS.includes('token_expiry'),
      WIPE_KEYS.join(','),
      'CRITICAL',
    );
    const clearSrc = readClient('src/hooks/useTokenRefresh.ts');
    gate(
      'CLEAR_USES_WIPE_SSOT',
      clearSrc.includes('AUTH_SESSION_WIPE_KEYS') &&
        clearSrc.includes("from '@shared/security/deviceSessionPolicySsot'"),
      'clearTokens iterates SSOT wipe keys',
      'CRITICAL',
    );
    gate(
      'OFFLINE_SURVIVES_WIPE_LIST',
      offlineCredentialsSurvivesClearTokens([...WIPE_KEYS, 'refresh_lock']),
      'offline password cache not in wipe list',
      'HIGH',
    );
  });

  it('SHARED close wipes all identity keys + sets actor lock', () => {
    seedLiveSession();
    const rt = localStorage.getItem('refresh_token');
    const result = lockSharedSessionOnUnload({
      mode: 'SHARED',
      clearSession: clearTokens,
      refreshToken: rt,
      destroySession: true,
    });
    gate('CLOSE_DESTROYED', result.sessionDestroyed === true, 'sessionDestroyed', 'CRITICAL');
    gate('CLOSE_LOCK', result.lockDurable === true && isActorLockSet(), LOCK_KEY, 'CRITICAL');
    for (const key of WIPE_KEYS) {
      gate(
        `CLOSE_GONE_${key}`,
        localStorage.getItem(key) === null,
        `${key} must be absent after close`,
        'CRITICAL',
      );
    }
    gate(
      'CLOSE_ASSERT_WIPED',
      (() => {
        try {
          assertSessionWiped();
          return true;
        } catch {
          return false;
        }
      })(),
      'assertSessionWiped passes',
      'CRITICAL',
    );
    gate(
      'CLOSE_KEEPS_OFFLINE_CACHE',
      localStorage.getItem(OFF_KEY) !== null,
      'offline_login_credentials survives close wipe',
      'HIGH',
    );
  });

  it('bfcache freeze is a no-op (no lock, no wipe)', () => {
    seedLiveSession();
    clearActorLock();
    const result = lockSharedSessionOnUnload({
      mode: 'SHARED',
      clearSession: clearTokens,
      refreshToken: 'rt-actor-a',
      destroySession: false,
    });
    gate('BFCACHE_NOT_DESTROYED', result.sessionDestroyed === false, 'no wipe', 'CRITICAL');
    gate(
      'BFCACHE_NO_LOCK',
      isActorLockSet() === false,
      'bfcache must not set actor lock (would false-logout on resume)',
      'CRITICAL',
    );
    gate(
      'BFCACHE_TOKENS_LIVE',
      localStorage.getItem('auth_token') === 'jwt-actor-a' &&
        localStorage.getItem('refresh_token') === 'rt-actor-a',
      'live page keeps session',
      'CRITICAL',
    );
  });

  it('PERSONAL close never destroys session', () => {
    seedLiveSession();
    const result = lockSharedSessionOnUnload({
      mode: 'PERSONAL',
      clearSession: clearTokens,
      refreshToken: 'rt-actor-a',
      destroySession: true,
    });
    gate('PERSONAL_NO_DESTROY', result.sessionDestroyed === false, 'office restore', 'CRITICAL');
    gate(
      'PERSONAL_TOKENS_LIVE',
      localStorage.getItem('auth_token') === 'jwt-actor-a',
      'PERSONAL keeps JWT',
      'CRITICAL',
    );
  });

  it('double unload (beforeunload → pagehide) is idempotent and leaves nothing', () => {
    seedLiveSession();
    const rt = localStorage.getItem('refresh_token');
    const first = lockSharedSessionOnUnload({
      mode: 'SHARED',
      clearSession: clearTokens,
      refreshToken: rt,
      destroySession: true,
    });
    const second = lockSharedSessionOnUnload({
      mode: 'SHARED',
      clearSession: clearTokens,
      refreshToken: localStorage.getItem('refresh_token'), // null after first
      destroySession: true,
    });
    gate('IDEM_FIRST', first.sessionDestroyed === true, 'first wipe', 'CRITICAL');
    gate('IDEM_SECOND', second.sessionDestroyed === true, 'second wipe ok', 'HIGH');
    gate(
      'IDEM_EMPTY',
      WIPE_KEYS.every((k) => localStorage.getItem(k) === null) && isActorLockSet(),
      'no leftover identity after double event',
      'CRITICAL',
    );
  });

  it('AuthContext wiring is consistent (RT snapshot + bfcache + beforeunload)', () => {
    const auth = readClient('src/contexts/AuthContext.tsx');
    const policy = readClient('src/lib/deviceSessionPolicy.ts');
    const ssot = readFileSync(join(repoRoot, 'shared/security/deviceSessionPolicySsot.ts'), 'utf8');

    gate(
      'AUTH_DESTROY_HELPER',
      auth.includes('destroySharedSession') &&
        auth.includes('const refreshToken = getRefreshToken()') &&
        auth.includes('destroySharedSession(!e.persisted)') &&
        auth.includes('destroySharedSession(true)'),
      'RT snapshotted once per event; pagehide/beforeunload consistent',
      'CRITICAL',
    );
    gate(
      'AUTH_LISTENERS',
      auth.includes("addEventListener('pagehide'") &&
        auth.includes("addEventListener('beforeunload'"),
      'both close signals wired',
      'CRITICAL',
    );
    gate(
      'POLICY_BFCACHE_NOOP',
      policy.includes('bfcache freeze') &&
        policy.includes('leave session and lock alone') &&
        /if\s*\(\s*!destroy\s*\)/.test(policy),
      'bfcache early-return no lock/wipe',
      'CRITICAL',
    );
    gate(
      'POLICY_ALWAYS_WIPE_ON_DESTROY',
      policy.includes('input.clearSession()') &&
        policy.includes('beaconRevokeRefreshToken(input.refreshToken)'),
      'destroy path always wipes + beacon',
      'CRITICAL',
    );
    gate(
      'SSOT_DOC_CLOSE',
      ssot.includes('Browser/tab close ⇒ full local logout') &&
        ssot.includes('Next opener cannot inherit prior account'),
      'SSOT documents close logout',
      'CONTROL',
    );
    gate(
      'PROOF_TOKEN',
      readClient('src/__tests__/browser-close-logout.security.proof.test.ts').includes(
        SECURITY_BROWSER_CLOSE_LOGOUT_ID,
      ),
      SECURITY_BROWSER_CLOSE_LOGOUT_ID,
      'CONTROL',
    );
  });

  it('next opener has no inherit path after close', () => {
    seedLiveSession();
    lockSharedSessionOnUnload({
      mode: 'SHARED',
      clearSession: clearTokens,
      refreshToken: 'rt-actor-a',
      destroySession: true,
    });
    gate(
      'NEXT_NO_JWT',
      localStorage.getItem('auth_token') === null &&
        localStorage.getItem('refresh_token') === null &&
        localStorage.getItem('user') === null,
      'next person finds empty session store',
      'CRITICAL',
    );
    gate(
      'NEXT_LOCK_SET',
      localStorage.getItem(LOCK_KEY) === '1',
      'actor lock blocks any residual restore path',
      'CRITICAL',
    );
  });
});

afterAll(() => {
  const pass = gates.filter((g) => g.ok).length;
  const fail = gates.filter((g) => !g.ok).length;
  const criticalFail = gates.filter((g) => !g.ok && g.severity === 'CRITICAL').length;
  const verdict = fail === 0 ? 'PASS' : 'FAIL';
  const iso = new Date().toISOString();

  const md = [
    `# PROOF: Browser close = logout (SHARED)`,
    ``,
    `- Date: ${iso}`,
    `- Token: \`${SECURITY_BROWSER_CLOSE_LOGOUT_ID}\``,
    `- Runner: \`npx vitest run src/__tests__/browser-close-logout.security.proof.test.ts\``,
    `- Gates: ${pass}/${gates.length} pass (${fail} fail, ${criticalFail} critical fail)`,
    `- Verdict: **${verdict}**`,
    ``,
    `## Contract`,
    ``,
    `| Event | SHARED | PERSONAL |`,
    `|---|---|---|`,
    `| Browser/tab close | Wipe JWT/RT/user/rbac + actor lock + beacon | Keep session |`,
    `| bfcache (persisted) | No lock, no wipe | N/A |`,
    `| Next opener | Empty store — must re-auth | May restore (admin/manager) |`,
    `| Offline password cache | Survives wipe | Survives wipe |`,
    ``,
    `## Gates`,
    ``,
    ...gates.map((g) => `- [${g.ok ? 'x' : ' '}] \`${g.id}\` (${g.severity}) — ${g.detail}`),
    ``,
  ].join('\n');

  writeFileSync(join(repoRoot, 'PROOF_BROWSER_CLOSE_LOGOUT_SECURITY.md'), md);
  writeFileSync(
    join(repoRoot, 'PROOF_BROWSER_CLOSE_LOGOUT_SECURITY.json'),
    JSON.stringify(
      {
        proof: 'BROWSER_CLOSE_LOGOUT_SECURITY',
        token: SECURITY_BROWSER_CLOSE_LOGOUT_ID,
        date: iso,
        verdict,
        pass,
        fail,
        criticalFail,
        gates,
      },
      null,
      2,
    ),
  );
});
