/**
 * PERMANENT CONTRACT — Session death → Login (never leave zombie SPA)
 *
 * Token: INVARIANT_SESSION_DEATH_LOGIN_v1
 *
 * Failure modes this locks forever (must NEVER return in product):
 * 1. Definitive auth failure deferred while user is "active"
 * 2. Originating tab relies only on BroadcastChannel (does not self-redirect)
 * 3. Peer tab ignores SESSION_EXPIRED because it is "working"
 *
 * Enforcement:
 * - Behavioral gates via shouldPerformAutoLogout / shouldIgnoreCrossTab…
 * - Structural source greps (required / forbidden strings)
 * - CI job session-death-login-invariant (hard fail, no continue-on-error)
 *
 * Do not weaken definitive_auth policy without updating this lock and security review.
 */

export const SESSION_DEATH_LOGIN_INVARIANT_ID = 'INVARIANT_SESSION_DEATH_LOGIN_v1' as const;

/** Source files that must contain the invariant token. */
export const SESSION_DEATH_LOGIN_SOURCE_FILES = [
  'src/lib/sessionLogoutPolicy.ts',
  'src/hooks/useTokenRefresh.ts',
  'src/lib/authBroadcast.ts',
] as const;

/** Substrings that MUST appear in corresponding sources (wiring integrity). */
export const SESSION_DEATH_LOGIN_REQUIRED_SNIPPETS: Record<string, string[]> = {
  'src/lib/sessionLogoutPolicy.ts': [
    SESSION_DEATH_LOGIN_INVARIANT_ID,
    "if (input.errorKind === 'definitive_auth')",
    'return true',
    'export function shouldIgnoreCrossTabSessionExpired',
    'return false',
  ],
  'src/hooks/useTokenRefresh.ts': [
    SESSION_DEATH_LOGIN_INVARIANT_ID,
    'export function forceLogoutRedirect',
    'clearTokens()',
    'location.replace',
    '/login',
    'forceLogoutRedirect(',
    'build401Handler',
    '401_after_retry',
  ],
  'src/lib/authBroadcast.ts': [
    SESSION_DEATH_LOGIN_INVARIANT_ID,
    'originating tab does NOT receive',
    'forceLogoutRedirect',
  ],
  'src/contexts/AuthContext.tsx': [
    "event.type === 'SESSION_EXPIRED'",
    "event.type === 'LOGOUT'",
    'location.replace',
    '/login',
    'forceLogoutRedirect',
    'boot_refresh_failed',
  ],
  'src/utils/download.ts': [
    'forceLogoutRedirect',
    'authorizedFetch',
  ],
};

/**
 * Forbidden regressions — presence of these patterns fails the permanent lock.
 * Keep messages precise so PRs that reintroduce “defer while active” fail CI.
 */
export const SESSION_DEATH_LOGIN_FORBIDDEN_SNIPPETS: string[] = [
  // Old bad comment / test wording that justified the zombie-session bug
  'NEVER auto-logout active user on definitive auth',
  'defer until idle',
  'deferred (NO auto-logout)',
  'IGNORE peer SESSION_EXPIRED',
  // Dangerous ordering: block ALL auto-logout when active, including definitive
  // (allowed only if definitive returns true BEFORE this pattern)
];

/**
 * Forbidden implementation of shouldPerformAutoLogout that restores Bug A:
 * activeOrGuarded early-return BEFORE definitive_auth is handled.
 * Verified by analyzing AST-free text order in sessionLogoutPolicy.ts.
 */
export function policySourceOrdersDefinitiveBeforeActivityGate(policySrc: string): boolean {
  const definitiveIdx = policySrc.indexOf("errorKind === 'definitive_auth'");
  // The only safe early activeGate after definitive must not appear before it for auto-logout body.
  const fnStart = policySrc.indexOf('export function shouldPerformAutoLogout');
  const fnBody = policySrc.slice(fnStart, fnStart + 900);
  const defInFn = fnBody.indexOf("errorKind === 'definitive_auth'");
  const activeBeforeDef =
    fnBody.search(/if\s*\(\s*input\.activeOrGuarded\s*\)\s*\{?\s*return\s+false/) >= 0 &&
    (() => {
      const m = fnBody.search(/if\s*\(\s*input\.activeOrGuarded\s*\)\s*\{?\s*return\s+false/);
      return m >= 0 && m < defInFn;
    })();
  return definitiveIdx >= 0 && defInFn >= 0 && !activeBeforeDef;
}

/** Full behavioral truth table the product must uphold. */
export const SESSION_DEATH_LOGIN_BEHAVIORAL_TRUTH: Array<{
  id: string;
  activeOrGuarded: boolean;
  errorKind: 'network' | 'transient_server' | 'definitive_auth' | 'unknown';
  hasRefreshToken: boolean;
  expectLogout: boolean;
}> = [
  { id: 'ACT_DEF', activeOrGuarded: true, errorKind: 'definitive_auth', hasRefreshToken: true, expectLogout: true },
  { id: 'IDLE_DEF', activeOrGuarded: false, errorKind: 'definitive_auth', hasRefreshToken: true, expectLogout: true },
  { id: 'ACT_NET', activeOrGuarded: true, errorKind: 'network', hasRefreshToken: true, expectLogout: false },
  { id: 'IDLE_NET', activeOrGuarded: false, errorKind: 'network', hasRefreshToken: true, expectLogout: false },
  { id: 'ACT_5XX', activeOrGuarded: true, errorKind: 'transient_server', hasRefreshToken: true, expectLogout: false },
  { id: 'IDLE_5XX', activeOrGuarded: false, errorKind: 'transient_server', hasRefreshToken: true, expectLogout: false },
  { id: 'NO_RT', activeOrGuarded: true, errorKind: 'network', hasRefreshToken: false, expectLogout: true },
];
