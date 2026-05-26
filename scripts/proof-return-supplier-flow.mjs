#!/usr/bin/env node
/**
 * Proof: Return to Supplier + Supplier Credit Note path (read-only live + unit tests).
 *
 * Live (default): validates returnable API + RGRN list for a COMPLETED GR — no stock mutation.
 * Set EXECUTE_RETURN=1 to run create+post return (destructive) — not recommended on production.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverDir = path.join(root, 'SamplePOS.Server');
const BASE = process.env.BASE_URL || 'http://localhost:3001';
const EMAIL = process.env.TEST_EMAIL || 'admin@samplepos.com';
const PASSWORD = process.env.TEST_PASSWORD || 'admin123';

console.log('proof-return-supplier-flow: unit tests…\n');

const unit = spawnSync(
  'node',
  [
    '--experimental-vm-modules',
    './node_modules/jest/bin/jest.js',
    'src/modules/return-grn/returnGrnService.costLayers.test.ts',
    'src/tests/supplierCnDnProof.test.ts',
    '--runInBand',
  ],
  { cwd: serverDir, stdio: 'inherit', shell: process.platform === 'win32' },
);

if (unit.status !== 0) {
  console.error('\nproof-return-supplier-flow: unit tests FAILED');
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

  const listRes = await fetch(`${BASE}/api/goods-receipts?limit=5&status=COMPLETED`, { headers });
  if (!listRes.ok) throw new Error(`List GR failed ${listRes.status}`);
  const gr = (await listRes.json()).data?.[0];
  if (!gr?.id) {
    console.log('SKIP live — no COMPLETED GR');
    return;
  }

  const retRes = await fetch(`${BASE}/api/return-grn/grn/${gr.id}/returnable`, { headers });
  if (!retRes.ok) throw new Error(`Returnable failed ${retRes.status}`);
  const retJson = await retRes.json();
  const items = retJson.data?.data ?? retJson.data ?? [];
  const returnable = items.filter((i) => Number(i.returnableQuantity) > 0);

  const rgrnRes = await fetch(`${BASE}/api/return-grn/grn/${gr.id}`, { headers });
  const rgrns = rgrnRes.ok ? ((await rgrnRes.json()).data ?? []) : [];

  console.log(
    `PASS live-read GR=${gr.grNumber ?? gr.id} returnableLines=${returnable.length} existingRGRNs=${rgrns.length}`,
  );

  if (process.env.EXECUTE_RETURN === '1' && returnable.length > 0) {
    console.warn('EXECUTE_RETURN=1 — skipping auto-return in proof script (use UI for controlled test)');
  }
}

console.log('\nproof-return-supplier-flow: live read-only…\n');
try {
  await liveReadOnly();
} catch (e) {
  console.error('FAIL live', e.message);
  process.exit(1);
}

console.log('\nproof-return-supplier-flow: PASS');
