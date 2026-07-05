#!/usr/bin/env node
/**
 * Verify release evidence package is complete before final sign-off tag.
 *
 * Usage:
 *   node scripts/proof-release-evidence-check.mjs --commit <merge-sha> [--dir release-evidence/]
 *
 * Checks for required artifacts referenced in the release sign-off checklist.
 * Exit 0 when all present; exit 1 when gaps remain.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const commitIdx = args.indexOf('--commit');
const dirIdx = args.indexOf('--dir');
const commit = commitIdx >= 0 ? args[commitIdx + 1] : process.env.RELEASE_COMMIT || '';
const evidenceDir = dirIdx >= 0 ? path.resolve(args[dirIdx + 1]) : ROOT;

if (!commit) {
  console.error('Usage: node scripts/proof-release-evidence-check.mjs --commit <merge-sha> [--dir <evidence-folder>]');
  process.exit(2);
}

const short = commit.slice(0, 7);

/** @type {{ label: string; paths: string[]; optional?: boolean }[]} */
const required = [
  {
    label: 'Readiness lock (exact commit)',
    paths: [
      `deploy-locks/readiness-lock-${commit}.json`,
      'deploy-locks/readiness-lock-2026-07-05T08-21-38-569ZZ.json',
      ...fs.existsSync(path.join(ROOT, 'deploy-locks'))
        ? fs.readdirSync(path.join(ROOT, 'deploy-locks')).filter((f) => f.endsWith('.json'))
        : [],
    ].filter((p, i, arr) => typeof p === 'string' && arr.indexOf(p) === i),
  },
  { label: 'Henber AP decomposition report', paths: ['PROOF_AP_DRIFT_DECOMPOSE.md'] },
  { label: 'Henber AR decomposition report', paths: ['PROOF_AR_DRIFT_DECOMPOSE.md'] },
  {
    label: 'Production post-deploy smoke log',
    paths: ['release-evidence/post-deploy-smoke.log', 'PROOF_POST_DEPLOY_SMOKE.log'],
  },
  {
    label: 'Production deployment log',
    paths: ['release-evidence/deploy-workflow.log', 'PROOF_DEPLOYMENT.log'],
    optional: true,
  },
  {
    label: 'Warehouse deploy gate (production, if run)',
    paths: ['release-evidence/warehouse-deploy-gate.log', 'PROOF_WAREHOUSE_NETWORK_PHASES.md'],
    optional: true,
  },
  {
    label: 'Browser E2E (production, if run)',
    paths: ['release-evidence/browser-e2e.log', 'PROOF_BROWSER_WAREHOUSE_E2E.md'],
    optional: true,
  },
  {
    label: 'Release summary',
    paths: ['release-evidence/RELEASE_SUMMARY.md'],
    optional: true,
  },
];

function exists(rel) {
  return fs.existsSync(path.join(evidenceDir, rel));
}

function findReadinessLock() {
  const lockDir = path.join(evidenceDir, 'deploy-locks');
  if (!fs.existsSync(lockDir)) return null;
  for (const file of fs.readdirSync(lockDir).filter((f) => f.endsWith('.json'))) {
    try {
      const lock = JSON.parse(fs.readFileSync(path.join(lockDir, file), 'utf8'));
      if (lock.git?.commit === commit || lock.git?.commit?.startsWith(short)) {
        return path.join('deploy-locks', file);
      }
    } catch {
      // ignore parse errors
    }
  }
  return null;
}

let failed = 0;
console.log('\nRelease evidence package check');
console.log(`  Commit: ${commit}`);
console.log(`  Dir:    ${evidenceDir}\n`);

for (const item of required) {
  if (item.label.startsWith('Readiness lock')) {
    const lockPath = findReadinessLock();
    if (lockPath) {
      console.log(`  PASS  ${item.label} — ${lockPath}`);
    } else {
      console.error(`  FAIL  ${item.label} — no lock JSON matching commit ${commit}`);
      failed += 1;
    }
    continue;
  }

  const hit = item.paths.find((p) => exists(p));
  if (hit) {
    console.log(`  PASS  ${item.label} — ${hit}`);
  } else if (item.optional) {
    console.log(`  SKIP  ${item.label} — optional, not found`);
  } else {
    console.error(`  FAIL  ${item.label} — expected one of: ${item.paths.join(', ')}`);
    failed += 1;
  }
}

console.log('');
if (failed > 0) {
  console.error(`Evidence package INCOMPLETE (${failed} required item(s) missing)`);
  console.error('Archive merge SHA, readiness lock, Henber AP/AR reports, and post-deploy smoke before tagging.');
  process.exit(1);
}

console.log('Evidence package COMPLETE for required items');
process.exit(0);
