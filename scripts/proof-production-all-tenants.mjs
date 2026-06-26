#!/usr/bin/env node
/**
 * Production proof: deploy status + feature markers on every active tenant.
 *
 * Usage:
 *   node scripts/proof-production-all-tenants.mjs
 *   EXPECT_COMMIT=711d180 TEST_PASSWORD=... node scripts/proof-production-all-tenants.mjs
 */
import { spawnSync } from 'node:child_process';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXPECT_COMMIT = (process.env.EXPECT_COMMIT || '711d180').slice(0, 7);
const PLATFORM_BASE = process.env.PLATFORM_BASE || 'https://henber.wizarddigital-inv.com';
const TENANT_HOST_SUFFIX = process.env.TENANT_HOST_SUFFIX || 'wizarddigital-inv.com';
const PLATFORM_EMAIL = process.env.PLATFORM_EMAIL || 'platform@samplepos.com';
const PLATFORM_PASSWORD = process.env.PLATFORM_PASSWORD || 'Platform123';
const TENANT_EMAIL = process.env.TEST_EMAIL || 'admin@samplepos.com';
const TENANT_PASSWORD = process.env.TEST_PASSWORD || process.env.BLISS_TEST_PASSWORD || 'admin123';

let pass = 0;
let fail = 0;
function ok(n, d = '') {
  pass += 1;
  console.log(`  PASS  ${n}${d ? ` — ${d}` : ''}`);
}
function bad(n, d = '') {
  fail += 1;
  console.error(`  FAIL  ${n}${d ? ` — ${d}` : ''}`);
}
function assert(c, n, d = '') {
  if (c) ok(n, d);
  else bad(n, d);
}

function extractPdfText(buf) {
  const latin = buf.toString('latin1');
  let text = '';
  const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match;
  while ((match = streamRe.exec(latin)) !== null) {
    try {
      const inflated = zlib.inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1');
      const litRe = /\(([^)\\]*(?:\\.[^)\\]*)*)\)\s*Tj/g;
      let m;
      while ((m = litRe.exec(inflated)) !== null) text += m[1];
      const tjRe = /\[([^\]]+)\]\s*TJ/g;
      while ((m = tjRe.exec(inflated)) !== null) {
        const hexRe = /<([0-9A-Fa-f]+)>/g;
        let hm;
        while ((hm = hexRe.exec(m[1])) !== null) {
          const hex = hm[1];
          for (let i = 0; i + 1 < hex.length; i += 2) {
            text += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
          }
        }
      }
    } catch {
      // skip
    }
  }
  return text;
}

function tenantUrl(tenant) {
  if (tenant.customDomain?.trim()) return `https://${tenant.customDomain.trim()}`;
  return `https://${tenant.slug}.${TENANT_HOST_SUFFIX}`;
}

async function platformLogin() {
  const r = await fetch(`${PLATFORM_BASE}/api/platform/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: PLATFORM_EMAIL, password: PLATFORM_PASSWORD }),
  });
  if (!r.ok) return { ok: false, status: r.status, body: await r.text().catch(() => '') };
  const j = await r.json();
  const token = j.data?.token ?? j.data?.accessToken;
  if (!token) return { ok: false, status: r.status, body: 'no token' };
  return { ok: true, token };
}

async function listAllTenants(token) {
  const tenants = [];
  for (let page = 1; page <= 20; page++) {
    const r = await fetch(`${PLATFORM_BASE}/api/platform/tenants?limit=50&page=${page}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) throw new Error(`list tenants HTTP ${r.status}`);
    const j = await r.json();
    const rows = j.data?.tenants ?? j.data ?? [];
    tenants.push(...rows);
    const totalPages = j.data?.totalPages ?? 1;
    if (page >= totalPages || rows.length === 0) break;
  }
  return tenants.filter((t) => {
    const status = String(t.status ?? 'ACTIVE').toUpperCase();
    return status !== 'DELETED' && status !== 'SUSPENDED';
  });
}

async function tenantLogin(base) {
  const r = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TENANT_EMAIL, password: TENANT_PASSWORD }),
  });
  if (!r.ok) return { ok: false, status: r.status };
  const j = await r.json();
  const token = j.data?.token ?? j.data?.accessToken;
  return token ? { ok: true, token } : { ok: false, status: r.status };
}

async function probeTenant(tenant) {
  const base = tenantUrl(tenant);
  const slug = tenant.slug ?? tenant.name ?? base;
  const result = {
    slug,
    base,
    health: 'FAIL',
    login: 'FAIL',
    apiAuthorisation: 'SKIP',
    pdfAuthorisation: 'SKIP',
    billToLayout: 'SKIP',
    deployedFeature: 'NO',
    sample: '—',
  };

  try {
    const healthRes = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(15000) });
    result.health = healthRes.ok ? 'PASS' : `HTTP ${healthRes.status}`;
  } catch (e) {
    result.health = e instanceof Error ? e.message : String(e);
    return result;
  }

  const auth = await tenantLogin(base);
  if (!auth.ok) {
    result.login = `HTTP ${auth.status}`;
    return result;
  }
  result.login = 'PASS';
  const headers = { Authorization: `Bearer ${auth.token}` };

  let quoteLinked = null;
  for (let page = 1; page <= 5 && !quoteLinked; page++) {
    const listRes = await fetch(`${base}/api/invoices?limit=50&page=${page}`, { headers });
    if (!listRes.ok) break;
    const listJson = await listRes.json();
    const rows = listJson.data?.invoices ?? listJson.data ?? [];
    for (const row of rows) {
      const detailRes = await fetch(`${base}/api/invoices/${row.id}`, { headers });
      if (!detailRes.ok) continue;
      const detailJson = await detailRes.json();
      const source = detailJson.data?.sourceQuotation;
      if (source?.quoteNumber) {
        quoteLinked = { row, detailJson, source };
        break;
      }
    }
  }

  if (!quoteLinked) {
    result.apiAuthorisation = 'SKIP (no quote-linked invoice)';
    result.pdfAuthorisation = 'SKIP (no quote-linked invoice)';
    result.billToLayout = 'SKIP (no quote-linked invoice)';
    return result;
  }

  const invNo = quoteLinked.row.invoice_number ?? quoteLinked.row.invoiceNumber;
  const hasApiAuthField = 'invoiceAuthorisedByName' in (quoteLinked.detailJson.data ?? {});
  const hasSourceRefField = 'reference' in (quoteLinked.source ?? {});
  result.apiAuthorisation = hasApiAuthField && hasSourceRefField ? 'PASS' : 'FAIL (pre-711d180 API shape)';
  result.sample = invNo;

  const pdfRes = await fetch(`${base}/api/documents/INVOICE/${quoteLinked.row.id}`, { headers });
  if (!pdfRes.ok) {
    result.pdfAuthorisation = `HTTP ${pdfRes.status}`;
    return result;
  }
  const pdfText = extractPdfText(Buffer.from(await pdfRes.arrayBuffer()));
  const hasAuthSection = pdfText.includes('AUTHORISATION') && pdfText.includes('INVOICE AUTHORISED BY');
  result.pdfAuthorisation = hasAuthSection ? 'PASS' : 'FAIL (missing Authorisation section)';

  const billStart = pdfText.indexOf('BILL TO');
  const itemsStart = pdfText.indexOf('ITEMS');
  if (billStart >= 0 && itemsStart > billStart) {
    const billTo = pdfText.slice(billStart, itemsStart);
    const hasReferenceLabel = billTo.includes('Reference');
    const custRes = await fetch(`${base}/api/customers/${quoteLinked.row.customer_id ?? quoteLinked.row.customerId}`, { headers }).catch(() => null);
    let customerName = null;
    if (custRes?.ok) {
      const cj = await custRes.json();
      customerName = cj.data?.name ?? cj.data?.customer?.name ?? null;
    }
    const nameInBillTo = customerName ? billTo.includes(customerName) : false;
    result.billToLayout = hasReferenceLabel && nameInBillTo
      ? 'PASS (name + Reference)'
      : hasReferenceLabel
        ? 'PARTIAL (Reference only — pre-711d180 layout)'
        : 'FAIL';
  }

  result.deployedFeature =
    result.apiAuthorisation === 'PASS' &&
    result.pdfAuthorisation === 'PASS' &&
    result.billToLayout.startsWith('PASS')
      ? 'YES'
      : 'NO';

  return result;
}

function lastDeploy() {
  const list = spawnSync(
    'gh',
    ['run', 'list', '--workflow=deploy-production.yml', '--limit', '5', '--json', 'headSha,conclusion,displayTitle,createdAt,status,url'],
    { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' },
  );
  if (list.status !== 0 || !list.stdout) return null;
  try {
    return JSON.parse(list.stdout);
  } catch {
    return null;
  }
}

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║  PRODUCTION — ALL TENANTS DEPLOY + FEATURE PROOF             ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

const originMain = spawnSync('git', ['rev-parse', '--short', 'origin/main'], { cwd: root, encoding: 'utf8' }).stdout.trim();
console.log(`Expected feature commit: ${EXPECT_COMMIT}`);
console.log(`origin/main:             ${originMain}\n`);

console.log('── GitHub Deploy ──');
const deployRuns = lastDeploy() ?? [];
const targetRun = deployRuns.find((r) => r.headSha?.startsWith(EXPECT_COMMIT)) ?? deployRuns[0];
if (targetRun) {
  console.log(`  Latest relevant run: ${targetRun.headSha?.slice(0, 7)} — ${targetRun.conclusion ?? targetRun.status}`);
  console.log(`  Title: ${targetRun.displayTitle}`);
  console.log(`  When:  ${targetRun.createdAt}`);
  if (targetRun.url) console.log(`  URL:   ${targetRun.url}`);
  assert(
    targetRun.headSha?.startsWith(EXPECT_COMMIT) && targetRun.conclusion === 'success',
    `Deploy ${EXPECT_COMMIT} succeeded`,
    targetRun.conclusion ?? targetRun.status,
  );
} else {
  bad('GitHub deploy runs', 'gh unavailable');
}

console.log('\n── Tenant registry ──');
const plat = await platformLogin();
let tenants = [];
if (plat.ok) {
  ok('Platform login', PLATFORM_BASE);
  try {
    tenants = await listAllTenants(plat.token);
    ok(`Active tenants discovered`, `count=${tenants.length}`);
  } catch (e) {
    bad('List tenants', e instanceof Error ? e.message : String(e));
  }
} else {
  bad('Platform login', `${plat.status} ${String(plat.body).slice(0, 80)}`);
  const fallback = (process.env.TENANT_SLUGS || 'henber,bliss-interior-ltd')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((slug) => ({ slug, status: 'ACTIVE' }));
  tenants = fallback;
  console.log(`  Using fallback slugs: ${fallback.map((t) => t.slug).join(', ')}`);
}

console.log('\n── Per-tenant probes ──');
const rows = [];
for (const tenant of tenants) {
  const slug = tenant.slug ?? tenant.name;
  process.stdout.write(`  Probing ${slug}... `);
  const row = await probeTenant(tenant);
  rows.push(row);
  const icon = row.deployedFeature === 'YES' ? '✅' : row.health === 'PASS' && row.login === 'PASS' ? '⚠️' : '❌';
  console.log(`${icon} health=${row.health} login=${row.login} feature=${row.deployedFeature}`);
}

console.log('\n┌─────────────────────────┬────────┬────────┬────────────────────┬──────────────────────────────┐');
console.log('│ Tenant                  │ Health │ Login  │ Feature live       │ Notes                        │');
console.log('├─────────────────────────┼────────┼────────┼────────────────────┼──────────────────────────────┤');
for (const r of rows) {
  const slug = r.slug.padEnd(23).slice(0, 23);
  const health = r.health.padEnd(6).slice(0, 6);
  const login = r.login.padEnd(6).slice(0, 6);
  const feat = r.deployedFeature.padEnd(18).slice(0, 18);
  const note = [r.apiAuthorisation, r.pdfAuthorisation, r.billToLayout, r.sample !== '—' ? r.sample : '']
    .filter(Boolean)
    .join(' | ')
    .padEnd(28)
    .slice(0, 28);
  console.log(`│ ${slug} │ ${health} │ ${login} │ ${feat} │ ${note} │`);
}
console.log('└─────────────────────────┴────────┴────────┴────────────────────┴──────────────────────────────┘');

const liveCount = rows.filter((r) => r.deployedFeature === 'YES').length;
const reachable = rows.filter((r) => r.health === 'PASS' && r.login === 'PASS').length;
console.log(`\nSummary: ${liveCount}/${rows.length} tenants have 711d180 feature markers live`);
console.log(`         ${reachable}/${rows.length} tenants reachable with test credentials`);

if (targetRun?.conclusion !== 'success') {
  bad('Production deploy', `commit ${EXPECT_COMMIT} is NOT live — last run ${targetRun?.conclusion ?? 'unknown'}`);
}

console.log('\n' + '═'.repeat(64));
console.log(`PROOF: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
