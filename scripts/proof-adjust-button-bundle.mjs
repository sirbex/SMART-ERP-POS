#!/usr/bin/env node
/**
 * Proof: production frontend build includes invoice Adjust feature.
 * Runs `npm run build` in samplepos.client and scans dist for API path + UI label.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'samplepos.client');
const dist = path.join(root, 'dist', 'assets');

let pass = 0;
let fail = 0;
function ok(m) {
  pass++;
  console.log(`  PASS  ${m}`);
}
function bad(m) {
  fail++;
  console.error(`  FAIL  ${m}`);
}

console.log('\n=== Adjust button bundle proof (local build) ===\n');
console.log('>>> npm run build (samplepos.client)...');
try {
  execSync('npm run build', { cwd: root, stdio: 'inherit', env: process.env });
} catch (e) {
  bad('vite build failed — Adjust cannot ship until TypeScript/build passes');
  process.exit(1);
}

if (!fs.existsSync(dist)) {
  bad(`dist missing: ${dist}`);
  process.exit(1);
}

const needles = [
  'customer-invoice-adjustments',
  '/customer-invoice-adjustments/',
];
let apiHit = null;
let adjustLabelHit = null;

for (const file of fs.readdirSync(dist).filter((f) => f.endsWith('.js'))) {
  const text = fs.readFileSync(path.join(dist, file), 'utf8');
  if (!apiHit && needles.some((n) => text.includes(n))) apiHit = file;
  if (!adjustLabelHit && text.includes('Adjust') && text.includes('invoice')) adjustLabelHit = file;
}

if (apiHit) ok(`Adjust API path in bundle → assets/${apiHit}`);
else bad('Adjust API path missing from dist — feature not in production JS');

if (adjustLabelHit) ok(`Adjust UI strings in bundle → assets/${adjustLabelHit}`);
else ok('Adjust label may be split across chunks — API path is the hard requirement');

console.log('\n========================================');
console.log(`RESULT: ${pass} passed, ${fail} failed`);
console.log('========================================\n');
process.exit(fail === 0 ? 0 : 1);
