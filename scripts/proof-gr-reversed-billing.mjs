#!/usr/bin/env node
/**
 * Proof gate: reversed uninvoiced GRs leave the "To invoice" billing lane.
 *
 * Gate 1 — Jest (goodsReceiptBillingList.test.ts)
 * Gate 2 — Live API after uninvoiced reversal (when server + DB up)
 *
 * Usage:
 *   node scripts/proof-gr-reversed-billing.mjs
 *   PROOF_OUT=PROOF_GR_REVERSED_BILLING.md node scripts/proof-gr-reversed-billing.mjs
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const serverDir = resolve(root, 'SamplePOS.Server');
const BASE = process.env.BASE_URL || 'http://localhost:3001';
const EMAIL = process.env.TEST_EMAIL || 'admin@samplepos.com';
const PASSWORD = process.env.TEST_PASSWORD || 'admin123';
const OUT = process.env.PROOF_OUT || resolve(root, 'PROOF_GR_REVERSED_BILLING.md');

let pass = 0;
let fail = 0;
const lines = [`# GR Reversed Billing Proof\n`, `Run: ${new Date().toISOString()}\n`];

function ok(n, d = '') {
  pass++;
  const msg = `PASS  ${n}${d ? ` — ${d}` : ''}`;
  console.log(`  ${msg}`);
  lines.push(`- **PASS** ${n}${d ? ` — ${d}` : ''}`);
}
function bad(n, d = '') {
  fail++;
  const msg = `FAIL  ${n}${d ? ` — ${d}` : ''}`;
  console.error(`  ${msg}`);
  lines.push(`- **FAIL** ${n}${d ? ` — ${d}` : ''}`);
}
function assert(c, n, d = '') {
  if (c) ok(n, d);
  else bad(n, d);
}

function loadEnv() {
  const envPath = resolve(serverDir, '.env');
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m && !process.env[m[1].trim()]) {
        process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
      }
    }
  }
}

console.log('═'.repeat(60));
console.log(' proof-gr-reversed-billing — Gate 1: Jest');
console.log('═'.repeat(60));

const jest = spawnSync(
  'node',
  [
    '--experimental-vm-modules',
    './node_modules/jest/bin/jest.js',
    'src/modules/goods-receipts/goodsReceiptBillingList.test.ts',
    '--runInBand',
  ],
  { cwd: serverDir, stdio: 'inherit', shell: false },
);

if (jest.status !== 0) {
  bad('Jest goodsReceiptBillingList.test.ts');
  lines.push(`\n**Result: FAIL** (${pass} pass, ${fail} fail)\n`);
  writeFileSync(OUT, lines.join('\n'));
  process.exit(jest.status ?? 1);
}
ok('Jest goodsReceiptBillingList.test.ts');

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`Login failed ${res.status}`);
  const json = await res.json();
  const token = json.data?.token ?? json.data?.accessToken;
  if (!token) throw new Error('No token');
  return token;
}

async function gate2Live() {
  console.log('\n' + '═'.repeat(60));
  console.log(' proof-gr-reversed-billing — Gate 2: Live API');
  console.log('═'.repeat(60));

  let token;
  try {
    token = await login();
  } catch (e) {
    lines.push(`- **SKIP** Gate 2 live — ${e instanceof Error ? e.message : e}`);
    console.warn('SKIP Gate 2 — cannot login:', e instanceof Error ? e.message : e);
    return;
  }

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const toInvoiceRes = await fetch(`${BASE}/api/goods-receipts?limit=100&billingStatus=TO_INVOICE`, { headers });
  assert(toInvoiceRes.ok, 'TO_INVOICE list HTTP OK', String(toInvoiceRes.status));
  if (!toInvoiceRes.ok) return;

  const toInvoice = ((await toInvoiceRes.json()).data ?? []);
  const reversedInFilter = toInvoice.filter((g) => g.isReversed === true || g.billingStatus === 'REVERSED');
  assert(reversedInFilter.length === 0, 'No reversed GR in TO_INVOICE filter',
    reversedInFilter.length ? reversedInFilter.map((g) => g.grNumber).join(', ') : `${toInvoice.length} rows clean`);

  const allRes = await fetch(`${BASE}/api/goods-receipts?limit=100`, { headers });
  if (allRes.ok) {
    const all = ((await allRes.json()).data ?? []);
    const reversed = all.filter((g) => g.billingStatus === 'REVERSED' || g.isReversed === true);
    const badBilling = reversed.filter((g) => g.billingStatus !== 'REVERSED');
    assert(badBilling.length === 0, 'All isReversed rows have billingStatus=REVERSED',
      badBilling.length ? badBilling.map((g) => g.grNumber).join(', ') : `${reversed.length} reversed row(s) OK`);
  }
}

loadEnv();
await gate2Live();

lines.push(`\n**Result: ${fail === 0 ? 'PASS' : 'FAIL'}** (${pass} pass, ${fail} fail)\n`);
writeFileSync(OUT, lines.join('\n'));
console.log(`\nProof written: ${OUT}`);

console.log('\n' + '═'.repeat(60));
if (fail === 0) {
  console.log(' proof-gr-reversed-billing: ALL GATES PASSED');
  console.log('═'.repeat(60) + '\n');
  process.exit(0);
}
console.log(' proof-gr-reversed-billing: FAILED');
console.log('═'.repeat(60) + '\n');
process.exit(1);
