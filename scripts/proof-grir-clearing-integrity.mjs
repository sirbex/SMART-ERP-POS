#!/usr/bin/env node
/**
 * Enterprise proof — GR/IR Clearing integrity (evidence only, hard fail)
 *
 * Proves with tests + emitted artifacts (not theory):
 *   1) Server — multi-path SSOT, SQL CASE, F.13 algorithm, repository guards
 *   2) Client — shared domain SSOT, UI wiring, no inline drift
 *   3) F.13 — preview/run share selectF13Pairs
 *
 *   node scripts/proof-grir-clearing-integrity.mjs
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = path.join(root, 'SamplePOS.Server');
const client = path.join(root, 'samplepos.client');

const ARTIFACTS = [
  { file: 'PROOF_GRIR_CLEARING_INTEGRITY.json', label: 'server integrity' },
  { file: 'PROOF_GRIR_CLEARING_SSOT_CLIENT.json', label: 'client SSOT' },
  { file: 'PROOF_GRIR_F13_AUTO_MATCH.json', label: 'F.13 auto-match' },
];

let failed = 0;

function pass(msg) {
  console.log(`PASS ${msg}`);
}

function fail(msg) {
  console.error(`FAIL ${msg}`);
  failed++;
}

function runJest(testFiles, label) {
  console.log('\n' + '═'.repeat(60));
  console.log(` ${label}`);
  console.log('═'.repeat(60));

  const r = spawnSync(
    'node',
    [
      '--experimental-vm-modules',
      './node_modules/jest/bin/jest.js',
      ...testFiles,
      '--runInBand',
    ],
    { cwd: server, stdio: 'inherit', shell: false, env: process.env },
  );

  if (r.status !== 0) {
    fail(label);
    return false;
  }
  pass(label);
  return true;
}

function runVitest(testFile, label) {
  console.log('\n' + '═'.repeat(60));
  console.log(` ${label}`);
  console.log('═'.repeat(60));

  const r = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['vitest', 'run', testFile],
    {
      cwd: client,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: process.env,
    },
  );

  if (r.status !== 0) {
    fail(label);
    return false;
  }
  pass(label);
  return true;
}

function readArtifact(rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function assertArtifact(rel, label) {
  const data = readArtifact(rel);
  if (!data) {
    fail(`${label}: missing ${rel}`);
    return null;
  }
  const verdict = data.summary?.verdict ?? (data.passed === true ? 'PASS' : data.passed === false ? 'FAIL' : null);
  const passCount = data.summary?.pass ?? data.gates?.filter((g) => g.ok).length ?? 0;
  const total = data.summary?.total ?? data.gates?.length ?? 0;
  const failCount = data.summary?.fail ?? data.gates?.filter((g) => !g.ok).length ?? 0;

  if (verdict !== 'PASS' || failCount > 0) {
    fail(`${label}: verdict=${verdict ?? 'UNKNOWN'} (${passCount}/${total})`);
    return null;
  }
  pass(`${label}: ${passCount}/${total} gates — ${rel}`);
  return data;
}

console.log('ENTERPRISE PROOF: GRIR_CLEARING_INTEGRITY');
console.log('Working directory:', root);

runJest(
  [
    'src/modules/grir-clearing/grirClearingIntegrity.evidence.test.ts',
    'src/modules/grir-clearing/grirClearingRepository.test.ts',
    'src/modules/grir-clearing/grirClearingF13.evidence.test.ts',
  ],
  'proof — server GR/IR integrity + repository + F.13',
);

runVitest(
  'src/__tests__/grir-clearing-ssot.evidence.test.ts',
  'proof — client GR/IR SSOT + wiring',
);

console.log('\n' + '═'.repeat(60));
console.log(' proof — evidence artifacts');
console.log('═'.repeat(60));

const bundleParts = [];
for (const { file, label } of ARTIFACTS) {
  const data = assertArtifact(file, label);
  if (data) {
    bundleParts.push({
      file,
      feature: data.feature ?? data.proof ?? label,
      at: data.at ?? data.asOf ?? null,
      summary: data.summary ?? {
        pass: data.gates?.filter((g) => g.ok).length ?? 0,
        fail: data.gates?.filter((g) => !g.ok).length ?? 0,
        total: data.gates?.length ?? 0,
        verdict: data.passed ? 'PASS' : 'FAIL',
      },
    });
  }
}

const at = new Date().toISOString();
const bundleFail = bundleParts.some((p) => p.summary.verdict !== 'PASS') || bundleParts.length !== ARTIFACTS.length;
const bundlePass = bundleParts.reduce((n, p) => n + (p.summary.pass ?? 0), 0);
const bundleTotal = bundleParts.reduce((n, p) => n + (p.summary.total ?? 0), 0);

const bundle = {
  at,
  feature: 'GRIR_CLEARING_INTEGRITY_BUNDLE',
  purpose: 'Evidence-only acceptance — server SSOT + client SSOT + F.13 (no claims without gates)',
  summary: {
    pass: bundlePass,
    fail: bundleFail ? 1 : 0,
    total: bundleTotal,
    verdict: failed === 0 && !bundleFail && bundleParts.length === ARTIFACTS.length ? 'PASS' : 'FAIL',
    artifacts: bundleParts.length,
    artifactsExpected: ARTIFACTS.length,
  },
  parts: bundleParts,
};

const bundleMd = `# PROOF — GR/IR Clearing (evidence bundle)

**Generated:** ${at}  
**Verdict:** **${bundle.summary.verdict}** (${bundlePass}/${bundleTotal} gates across ${bundleParts.length} artifacts)

## Acceptance rule

Only evidence with emitted gate artifacts is accepted. Re-run:

\`\`\`bash
npm run proof:grir-clearing
\`\`\`

## Artifacts

| File | Feature | Gates | Verdict |
|------|---------|-------|---------|
${bundleParts
  .map(
    (p) =>
      `| \`${p.file}\` | ${p.feature} | ${p.summary.pass}/${p.summary.total} | ${p.summary.verdict} |`,
  )
  .join('\n')}
`;

fs.writeFileSync(path.join(root, 'PROOF_GRIR_CLEARING_INTEGRITY_BUNDLE.json'), JSON.stringify(bundle, null, 2));
fs.writeFileSync(path.join(root, 'PROOF_GRIR_CLEARING_INTEGRITY_BUNDLE.md'), bundleMd);

if (bundle.summary.verdict !== 'PASS') {
  fail('bundle verdict not PASS');
} else {
  pass(`bundle ${bundlePass}/${bundleTotal} gates`);
}

console.log('\n' + '═'.repeat(60));
if (failed > 0) {
  console.error(`proof-grir-clearing-integrity: ${failed} CHECK(S) FAILED`);
  process.exit(1);
}

console.log('proof-grir-clearing-integrity: ALL CHECKS PASSED');
console.log('');
console.log('Evidence artifacts:');
for (const { file } of ARTIFACTS) {
  console.log(`  • ${file}`);
}
console.log('  • PROOF_GRIR_CLEARING_INTEGRITY_BUNDLE.json');
