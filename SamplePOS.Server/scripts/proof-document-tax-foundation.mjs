#!/usr/bin/env node
/**
 * DocumentTax Production Certification — Gates A–E runner.
 *
 * Usage:
 *   npm run proof:document-tax-foundation
 *   npm run proof:document-tax-certification
 *   DATABASE_URL=... npm run proof:document-tax-foundation
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(serverRoot, '..');
const OUT =
  process.env.PROOF_OUT || resolve(repoRoot, 'PROOF_DOCUMENT_TAX_RUN.md');
const CERT_STRICT =
  process.env.DOCUMENT_TAX_CERTIFICATION_STRICT === '1' ||
  process.argv.includes('--strict');

let pass = 0;
let fail = 0;
let skip = 0;
const gateVerdict = {
  A: 'PENDING',
  B: 'PENDING',
  C: 'PENDING',
  D: 'PENDING',
  E: 'PENDING',
};

const lines = [
  '# DocumentTax — Production Certification Proof Run\n',
  `Run: ${new Date().toISOString()}\n`,
  `Mode: ${CERT_STRICT ? 'STRICT (certification)' : 'foundation'}\n`,
  `Charter: [PROOF_DOCUMENT_TAX_CHARTER.md](./PROOF_DOCUMENT_TAX_CHARTER.md)\n`,
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

function loadUrl() {
  for (const rel of ['.env', '.env.test', '.env.local']) {
    const p = resolve(serverRoot, rel);
    if (!existsSync(p)) continue;
    const m = readFileSync(p, 'utf8').match(/^DATABASE_URL=(.+)$/m);
    if (m) return m[1].replace(/^["']|["']$/g, '').trim();
  }
  return process.env.DATABASE_URL || process.env.TENANT_DATABASE_URL;
}

function run(cmd, args, cwd, extraEnv = {}) {
  const r = spawnSync(cmd, args, {
    cwd,
    stdio: 'pipe',
    shell: false,
    env: {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL || loadUrl() || '',
      ...extraEnv,
    },
    encoding: 'utf8',
  });
  return { code: r.status ?? 1, out: `${r.stdout || ''}${r.stderr || ''}` };
}

console.log('═'.repeat(60));
console.log(' proof-document-tax-foundation');
console.log(` mode: ${CERT_STRICT ? 'STRICT' : 'foundation'}`);
console.log('═'.repeat(60));

// ── Gate A ────────────────────────────────────────────────────
lines.push('\n## Gate A — Architecture (Jest evidence)\n');
const evidence = run(
  'node',
  [
    '--experimental-vm-modules',
    './node_modules/jest/bin/jest.js',
    '--testPathPatterns',
    'documentTax|taxOverride.evidence|saleItemsTaxPersistence|vatRemittanceSaleItems|invoiceSaleItemsTax|productTaxMappingsAdmin|customerTaxProfile.evidence',
    '--no-coverage',
  ],
  serverRoot,
);
assert(
  evidence.code === 0,
  'A-document-tax-evidence-matrix',
  evidence.code === 0 ? '101 tests class' : evidence.out.slice(-600),
);

const e2e = run(
  'node',
  [
    '--experimental-vm-modules',
    './node_modules/jest/bin/jest.js',
    'src/services/documentTaxPhases.e2e.evidence.test.ts',
    '--no-coverage',
  ],
  serverRoot,
);
assert(
  e2e.code === 0,
  'A-phases-e2e-evidence',
  e2e.code === 0 ? '24 executable pipeline cases' : e2e.out.slice(-400),
);

const priceMode = run(
  'node',
  [
    '--experimental-vm-modules',
    './node_modules/jest/bin/jest.js',
    'src/services/documentTaxPriceModeIntegrity.evidence.test.ts',
    '--no-coverage',
  ],
  serverRoot,
);
assert(
  priceMode.code === 0,
  'A-PM-price-mode-integrity',
  priceMode.code === 0
    ? 'exclusive/inclusive contract + SALE-2026-0179 seal'
    : priceMode.out.slice(-600),
);

const productVat = run(
  'node',
  [
    '--experimental-vm-modules',
    './node_modules/jest/bin/jest.js',
    'src/services/documentTaxProductVatUntick.evidence.test.ts',
    'src/services/documentTaxService.test.ts',
    '--no-coverage',
  ],
  serverRoot,
);
assert(
  productVat.code === 0,
  'A-PV-product-vat-untick-integrity',
  productVat.code === 0
    ? 'is_taxable=false beats mapping on retail computeForLines'
    : productVat.out.slice(-600),
);
gateVerdict.A = fail === 0 ? 'PASS' : 'FAIL';
const failAfterA = fail;

// ── Gate B/C live ─────────────────────────────────────────────
lines.push('\n## Gates B–C — Live PostgreSQL mutations\n');
const dbUrl = loadUrl();
if (!dbUrl) {
  if (CERT_STRICT) bad('B-database-url', 'DATABASE_URL required in --strict');
  else skipped('B-database-url', 'no DATABASE_URL');
  gateVerdict.B = CERT_STRICT ? 'FAIL' : 'SKIP';
  gateVerdict.C = gateVerdict.B;
} else {
  let reachable = false;
  try {
    const pool = new pg.Pool({ connectionString: dbUrl, max: 1 });
    await pool.query('SELECT 1');
    await pool.end();
    reachable = true;
    ok('B-database-reachable');
  } catch (e) {
    if (CERT_STRICT) bad('B-database-reachable', e instanceof Error ? e.message : String(e));
    else skipped('B-database-reachable', e instanceof Error ? e.message : String(e));
  }

  if (reachable) {
    const liveEnv = {
      PROOF_OUT: resolve(repoRoot, 'PROOF_DOCUMENT_TAX_LIVE_LANE.md'),
    };
    const tsxCli = resolve(serverRoot, 'node_modules/tsx/dist/cli.mjs');
    const live = existsSync(tsxCli)
      ? run(process.execPath, [tsxCli, 'scripts/proof-document-tax-live.ts'], serverRoot, liveEnv)
      : run(
          process.execPath,
          ['--import', 'tsx', 'scripts/proof-document-tax-live.ts'],
          serverRoot,
          liveEnv,
        );
    const livePass = live.code === 0;
    assert(livePass, 'B-C-live-mutation-cert', livePass ? 'live tsx exit 0' : live.out.slice(-800));
    gateVerdict.B = livePass ? 'PASS' : 'FAIL';
    gateVerdict.C = livePass ? 'PASS' : 'FAIL';
    lines.push('\n### Live lane stdout (tail)\n');
    lines.push('```');
    lines.push(live.out.slice(-2500) || '(empty)');
    lines.push('```\n');
  } else {
    gateVerdict.B = CERT_STRICT ? 'FAIL' : 'SKIP';
    gateVerdict.C = gateVerdict.B;
  }
}

// ── Gate D deferred ───────────────────────────────────────────
lines.push('\n## Gate D — Deferred lanes\n');
skipped('D-restaurant-http', 'use proof:order-complete-soak:live');
skipped('D-quotation-convert-http', 'use proof:quotation-invoice-pdf:live');
skipped('D-offline-replay', 'requires offline queue fixture');
skipped('D-phase-8b-multi-rate-gl', 'deferred by design');
skipped('D-perf-benchmark', 'p50/p95/p99 not yet instrumented');
gateVerdict.D = 'SKIP';

// ── Gate E governance ─────────────────────────────────────────
lines.push('\n## Gate E — Governance\n');
const ver = readFileSync(resolve(serverRoot, 'src/constants/schemaVersion.ts'), 'utf8');
assert(/CURRENT_SCHEMA_VERSION\s*=\s*58[4-9]/.test(ver), 'E-schema-version-584plus');
assert(
  existsSync(resolve(repoRoot, 'shared/sql/584_sale_items_tax_persistence.sql')),
  'E-migration-584-file',
);
gateVerdict.E =
  /CURRENT_SCHEMA_VERSION\s*=\s*58[4-9]/.test(ver) &&
  existsSync(resolve(repoRoot, 'shared/sql/584_sale_items_tax_persistence.sql'))
    ? 'PASS'
    : 'FAIL';

lines.push('\n## Gate verdicts\n');
for (const [g, v] of Object.entries(gateVerdict)) {
  lines.push(`- Gate ${g}: **${v}**`);
}
lines.push(`\nPASS: ${pass}  FAIL: ${fail}  SKIP: ${skip}\n`);

const certified =
  gateVerdict.A === 'PASS' &&
  gateVerdict.B === 'PASS' &&
  gateVerdict.C === 'PASS' &&
  gateVerdict.E === 'PASS' &&
  fail === 0;

if (CERT_STRICT) {
  lines.push(
    `\n**Verdict:** ${certified ? 'CERTIFIED' : 'NOT CERTIFIED'} (strict)\n`,
  );
} else {
  const foundationOk = gateVerdict.A === 'PASS' && gateVerdict.E === 'PASS';
  lines.push(
    `\n**Verdict:** ${
      foundationOk
        ? certified
          ? 'CERTIFIED (foundation + live)'
          : 'FOUNDATION PASS (live pending or partial)'
        : 'FOUNDATION FAIL'
    }\n`,
  );
}

writeFileSync(OUT, lines.join('\n') + '\n', 'utf8');
console.log('═'.repeat(60));
console.log(` wrote ${OUT}`);
console.log(` PASS=${pass} FAIL=${fail} SKIP=${skip}`);
console.log(
  ` Gates: A=${gateVerdict.A} B=${gateVerdict.B} C=${gateVerdict.C} D=${gateVerdict.D} E=${gateVerdict.E}`,
);
console.log('═'.repeat(60));

if (CERT_STRICT) process.exit(certified ? 0 : 1);
process.exit(gateVerdict.A === 'PASS' && gateVerdict.E === 'PASS' && fail === 0 ? 0 : fail > 0 ? 1 : 0);
