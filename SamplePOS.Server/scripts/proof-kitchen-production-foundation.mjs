#!/usr/bin/env node
/**
 * Kitchen Production — Foundation / Certification proof (Gates A + Live integrity).
 *
 * Usage:
 *   npm run proof:kitchen-production-foundation
 *   npm run proof:kitchen-production-certification   # --strict: live DB required
 *   DATABASE_URL=... npm run proof:kitchen-production-live
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(serverRoot, '..');
const OUT =
  process.env.PROOF_OUT || resolve(repoRoot, 'PROOF_KITCHEN_PRODUCTION_FOUNDATION_RUN.md');
const STRICT =
  process.env.KITCHEN_PRODUCTION_CERTIFICATION_STRICT === '1' ||
  process.argv.includes('--strict');

let pass = 0;
let fail = 0;
let skip = 0;
const lines = [
  '# Kitchen Production — Foundation / Certification Proof\n',
  `Run: ${new Date().toISOString()}\n`,
  `Mode: ${STRICT ? 'STRICT (live required)' : 'foundation'}\n`,
  `ADR: [docs/architecture/KITCHEN_PRODUCTION_ADR.md](./docs/architecture/KITCHEN_PRODUCTION_ADR.md)\n`,
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

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, {
    cwd,
    stdio: 'pipe',
    shell: process.platform === 'win32',
    env: process.env,
  });
  return { code: r.status ?? 1, out: `${r.stdout || ''}${r.stderr || ''}` };
}

function loadUrl() {
  for (const rel of ['.env', '.env.test', '.env.local']) {
    const p = resolve(serverRoot, rel);
    if (!existsSync(p)) continue;
    const m = readFileSync(p, 'utf8').match(/^DATABASE_URL=(.+)$/m);
    if (m) return m[1].replace(/^["']|["']$/g, '').trim();
  }
  return process.env.DATABASE_URL || process.env.TENANT_DATABASE_URL || null;
}

console.log('═'.repeat(60));
console.log(' proof-kitchen-production-foundation');
console.log(` mode: ${STRICT ? 'STRICT' : 'foundation'}`);
console.log('═'.repeat(60));

// ── Gate A: architecture + pure ───────────────────────────────
lines.push('\n## Gate A — Architecture & pure helpers\n');
const jest = run(
  'node',
  [
    '--experimental-vm-modules',
    './node_modules/jest/bin/jest.js',
    'src/modules/kitchen-production/',
    '--no-coverage',
  ],
  serverRoot,
);
assert(
  jest.code === 0,
  'Jest kitchen-production suite (architecture + pure + Phase 1–6 proofs)',
  jest.code === 0 ? '' : jest.out.slice(-800),
);

// Artifact presence
const artifacts = [
  'shared/sql/587_kitchen_production_phase1.sql',
  'shared/sql/588_kitchen_prepared_food_catalog.sql',
  'shared/sql/589_kitchen_buffet_sessions.sql',
  'shared/sql/590_kitchen_waste_yield.sql',
  'docs/architecture/KITCHEN_PRODUCTION_ADR.md',
  'docs/architecture/KITCHEN_PRODUCTION_PHASE5_ROADMAP.md',
  'docs/architecture/KITCHEN_PRODUCTION_PHASE6_ROADMAP.md',
  'samplepos.client/src/pages/kitchen/KitchenAnalyticsPage.tsx',
  'samplepos.client/src/pages/kitchen/KitchenHubPage.tsx',
  'SamplePOS.Server/scripts/proof-kitchen-production-live.ts',
];
for (const rel of artifacts) {
  assert(existsSync(resolve(repoRoot, rel)), `artifact ${rel}`);
}

// ── Gate B: LIVE integrity ────────────────────────────────────
lines.push('\n## Gate B — Live integrity path\n');
const url = loadUrl();
if (!url) {
  if (STRICT) {
    bad('live-DATABASE_URL', 'required in --strict mode');
  } else {
    skipped('live-DATABASE_URL', 'no DATABASE_URL — run proof:kitchen-production-live with DB');
  }
} else {
  const live = run(
    'npx',
    ['tsx', 'scripts/proof-kitchen-production-live.ts'],
    serverRoot,
  );
  assert(
    live.code === 0,
    'proof-kitchen-production-live (produce → buffet → sale → waste → analytics)',
    live.code === 0 ? '' : live.out.slice(-1200),
  );
  // Fold live markdown into foundation output pointer
  const liveOut = resolve(repoRoot, 'PROOF_KITCHEN_PRODUCTION_RUN.md');
  if (existsSync(liveOut)) {
    lines.push(`\nSee also [PROOF_KITCHEN_PRODUCTION_RUN.md](./PROOF_KITCHEN_PRODUCTION_RUN.md)\n`);
    ok('live-report-written', liveOut);
  }
}

lines.push('\n---\n');
const verdict = fail === 0 ? (STRICT ? 'CERTIFIED' : 'FOUNDATION PASS') : 'FAILED';
lines.push(`**Result:** ${verdict} — ${pass} pass, ${fail} fail, ${skip} skip\n`);
writeFileSync(OUT, lines.join('\n'), 'utf8');

console.log('═'.repeat(60));
console.log(` ${verdict}  ${pass} pass / ${fail} fail / ${skip} skip`);
console.log(` Written: ${OUT}`);
console.log('═'.repeat(60));
process.exit(fail === 0 ? 0 : 1);
