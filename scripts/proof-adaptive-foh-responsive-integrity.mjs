#!/usr/bin/env node
/**
 * Adaptive FOH responsive integrity proof — any screen, any OS, SSOT CTAs.
 *
 * Usage (repo root):
 *   node scripts/proof-adaptive-foh-responsive-integrity.mjs
 *
 * Writes:
 *   PROOF_ADAPTIVE_FOH_RESPONSIVE_INTEGRITY.json
 *   PROOF_ADAPTIVE_FOH_RESPONSIVE_INTEGRITY.md
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runAt = new Date().toISOString();

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    shell: false,
    env: process.env,
  });
  return {
    ok: r.status === 0,
    status: r.status,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
  };
}

function parseVitestCounts(text) {
  const failedPass = text.match(
    /Tests\s+(\d+)\s+failed\s*\|\s*(\d+)\s+passed\s+\((\d+)\)/,
  );
  if (failedPass) {
    return {
      fail: Number(failedPass[1]),
      pass: Number(failedPass[2]),
      total: Number(failedPass[3]),
    };
  }
  const only = text.match(/Tests\s+(\d+)\s+passed\s+\((\d+)\)/);
  if (only) {
    return { fail: 0, pass: Number(only[1]), total: Number(only[2]) };
  }
  return { fail: 1, pass: 0, total: 0 };
}

const suites = [
  'src/lib/adaptiveFohResponsiveIntegrity.proof.test.ts',
  'src/__tests__/adaptive-chrome.ssot.evidence.test.ts',
  'src/lib/restaurantMultiTicketIntegrity.proof.test.ts',
];

const client = run(
  process.execPath,
  [
    resolve(root, 'samplepos.client/node_modules/vitest/vitest.mjs'),
    'run',
    ...suites,
    '--reporter=default',
  ],
  resolve(root, 'samplepos.client'),
);

const counts = parseVitestCounts(`${client.stdout}\n${client.stderr}`);
const overallOk = client.ok && counts.fail === 0 && counts.pass > 0;

const viewportMatrix = [
  { classId: 'phone-portrait', w: 390, h: 844, pane: 'sheet', labels: 'short' },
  { classId: 'phone-landscape-short', w: 844, h: 390, pane: 'sheet', labels: 'short' },
  { classId: 'pos-pad-compact', w: 800, h: 1280, pane: 'sheet', labels: 'short' },
  { classId: 'laptop-10in-1280x800', w: 1280, h: 800, pane: 'column', labels: 'short' },
  { classId: 'laptop-1366x768', w: 1366, h: 768, pane: 'column', labels: 'short' },
  { classId: 'desk-1440x900', w: 1440, h: 900, pane: 'column', labels: 'verbose' },
  { classId: 'wide-1920x1080', w: 1920, h: 1080, pane: 'column', labels: 'verbose' },
  { classId: 'wide-short-half-window', w: 1800, h: 800, pane: 'column', labels: 'short' },
];

const proof = {
  proof: 'ADAPTIVE_FOH_RESPONSIVE_INTEGRITY',
  objective:
    'OS-agnostic adaptive chrome SSOT: any CSS viewport → deterministic density, ticket pane, and dynamic CTA labels; FOH minmax ticket column never crushes KOT/Bill/Pay',
  runAt,
  result: overallOk ? 'PASS' : 'FAIL',
  policy: {
    inputs: ['widthPx', 'heightPx', 'touchFirst'],
    forbiddenInputs: ['navigator.userAgent', 'navigator.platform', 'process.platform', 'device brand'],
    ssot: 'samplepos.client/src/lib/adaptiveChrome.ts',
    consumers: [
      'RestaurantPosPage.tsx',
      'AdaptiveAppShell.tsx',
      'POSPage.tsx',
      'layoutTiers.buildLayoutCapabilities',
    ],
  },
  viewportMatrix,
  summary: {
    client: counts,
    pass: counts.pass,
    fail: counts.fail,
    total: counts.total,
  },
  gates: [
    {
      id: 'R01_VIEWPORT_MATRIX',
      ok: overallOk,
      detail: '8 viewport classes: sheet on pads/phones; column on desk/laptop incl. dense 10"',
    },
    {
      id: 'D01_DYNAMIC_PAY_LABELS',
      ok: overallOk,
      detail: 'resolvePayButtonLabel / resolveActionLabel from chrome.actionLabels only',
    },
    {
      id: 'D02_LAPTOP_PACKING',
      ok: overallOk,
      detail: 'isLaptopShortViewport + isNarrowDesktopViewport densify without phone sheet',
    },
    {
      id: 'D03_TYPE_SCALE',
      ok: overallOk,
      detail: 'resolveTypeScale(density) SSOT; shell stamps --type-*; FOH uses type-body/amount/cta',
    },
    {
      id: 'S01_CROSS_OS_IDENTITY',
      ok: overallOk,
      detail: 'identical CSS geometry → identical chrome (Win/macOS/Linux)',
    },
    {
      id: 'S02_NO_UA_FORK',
      ok: overallOk,
      detail: 'adaptiveChrome + layoutTiers forbid UA/platform/brand runtime forks',
    },
    {
      id: 'L01_MINMAX_TICKET',
      ok: overallOk,
      detail: 'RestaurantPosPage minmax(19rem) ticket track + data-ticket-cta-grid',
    },
    {
      id: 'L02_SHELL_STAMP',
      ok: overallOk,
      detail: 'AdaptiveAppShell + FOH stamp fohTicketPane / density / --pos-cta-min-h',
    },
    {
      id: 'L03_CTA_CONTRACT',
      ok: overallOk,
      detail: 'KOT/Bill short literals; Pay from SSOT (no hard-coded verbose Pay)',
    },
    {
      id: 'EVIDENCE_CHROME_SSOT',
      ok: overallOk,
      detail: 'adaptive-chrome.ssot.evidence.test.ts included in suite',
    },
    {
      id: 'EVIDENCE_MULTI_TICKET_S03',
      ok: overallOk,
      detail: 'restaurantMultiTicketIntegrity S03 sheet/column SSOT included',
    },
  ],
  suites,
  exitStatus: client.status,
  stdoutTail: `${client.stdout}\n${client.stderr}`.slice(-4000),
};

writeFileSync(
  resolve(root, 'PROOF_ADAPTIVE_FOH_RESPONSIVE_INTEGRITY.json'),
  `${JSON.stringify(proof, null, 2)}\n`,
  'utf8',
);

const gateRows = proof.gates
  .map((g) => `| \`${g.id}\` | ${g.ok ? 'PASS' : 'FAIL'} | ${g.detail} |`)
  .join('\n');

const matrixRows = viewportMatrix
  .map(
    (v) =>
      `| \`${v.classId}\` | ${v.w}×${v.h} | ${v.pane} | ${v.labels} |`,
  )
  .join('\n');

const md = `# PROOF — Adaptive FOH responsive integrity

**Generated:** ${runAt}  
**Verdict:** **${proof.result}** (${counts.pass}/${counts.total} tests)

## Guarantee

If this artifact is green, Restaurant FOH chrome is **capability-based** (width × height × touch), **OS-agnostic**, and primary CTAs (esp. Pay) plus **type scale** (caption/body/title/amount/cta) resolve from the **adaptiveChrome SSOT**. A ~10" laptop keeps a **side ticket column** with usable KOT/Bill/Pay (minmax track) — never a crushed vertical sliver, never phone sheet demotion solely because density is dense, and card/amount fonts step with density so labels are not hidden by fixed Tailwind sizes.

## Policy

| Rule | Value |
|------|--------|
| Inputs | \`widthPx\`, \`heightPx\`, \`touchFirst\` |
| Forbidden | UA / platform / OS / device brand |
| SSOT | \`samplepos.client/src/lib/adaptiveChrome.ts\` |

## Viewport matrix (doc classes only)

| Class | CSS size | Ticket pane | Action labels |
|-------|----------|-------------|---------------|
${matrixRows}

## Gates

| Gate | Result | Detail |
|------|--------|--------|
${gateRows}

## Reproduce

\`\`\`bash
node scripts/proof-adaptive-foh-responsive-integrity.mjs
\`\`\`

## Artifacts

- JSON: \`PROOF_ADAPTIVE_FOH_RESPONSIVE_INTEGRITY.json\`
- MD: \`PROOF_ADAPTIVE_FOH_RESPONSIVE_INTEGRITY.md\`
`;

writeFileSync(resolve(root, 'PROOF_ADAPTIVE_FOH_RESPONSIVE_INTEGRITY.md'), md, 'utf8');

console.log(
  overallOk
    ? `PASS ADAPTIVE_FOH_RESPONSIVE_INTEGRITY ${counts.pass}/${counts.total}`
    : `FAIL ADAPTIVE_FOH_RESPONSIVE_INTEGRITY pass=${counts.pass} fail=${counts.fail} status=${client.status}`,
);
process.exit(overallOk ? 0 : 1);
