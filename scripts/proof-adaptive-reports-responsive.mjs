#!/usr/bin/env node
/**
 * Adaptive reports responsive integrity — SSOT + consumer consistency pack.
 *
 * Usage (repo root):
 *   npm run proof:adaptive-reports-responsive
 *   node scripts/proof-adaptive-reports-responsive.mjs
 *
 * Runs:
 *   - adaptive-reports-responsive.evidence.test.ts (writes PROOF_*)
 *   - adaptive-phase4.evidence.test.ts
 *   - adaptive-pwa-phase6-accounting.evidence.test.ts
 *   - report-back-link.evidence.test.ts
 *   - reports-ui-ssot-brand.evidence.test.ts
 *
 * Writes pack summary:
 *   PROOF_ADAPTIVE_REPORTS_RESPONSIVE_PACK.json / .md
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const client = resolve(root, 'samplepos.client');
const runAt = new Date().toISOString();

const suites = [
  'src/__tests__/adaptive-reports-responsive.evidence.test.ts',
  'src/__tests__/adaptive-dashboard-kpi-density.evidence.test.ts',
  'src/__tests__/adaptive-phase4.evidence.test.ts',
  'src/__tests__/adaptive-pwa-phase6-accounting.evidence.test.ts',
  'src/__tests__/report-back-link.evidence.test.ts',
  'src/__tests__/reports-ui-ssot-brand.evidence.test.ts',
];

function runVitest(files) {
  const r = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['vitest', 'run', ...files],
    { cwd: client, encoding: 'utf8', shell: true, env: process.env },
  );
  return {
    ok: r.status === 0,
    status: r.status ?? 1,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
  };
}

const result = runVitest(suites);
const evidencePath = resolve(root, 'PROOF_ADAPTIVE_REPORTS_RESPONSIVE.json');
const evidence = existsSync(evidencePath)
  ? JSON.parse(readFileSync(evidencePath, 'utf8'))
  : null;

const pack = {
  proof: 'ADAPTIVE_REPORTS_RESPONSIVE_PACK',
  verdict: result.ok && evidence?.verdict === 'PASS' ? 'PASS' : 'FAIL',
  generatedAt: runAt,
  vitest: {
    ok: result.ok,
    status: result.status,
    suites,
  },
  evidence: evidence
    ? {
        verdict: evidence.verdict,
        passed: evidence.passed,
        total: evidence.total,
        integrity: evidence.integrity,
      }
    : null,
  guarantee:
    'If PASS: adaptiveReports SSOT + AdaptiveReportShell/Filters + hub/P&L consumers are consistent — primary filters and report body stay visible on small screens; no brand/UA forks; pack suites green.',
};

const md = `# PROOF — Adaptive reports responsive integrity pack

**Generated:** ${runAt}
**Verdict:** **${pack.verdict}**

## Guarantee

${pack.guarantee}

## Vitest pack

| Suite | Role |
|-------|------|
| adaptive-reports-responsive | SSOT + consumer consistency matrix |
| adaptive-phase4 | Phase 4 columns/modes + print contract |
| adaptive-pwa-phase6-accounting | Accounting/report Adaptive floorplans |
| report-back-link | ReportBackLink + AdaptivePage slot |
| reports-ui-ssot-brand | Reports UI brand/SSOT gates |

Vitest exit: **${result.ok ? '0' : result.status}**

## Evidence artifact

${
  evidence
    ? `\`PROOF_ADAPTIVE_REPORTS_RESPONSIVE\` — **${evidence.verdict}** (${evidence.passed}/${evidence.total})`
    : '_missing — evidence suite did not write artifact_'
}

## Reproduce

\`\`\`bash
npm run proof:adaptive-reports-responsive
\`\`\`
`;

writeFileSync(resolve(root, 'PROOF_ADAPTIVE_REPORTS_RESPONSIVE_PACK.json'), `${JSON.stringify(pack, null, 2)}\n`);
writeFileSync(resolve(root, 'PROOF_ADAPTIVE_REPORTS_RESPONSIVE_PACK.md'), md);

if (!result.ok) {
  console.error(result.stdout);
  console.error(result.stderr);
  process.exit(result.status || 1);
}

console.log(JSON.stringify({ verdict: pack.verdict, evidence: pack.evidence }, null, 2));
process.exit(0);
