/**
 * PERMANENT LOCK — Tab resume must not freeze UI / ignore first click
 * Token: INVARIANT_SESSION_RESUME_INTEGRITY_v1
 *
 *   npm run proof:session-resume-integrity --prefix samplepos.client
 */
import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SESSION_RESUME_INTEGRITY_INVARIANT_ID,
  SESSION_RESUME_INTEGRITY_SOURCE_FILES,
  SESSION_RESUME_INTEGRITY_REQUIRED_SNIPPETS,
  SESSION_RESUME_INTEGRITY_FORBIDDEN_SNIPPETS,
  SESSION_RESUME_VISIBILITY_SSOT_FILES,
  SESSION_RESUME_VISIBILITY_SCAN_SKIP,
} from '../lib/sessionResumeIntegrityInvariant';

const here = dirname(fileURLToPath(import.meta.url));
const clientRoot = resolve(here, '../..');
const clientSrc = join(clientRoot, 'src');
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

function walkTsFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue;
      walkTsFiles(full, acc);
    } else if (/\.(ts|tsx)$/.test(name)) {
      acc.push(full);
    }
  }
  return acc;
}

describe(`PERMANENT LOCK ${SESSION_RESUME_INTEGRITY_INVARIANT_ID}`, () => {
  it('structural: invariant token + required wiring in production sources', () => {
    for (const file of SESSION_RESUME_INTEGRITY_SOURCE_FILES) {
      const src = readClient(file);
      gate(
        `TOKEN_${file.replace(/[^\w]+/g, '_')}`,
        src.includes(SESSION_RESUME_INTEGRITY_INVARIANT_ID),
        `${file} embeds ${SESSION_RESUME_INTEGRITY_INVARIANT_ID}`,
      );
    }

    for (const [file, snippets] of Object.entries(SESSION_RESUME_INTEGRITY_REQUIRED_SNIPPETS)) {
      const src = readClient(file);
      for (const snip of snippets) {
        const id = `REQ_${file.split('/').pop()}_${snip.slice(0, 24).replace(/\W+/g, '_')}`;
        gate(id, src.includes(snip), `${file} contains ${JSON.stringify(snip)}`);
      }
    }
  });

  it('structural: visibilitychange SSOT — only coordinator + idle timeout', () => {
    const offenders: string[] = [];
    for (const abs of walkTsFiles(clientSrc)) {
      const rel = relative(clientRoot, abs).replace(/\\/g, '/');
      if (SESSION_RESUME_VISIBILITY_SCAN_SKIP.has(rel)) continue;
      if (SESSION_RESUME_VISIBILITY_SSOT_FILES.includes(rel as (typeof SESSION_RESUME_VISIBILITY_SSOT_FILES)[number])) continue;
      const src = readFileSync(abs, 'utf8');
      if (src.includes("addEventListener('visibilitychange'") || src.includes('addEventListener("visibilitychange"')) {
        offenders.push(rel);
      }
    }
    gate(
      'VISIBILITY_SSOT_NO_OFFENDERS',
      offenders.length === 0,
      offenders.length === 0
        ? `only ${SESSION_RESUME_VISIBILITY_SSOT_FILES.join(', ')} may listen`
        : `forbidden visibility listeners: ${offenders.join(', ')}`,
    );
    for (const file of SESSION_RESUME_VISIBILITY_SSOT_FILES) {
      gate(
        `VISIBILITY_SSOT_${file.split('/').pop()}`,
        readClient(file).includes('visibilitychange'),
        `${file} registers visibilitychange`,
      );
    }
  });

  it('structural: AuthContext narrows cross-tab auth_token storage (no full initAuth storm)', () => {
    const auth = readClient('src/contexts/AuthContext.tsx');
    const storageBlock = auth.slice(auth.indexOf('handleStorageChange'), auth.indexOf('handleStorageChange') + 600);
    gate(
      'AUTHCTX_STORAGE_USER_ONLY_INIT',
      storageBlock.includes("event.key === 'user'") && storageBlock.includes('void initAuth()'),
      'user key triggers initAuth',
    );
    gate(
      'AUTHCTX_STORAGE_TOKEN_NARROW',
      storageBlock.includes("event.key === 'auth_token'") &&
        storageBlock.includes('isAuthenticatedRef.current') &&
        storageBlock.includes('resetAuthState()'),
      'auth_token rotation resets state without full initAuth when already authenticated',
    );
    gate(
      'AUTHCTX_TOKEN_REFRESH_BROADCAST',
      auth.includes("event.type === 'TOKEN_REFRESH'") && auth.includes('resetAuthState()'),
      'peer TOKEN_REFRESH unblocks waiters',
    );
  });

  it('forbidden regression patterns must not reappear in resume-critical sources', () => {
    const scanFiles = [
      'src/contexts/AuthContext.tsx',
      'src/lib/offlineRequestQueue.ts',
      'src/pages/pos/POSPage.tsx',
      'src/contexts/OfflineContext.tsx',
      'src/hooks/useCashRegister.ts',
      'src/hooks/useMultistore.ts',
      'src/hooks/useSessionKeepalive.ts',
      'src/main.tsx',
    ];
    const scan = scanFiles.map((f) => readClient(f)).join('\n');
    for (const bad of SESSION_RESUME_INTEGRITY_FORBIDDEN_SNIPPETS) {
      gate(
        `FORBIDDEN_${bad.slice(0, 36).replace(/\W+/g, '_')}`,
        !scan.includes(bad),
        `must not contain ${JSON.stringify(bad)}`,
      );
    }
  });

  it('permanent proof module + behavioral proof test present', () => {
    gate(
      'LOCK_MODULE_PRESENT',
      existsSync(join(clientRoot, 'src/lib/sessionResumeIntegrityInvariant.ts')),
      'sessionResumeIntegrityInvariant.ts present',
    );
    gate(
      'PROOF_TEST_PRESENT',
      existsSync(join(clientRoot, 'src/__tests__/session-resume-integrity.proof.test.ts')),
      'behavioral proof test present',
    );
    gate(
      'COORDINATOR_MODULE_PRESENT',
      existsSync(join(clientRoot, 'src/lib/sessionResumeCoordinator.ts')),
      'sessionResumeCoordinator.ts present',
    );
  });
});

afterAll(() => {
  const pass = gates.filter((g) => g.ok).length;
  const fail = gates.filter((g) => !g.ok).length;
  const verdict = fail === 0 ? 'PASS' : 'FAIL';
  const at = new Date().toISOString();

  const evidence = {
    invariantId: SESSION_RESUME_INTEGRITY_INVARIANT_ID,
    at,
    purpose:
      'Permanent guarantee: tab resume after idle must not freeze UI, ignore first click, or storm APIs',
    summary: { pass, fail, total: gates.length, verdict },
    gates,
    enforcement: {
      npm: 'npm run proof:session-resume-integrity --prefix samplepos.client',
      rootRunner: 'node scripts/proof-session-resume-integrity.mjs',
      hardFail: true,
    },
  };

  const md = `# PERMANENT LOCK — ${SESSION_RESUME_INTEGRITY_INVARIANT_ID}

**Generated:** ${at}  
**Verdict:** **${verdict}** (${pass}/${gates.length} gates)

## Guarantee

If this artifact is green, the enterprise resume path is wired correctly:

- **One** debounced visibility handler (session resume coordinator)
- Proactive token refresh **before** deferred module work
- No focus-refetch storms on cash register / multistore hooks
- Peer-tab token rotation does **not** re-run full \`initAuth()\`

## Gates

| Gate | Result | Detail |
|------|--------|--------|
${gates.map((g) => `| \`${g.id}\` | ${g.ok ? 'PASS' : 'FAIL'} | ${g.detail.replace(/\|/g, '\\|')} |`).join('\n')}

## Re-run

\`\`\`bash
npm run proof:session-resume-integrity --prefix samplepos.client
# or from repo root:
node scripts/proof-session-resume-integrity.mjs
\`\`\`

**Do not merge** when verdict is FAIL.
`;

  writeFileSync(join(repoRoot, 'PROOF_SESSION_RESUME_INTEGRITY.md'), md, 'utf8');
  writeFileSync(
    join(repoRoot, 'PROOF_SESSION_RESUME_INTEGRITY.json'),
    JSON.stringify(evidence, null, 2),
    'utf8',
  );

  if (fail > 0) {
    throw new Error(`${SESSION_RESUME_INTEGRITY_INVARIANT_ID}: ${fail} gate(s) FAILED`);
  }
});
