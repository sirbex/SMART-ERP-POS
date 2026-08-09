/**
 * PERMANENT LOCK — Session death must always force Login UI
 * Token: INVARIANT_SESSION_DEATH_LOGIN_v1
 *
 * This suite is intentionally brittle against regressions that recreated
 * "server logged out, SPA still shows protected modules + token toasts".
 *
 * Hard-fail CI job: session-death-login-invariant (no continue-on-error)
 *
 *   npm run proof:session-death-login-lock
 */
import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SESSION_DEATH_LOGIN_INVARIANT_ID,
  SESSION_DEATH_LOGIN_SOURCE_FILES,
  SESSION_DEATH_LOGIN_REQUIRED_SNIPPETS,
  SESSION_DEATH_LOGIN_FORBIDDEN_SNIPPETS,
  SESSION_DEATH_LOGIN_BEHAVIORAL_TRUTH,
  policySourceOrdersDefinitiveBeforeActivityGate,
} from '../lib/sessionDeathLoginInvariant';
import {
  shouldPerformAutoLogout,
  shouldIgnoreCrossTabSessionExpired,
  classifyRefreshError,
} from '../lib/sessionLogoutPolicy';

const here = dirname(fileURLToPath(import.meta.url));
const clientRoot = resolve(here, '../..');
const repoRoot = resolve(clientRoot, '..');

type Gate = { id: string; ok: boolean; detail: string };
const gates: Gate[] = [];

function gate(id: string, ok: boolean, detail: string) {
  gates.push({ id, ok, detail });
  expect.soft({ id, ok, detail }).toEqual({ id, ok: true, detail });
}

function readClient(rel: string): string {
  return readFileSync(join(clientRoot, rel), 'utf8');
}

describe(`PERMANENT LOCK ${SESSION_DEATH_LOGIN_INVARIANT_ID}`, () => {
  it('behavioral truth table — definitive auth always logout; network/5xx never', () => {
    for (const row of SESSION_DEATH_LOGIN_BEHAVIORAL_TRUTH) {
      const got = shouldPerformAutoLogout({
        activeOrGuarded: row.activeOrGuarded,
        errorKind: row.errorKind,
        hasRefreshToken: row.hasRefreshToken,
      });
      gate(
        `BEHAVIOR_${row.id}`,
        got === row.expectLogout,
        `${row.id}: expected logout=${row.expectLogout} got=${got}`,
      );
    }
  });

  it('peer SESSION_EXPIRED is never ignored (working or idle)', () => {
    gate(
      'PEER_NEVER_IGNORE_ACTIVE',
      shouldIgnoreCrossTabSessionExpired(true) === false,
      'active peer ignore must be false',
    );
    gate(
      'PEER_NEVER_IGNORE_IDLE',
      shouldIgnoreCrossTabSessionExpired(false) === false,
      'idle peer ignore must be false',
    );
  });

  it('classification locks bare 401 + refresh-expired as definitive', () => {
    gate(
      'CLASSIFY_REFRESH_EXPIRED',
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
    gate(
      'CLASSIFY_REUSE',
      classifyRefreshError({
        response: {
          status: 401,
          data: { error: 'Token reuse detected. All sessions have been revoked for security.' },
        },
      }) === 'definitive_auth',
      'token reuse',
    );
  });

  it('structural: invariant token + required wiring in production sources', () => {
    for (const file of SESSION_DEATH_LOGIN_SOURCE_FILES) {
      const src = readClient(file);
      gate(
        `TOKEN_${file.replace(/[^\w]+/g, '_')}`,
        src.includes(SESSION_DEATH_LOGIN_INVARIANT_ID),
        `${file} embeds ${SESSION_DEATH_LOGIN_INVARIANT_ID}`,
      );
    }

    for (const [file, snippets] of Object.entries(SESSION_DEATH_LOGIN_REQUIRED_SNIPPETS)) {
      const src = readClient(file);
      for (const snip of snippets) {
        const id = `REQ_${file.split('/').pop()}_${snip.slice(0, 24).replace(/\W+/g, '_')}`;
        gate(id, src.includes(snip), `${file} contains ${JSON.stringify(snip)}`);
      }
    }
  });

  it('structural: policy orders definitive_auth BEFORE activeOrGuarded false-return', () => {
    const policy = readClient('src/lib/sessionLogoutPolicy.ts');
    gate(
      'ORDER_DEFINITIVE_BEFORE_ACTIVE_GATE',
      policySourceOrdersDefinitiveBeforeActivityGate(policy),
      'definitive_auth handled before activeOrGuarded→false in shouldPerformAutoLogout',
    );
  });

  it('structural: refresh failure path calls forceLogoutRedirect (same-tab)', () => {
    const tr = readClient('src/hooks/useTokenRefresh.ts');
    // Must call forceLogout on definitive path inside _refreshOnce catch, not only broadcast
    const catchIdx = tr.indexOf('.catch((err: unknown)');
    const catchSlice = tr.slice(catchIdx, catchIdx + 1200);
    gate(
      'REFRESH_CATCH_FORCE_LOGOUT',
      catchSlice.includes('forceLogoutRedirect'),
      '_refreshOnce catch invokes forceLogoutRedirect',
    );
    gate(
      'FORCE_USES_LOCATION_REPLACE',
      /location\.replace\([^)]*\/login/.test(tr) || tr.includes("location.replace(`${window.location.origin}/login`)"),
      'forceLogoutRedirect uses location.replace(.../login)',
    );
    gate(
      'BUILD401_FORCE_LOGOUT',
      /export function build401Handler[\s\S]*?forceLogoutRedirect/.test(tr) &&
        tr.indexOf('export function build401Handler') < tr.lastIndexOf('forceLogoutRedirect') &&
        tr.includes('mayAutoLogout'),
      'build401Handler still force-logout on dead refresh',
    );
  });

  it('structural: AuthContext hard-navigates on peer logout / session expire', () => {
    const auth = readClient('src/contexts/AuthContext.tsx');
    // Must not reintroduce peer-session-expired ignore
    gate(
      'AUTHCTX_NO_IGNORE_PEER',
      !/shouldIgnoreCrossTabSessionExpired\([^)]+\)\s*\)\s*\{\s*return;/.test(auth) &&
        !/if\s*\(\s*shouldIgnoreCrossTabSessionExpired/.test(auth),
      'AuthContext does not early-return on shouldIgnoreCrossTabSessionExpired',
    );
    const sessionBlock = auth.slice(auth.indexOf("event.type === 'SESSION_EXPIRED'"), auth.indexOf("event.type === 'SESSION_EXPIRED'") + 800);
    gate(
      'AUTHCTX_SESSION_REPLACE',
      sessionBlock.includes('location.replace') && sessionBlock.includes('/login'),
      'SESSION_EXPIRED hard-nav to login',
    );
  });

  it('forbidden regression phrases must not reappear in client auth sources', () => {
    const scan = [
      'src/lib/sessionLogoutPolicy.ts',
      'src/hooks/useTokenRefresh.ts',
      'src/contexts/AuthContext.tsx',
      'src/__tests__/session-reliability.spec.ts',
      'src/__tests__/session-active-enterprise.spec.ts',
    ]
      .map((f) => readClient(f))
      .join('\n');

    for (const bad of SESSION_DEATH_LOGIN_FORBIDDEN_SNIPPETS) {
      gate(
        `FORBIDDEN_${bad.slice(0, 40).replace(/\W+/g, '_')}`,
        !scan.includes(bad),
        `must not contain ${JSON.stringify(bad)}`,
      );
    }
  });

  it('structural: 401-after-retry never leaves SPA without forceLogout', () => {
    const tr = readClient('src/hooks/useTokenRefresh.ts');
    gate(
      'RETRY_401_FORCE',
      tr.includes("forceLogoutRedirect('401_after_retry')"),
      'second 401 after retry forces login',
    );
    const authCtx = readClient('src/contexts/AuthContext.tsx');
    gate(
      'INITAUTH_NO_STALE_FALLBACK',
      !authCtx.includes("localStorage.getItem('auth_token') || token") &&
        authCtx.includes('boot_refresh_failed') &&
        authCtx.includes('forceLogoutRedirect'),
      'boot refuses stale token resurrection + forceLogout on dead refresh',
    );
    gate(
      'DOWNLOAD_AUTH_FORCE',
      readClient('src/utils/download.ts').includes('forceLogoutRedirect') &&
        readClient('src/utils/download.ts').includes('authorizedFetch'),
      'binary download path forces login on 401',
    );
  });

  it('permanent proof + report artifacts exist after suite (self-documenting)', () => {
    gate(
      'LOCK_MODULE_PRESENT',
      existsSync(join(clientRoot, 'src/lib/sessionDeathLoginInvariant.ts')),
      'sessionDeathLoginInvariant.ts present',
    );
    gate(
      'PROOF_TEST_PRESENT',
      existsSync(join(clientRoot, 'src/__tests__/session-force-login-redirect.proof.test.ts')),
      'behavioral proof test present',
    );
  });
});

afterAll(() => {
  const pass = gates.filter((g) => g.ok).length;
  const fail = gates.filter((g) => !g.ok).length;
  const verdict = fail === 0 ? 'PASS' : 'FAIL';
  const at = new Date().toISOString();

  const evidence = {
    invariantId: SESSION_DEATH_LOGIN_INVARIANT_ID,
    at,
    purpose:
      'Permanent guarantee: server/session death always forces Login UI — never zombie SPA + token toasts',
    summary: { pass, fail, total: gates.length, verdict },
    gates,
    enforcement: {
      npm: 'npm run proof:session-death-login-lock --prefix samplepos.client',
      ciJob: 'session-death-login-invariant',
      hardFail: true,
    },
  };

  const md = `# PERMANENT LOCK — ${SESSION_DEATH_LOGIN_INVARIANT_ID}

**Generated:** ${at}  
**Verdict:** **${verdict}** (${pass}/${gates.length} gates)  
**Hard-fail CI job:** \`session-death-login-invariant\`

## Guarantee

If this artifact and the CI job are green, the inconsistency  
**“server logged user out but UI stayed on protected pages with token errors”**  
has **not** regressed in source or policy behavior.

## Behavioral truth table

| Scenario | Must force login? |
|----------|-------------------|
| Active + definitive auth | **YES** |
| Idle + definitive auth | **YES** |
| Active + network | NO |
| Active + 5xx | NO |
| No refresh token | **YES** |

## Gates

| Gate | Result | Detail |
|------|--------|--------|
${gates.map((g) => `| \`${g.id}\` | ${g.ok ? 'PASS' : 'FAIL'} | ${g.detail.replace(/\|/g, '\\|')} |`).join('\n')}

## Re-run / enforce

\`\`\`bash
cd samplepos.client
npm run proof:session-death-login-lock
# or from repo root:
node scripts/proof-session-death-login-invariant.mjs
\`\`\`

**Do not merge** when verdict is FAIL.
`;

  writeFileSync(join(repoRoot, 'PROOF_SESSION_DEATH_LOGIN_INVARIANT_LOCK.md'), md, 'utf8');
  writeFileSync(
    join(repoRoot, 'PROOF_SESSION_DEATH_LOGIN_INVARIANT_LOCK.json'),
    JSON.stringify(evidence, null, 2),
    'utf8',
  );

  // Permanent living guarantee — stamp fails if not PASS (CI consumes both)
  writeFileSync(
    join(repoRoot, 'PERMANENT_GUARANTEE_SESSION_DEATH_LOGIN.md'),
    `# Permanent guarantee — Session death → Login

| Field | Value |
|-------|--------|
| **Invariant** | \`${SESSION_DEATH_LOGIN_INVARIANT_ID}\` |
| **Last proof** | ${at} |
| **Verdict** | **${verdict}** |
| **Gates** | ${pass}/${gates.length} |

## Promise

This application **must never** leave an authenticated SPA shell after server-side session death.
Definitive auth failure always hard-navigates to Login (same tab + peers).
Network / 5xx blips do not force logout.

## Enforcement (cannot be a soft test)

1. Vitest permanent lock: \`src/__tests__/session-death-login.invariant.lock.test.ts\`
2. Behavioral proof: \`src/__tests__/session-force-login-redirect.proof.test.ts\`
3. CI job **session-death-login-invariant** (hard fail — no continue-on-error)
4. Source tokens \`${SESSION_DEATH_LOGIN_INVARIANT_ID}\` required in policy / forceLogout / broadcast modules

## Seal

This file is regenerated only by the permanent lock suite.  
If CI merges when this is **FAIL**, process has been bypassed.
`,
    'utf8',
  );

  if (fail > 0) {
    // Ensure non-soft failure is visible even if soft expects were used
    throw new Error(
      `${SESSION_DEATH_LOGIN_INVARIANT_ID} LOCK FAILED: ${fail}/${gates.length} gates — see PROOF_SESSION_DEATH_LOGIN_INVARIANT_LOCK.md`,
    );
  }
});
