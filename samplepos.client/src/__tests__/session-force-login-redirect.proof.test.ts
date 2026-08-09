/**
 * PROOF: Session death must hard-navigate to /login (no stuck protected UI).
 *
 * Runner: npx vitest run src/__tests__/session-force-login-redirect.proof.test.ts
 */
import { afterAll, describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const _store: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => _store[key] ?? null,
  setItem: (key: string, value: string) => {
    _store[key] = value;
  },
  removeItem: (key: string) => {
    delete _store[key];
  },
  clear: () => {
    Object.keys(_store).forEach((k) => delete _store[k]);
  },
};
// @ts-expect-error test env
global.localStorage = localStorageMock;

const _sess: Record<string, string> = {};
const sessionStorageMock = {
  getItem: (key: string) => _sess[key] ?? null,
  setItem: (key: string, value: string) => {
    _sess[key] = value;
  },
  removeItem: (key: string) => {
    delete _sess[key];
  },
  clear: () => {
    Object.keys(_sess).forEach((k) => delete _sess[k]);
  },
};
// @ts-expect-error test env
global.sessionStorage = sessionStorageMock;

const replace = vi.fn();
const windowMock = {
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
  setTimeout: ((fn: () => void) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
    return 0;
  }) as typeof setTimeout,
  location: {
    pathname: '/dashboard',
    origin: 'http://localhost',
    href: 'http://localhost/dashboard',
    replace,
  },
};
// @ts-expect-error test env
global.window = windowMock;

Object.defineProperty(globalThis, 'navigator', {
  value: { onLine: true },
  configurable: true,
  writable: true,
});

const refreshPost = vi.hoisted(() => vi.fn());

vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
    create: vi.fn(() => ({
      post: refreshPost,
      interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
    })),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
}));

import {
  shouldPerformAutoLogout,
  shouldIgnoreCrossTabSessionExpired,
  classifyRefreshError,
} from '../lib/sessionLogoutPolicy';
import {
  storeTokens,
  clearTokens,
  getAccessToken,
  build401Handler,
  forceLogoutRedirect,
  resetAuthState,
} from '../hooks/useTokenRefresh';
import { touchSessionActivity, __resetSessionActivityForTests } from '../lib/sessionActivity';

const here = dirname(fileURLToPath(import.meta.url));
const results: Array<{ id: string; ok: boolean; detail: string }> = [];

function gate(id: string, ok: boolean, detail: string) {
  results.push({ id, ok, detail });
  expect({ id, ok, detail }).toEqual({ id, ok: true, detail });
}

describe('PROOF: force login on server/session death', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    resetAuthState();
    replace.mockClear();
    windowMock.location.pathname = '/dashboard';
    Object.defineProperty(globalThis, 'navigator', {
      value: { onLine: true },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    clearTokens();
    resetAuthState();
  });

  it('policy: definitive auth always logout even while typing', () => {
    touchSessionActivity();
    gate(
      'POLICY_ACTIVE_DEFINITIVE',
      shouldPerformAutoLogout({
        activeOrGuarded: true,
        hasRefreshToken: true,
        errorKind: 'definitive_auth',
      }) === true,
      'active + definitive_auth → logout',
    );
    gate(
      'POLICY_NETWORK_PRESERVE',
      shouldPerformAutoLogout({
        activeOrGuarded: true,
        hasRefreshToken: true,
        errorKind: 'network',
      }) === false,
      'active + network → stay',
    );
    gate(
      'POLICY_PEER_SESSION_EXPIRED',
      shouldIgnoreCrossTabSessionExpired(true) === false,
      'SESSION_EXPIRED never ignored',
    );
  });

  it('classification: bare 401 and refresh-token messages', () => {
    gate(
      'CLASSIFY_EXPIRED_MSG',
      classifyRefreshError({
        response: { status: 401, data: { error: 'Refresh token expired' } },
      }) === 'definitive_auth',
      'Refresh token expired',
    );
    gate(
      'CLASSIFY_BARE_401',
      classifyRefreshError({ response: { status: 401, data: {} } }) === 'definitive_auth',
      'bare 401',
    );
  });

  it('forceLogoutRedirect clears tokens and replaces location', () => {
    storeTokens('access-x', 'refresh-x', 900);
    windowMock.location.pathname = '/dashboard';
    forceLogoutRedirect('refresh_revoked');
    gate('FORCE_CLEAR', getAccessToken() === null, 'tokens cleared');
    gate(
      'FORCE_REPLACE',
      replace.mock.calls.some((c) => String(c[0]).includes('/login')),
      'location.replace(/login)',
    );
    gate(
      'FORCE_FLAG',
      sessionStorage.getItem('session_expired') === '1',
      'session_expired banner flag',
    );
  });

  it('401 + refresh dead while active → tokens wiped (login path)', async () => {
    touchSessionActivity();
    storeTokens('access-alive', 'refresh-dead', 3600);
    localStorage.setItem('token_expiry', String(Date.now() - 1000));
    windowMock.location.pathname = '/sales';
    replace.mockClear();

    refreshPost.mockRejectedValue({
      response: { status: 401, data: { error: 'Refresh token expired' } },
    });

    const handler = build401Handler(vi.fn() as never);
    try {
      await handler({
        response: { status: 401 },
        config: { url: '/api/sales', headers: {}, _retry: false },
      } as never);
    } catch {
      /* expected */
    }

    gate('HANDLER_CLEAR', getAccessToken() === null, 'tokens cleared after 401 path');
    gate('HANDLER_NAV', replace.mock.calls.length > 0, 'hard nav attempted');
  });

  it('idle policy still logs out on definitive auth', () => {
    __resetSessionActivityForTests();
    gate(
      'IDLE_INACTIVE_LOGOUT',
      shouldPerformAutoLogout({
        activeOrGuarded: false,
        hasRefreshToken: true,
        errorKind: 'definitive_auth',
      }) === true,
      'idle definitive still logout',
    );
  });
});

afterAll(() => {
  const pass = results.filter((g) => g.ok).length;
  const fail = results.filter((g) => !g.ok).length;
  const at = new Date().toISOString();
  const verdict = fail === 0 ? 'PASS' : 'FAIL';
  const md = `# PROOF — Force login on session death

**Generated:** ${at}  
**Verdict:** **${verdict}** (${pass}/${results.length} gates)

## Bug (integrity)

1. Definitive auth (refresh revoked / expired) was deferred while user was "active".
2. Broadcast SESSION_EXPIRED does not fire on the originating tab.
3. Result: server killed session; UI stayed open; user only saw token-expired errors.

## Fix

- \`shouldPerformAutoLogout\`: definitive_auth → always true.
- \`forceLogoutRedirect\`: clear tokens + \`location.replace('/login')\` on same tab.
- Peer SESSION_EXPIRED never ignored.

## Gates

| Gate | Result | Detail |
|------|--------|--------|
${results.map((g) => `| \`${g.id}\` | ${g.ok ? 'PASS' : 'FAIL'} | ${g.detail.replace(/\|/g, '\\|')} |`).join('\n')}

## Re-run

\`\`\`bash
cd samplepos.client
npx vitest run src/__tests__/session-force-login-redirect.proof.test.ts
npx vitest run src/__tests__/session-reliability.spec.ts src/__tests__/session-active-enterprise.spec.ts
\`\`\`
`;
  writeFileSync(resolve(here, '../../../PROOF_SESSION_FORCE_LOGIN.md'), md, 'utf8');
  writeFileSync(
    resolve(here, '../../../PROOF_SESSION_FORCE_LOGIN.json'),
    JSON.stringify({ at, verdict, pass, fail, total: results.length, gates: results }, null, 2),
    'utf8',
  );
});
