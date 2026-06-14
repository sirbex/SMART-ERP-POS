#!/usr/bin/env node
/**
 * Full MUoM integrity proof matrix — run before commit.
 *
 * Usage:
 *   node scripts/proof-muom-integrity-matrix.mjs
 */
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function run(cmd, args, cwd = root) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', shell: process.platform === 'win32' });
  return { ok: r.status === 0, out: (r.stdout || '') + (r.stderr || ''), code: r.status ?? 1 };
}

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║  MUoM INTEGRITY PROOF MATRIX                                 ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

const sections = [];

// 1. Audit (after local repair — expect 0)
const audit = run('npm', ['run', 'audit:muom-purchase-uom-gap']);
sections.push({ name: 'Audit (local tenant)', ok: audit.ok, detail: audit.out.trim().split('\n').slice(-3).join(' | ') });

// 2. Resolve proof SKU 13 / 5551
const resolveProof = run('npm', ['run', 'proof:muom-purchase-uom']);
sections.push({ name: 'resolveCanonicalProductUom SKU 13/5551', ok: resolveProof.ok && /13 \(Box\): OK/.test(resolveProof.out) && /5551 \(PACKET\): OK/.test(resolveProof.out), detail: resolveProof.out.match(/13 \(Box\).*|\n5551 \(PACKET\).*/g)?.join(' ') ?? '' });

const testFiles = [
  'src/modules/products/productPurchaseUomIntegrity.test.ts',
  'src/modules/products/productService.procurement.test.ts',
  'src/modules/products/productService.muomIntegrity.test.ts',
  'src/modules/products/uomService.test.ts',
];
const tests = run('npm', ['test', '--', ...testFiles], resolve(root, 'SamplePOS.Server'));
const ourTestsOk =
  tests.ok &&
  testFiles.every((f) => tests.out.includes(`PASS ${f}`));
const passedMatch = /Tests:\s+(\d+) passed/.exec(tests.out);
sections.push({
  name: 'Unit tests (MUoM suite)',
  ok: ourTestsOk,
  detail: passedMatch ? `${passedMatch[1]} passed (4 MUoM suites)` : 'see jest output',
});

// 4. Build
const build = run('npm', ['run', 'build'], resolve(root, 'SamplePOS.Server'));
sections.push({ name: 'Server tsc build', ok: build.ok, detail: build.ok ? 'PASS' : 'FAIL' });

let fail = 0;
for (const s of sections) {
  console.log(`${s.ok ? '✅' : '❌'} ${s.name}`);
  if (s.detail) console.log(`   ${s.detail}`);
  if (!s.ok) fail += 1;
}

console.log('\n' + '═'.repeat(64));
if (fail === 0) {
  console.log('✅ MUoM INTEGRITY PROOF MATRIX — ALL PASS');
} else {
  console.log(`❌ ${fail} section(s) failed`);
}
console.log('═'.repeat(64));
process.exit(fail > 0 ? 1 : 0);
