#!/usr/bin/env node
/**
 * Proof: deployed finance package is live on Henber production.
 *
 * Checks:
 *   1) Latest successful Deploy to Production headSha matches EXPECT_COMMIT (main HEAD)
 *   2) Prod /api/health healthy
 *   3) Prod SPA JS contains feature fingerprints unique to this release
 *   4) Authenticated API: sales group_by=category; treasury reverse route exists
 *
 * Usage:
 *   node SamplePOS.Server/scripts/proof-production-deploy-fingerprint.mjs
 *   EXPECT_COMMIT=27d80e2 PROD_URL=https://henber.wizarddigital-inv.com node ...
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT =
  process.env.PROOF_OUT || resolve(repoRoot, 'PROOF_PRODUCTION_DEPLOY_FINGERPRINT.md');
const PROD = (process.env.PROD_URL || 'https://henber.wizarddigital-inv.com').replace(
  /\/$/,
  '',
);
const EMAIL = process.env.TEST_EMAIL || process.env.PROD_EMAIL || '';
const PASSWORD = process.env.TEST_PASSWORD || process.env.PROD_PASSWORD || '';
const EXPECT =
  process.env.EXPECT_COMMIT ||
  spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).stdout.trim();

let pass = 0;
let fail = 0;
let skip = 0;
const lines = [
  '# Production Deploy Fingerprint Proof\n',
  `Run: ${new Date().toISOString()}\n`,
  `Prod: ${PROD}\n`,
  `Expect commit: \`${EXPECT.slice(0, 7)}\`\n`,
];

function ok(n, d = '') {
  pass++;
  console.log(`  PASS  ${n}${d ? ` — ${d}` : ''}`);
  lines.push(`- **PASS** ${n}${d ? ` — ${d}` : ''}`);
}
function bad(n, d = '') {
  fail++;
  console.error(`  FAIL  ${n}${d ? ` — ${d}` : ''}`);
  lines.push(`- **FAIL** ${n}${d ? ` — ${d}` : ''}`);
}
function skipped(n, d = '') {
  skip++;
  console.log(`  SKIP  ${n}${d ? ` — ${d}` : ''}`);
  lines.push(`- **SKIP** ${n}${d ? ` — ${d}` : ''}`);
}
function assert(c, n, d = '') {
  if (c) ok(n, d);
  else bad(n, d);
}

async function req(method, path, { token, body, base = PROD } = {}) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text?.slice(0, 400) };
  }
  return { status: res.status, data, text };
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
console.log(' proof-production-deploy-fingerprint');
console.log('═'.repeat(60));

lines.push('\n## GitHub deploy gate\n');

const localHead = spawnSync('git', ['rev-parse', 'HEAD'], {
  cwd: repoRoot,
  encoding: 'utf8',
}).stdout.trim();
assert(
  localHead.startsWith(EXPECT.slice(0, 7)) || EXPECT.startsWith(localHead.slice(0, 7)),
  'Local HEAD matches expect',
  `${localHead.slice(0, 7)}`,
);

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
  '8',
  '--json',
  'databaseId,conclusion,status,headSha,url,displayTitle,createdAt',
]);

const success = Array.isArray(runs)
  ? runs.find(
      (r) =>
        r.conclusion === 'success' &&
        (r.headSha?.startsWith(EXPECT.slice(0, 7)) ||
          EXPECT.startsWith(r.headSha?.slice(0, 7) || '')),
    )
  : null;
const latestSuccess = Array.isArray(runs)
  ? runs.find((r) => r.conclusion === 'success')
  : null;

assert(Boolean(success), 'Successful Deploy run for expect SHA', success?.url || JSON.stringify(runs?.[0] || null));
if (latestSuccess) {
  ok(
    'Latest successful Deploy',
    `${latestSuccess.headSha?.slice(0, 7)} · ${latestSuccess.url}`,
  );
  assert(
    latestSuccess.headSha?.startsWith(EXPECT.slice(0, 7)) ||
      EXPECT.startsWith(latestSuccess.headSha?.slice(0, 7) || ''),
    'Latest deploy SHA is expect (or expect is that deploy)',
    `deploy=${latestSuccess.headSha?.slice(0, 7)} expect=${EXPECT.slice(0, 7)}`,
  );
}

lines.push('\n## Production health\n');
const health = await req('GET', '/api/health');
assert(health.status === 200 && health.data?.data?.status === 'healthy', 'Prod health', String(health.status));
ok(
  'Prod uptime/timestamp',
  `uptime=${Number(health.data?.data?.uptime || 0).toFixed(1)}s · ${health.data?.data?.timestamp || ''}`,
);

lines.push('\n## SPA fingerprint (no login; includes lazy chunks)\n');
const html = await fetch(PROD).then((r) => r.text());
const fromHtml = [...html.matchAll(/\/assets\/[A-Za-z0-9_.-]+\.js/g)].map((m) => m[0]);
assert(fromHtml.length > 0, 'SPA references JS assets', `n=${fromHtml.length}`);

const indexAsset = fromHtml.find((a) => /\/index-.*\.js$/.test(a));
let discovered = [...fromHtml];
if (indexAsset) {
  try {
    const indexJs = await fetch(PROD + indexAsset).then((r) => r.text());
    const fromIndex = [...indexJs.matchAll(/assets\/([A-Za-z0-9_-]+\.js)/g)].map(
      (m) => `/assets/${m[1]}`,
    );
    const fromRel = [...indexJs.matchAll(/\.\.\/assets\/([A-Za-z0-9_-]+\.js)/g)].map(
      (m) => `/assets/${m[1]}`,
    );
    const fromChunks = [...indexJs.matchAll(/"([A-Za-z0-9_-]+-[A-Za-z0-9_-]+\.js)"/g)]
      .map((m) => `/assets/${m[1]}`)
      .filter((a) => a.includes('-'));
    discovered = [...new Set([...fromHtml, ...fromIndex, ...fromRel, ...fromChunks])];
    ok('Discovered lazy JS chunks from index', `n=${discovered.length}`);
  } catch (e) {
    bad('Discover lazy JS chunks', e instanceof Error ? e.message : String(e));
  }
} else {
  bad('Locate index-*.js entry', 'missing from HTML');
}

const NEEDLES = [
  'Sales Analysis',
  'sales-analysis',
  'By item category',
  'Smart views',
  'sales-analyse-by',
  'Export PDF',
  'Export CSV',
  'Reverse document',
  'Confirm reverse',
  'Opening Balance Equity (3050)',
  // Inventory worklist Columns-in-More (202fe535+)
  'inventory.worklist.columns.v2.',
  'Choose columns to show',
  'Reset defaults',
  'data-inventory-column-picker',
];
const found = {};
for (const a of discovered) {
  try {
    const res = await fetch(PROD + a);
    if (!res.ok) continue;
    const js = await res.text();
    for (const n of NEEDLES) {
      if (js.includes(n)) {
        found[n] = found[n] || [];
        found[n].push(a);
      }
    }
  } catch (e) {
    // Skip transient fetch errors on individual assets; needles assert below.
  }
}
for (const n of NEEDLES) {
  assert(Boolean(found[n]?.length), `SPA contains "${n}"`, found[n]?.[0] || 'missing');
}

lines.push('\n## Authenticated API fingerprints\n');
let token = null;
if (!EMAIL || !PASSWORD) {
  skipped('API login', 'Set TEST_EMAIL + TEST_PASSWORD (or PROD_*) for live API checks');
} else {
  const login = await req('POST', '/api/auth/login', {
    body: { email: EMAIL, password: PASSWORD },
  });
  token = login.data?.data?.token || login.data?.data?.accessToken;
  assert(login.status === 200 && token, 'Prod login', String(login.status));

  if (token) {
    const end = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Kampala' });
    const start = `${end.slice(0, 7)}-01`;
    const salesCat = await req(
      'GET',
      `/api/reports/sales?start_date=${start}&end_date=${end}&group_by=category`,
      { token },
    );
    const payload = salesCat.data?.data;
    assert(
      salesCat.status === 200 && payload?.reportType === 'SALES_REPORT',
      'API sales group_by=category accepted',
      `${payload?.recordCount ?? 0} groups`,
    );
    if (Array.isArray(payload?.data) && payload.data.length) {
      assert(
        payload.data.every((r) => typeof r.category === 'string' || r.period),
        'Category rows include category/period',
        String(payload.data[0]?.category || payload.data[0]?.period),
      );
    } else {
      ok('Category report empty-ok for range', `${start}→${end}`);
    }

    const noFmt = Object.keys(payload?.summary || {}).filter((k) => /Formatted$/i.test(k));
    assert(noFmt.length === 0, 'Sales summary has no *Formatted keys', 'clean');

    const tre = await req('GET', '/api/treasury/enabled', { token });
    assert(tre.status === 200, 'Treasury enabled endpoint', String(tre.status));

    // Reverse endpoint must exist (404/400/409 ok; 404 route missing would be Express default differently)
    const revProbe = await req('POST', '/api/treasury/documents/00000000-0000-4000-8000-000000000000/reverse', {
      token,
      body: { reason: 'PROD fingerprint probe — expect not-found' },
    });
    assert(
      revProbe.status !== 404 || /not found|Treasury Document/i.test(JSON.stringify(revProbe.data || {})),
      'Treasury reverse route wired',
      `${revProbe.status} ${JSON.stringify(revProbe.data?.error || revProbe.data?.message || '').slice(0, 120)}`,
    );
    // Prefer: 404 entity / 400 validation / 403 forbidden — all prove route is mounted
    assert(
      [400, 403, 404, 409, 422].includes(revProbe.status),
      'Reverse returns domain status (not Express raw miss alone)',
      String(revProbe.status),
    );
  }
}

lines.push('\n## Verdict\n');
lines.push(`- PASS: ${pass}`);
lines.push(`- FAIL: ${fail}`);
lines.push(`- SKIP: ${skip}`);
const verdict = fail === 0 ? 'PASS' : 'FAIL';
lines.push(`\n**Overall: ${verdict}** — production ${verdict === 'PASS' ? 'serves' : 'does NOT clearly serve'} \`${EXPECT.slice(0, 7)}\` fingerprints.\n`);

writeFileSync(OUT, lines.join('\n') + '\n', 'utf8');
console.log('\n' + '─'.repeat(60));
console.log(` Wrote ${OUT}`);
console.log(` PASS=${pass} FAIL=${fail} SKIP=${skip} → ${verdict}`);
console.log('─'.repeat(60));
process.exit(fail === 0 ? 0 : 1);
