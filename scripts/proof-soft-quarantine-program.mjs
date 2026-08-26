#!/usr/bin/env node
/**
 * Master integrity proof — Soft quarantine program P0–P4.
 *
 * Usage:
 *   npm run proof:soft-quarantine-program
 *   npm run proof:soft-quarantine-program -- --strict
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STRICT = process.argv.includes('--strict');

const gates = [];

function gate(id, ok, detail) {
  gates.push({ id, ok, detail });
}

function read(rel) {
  return readFileSync(path.join(ROOT, rel), 'utf8');
}

function run(cmd, args, cwd = ROOT) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', shell: process.platform === 'win32' });
  return { ok: r.status === 0, stdout: r.stdout || '', stderr: r.stderr || '', status: r.status };
}

// ── Static phase contracts ─────────────────────────────────────────────
const doc = read('docs/architecture/LOSS_QUARANTINE_SOFT_QUARANTINE.md');
gate('P0_DOC', doc.includes('LQ13') && doc.includes('Mode adapter'), 'P0 policy + mode adapter documented');

const softSvc = read('SamplePOS.Server/src/modules/loss-quarantine/softQuarantineService.ts');
const agingSvc = read('SamplePOS.Server/src/modules/loss-quarantine/quarantineAgingService.ts');
const disposeSvc = read('SamplePOS.Server/src/modules/loss-quarantine/lossDisposalService.ts');
const registry = read('SamplePOS.Server/src/modules/loss-quarantine/lossQuarantineTouchpointRegistry.ts');

gate(
  'P1_SOFT',
  softSvc.includes('applySoftQuarantine') &&
    softSvc.includes('postsGl: false') &&
    agingSvc.includes('getSoftQuarantineAging') &&
    disposeSvc.includes('disposeSoftQuarantine'),
  'P1 soft quarantine + aging + dispose parity',
);

const inventorySvc = read('SamplePOS.Server/src/modules/inventory/inventoryService.ts');
gate(
  'DAMAGE_FLOW',
  inventorySvc.includes('singleStoreQuarantineFromAdjustment') &&
    inventorySvc.includes("params.reason === 'DAMAGE'") &&
    inventorySvc.includes('applySoftQuarantine') &&
    agingSvc.includes("= 'QUARANTINED'"),
  'single-store DAMAGE → soft quarantine; aging maps QUARANTINED → DAMAGE band',
);

const expirySvc = read('SamplePOS.Server/src/modules/inventory/warehouse/expiryAutomationService.ts');
gate(
  'P2_AUTO',
  expirySvc.includes('processSoftExpiredLots') &&
    expirySvc.includes('isExpiryAutomationEnabled') &&
    expirySvc.includes('runScheduledExpiryAutomation'),
  'P2 unified expiry automation (flag default off)',
);

const routes = read('SamplePOS.Server/src/modules/loss-quarantine/lossQuarantineRoutes.ts');
const reportsPage = read('samplepos.client/src/pages/ReportsPage.tsx');
gate(
  'P3_BRIDGE',
  softSvc.includes('quarantineFromExpiringReport') &&
    routes.includes('/from-expiring-report') &&
    reportsPage.includes('quarantineFromExpiringReport'),
  'P3 Expiring Items → quarantine bridge',
);

const autoDispose = read('SamplePOS.Server/src/modules/loss-quarantine/quarantineAutoDisposeService.ts');
const sql608 = read('shared/sql/608_quarantine_auto_dispose.sql');
gate(
  'P4_DISPOSE',
  autoDispose.includes('disposeFromQuarantine') &&
    sql608.includes('quarantine_auto_dispose_enabled BOOLEAN NOT NULL DEFAULT false') &&
    autoDispose.includes('QUARANTINE_AUTO_DISPOSE_BUCKET'),
  'P4 auto-dispose separate flag, EXPIRED only, dispose gateway',
);

const jobQueue = read('SamplePOS.Server/src/services/jobQueue.ts');
const calcJobs = read('SamplePOS.Server/src/services/calculationsScheduledJobs.ts');
gate(
  'JOBS_DISPATCH',
  jobQueue.includes('registerCalculationsHandler') &&
    jobQueue.includes('startCalculationsProcessor') &&
    calcJobs.includes('initCalculationsScheduledJobs') &&
    !calcJobs.includes('processQueue('),
  'Unified calculations dispatcher (no competing Bull processors)',
);

gate(
  'LQ13',
  registry.includes("id: 'LQ13'") && registry.includes('P4'),
  'LQ13 touchpoint covers P1–P4',
);

// ── Executed proofs ────────────────────────────────────────────────────
const fitness = run('npm', ['run', 'ci:loss-quarantine-fitness', ...(STRICT ? ['--', '--strict'] : [])]);
gate('FITNESS', fitness.ok, fitness.ok ? 'ci:loss-quarantine-fitness PASS' : `fitness failed: ${fitness.stderr.slice(0, 200)}`);

const vitest = run('npx', [
  'vitest',
  'run',
  'src/__tests__/soft-quarantine-p1.evidence.test.ts',
  'src/__tests__/soft-quarantine-p2.evidence.test.ts',
  'src/__tests__/soft-quarantine-p3.evidence.test.ts',
  'src/__tests__/soft-quarantine-p4.evidence.test.ts',
  'src/__tests__/expiring-items-ssot.evidence.test.ts',
  'src/__tests__/quarantine-damage-visibility.evidence.test.ts',
  'src/__tests__/quarantine-lifecycle-e2e.evidence.test.ts',
], path.join(ROOT, 'samplepos.client'));
gate('VITEST_EVIDENCE', vitest.ok, vitest.ok ? 'P1–P4 + lifecycle E2E vitest PASS' : `vitest failed (exit ${vitest.status})`);

const tscServer = run('npx', ['tsc', '--noEmit'], path.join(ROOT, 'SamplePOS.Server'));
gate('TSC_SERVER', tscServer.ok, tscServer.ok ? 'Server TypeScript compile PASS' : `tsc failed: ${tscServer.stdout.slice(0, 300)}`);

const archProof = run(
  'node',
  ['--experimental-vm-modules', './node_modules/jest/bin/jest.js', 'src/modules/loss-quarantine/lossQuarantineArchitectureProof.test.ts', '--forceExit'],
  path.join(ROOT, 'SamplePOS.Server'),
);
gate(
  'LQ_ARCH',
  archProof.ok,
  archProof.ok ? 'lossQuarantineArchitectureProof (Gate A) PASS' : `architecture proof failed (exit ${archProof.status})`,
);

// ── Proof artifacts must exist and be PASS ───────────────────────────────
for (const phase of ['P1', 'P2', 'P3', 'P4']) {
  const jsonPath = path.join(ROOT, `PROOF_SOFT_QUARANTINE_${phase}.json`);
  let verdict = 'MISSING';
  if (existsSync(jsonPath)) {
    try {
      verdict = JSON.parse(readFileSync(jsonPath, 'utf8')).summary?.verdict ?? 'UNKNOWN';
    } catch {
      verdict = 'PARSE_ERROR';
    }
  }
  gate(`ARTIFACT_${phase}`, verdict === 'PASS', `PROOF_SOFT_QUARANTINE_${phase} = ${verdict}`);
}

const damageJson = path.join(ROOT, 'PROOF_QUARANTINE_DAMAGE_VISIBILITY.json');
let damageVerdict = 'MISSING';
if (existsSync(damageJson)) {
  try {
    damageVerdict = JSON.parse(readFileSync(damageJson, 'utf8')).summary?.verdict ?? 'UNKNOWN';
  } catch {
    damageVerdict = 'PARSE_ERROR';
  }
}
gate('ARTIFACT_DAMAGE', damageVerdict === 'PASS', `PROOF_QUARANTINE_DAMAGE_VISIBILITY = ${damageVerdict}`);

const lifecycleJson = path.join(ROOT, 'PROOF_QUARANTINE_LIFECYCLE_E2E.json');
let lifecycleVerdict = 'MISSING';
if (existsSync(lifecycleJson)) {
  try {
    lifecycleVerdict = JSON.parse(readFileSync(lifecycleJson, 'utf8')).summary?.verdict ?? 'UNKNOWN';
  } catch {
    lifecycleVerdict = 'PARSE_ERROR';
  }
}
gate('ARTIFACT_LIFECYCLE', lifecycleVerdict === 'PASS', `PROOF_QUARANTINE_LIFECYCLE_E2E = ${lifecycleVerdict}`);

const failed = gates.filter((g) => !g.ok);
const evidence = {
  feature: 'SOFT_QUARANTINE_PROGRAM',
  provenAt: new Date().toISOString(),
  strict: STRICT,
  contract:
    'P0–P4 soft quarantine program: mode adapter, expiry automation, Expiring Items bridge, auto-dispose; unified job dispatch; LQ fitness + architecture proof',
  gates,
  summary: {
    total: gates.length,
    passed: gates.filter((g) => g.ok).length,
    failed: failed.length,
    verdict: failed.length === 0 ? 'PASS' : 'FAIL',
  },
};

writeFileSync(path.join(ROOT, 'PROOF_SOFT_QUARANTINE_PROGRAM.json'), JSON.stringify(evidence, null, 2));
writeFileSync(
  path.join(ROOT, 'PROOF_SOFT_QUARANTINE_PROGRAM.md'),
  [
    '# PROOF — Soft quarantine program (P0–P4 master)',
    '',
    `**Verdict:** ${evidence.summary.verdict}`,
    `**Proven at:** ${evidence.provenAt}`,
    `**Strict:** ${STRICT}`,
    '',
    `**Contract:** ${evidence.contract}`,
    '',
    ...gates.map((g) => `- ${g.ok ? 'PASS' : 'FAIL'} \`${g.id}\`: ${g.detail}`),
    '',
    '```bash',
    'npm run proof:soft-quarantine-program',
    'npm run proof:soft-quarantine-program -- --strict',
    '```',
    '',
  ].join('\n'),
);

console.log('═'.repeat(60));
console.log(' proof:soft-quarantine-program');
console.log(` verdict: ${evidence.summary.verdict}`);
console.log(` passed: ${evidence.summary.passed}/${evidence.summary.total}`);
console.log('═'.repeat(60));
for (const g of gates) {
  console.log(`${g.ok ? '✓' : '✗'} ${g.id}: ${g.detail}`);
}

process.exit(failed.length === 0 ? 0 : 1);
