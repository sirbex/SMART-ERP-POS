/**
 * PERMANENT SECURITY PROOF — Idle logout + false-logout immunity
 *
 * Token: SECURITY_IDLE_FALSE_LOGOUT_v1
 *
 * Expert contract (must never regress):
 * 1. Idle auto-logout ONLY after 60 minutes of no deliberate input
 * 2. Working users (recent key/mouse/touch) MUST NOT be idle-logged-out
 * 3. SHARED browser/tab close MUST wipe JWT/RT (next user cannot inherit)
 * 4. bfcache freeze must NOT lock or wipe (no false logout on resume)
 * 5. Actor lock still blocks residual restore paths after close
 * 6. Definitive server session death ALWAYS forces login (even while active)
 * 7. Network / 5xx NEVER force logout while a refresh token exists
 *
 * Generates: PROOF_SESSION_IDLE_FALSE_LOGOUT_SECURITY.md + .json (repo root)
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  IDLE_TIMEOUT_MS,
  SHARED_IDLE_TIMEOUT_MS,
  PERSONAL_IDLE_TIMEOUT_MS,
  idleTimeoutMsForMode,
  shouldForceReauthOnBoot,
} from '@shared/security/deviceSessionPolicySsot';
import {
  shouldPerformAutoLogout,
  shouldPerformIdleLogout,
  classifyRefreshError,
} from '../lib/sessionLogoutPolicy';
import {
  touchSessionActivity,
  isUserActiveOrGuarded,
  __resetSessionActivityForTests,
  ACTIVE_SESSION_WINDOW_MS,
} from '../lib/sessionActivity';
import { IDLE_SESSION_ACTIVITY_EVENTS } from '../lib/sessionActivityEvents';
import {
  lockSharedSessionOnUnload,
  setActorLock,
  clearActorLock,
  isActorLockSet,
} from '../lib/deviceSessionPolicy';
import { clearTokens } from '../hooks/useTokenRefresh';

const SECURITY_IDLE_FALSE_LOGOUT_ID = 'SECURITY_IDLE_FALSE_LOGOUT_v1' as const;

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
  __resetSessionActivityForTests(0);
  touchSessionActivity();
});

describe(`PROOF: ${SECURITY_IDLE_FALSE_LOGOUT_ID}`, () => {
  it('SSOT: 60-minute idle for every device mode', () => {
    gate(
      'IDLE_SSOT_60M',
      IDLE_TIMEOUT_MS === 60 * 60 * 1000 &&
        SHARED_IDLE_TIMEOUT_MS === IDLE_TIMEOUT_MS &&
        PERSONAL_IDLE_TIMEOUT_MS === IDLE_TIMEOUT_MS,
      `${IDLE_TIMEOUT_MS}ms`,
      'CRITICAL',
    );
    gate(
      'IDLE_MODE_SHARED',
      idleTimeoutMsForMode('SHARED') === 60 * 60 * 1000,
      'SHARED=60m',
      'CRITICAL',
    );
    gate(
      'IDLE_MODE_PERSONAL',
      idleTimeoutMsForMode('PERSONAL') === 60 * 60 * 1000,
      'PERSONAL=60m',
      'CRITICAL',
    );
    gate(
      'ACTIVE_WINDOW_ALIGNED',
      ACTIVE_SESSION_WINDOW_MS === IDLE_TIMEOUT_MS,
      'activity window matches idle SSOT',
      'HIGH',
    );
  });

  it('working user never idle-logs-out; true idle does', () => {
    touchSessionActivity();
    gate(
      'WORKING_NO_IDLE_LOGOUT',
      shouldPerformIdleLogout(isUserActiveOrGuarded(IDLE_TIMEOUT_MS)) === false,
      'recent activity suppresses idle logout',
      'CRITICAL',
    );

    __resetSessionActivityForTests(IDLE_TIMEOUT_MS + 60_000);
    gate(
      'TRUE_IDLE_LOGOUT',
      shouldPerformIdleLogout(isUserActiveOrGuarded(IDLE_TIMEOUT_MS)) === true,
      '60m+ zero input → idle logout allowed',
      'CRITICAL',
    );
  });

  it('deliberate input events only (no mousemove forever-session)', () => {
    const events = IDLE_SESSION_ACTIVITY_EVENTS as readonly string[];
    gate(
      'EVENTS_HAS_KEY_MOUSE_TOUCH',
      events.includes('keydown') &&
        events.includes('mousedown') &&
        events.includes('pointerdown') &&
        events.includes('touchstart') &&
        events.includes('click'),
      events.join(','),
      'HIGH',
    );
    gate(
      'EVENTS_NO_PASSIVE_MOVE',
      !events.includes('mousemove') && !events.includes('scroll') && !events.includes('wheel'),
      'passive move/scroll must not keep session forever',
      'HIGH',
    );
  });

  it('browser close destroys session (next user cannot inherit account)', () => {
    localStorage.setItem('auth_token', 'jwt-live');
    localStorage.setItem('refresh_token', 'rt-live');
    const unloaded = lockSharedSessionOnUnload({
      mode: 'SHARED',
      clearSession: clearTokens,
      refreshToken: 'rt-live',
      destroySession: true,
    });
    gate('UNLOAD_LOCKS', unloaded.lockDurable === true && isActorLockSet(), 'actor lock set', 'CRITICAL');
    gate(
      'UNLOAD_WIPES_TOKENS',
      unloaded.sessionDestroyed === true &&
        localStorage.getItem('refresh_token') === null &&
        localStorage.getItem('auth_token') === null,
      'close = logout — JWT/RT gone',
      'CRITICAL',
    );

    const unloadSrc = readClient('src/lib/deviceSessionPolicy.ts');
    const fn = unloadSrc.slice(
      unloadSrc.indexOf('export function lockSharedSessionOnUnload'),
      unloadSrc.indexOf('export function lockSharedSessionOnUnload') + 1400,
    );
    gate(
      'UNLOAD_BEACON_REVOKE',
      fn.includes('beaconRevokeRefreshToken'),
      'close best-effort server revoke',
      'CRITICAL',
    );
    gate(
      'BFCACHE_NO_WIPE',
      (() => {
        localStorage.setItem('auth_token', 'jwt-bf');
        localStorage.setItem('refresh_token', 'rt-bf');
        clearActorLock();
        const r = lockSharedSessionOnUnload({
          mode: 'SHARED',
          clearSession: clearTokens,
          destroySession: false,
        });
        return (
          r.sessionDestroyed === false &&
          localStorage.getItem('auth_token') === 'jwt-bf' &&
          isActorLockSet() === false
        );
      })(),
      'bfcache freeze: no wipe, no lock',
      'HIGH',
    );
    gate(
      'AUTH_CLOSE_SSOT',
      readClient('src/contexts/AuthContext.tsx').includes('destroySharedSession') &&
        readClient('src/contexts/AuthContext.tsx').includes('destroySharedSession(!e.persisted)') &&
        readClient('src/contexts/AuthContext.tsx').includes('destroySharedSession(true)'),
      'AuthContext wires close logout + bfcache skip',
      'CRITICAL',
    );
  });

  it('next opener still blocked; cold start not bypassed by soft grace', () => {
    setActorLock();
    gate(
      'NEXT_OPENER_BLOCKED',
      shouldForceReauthOnBoot({
        mode: 'SHARED',
        role: 'CASHIER',
        hasStoredSession: true,
        actorLockSet: true,
        isBrowserColdStart: false,
        withinSoftReloadGrace: false,
      }) === true,
      'stale actor lock forces re-auth',
      'CRITICAL',
    );
    gate(
      'COLD_NOT_BYPASSED',
      shouldForceReauthOnBoot({
        mode: 'SHARED',
        role: 'ADMIN',
        hasStoredSession: true,
        actorLockSet: true,
        isBrowserColdStart: true,
        withinSoftReloadGrace: true,
      }) === true,
      'soft grace never bypasses cold start',
      'CRITICAL',
    );
  });

  it('session-death truth table: definitive always; network never', () => {
    const rows: Array<{
      id: string;
      active: boolean;
      kind: 'network' | 'transient_server' | 'definitive_auth';
      hasRt: boolean;
      expectLogout: boolean;
    }> = [
      { id: 'ACT_DEF', active: true, kind: 'definitive_auth', hasRt: true, expectLogout: true },
      { id: 'IDLE_DEF', active: false, kind: 'definitive_auth', hasRt: true, expectLogout: true },
      { id: 'ACT_NET', active: true, kind: 'network', hasRt: true, expectLogout: false },
      { id: 'IDLE_NET', active: false, kind: 'network', hasRt: true, expectLogout: false },
      { id: 'ACT_5XX', active: true, kind: 'transient_server', hasRt: true, expectLogout: false },
    ];
    for (const row of rows) {
      const got = shouldPerformAutoLogout({
        activeOrGuarded: row.active,
        errorKind: row.kind,
        hasRefreshToken: row.hasRt,
      });
      gate(
        `DEATH_${row.id}`,
        got === row.expectLogout,
        `${row.kind} active=${row.active} → logout=${got}`,
        'CRITICAL',
      );
    }
    gate(
      'CLASSIFY_NET',
      classifyRefreshError(Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' })) ===
        'network',
      'network classify',
      'HIGH',
    );
  });

  it('AuthContext wires 60m idle SSOT + no unload RT kill', () => {
    const auth = readClient('src/contexts/AuthContext.tsx');
    const ssot = readFileSync(join(repoRoot, 'shared/security/deviceSessionPolicySsot.ts'), 'utf8');
    gate(
      'AUTH_IDLE_MODE',
      auth.includes('idleTimeoutMsForMode') && auth.includes('useIdleTimeout'),
      'AuthContext uses mode idle',
      'HIGH',
    );
    gate(
      'SSOT_DOC_CLOSE_LOGOUT',
      ssot.includes('Browser/tab close ⇒ full local logout') &&
        ssot.includes('60-minute idle'),
      'SSOT documents close=logout + 60m idle',
      'CONTROL',
    );
    gate(
      'PROOF_TOKEN',
      readClient('src/__tests__/session-idle-false-logout.security.proof.test.ts').includes(
        SECURITY_IDLE_FALSE_LOGOUT_ID,
      ),
      'permanent proof token present',
      'CONTROL',
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
    `# PROOF: Session idle + false-logout security`,
    ``,
    `- Date: ${iso}`,
    `- Token: \`${SECURITY_IDLE_FALSE_LOGOUT_ID}\``,
    `- Runner: \`npx vitest run src/__tests__/session-idle-false-logout.security.proof.test.ts\``,
    `- Gates: ${pass}/${gates.length} pass (${fail} fail, ${criticalFail} critical fail)`,
    `- Verdict: **${verdict}**`,
    ``,
    `## Security contract`,
    ``,
    `| Control | Requirement |`,
    `|---|---|`,
    `| Idle logout | 60 minutes zero deliberate input |`,
    `| Working user | Never idle-logout |`,
    `| Browser/tab close (SHARED) | Wipe JWT/RT + actor lock + beacon revoke |`,
    `| bfcache freeze | Keep tokens (same page may restore) |`,
    `| Next opener (SHARED) | Cannot inherit prior account |`,
    `| Definitive auth death | Always force login |`,
    `| Network / 5xx | Never force logout while RT exists |`,
    ``,
    `## Gates`,
    ``,
    ...gates.map(
      (g) =>
        `- [${g.ok ? 'x' : ' '}] \`${g.id}\` (${g.severity}) — ${g.detail}`,
    ),
    ``,
  ].join('\n');

  writeFileSync(join(repoRoot, 'PROOF_SESSION_IDLE_FALSE_LOGOUT_SECURITY.md'), md);
  writeFileSync(
    join(repoRoot, 'PROOF_SESSION_IDLE_FALSE_LOGOUT_SECURITY.json'),
    JSON.stringify(
      {
        proof: 'SESSION_IDLE_FALSE_LOGOUT_SECURITY',
        token: SECURITY_IDLE_FALSE_LOGOUT_ID,
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
