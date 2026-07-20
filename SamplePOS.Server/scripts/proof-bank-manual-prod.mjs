#!/usr/bin/env node
/**
 * Post-deploy proof: BANK_MANUAL + deposit destination GL guard on production.
 *
 * Usage:
 *   node SamplePOS.Server/scripts/proof-bank-manual-prod.mjs
 *   Loads .env.proof.production (TEST_EMAIL, TEST_PASSWORD, optional PROD_URL)
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = resolve(repoRoot, 'PROOF_BANK_MANUAL_PROD_DEPLOY.md');

function loadEnvFile(p) {
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const k = m[1];
    let v = m[2].replace(/^["']|["']$/g, '');
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnvFile(resolve(repoRoot, '.env.proof.production'));
loadEnvFile(resolve(repoRoot, 'SamplePOS.Server/.env.proof.production'));

const PROD = (process.env.PROD_URL || 'https://henber.wizarddigital-inv.com').replace(/\/$/, '');
const EMAIL = process.env.TEST_EMAIL || process.env.PROD_EMAIL || '';
const PASSWORD = process.env.TEST_PASSWORD || process.env.PROD_PASSWORD || '';
const EXPECT =
  process.env.EXPECT_COMMIT ||
  spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).stdout.trim();

let pass = 0;
let fail = 0;
let skip = 0;
const lines = [
  '# Proof: BANK_MANUAL production deploy\n',
  `Run: ${new Date().toISOString()}\n`,
  `Prod: ${PROD}\n`,
  `Expect commit: \`${EXPECT.slice(0, 7)}\`\n`,
];

const ok = (n, d = '') => {
  pass++;
  console.log(`  PASS  ${n}${d ? ` — ${d}` : ''}`);
  lines.push(`- **PASS** ${n}${d ? ` — ${d}` : ''}`);
};
const bad = (n, d = '') => {
  fail++;
  console.error(`  FAIL  ${n}${d ? ` — ${d}` : ''}`);
  lines.push(`- **FAIL** ${n}${d ? ` — ${d}` : ''}`);
};
const skipped = (n, d = '') => {
  skip++;
  console.log(`  SKIP  ${n}${d ? ` — ${d}` : ''}`);
  lines.push(`- **SKIP** ${n}${d ? ` — ${d}` : ''}`);
};

async function req(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${PROD}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text?.slice(0, 500) };
  }
  return { status: res.status, data, text, error: data?.error || data?.message };
}

function ghJson(args) {
  const r = spawnSync('gh', args, { cwd: repoRoot, encoding: 'utf8', shell: true });
  if (r.status !== 0) return null;
  try {
    return JSON.parse(r.stdout);
  } catch {
    return null;
  }
}

console.log('═'.repeat(60));
console.log(' proof-bank-manual-prod');
console.log('═'.repeat(60));

lines.push('\n## Deploy gate\n');
const runs = ghJson([
  'run',
  'list',
  '--repo',
  'wizard-digital/SMART-ERP-POS',
  '--workflow',
  'deploy-production.yml',
  '--branch',
  'main',
  '--limit',
  '5',
  '--json',
  'databaseId,conclusion,status,headSha,url,displayTitle',
]);
const match = Array.isArray(runs)
  ? runs.find(
      (r) =>
        r.conclusion === 'success' &&
        (r.headSha?.startsWith(EXPECT.slice(0, 7)) ||
          EXPECT.startsWith(r.headSha?.slice(0, 7) || '')),
    )
  : null;
if (match) ok('Deploy succeeded for expect SHA', match.url);
else bad('Deploy succeeded for expect SHA', JSON.stringify(runs?.[0] || null));

lines.push('\n## Health\n');
const health = await req('GET', '/api/health');
if (health.status === 200 && (health.data?.success || health.data?.data?.status === 'healthy' || health.data?.status === 'healthy')) {
  ok('Prod health', String(health.status));
} else {
  // some builds nest differently
  const okHealth =
    health.status === 200 &&
    (health.data?.success === true ||
      health.data?.status === 'healthy' ||
      health.data?.data?.status === 'healthy');
  if (okHealth) ok('Prod health', String(health.status));
  else bad('Prod health', JSON.stringify(health.data).slice(0, 200));
}

lines.push('\n## Deployed artifact (SSH / container)\n');
try {
  // One remote script string — avoid Windows shell splitting `docker` locally.
  const remote = [
    'set -e',
    'cd /opt/smarterp',
    'echo HEAD=$(git rev-parse HEAD)',
    'echo GOV_BM=$(docker exec smarterp-backend grep -c BANK_MANUAL /app/dist/SamplePOS.Server/src/services/postingGovernanceService.js || true)',
    'echo BANK_BM=$(docker exec smarterp-backend grep -c BANK_MANUAL /app/dist/SamplePOS.Server/src/services/bankingService.js || true)',
    'echo DEP_GUARD=$(docker exec smarterp-backend grep -c "cannot receive deposits" /app/dist/SamplePOS.Server/src/modules/treasury/depositWorksheetService.js || true)',
  ].join('; ');

  const ssh = spawnSync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=25', 'root@209.38.203.138', remote], {
    encoding: 'utf8',
    windowsHide: true,
  });
  const out = `${ssh.stdout || ''}\n${ssh.stderr || ''}`.trim();
  const head = (out.match(/HEAD=([0-9a-f]{7,40})/) || [])[1] || '';
  const govBm = Number((out.match(/GOV_BM=(\d+)/) || [])[1] || 0);
  const bankBm = Number((out.match(/BANK_BM=(\d+)/) || [])[1] || 0);
  const depGuard = Number((out.match(/DEP_GUARD=(\d+)/) || [])[1] || 0);

  if (head && (head.startsWith(EXPECT.slice(0, 7)) || EXPECT.startsWith(head.slice(0, 7)))) {
    ok('Prod server git HEAD matches expect', head.slice(0, 7));
  } else {
    bad('Prod server git HEAD matches expect', out.slice(0, 240));
  }
  if (govBm > 0 && bankBm > 0) {
    ok('Container dist contains BANK_MANUAL', `gov=${govBm} banking=${bankBm}`);
  } else {
    bad('Container dist contains BANK_MANUAL', out.slice(0, 240));
  }
  if (depGuard > 0) {
    ok('Container dist contains deposit GL guard', `hits=${depGuard}`);
  } else {
    bad('Container dist contains deposit GL guard', out.slice(0, 240));
  }
} catch (e) {
  bad('SSH artifact check', e instanceof Error ? e.message : String(e));
}

lines.push('\n## Authenticated BANK_MANUAL + deposit GL\n');
if (!EMAIL || !PASSWORD) {
  skipped('Login', 'Set TEST_EMAIL/TEST_PASSWORD in .env.proof.production');
} else {
  const login = await req('POST', '/api/auth/login', {
    body: { email: EMAIL, password: PASSWORD },
  });
  const token =
    login.data?.data?.token ||
    login.data?.data?.accessToken ||
    login.data?.token ||
    login.data?.accessToken;
  if (!token) {
    bad('Prod login', login.error || String(login.status));
  } else {
    ok('Prod login', String(login.status));

    const cats = await req('GET', '/api/banking/categories?direction=IN', { token });
    const accounts = await req('GET', '/api/banking/accounts', { token });
    const sales = (cats.data?.data || []).find((c) => c.code === 'SALES_DEPOSIT');
    const banks = accounts.data?.data || [];
    const good =
      banks.find((a) => a.glAccountCode === '1030') ||
      banks.find(
        (a) =>
          a.glAccountCode &&
          String(a.glAccountCode).startsWith('10') &&
          !['1015', '1200', '3050'].includes(String(a.glAccountCode)),
      );

    if (!sales || !good) {
      skipped('BANK_MANUAL Sales Deposit', `sales=${!!sales} bank=${!!good}`);
    } else {
      const today = new Date().toLocaleDateString('en-CA');
      const create = await req('POST', '/api/banking/transactions', {
        token,
        body: {
          bankAccountId: good.id,
          transactionDate: today,
          type: 'DEPOSIT',
          categoryId: sales.id,
          description: `PROD PROOF BANK_MANUAL ${EXPECT.slice(0, 7)}`,
          amount: 1,
          reference: `PROOF-BM-${EXPECT.slice(0, 7)}`,
        },
      });
      if (create.status >= 200 && create.status < 300 && create.data?.data?.id) {
        ok(
          'BANK_MANUAL Sales Deposit on prod',
          `${create.data.data.transactionNumber} → ${good.name} (${good.glAccountCode})`,
        );
      } else if (
        String(create.error || '').includes('Manual credit') ||
        String(create.error || '').includes('debit-normal')
      ) {
        bad('BANK_MANUAL Sales Deposit on prod', `still MANUAL_JOURNAL blocked: ${create.error}`);
      } else {
        bad('BANK_MANUAL Sales Deposit on prod', `${create.status} ${create.error || ''}`);
      }
    }

    const badBank = banks.find((a) =>
      ['1015', '1200', '3050'].includes(String(a.glAccountCode || '')),
    );
    if (!badBank) {
      skipped('Deposit rejects bad GL', 'no bank account linked to 1015/1200/3050 on this tenant');
    } else {
      const dep = await req('POST', '/api/treasury/deposit-worksheets', {
        token,
        body: {
          transactionDate: new Date().toLocaleDateString('en-CA'),
          bankAccountId: badBank.id,
          depositReference: `PROOF-BAD-${EXPECT.slice(0, 7)}`,
          shortageAmount: 0,
          overageAmount: 0,
          receipts: [
            {
              sourceType: 'AR_CUSTOMER_PAYMENT',
              sourceId: '00000000-0000-4000-8000-000000000001',
              amount: 1,
            },
          ],
        },
      });
      const err = String(dep.error || '');
      if (
        err.includes('cannot receive deposits') ||
        err.includes('non-asset') ||
        /1015|1200|3050/.test(err)
      ) {
        ok(
          'Deposit rejects bad bank GL on prod',
          `${badBank.name} (${badBank.glAccountCode})`,
        );
      } else if (dep.status >= 200 && dep.status < 300) {
        bad('Deposit rejects bad bank GL on prod', 'unexpected success');
      } else {
        // If treasury disabled or receipt missing before GL check — fail closed
        bad('Deposit rejects bad bank GL on prod', `${dep.status} ${err.slice(0, 240)}`);
      }
    }
  }
}

lines.push('\n## Verdict\n');
lines.push(`- PASS: ${pass}`);
lines.push(`- FAIL: ${fail}`);
lines.push(`- SKIP: ${skip}`);
lines.push('');
lines.push(
  fail === 0
    ? `**Overall: PASS** — production serves BANK_MANUAL / deposit GL guard for \`${EXPECT.slice(0, 7)}\`.`
    : `**Overall: FAIL** — see failures above.`,
);

writeFileSync(OUT, lines.join('\n') + '\n', 'utf8');
console.log(`\nWrote ${OUT}`);
console.log(`RESULT pass=${pass} fail=${fail} skip=${skip}`);
process.exit(fail > 0 ? 1 : 0);
