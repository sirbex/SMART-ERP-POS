#!/usr/bin/env node
/**
 * FOH deploy gate — behavioral proofs + build integrity (no grep evidence).
 *
 * Usage:
 *   node scripts/proof-foh-keyboard-ownership-deploy.mjs
 *
 * Writes:
 *   PROOF_FOH_KEYBOARD_OWNERSHIP_DEPLOY.md
 *   PROOF_FOH_KEYBOARD_OWNERSHIP_DEPLOY.json
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const clientRoot = resolve(repoRoot, 'samplepos.client');
const serverRoot = resolve(repoRoot, 'SamplePOS.Server');
const OUT_MD = resolve(repoRoot, 'PROOF_FOH_KEYBOARD_OWNERSHIP_DEPLOY.md');
const OUT_JSON = resolve(repoRoot, 'PROOF_FOH_KEYBOARD_OWNERSHIP_DEPLOY.json');

const commit = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' })
  .stdout.trim();
const short = commit.slice(0, 12);

const gates = [];

function runGate(id, label, cmd, args, cwd) {
  const started = Date.now();
  const r = spawnSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  const ok = r.status === 0;
  const detail = ok
    ? `${Math.round((Date.now() - started) / 1000)}s`
    : `exit ${r.status}\n${((r.stdout || '') + (r.stderr || '')).slice(-1200)}`;
  gates.push({ id, label, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `\n${detail}`}`);
  return ok;
}

console.log(`\n=== FOH keyboard + ownership deploy proof (${short}) ===\n`);

let allOk = true;

allOk =
  runGate(
    'PROOF_SOFT_KEYBOARD',
    'Behavioral: soft keyboard proofs (22 tests)',
    'npm',
    ['run', 'proof:soft-keyboard'],
    clientRoot,
  ) && allOk;

allOk =
  runGate(
    'PROOF_CHECK_OWNERSHIP',
    'Behavioral: restaurant check ownership (5 tests)',
    'npm',
    ['run', 'proof:restaurant-check-ownership'],
    clientRoot,
  ) && allOk;

allOk =
  runGate(
    'CLIENT_VITE_BUILD',
    'Client production bundle (vite build — matches Dockerfile.deploy)',
    'npx',
    ['vite', 'build'],
    clientRoot,
  ) && allOk;

allOk =
  runGate(
    'SERVER_TSC',
    'Server TypeScript compile',
    'npm',
    ['run', 'build'],
    serverRoot,
  ) && allOk;

const report = {
  started: new Date().toISOString(),
  commit,
  short,
  verdict: allOk ? 'PASS' : 'FAIL',
  gates,
  proofArtifacts: [
    'PROOF_SEARCH_SOFT_KEYBOARD.md',
    'PROOF_NUMERIC_SOFT_KEYBOARD.md',
    'PROOF_LOGIN_SOFT_KEYBOARD.md',
    'PROOF_RESTAURANT_CHECK_OWNERSHIP.md',
  ],
  policy: 'Behavioral vitest proofs only — grep evidence not accepted.',
};

writeFileSync(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

const md = [
  '# PROOF: FOH keyboard + ownership deploy gate',
  '',
  `- Date: ${report.started}`,
  `- Commit: \`${commit}\` (${short})`,
  `- Runner: \`node scripts/proof-foh-keyboard-ownership-deploy.mjs\``,
  '',
  '## Policy',
  report.policy,
  '',
  '## Gates',
  ...gates.map((g) => `- ${g.ok ? 'PASS' : 'FAIL'} **${g.id}** — ${g.label}${g.detail && !g.ok ? `\n  \`\`\`\n${g.detail}\n  \`\`\`` : g.ok ? ` (${g.detail})` : ''}`),
  '',
  '## Child proof artifacts',
  ...report.proofArtifacts.map((p) => `- ${p}`),
  '',
  '## Verdict',
  allOk
    ? '**PASS** — all behavioral proofs and builds green; safe to deploy.'
    : '**FAIL** — fix failing gates before deploy.',
  '',
].join('\n');

writeFileSync(OUT_MD, md, 'utf8');

console.log(`\nWrote ${OUT_MD}`);
console.log(`Wrote ${OUT_JSON}`);
console.log(`\nVerdict: ${report.verdict}\n`);

process.exit(allOk ? 0 : 1);
