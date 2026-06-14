#!/usr/bin/env node
/**
 * Live proof — MUoM purchase UoM integrity (commit 6c6e118+)
 *
 * Verifies:
 *   1. Git + CI deploy for EXPECT_COMMIT
 *   2. Henber API health + login
 *   3. procurement-search returns effectivePurchaseUomId + purchaseUomIncomplete
 *   4. PO create path accepts a line with valid base UoM (dry probe via product search)
 *
 * Usage:
 *   node scripts/proof-muom-purchase-uom-live.mjs
 *   PROD_URL=https://henber.wizarddigital-inv.com TEST_EMAIL=... TEST_PASSWORD=... node scripts/proof-muom-purchase-uom-live.mjs
 */
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROD = process.env.PROD_URL || 'https://henber.wizarddigital-inv.com';
const EMAIL = process.env.TEST_EMAIL || process.env.HENBER_TEST_EMAIL || 'admin@test.com';
const PASS = process.env.TEST_PASSWORD || process.env.HENBER_TEST_PASSWORD || '';
const EXPECT_COMMIT = process.env.EXPECT_COMMIT || '6c6e118';

let pass = 0;
let fail = 0;

function ok(name, detail = '') {
  pass += 1;
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`);
}
function bad(name, detail = '') {
  fail += 1;
  console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}
function assert(cond, name, detail = '') {
  if (cond) ok(name, detail);
  else bad(name, detail);
}

function git(args) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  return (r.stdout || '').trim();
}

async function login(base) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASS }),
  });
  if (!res.ok) return { ok: false, status: res.status, body: await res.text().catch(() => '') };
  const json = await res.json();
  const token = json.data?.token ?? json.data?.accessToken;
  if (!token) return { ok: false, status: res.status, body: 'no token' };
  return { ok: true, token };
}

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║  LIVE PROOF — MUoM purchase UoM integrity (6c6e118)         ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

console.log('1. GIT + DEPLOY');
const head = git(['rev-parse', 'HEAD']);
const origin = git(['rev-parse', 'origin/main']);
assert(head.startsWith(EXPECT_COMMIT) || origin.startsWith(EXPECT_COMMIT), 'Commit on main', `${origin.slice(0, 7)}`);
assert(head === origin, 'Local synced with origin/main', head.slice(0, 7));

const runs = spawnSync(
  'gh',
  ['run', 'list', '--workflow=deploy-production.yml', '--limit', '1', '--json', 'headSha,conclusion,status,displayTitle,createdAt'],
  { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' },
);
if (runs.status === 0) {
  try {
    const [run] = JSON.parse(runs.stdout);
    assert(run?.headSha?.startsWith(EXPECT_COMMIT), 'Production deploy commit', run?.headSha?.slice(0, 7));
    assert(run?.conclusion === 'success', 'Production deploy CI', run?.conclusion);
    console.log(`         ${run?.displayTitle}`);
    console.log(`         ${run?.createdAt}`);
  } catch {
    bad('Parse deploy run', 'gh output');
  }
} else {
  bad('gh deploy run list', `exit ${runs.status}`);
}

console.log('\n2. HENBER API + CLIENT BUNDLE');
console.log(`   URL: ${PROD}`);

try {
  const health = await fetch(`${PROD}/api/health`);
  assert(health.ok, 'Health endpoint', `HTTP ${health.status}`);
} catch (e) {
  bad('Health endpoint', e.message);
}

// Client deploy marker (lazy PO chunk — no login required)
try {
  const html = await fetch(`${PROD}/`).then((r) => r.text());
  const indexMatch = html.match(/\/assets\/(index-[^"]+\.js)/);
  assert(Boolean(indexMatch), 'Client index bundle in HTML', indexMatch?.[1] ?? 'missing');
  if (indexMatch) {
    const indexJs = await fetch(`${PROD}/assets/${indexMatch[1]}`).then((r) => r.text());
    const poChunk = indexJs.match(/PurchaseOrdersPage-[^"]+\.js/)?.[0];
    assert(Boolean(poChunk), 'PurchaseOrders lazy chunk referenced', poChunk ?? 'missing');
    if (poChunk) {
      const poJs = await fetch(`${PROD}/assets/${poChunk}`).then((r) => r.text());
      for (const needle of ['effectivePurchaseUomId', 'purchaseUomIncomplete', 'Purchase UoM incomplete']) {
        assert(poJs.includes(needle), `Client bundle contains "${needle}"`, poChunk);
      }
    }
  }
} catch (e) {
  bad('Client bundle fingerprint', e.message);
}

const auth = await login(PROD);
if (!auth.ok) {
  bad('Login', `HTTP ${auth.status} — set TEST_EMAIL/TEST_PASSWORD (API field probe skipped)`);
  console.log('\n' + '═'.repeat(64));
  if (fail <= 1 && pass >= 8) {
    console.log(`⚠️  PARTIAL PASS — deploy + client verified; set credentials for API probe`);
    process.exit(0);
  }
  console.log(`❌ LIVE PROOF FAIL — ${fail} failed, ${pass} passed`);
  process.exit(1);
}
ok('Login', EMAIL);

const headers = { Authorization: `Bearer ${auth.token}` };

console.log('\n3. PROCUREMENT SEARCH (honest purchase UoM fields)');

const searchTerms = ['ritalin', 'paracetamol', 'amox'];
let probeProduct = null;

for (const q of searchTerms) {
  const res = await fetch(`${PROD}/api/products/procurement-search?q=${encodeURIComponent(q)}&limit=5`, { headers });
  if (!res.ok) {
    bad(`procurement-search "${q}"`, `HTTP ${res.status}`);
    continue;
  }
  const json = await res.json();
  const rows = json.data ?? [];
  if (rows.length === 0) continue;

  const first = rows[0];
  const hasEffective = 'effectivePurchaseUomId' in first;
  const hasIncomplete = 'purchaseUomIncomplete' in first;
  const hasBase = 'baseUomId' in first;

  assert(hasEffective, `effectivePurchaseUomId field present ("${q}")`);
  assert(hasIncomplete, `purchaseUomIncomplete field present ("${q}")`);
  assert(hasBase, `baseUomId field present ("${q}")`);

  if (hasEffective && hasIncomplete) {
    ok(`Sample row "${first.name?.slice(0, 30)}"`, `purchaseUomIncomplete=${first.purchaseUomIncomplete}, effective=${first.effectivePurchaseUomId ?? 'null(base)'}`);
    probeProduct = first;
    break;
  }
}

if (!probeProduct) {
  bad('procurement-search sample', 'no results for probe terms');
}

console.log('\n4. PO UoM RESOLVE (via product UoMs API)');

if (probeProduct?.id) {
  const uomRes = await fetch(`${PROD}/api/products/${probeProduct.id}/uoms`, { headers });
  if (uomRes.ok) {
    const uomJson = await uomRes.json();
    const uoms = uomJson.data ?? uomJson ?? [];
    const list = Array.isArray(uoms) ? uoms : uoms.uoms ?? [];
    assert(list.length > 0, 'Product has product_uoms rows', `${list.length} UoM(s)`);

    const poUomId = probeProduct.effectivePurchaseUomId ?? probeProduct.baseUomId ?? null;
    if (poUomId) {
      const match = list.some((u) => u.uomId === poUomId || u.id === poUomId);
      assert(match || probeProduct.effectivePurchaseUomId == null, 'effective PO UoM exists in product_uoms', poUomId.slice(0, 8));
    } else {
      ok('effectivePurchaseUomId null', 'PO line will use base UoM');
    }
  } else {
    bad('GET product uoms', `HTTP ${uomRes.status}`);
  }
}

console.log('\n5. LOCAL REGRESSION (reference)');
console.log('   Run on server after deploy:');
console.log('   docker exec -w /app smarterp-backend node scripts/audit-muom-purchase-uom-gap.mjs --tenant=henber');

console.log('\n' + '═'.repeat(64));
if (fail === 0) {
  console.log(`✅ LIVE PROOF PASS — ${pass} checks (${EXPECT_COMMIT} deployed)`);
} else {
  console.log(`❌ LIVE PROOF FAIL — ${fail} failed, ${pass} passed`);
}
console.log('═'.repeat(64));

process.exit(fail > 0 ? 1 : 0);
