/**
 * Behavioral proof — tab resume integrity (not theory)
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

Object.defineProperty(global, 'navigator', {
  value: { onLine: true },
  configurable: true,
});

const { refreshMock } = vi.hoisted(() => ({
  refreshMock: vi.fn(async () => {
    const { setAuthState } = await import('../lib/authStateMachine');
    const expiry = (Date.now() + 10 * 60 * 1000).toString();
    localStorageMock.setItem('token_expiry', expiry);
    localStorageMock.setItem('auth_token', 'fresh-access-token');
    localStorageMock.setItem('refresh_token', 'fresh-refresh-token');
    setAuthState('AUTHENTICATED');
  }),
}));

vi.mock('../hooks/useTokenRefresh', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../hooks/useTokenRefresh')>();
  return {
    ...actual,
    refreshAccessTokenDeduped: () => refreshMock(),
  };
});

import {
  getAuthState,
  setAuthState,
  resetAuthState,
  waitForAuthenticated,
} from '../lib/authStateMachine';
import {
  registerSessionResume,
  runSessionResume,
  resetSessionResumeCoordinatorForTests,
  setupSessionResumeAuth,
} from '../lib/sessionResumeCoordinator';
import {
  storeTokens,
  isTokenExpired,
  getAccessToken,
} from '../hooks/useTokenRefresh';

describe('session-resume-integrity.proof — behavioral', () => {
  beforeEach(() => {
    resetSessionResumeCoordinatorForTests();
    resetAuthState();
    localStorageMock.clear();
    refreshMock.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    resetSessionResumeCoordinatorForTests();
    vi.useRealTimers();
  });

  it('auth phase completes before after-phase callbacks (ordering)', async () => {
    const log: string[] = [];
    registerSessionResume(() => { log.push('auth'); }, { phase: 'auth' });
    registerSessionResume(() => { log.push('after'); }, { phase: 'after', delayMs: 0 });

    const run = runSessionResume();
    await vi.runAllTimersAsync();
    await run;

    expect(log).toEqual(['auth', 'after']);
  });

  it('proactive resume refresh runs when token expired (setupSessionResumeAuth)', async () => {
    storeTokens('stale', 'rt', 30);
    expect(isTokenExpired()).toBe(true);

    setupSessionResumeAuth();
    await runSessionResume();

    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(isTokenExpired()).toBe(false);
    expect(getAccessToken()).toBe('fresh-access-token');
  });

  it('after proactive refresh, waitForAuthenticated resolves immediately (no freeze)', async () => {
    storeTokens('stale', 'rt', 30);
    setAuthState('REFRESHING');

    setupSessionResumeAuth();
    const waitPromise = waitForAuthenticated(20_000);
    await runSessionResume();
    await waitPromise;

    expect(getAuthState()).toBe('AUTHENTICATED');
  });

  it('dedupes concurrent resume invocations (single refresh)', async () => {
    storeTokens('stale', 'rt', 30);
    setupSessionResumeAuth();

    const p1 = runSessionResume();
    const p2 = runSessionResume();
    await vi.runAllTimersAsync();
    await Promise.all([p1, p2]);

    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it('staggered after-phase buckets preserve delay ordering', async () => {
    const log: string[] = [];
    registerSessionResume(() => { log.push('t0'); }, { phase: 'after', delayMs: 0 });
    registerSessionResume(() => { log.push('t500'); }, { phase: 'after', delayMs: 500 });

    const run = runSessionResume();
    await vi.advanceTimersByTimeAsync(500);
    await run;

    expect(log.indexOf('t0')).toBeLessThan(log.indexOf('t500'));
  });
});
