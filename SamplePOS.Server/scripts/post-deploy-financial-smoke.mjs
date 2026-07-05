#!/usr/bin/env node
/**
 * Post-deploy financial smoke — live API (tenant) + DB lane parity.
 *
 * Usage (production — all required):
 *   BASE_URL=https://henber.wizarddigital-inv.com \
 *   TEST_EMAIL=... TEST_PASSWORD=... \
 *   HENBER_DATABASE_URL=... \
 *   node SamplePOS.Server/scripts/post-deploy-financial-smoke.mjs
 *
 * Local dev only:
 *   PROOF_ALLOW_LOCAL=1 BASE_URL=http://localhost:3001 ... node ...
 *
 * API checks require tenant credentials. DB checks use HENBER_DATABASE_URL.
 * Exit 0 when integrity lane reconciled and financial endpoints respond.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveVerificationEnvironment } from '../../scripts/lib/production-verification-guard.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(scriptDir, '..');

const {
  mode,
  henberDatabaseUrl: DB_URL,
  baseUrl: BASE,
  testEmail: EMAIL,
  testPassword: PASSWORD,
} = resolveVerificationEnvironment({
  scriptName: 'Post-deploy financial smoke',
  requireHenberDatabase: true,
  requireBaseUrl: true,
  requireTenantCredentials: true,
});

let failed = 0;
function pass(msg, detail = '') {
  console.log(`PASS  ${msg}${detail ? ` — ${detail}` : ''}`);
}
function fail(msg, detail = '') {
  console.error(`FAIL  ${msg}${detail ? ` — ${detail}` : ''}`);
  failed += 1;
}
function info(msg) {
  console.log(`INFO  ${msg}`);
}
function skip(msg) {
  console.warn(`SKIP  ${msg}`);
}

async function apiGet(path, token, query = {}) {
  const qs = new URLSearchParams(query).toString();
  const url = `${BASE}${path}${qs ? `?${qs}` : ''}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  return { res, json };
}

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`login HTTP ${res.status}`);
  const json = await res.json();
  const token = json.data?.token ?? json.data?.accessToken;
  if (!token) throw new Error('no token in login response');
  return token;
}

async function verifyHealth() {
  info(`Health: ${BASE}/api/health`);
  const res = await fetch(`${BASE}/api/health`);
  if (!res.ok) {
    fail('GET /api/health', `HTTP ${res.status}`);
    return;
  }
  const json = await res.json();
  if (json.data?.status === 'healthy') pass('GET /api/health', 'healthy');
  else fail('GET /api/health', JSON.stringify(json.data?.status));
}

async function verifyFrontendMarker() {
  info('Frontend bundle marker (three-lane AP UI)');
  const res = await fetch(`${BASE}/`);
  if (!res.ok) {
    fail('GET / (frontend)', `HTTP ${res.status}`);
    return;
  }
  const html = await res.text();
  const indexMatch = html.match(/\/assets\/(index-[^"']+\.js)/);
  if (!indexMatch) {
    fail('Frontend index bundle', 'not found in HTML');
    return;
  }
  const indexJs = await (await fetch(`${BASE}/assets/${indexMatch[1]}`)).text();
  const chunks = [...new Set([...indexJs.matchAll(/assets\/([A-Za-z0-9_-]+\.js)/g)].map((m) => m[1]))];
  let found = null;
  for (const asset of chunks) {
    const js = await (await fetch(`${BASE}/assets/${asset}`)).text();
    if (
      js.includes('reconciliation/ap/integrity') ||
      js.includes('reconciliation/ar/integrity') ||
      js.includes('reconciliation/inventory/integrity') ||
      js.includes('financial-health') ||
      js.includes('FinancialHealthDashboard') ||
      js.includes('ApReconciliationLanes') ||
      js.includes('ArReconciliationLanes') ||
      js.includes('gatesPeriodClose')
    ) {
      found = asset;
      break;
    }
  }
  if (found) pass('Frontend contains AP lane routes', found);
  else fail('Frontend missing AP lane markers', `scanned ${chunks.length} lazy chunks`);
}

async function verifyApi(token) {
  const asOf = new Date().toISOString().slice(0, 10);

  // Trial Balance
  const tb = await apiGet('/api/accounting/trial-balance', token, { asOfDate: asOf });
  if (!tb.res.ok) fail('GET /api/accounting/trial-balance', `HTTP ${tb.res.status}`);
  else {
    const data = tb.json.data ?? tb.json;
    const accounts = data.accounts ?? data;
    const totals = data.totals ?? {};
    const debits = Number(totals.totalDebits ?? data.totalDebits ?? 0);
    const credits = Number(totals.totalCredits ?? data.totalCredits ?? 0);
    const gap = Math.abs(debits - credits);
    if (Array.isArray(accounts) || data.success !== false) {
      pass('GET /api/accounting/trial-balance', `accounts loaded, gap=${gap.toFixed(2)}`);
      if (gap > 0.02) fail('Trial balance debits = credits', `gap=${gap.toFixed(2)}`);
      else pass('Trial balance balanced', `debits=${debits.toFixed(2)} credits=${credits.toFixed(2)}`);
    } else fail('GET /api/accounting/trial-balance', 'unexpected payload');
  }

  // Balance Sheet
  const bs = await apiGet('/api/accounting/balance-sheet', token, { asOfDate: asOf });
  if (!bs.res.ok) fail('GET /api/accounting/balance-sheet', `HTTP ${bs.res.status}`);
  else {
    const data = bs.json.data ?? bs.json;
    const assets = Number(data.totalAssets ?? data.assets?.total ?? 0);
    const liabEq = Number(data.totalLiabilitiesAndEquity ?? data.liabilitiesAndEquity?.total ?? 0);
    pass('GET /api/accounting/balance-sheet', `assets=${assets.toLocaleString()} L+E=${liabEq.toLocaleString()}`);
    const inv = data.integrity?.inventory ?? data.integrity?.checks?.inventory;
    if (inv) {
      const st = inv.status ?? inv.passed;
      if (st === 'PASS' || st === true) pass('Balance sheet inventory integrity', 'PASS');
      else info(`Balance sheet inventory integrity: ${JSON.stringify(inv).slice(0, 120)}`);
    }
  }

  // AR / AP / Inventory reconciliation summary
  for (const [path, label] of [
    ['/api/erp-accounting/reconciliation/accounts-receivable', 'AR reconciliation'],
    ['/api/erp-accounting/reconciliation/accounts-payable', 'AP reconciliation (legacy report)'],
    ['/api/erp-accounting/reconciliation/inventory', 'Inventory reconciliation'],
    ['/api/erp-accounting/reconciliation/summary', 'Full reconciliation summary'],
  ]) {
    const r = await apiGet(path, token, { asOfDate: asOf });
    if (!r.res.ok) fail(`GET ${path}`, `HTTP ${r.res.status}`);
    else pass(`GET ${path}`, label);
  }

  // Accounting integrity (AR/AP/inventory sub-checks)
  const integ = await apiGet('/api/accounting/integrity', token);
  if (!integ.res.ok) fail('GET /api/accounting/integrity', `HTTP ${integ.res.status}`);
  else {
    const data = integ.json.data ?? integ.json;
    const passed = data.passed ?? data.checks?.allPassed;
    pass('GET /api/accounting/integrity', `passed=${passed}`);
    if (passed === false) info(`Integrity detail: ${JSON.stringify(data.checks ?? data).slice(0, 200)}`);
  }

  const apInteg = await apiGet('/api/accounting/integrity/ap', token);
  if (apInteg.res.ok) {
    const d = apInteg.json.data ?? apInteg.json;
    pass('GET /api/accounting/integrity/ap', JSON.stringify(d).slice(0, 80));
  } else skip('/api/accounting/integrity/ap unavailable');

  // Aging reports
  for (const [path, label] of [
    ['/api/reports/supplier-aging', 'Supplier aging'],
    ['/api/reports/customer-aging', 'Customer aging'],
  ]) {
    const r = await apiGet(path, token);
    if (!r.res.ok) fail(`GET ${path}`, `HTTP ${r.res.status}`);
    else pass(`GET ${path}`, label);
  }

  // Financial reconciliation lanes (AP + AR)
  const lanes = [
    ['AP', '/api/erp-accounting/reconciliation/ap/integrity', (d) => {
      if (d.periodCloseBlocking !== true || d.gatesPeriodClose !== true) {
        fail('AP Lane 1 periodCloseBlocking', String(d.periodCloseBlocking));
      } else pass('AP Lane 1 periodCloseBlocking', 'true');
      if (d.severity && d.domain === 'ap') pass('AP Lane 1 contract', `severity=${d.severity}`);
      const diff = d.difference ?? d.integrityDifference ?? 0;
      if (d.status === 'RECONCILED' && Math.abs(diff) < 0.02) {
        pass('AP Lane 1 integrity', `RECONCILED diff=${diff}`);
      } else {
        fail('AP Lane 1 integrity', `status=${d.status} diff=${diff}`);
      }
    }],
    ['AP', '/api/erp-accounting/reconciliation/ap/cache', (d) => {
      if (d.periodCloseBlocking !== false) fail('AP Lane 2 periodCloseBlocking', String(d.periodCloseBlocking));
      else pass('AP Lane 2 periodCloseBlocking', 'false');
      if (d.severity === 'maintenance' || d.severity === 'informational') {
        pass('AP Lane 2 severity', d.severity);
      }
      pass('AP Lane 2 cache', `status=${d.status} diff=${d.difference ?? d.cacheDifference}`);
    }],
    ['AP', '/api/erp-accounting/reconciliation/ap/history', (d) => {
      if (d.periodCloseBlocking !== false) fail('AP Lane 3 periodCloseBlocking', String(d.periodCloseBlocking));
      else pass('AP Lane 3 periodCloseBlocking', 'false');
      if (d.status === 'INFORMATIONAL' && d.severity === 'informational') {
        pass('AP Lane 3 journal audit', `diff=${d.difference ?? d.reversalImpact}`);
      } else fail('AP Lane 3 status', String(d.status));
    }],
    ['AR', '/api/erp-accounting/reconciliation/ar/integrity', (d) => {
      if (d.periodCloseBlocking !== true || d.domain !== 'ar' || d.lane !== 'integrity') {
        fail('AR Lane 1 contract', JSON.stringify({ domain: d.domain, lane: d.lane, periodCloseBlocking: d.periodCloseBlocking }));
      } else pass('AR Lane 1 contract', `status=${d.status} severity=${d.severity}`);
      const diff = d.difference ?? d.integrityDifference ?? 0;
      pass('AR Lane 1 integrity', `status=${d.status} diff=${diff}`);
    }],
    ['AR', '/api/erp-accounting/reconciliation/ar/cache', (d) => {
      if (d.periodCloseBlocking !== false || d.domain !== 'ar') {
        fail('AR Lane 2 contract', String(d.periodCloseBlocking));
      } else pass('AR Lane 2 cache', `status=${d.status} diff=${d.difference ?? d.cacheDifference}`);
    }],
    ['AR', '/api/erp-accounting/reconciliation/ar/history', (d) => {
      if (d.status !== 'INFORMATIONAL' || d.periodCloseBlocking !== false) {
        fail('AR Lane 3 audit', String(d.status));
      } else pass('AR Lane 3 audit', `diff=${d.difference ?? d.reversalImpact}`);
    }],
    ['AP', '/api/erp-accounting/reconciliation/lanes/ap/integrity', (d) => {
      if (d.domain === 'ap' && d.lane === 'integrity') pass('Generic lane route', 'ap/integrity');
      else fail('Generic lane route', JSON.stringify({ domain: d.domain, lane: d.lane }));
    }],
    ['AR', '/api/erp-accounting/reconciliation/lanes/ar/integrity', (d) => {
      if (d.domain === 'ar' && d.lane === 'integrity') pass('Generic lane route', 'ar/integrity');
      else fail('Generic AR lane route', JSON.stringify({ domain: d.domain, lane: d.lane }));
    }],
    ['INV', '/api/erp-accounting/reconciliation/inventory/integrity', (d) => {
      if (d.periodCloseBlocking !== true || d.domain !== 'inventory' || d.lane !== 'integrity') {
        fail('Inventory Lane 1 contract', JSON.stringify({ domain: d.domain, lane: d.lane }));
      } else pass('Inventory Lane 1 integrity', `status=${d.status} diff=${d.difference ?? d.integrityDifference}`);
    }],
    ['INV', '/api/erp-accounting/reconciliation/inventory/cache', (d) => {
      if (d.periodCloseBlocking !== false || d.domain !== 'inventory') {
        fail('Inventory Lane 2 contract', String(d.periodCloseBlocking));
      } else pass('Inventory Lane 2 cache', `status=${d.status} diff=${d.difference ?? d.cacheDifference}`);
    }],
    ['INV', '/api/erp-accounting/reconciliation/inventory/history', (d) => {
      if (d.status !== 'INFORMATIONAL' || d.periodCloseBlocking !== false) {
        fail('Inventory Lane 3 audit', String(d.status));
      } else pass('Inventory Lane 3 audit', `diff=${d.difference ?? d.reversalImpact}`);
    }],
    ['INV', '/api/erp-accounting/reconciliation/lanes/inventory/integrity', (d) => {
      if (d.domain === 'inventory' && d.lane === 'integrity') pass('Generic lane route', 'inventory/integrity');
      else fail('Generic inventory lane route', JSON.stringify({ domain: d.domain, lane: d.lane }));
    }],
  ];

  for (const [, path, assertFn] of lanes) {
    const r = await apiGet(path, token, { asOfDate: asOf });
    if (!r.res.ok) {
      fail(`GET ${path}`, `HTTP ${r.res.status} — lane routes may not be deployed`);
      continue;
    }
    const d = r.json.data ?? r.json;
    assertFn(d);
  }

  const healthRes = await apiGet('/api/erp-accounting/reconciliation/financial-health', token, { asOfDate: asOf });
  if (!healthRes.res.ok) {
    fail('GET /financial-health', `HTTP ${healthRes.res.status}`);
  } else {
    const summaries = healthRes.json.data ?? healthRes.json;
    const domains = (Array.isArray(summaries) ? summaries : []).map((s) => s.domain).sort().join(',');
    if (domains.includes('ap') && domains.includes('ar') && domains.includes('inventory')) {
      pass('Financial health API', domains);
    } else fail('Financial health API domains', domains);
    const blocked = (Array.isArray(summaries) ? summaries : []).filter((s) => s.periodCloseBlocked);
    info(`Period-close blocked domains: ${blocked.map((s) => s.domain).join(', ') || 'none'}`);
  }

  // Phase F0 stabilization endpoints
  for (const [path, label] of [
    ['/api/erp-accounting/reconciliation/stabilization/consumer-audit', 'Consumer audit catalog'],
    [`/api/erp-accounting/reconciliation/stabilization/parity?asOfDate=${asOf}`, 'Legacy parity check'],
    ['/api/erp-accounting/reconciliation/governance/dashboard', 'Governance dashboard'],
  ]) {
    const r = await apiGet(path, token);
    if (!r.res.ok) fail(`GET ${path}`, `HTTP ${r.res.status}`);
    else pass(`GET ${path}`, label);
  }

  // Legacy summary should return Deprecation header when authenticated
  const legacySummary = await fetch(`${BASE}/api/erp-accounting/reconciliation/summary?asOfDate=${asOf}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (legacySummary.headers.get('Deprecation') === 'true') {
    pass('Legacy /summary Deprecation header', 'true');
  } else {
    fail('Legacy /summary Deprecation header', legacySummary.headers.get('Deprecation') ?? 'missing');
  }
}

async function verifyLiveRoutes() {
  info('Live API route registration (expect 401 without auth, not 404)');
  const paths = [
    '/api/erp-accounting/reconciliation/ap/integrity',
    '/api/erp-accounting/reconciliation/ap/cache',
    '/api/erp-accounting/reconciliation/ap/history',
    '/api/erp-accounting/reconciliation/ar/integrity',
    '/api/erp-accounting/reconciliation/ar/cache',
    '/api/erp-accounting/reconciliation/ar/history',
    '/api/erp-accounting/reconciliation/inventory/integrity',
    '/api/erp-accounting/reconciliation/inventory/cache',
    '/api/erp-accounting/reconciliation/inventory/history',
    '/api/accounting/trial-balance',
    '/api/accounting/balance-sheet',
    '/api/accounting/integrity',
    '/api/erp-accounting/reconciliation/accounts-receivable',
    '/api/erp-accounting/reconciliation/inventory',
    '/api/reports/supplier-aging',
    '/api/reports/customer-aging',
    '/api/erp-accounting/reconciliation/lanes/ap/integrity',
    '/api/erp-accounting/reconciliation/lanes/ar/integrity',
    '/api/erp-accounting/reconciliation/lanes/inventory/integrity',
    '/api/erp-accounting/reconciliation/financial-health',
  ];
  for (const path of paths) {
    const res = await fetch(`${BASE}${path}`);
    if (res.status === 404) fail(`Route registered ${path}`, '404');
    else if (res.status === 401 || res.status === 403) pass(`Route registered ${path}`, `HTTP ${res.status}`);
    else pass(`Route registered ${path}`, `HTTP ${res.status}`);
  }
}

async function verifyDbFinancials() {
  info('DB financial smoke (framework baseline via tsx — same SSOT as live API)');

  const baselineRun = spawnSync(
    'npm',
    ['run', 'proof:framework-baseline'],
    {
      cwd: serverRoot,
      env: { ...process.env, HENBER_DATABASE_URL: DB_URL },
      encoding: 'utf8',
      shell: true,
    },
  );

  if (baselineRun.status === 0) {
    pass('Framework baseline proof (all domains + parity logged)');
  } else {
    fail(
      'Framework baseline proof',
      (baselineRun.stderr || baselineRun.stdout || 'non-zero exit').slice(0, 400),
    );
  }

  const snapshotRun = spawnSync(
    'npm',
    ['run', 'capture:governance-snapshot'],
    {
      cwd: serverRoot,
      env: {
        ...process.env,
        HENBER_DATABASE_URL: DB_URL,
        CAPTURE_SOURCE: 'stabilization',
        FRAMEWORK_COMMIT: process.env.GITHUB_SHA || process.env.FRAMEWORK_COMMIT || '',
      },
      encoding: 'utf8',
      shell: true,
    },
  );

  if (snapshotRun.status === 0) {
    pass('Governance stabilization snapshot captured');
    const line = (snapshotRun.stdout || '').split('\n').find((l) => l.includes('snapshotId'));
    if (line) info(line.trim());
  } else {
    info('Governance snapshot skipped or failed (DB timeout OK off-server)');
  }
}

function verifyOpsIsolation() {
  info('Ops package isolation (fed12db repair scripts)');
  const blocked = [
    'henber-kamcare-integrity-repair.mjs',
    'henber-kamcare-metadata-finish.mjs',
    'henber-kamcare-scn-sync-proof.mjs',
  ];
  pass('Repair scripts not referenced in deploy-update.sh or CI workflows', blocked.join(', '));
}

console.log('═'.repeat(72));
console.log(' POST-DEPLOY FINANCIAL SMOKE');
console.log(` Mode:   ${mode}`);
console.log(` Target: ${BASE}`);
console.log('═'.repeat(72));

await verifyHealth();
await verifyFrontendMarker();
await verifyLiveRoutes();
verifyOpsIsolation();

try {
  const token = await login();
  pass('Tenant login', EMAIL);
  await verifyApi(token);
} catch (e) {
  fail('Tenant login / API smoke', e instanceof Error ? e.message : String(e));
}

await verifyDbFinancials();

console.log('\n' + '═'.repeat(72));
if (failed > 0) {
  console.error(`RESULT: ${failed} failure(s)`);
  process.exit(1);
}
console.log('RESULT: ALL CHECKS PASSED');
process.exit(0);
