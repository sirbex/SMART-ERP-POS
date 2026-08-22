#!/usr/bin/env node
/**
 * Live production probe — FOH soft keyboard + admin ownership release markers.
 * Writes PROOF_FOH_KEYBOARD_OWNERSHIP_LIVE.json + .md
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const commit =
  process.env.EXPECT_COMMIT ||
  spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).stdout.trim();
const short = commit.slice(0, 12);

const bases = (
  process.env.TENANT_URLS || 'https://henber.wizarddigital-inv.com,https://wizarddigital-inv.com'
)
  .split(',')
  .map((s) => s.trim().replace(/\/$/, ''))
  .filter(Boolean);

/** Minification-safe markers — function/class names are stripped in prod bundles. */
const needles = [
  'data-numeric-soft-keyboard',
  'data-search-soft-keyboard-input',
  'data-soft-keyboard-pad',
  'data-pos-qty-stepper',
  'data-pos-qty-inc',
  'SearchSoftKeyboardInput',
  'rbacRoleNames',
  'belongs to another waiter',
  'restaurant.edit_others',
];

async function scanHost(base) {
  const healthRes = await fetch(`${base}/api/health`);
  const health = healthRes.ok ? await healthRes.json() : null;
  const html = await (await fetch(`${base}/`)).text();
  const entry = [...html.matchAll(/\/assets\/([^"']+\.js)/g)].map((m) => m[1]);
  const queue = [...entry];
  const seen = new Set();
  const hits = Object.fromEntries(needles.map((n) => [n, false]));
  let scanned = 0;

  while (queue.length) {
    const file = queue.shift();
    if (!file || seen.has(file)) continue;
    seen.add(file);
    const res = await fetch(`${base}/assets/${file}`);
    if (!res.ok) continue;
    const js = await res.text();
    scanned += 1;
    for (const n of needles) {
      if (js.includes(n)) hits[n] = true;
    }
    for (const m of js.matchAll(/assets\/([A-Za-z0-9_.-]+\.js)/g)) {
      const ref = m[1];
      if (!seen.has(ref)) queue.push(ref);
    }
    if (needles.every((n) => hits[n])) break;
  }

  return {
    base,
    healthStatus: healthRes.status,
    healthOk: health?.status === 'healthy' || health?.data?.status === 'healthy',
    uptime: health?.data?.uptime ?? health?.uptime ?? null,
    scanned,
    hits,
  };
}

const rows = [];
let fail = 0;
for (const base of bases) {
  const row = await scanHost(base);
  rows.push(row);
  console.log(`\n== ${base} ==`);
  console.log(
    `health ${row.healthStatus} healthy=${row.healthOk} scanned=${row.scanned}`,
  );
  for (const n of needles) {
    const ok = !!row.hits[n];
    if (!ok) fail += 1;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}`);
  }
}

const report = {
  started: new Date().toISOString(),
  commit,
  short,
  bases,
  needles,
  rows,
  failCount: fail,
  verdict: fail === 0 ? 'PASS' : 'FAIL',
};

writeFileSync(
  resolve(repoRoot, 'PROOF_FOH_KEYBOARD_OWNERSHIP_LIVE.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);
writeFileSync(
  resolve(repoRoot, 'PROOF_FOH_KEYBOARD_OWNERSHIP_LIVE.md'),
  [
    '# PROOF: FOH keyboard + ownership LIVE',
    '',
    `- Date: ${report.started}`,
    `- Commit: \`${commit}\` (${short})`,
    `- Runner: \`node scripts/proof-foh-keyboard-ownership-live.mjs\``,
    '',
    '## Hosts',
    ...rows.map(
      (r) =>
        `- **${r.base}** — health ${r.healthStatus}, healthy=${r.healthOk}, scanned ${r.scanned} chunks`,
    ),
    '',
    '## Markers',
    ...rows.flatMap((r) =>
      needles.map(
        (n) => `- ${r.hits[n] ? 'PASS' : 'FAIL'} \`${n}\` on ${r.base}`,
      ),
    ),
    '',
    '## Verdict',
    report.verdict === 'PASS'
      ? '**PASS** — live SPA bundles contain keyboard + ownership release markers.'
      : `**FAIL** — ${fail} marker(s) missing on production.`,
    '',
  ].join('\n'),
);

console.log(`\nVerdict: ${report.verdict} (${fail} missing markers)\n`);
process.exit(fail === 0 ? 0 : 1);
