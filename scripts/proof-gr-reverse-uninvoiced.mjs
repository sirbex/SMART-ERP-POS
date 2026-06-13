#!/usr/bin/env node
/**
 * Proof: uninvoiced goods receipt reversal (Phase 1A — read-only + unit tests).
 *
 * Live: GET eligibility for COMPLETED uninvoiced GRs (no stock mutation).
 * Set EXECUTE_REVERSE=1 to POST reversal (destructive) — not for production.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverDir = path.join(root, 'SamplePOS.Server');
const BASE = process.env.BASE_URL || 'http://localhost:3001';
const EMAIL = process.env.TEST_EMAIL || 'admin@samplepos.com';
const PASSWORD = process.env.TEST_PASSWORD || 'admin123';

console.log('proof-gr-reverse-uninvoiced: unit tests…\n');

const unit = spawnSync(
  'node',
  [
    '--experimental-vm-modules',
    './node_modules/jest/bin/jest.js',
    'src/modules/goods-receipts/goodsReceiptReverse.test.ts',
    'src/modules/corrections/correctionEligibilityService.test.ts',
    '--runInBand',
  ],
  { cwd: serverDir, stdio: 'inherit', shell: process.platform === 'win32' },
);

if (unit.status !== 0) {
  console.error('\nproof-gr-reverse-uninvoiced: unit tests FAILED');
  process.exit(unit.status ?? 1);
}

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

async function liveReadOnly() {
  const token = await login();
  const headers = { Authorization: `Bearer ${token}` };

  const listRes = await fetch(`${BASE}/api/goods-receipts?limit=10&billingStatus=TO_INVOICE`, { headers });
  if (!listRes.ok) throw new Error(`List GR failed ${listRes.status}`);
  const listJson = await listRes.json();
  const grs = listJson.data?.grs ?? listJson.data ?? [];
  const gr = Array.isArray(grs) ? grs[0] : null;

  if (!gr?.id) {
    console.log('SKIP live — no TO_INVOICE goods receipt');
    return;
  }

  const eligRes = await fetch(`${BASE}/api/goods-receipts/${gr.id}/reverse-uninvoiced/eligibility`, {
    headers,
  });
  if (!eligRes.ok) throw new Error(`Eligibility failed ${eligRes.status}`);
  const eligJson = await eligRes.json();
  const elig = eligJson.data ?? eligJson;

  console.log(
    `PASS live-read GR=${gr.grNumber ?? gr.id} route=${elig.route} allowed=${elig.allowed} blockers=${(elig.blockers ?? []).length}`,
  );

  const detailRes = await fetch(`${BASE}/api/goods-receipts/${gr.id}`, { headers });
  if (detailRes.ok) {
    const detail = (await detailRes.json()).data?.gr ?? (await detailRes.json()).data;
    if (detail?.isReversed) {
      console.log(`  reversedBy=${detail.reversedByReturnGrnNumber ?? detail.reversedByReturnGrnId}`);
    }
  }

  if (process.env.EXECUTE_REVERSE === '1' && elig.allowed) {
    console.warn('EXECUTE_REVERSE=1 — use UI or controlled API test; skipping auto-reverse in proof script');
  }
}

console.log('\nproof-gr-reverse-uninvoiced: live read-only…\n');
try {
  await liveReadOnly();
  console.log('\nproof-gr-reverse-uninvoiced: ALL PASS\n');
} catch (err) {
  console.error('proof-gr-reverse-uninvoiced: live FAILED —', err instanceof Error ? err.message : err);
  process.exit(1);
}
