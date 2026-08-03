/**
 * Proof: DocumentTax release is live on production (deploy SHA + SPA fingerprints).
 *
 * Usage:
 *   node scripts/proof-document-tax-deployed.mjs
 *   EXPECT_COMMIT=4e2b03c9 PROD_URL=https://wizarddigital-inv.com node scripts/proof-document-tax-deployed.mjs
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(repoRoot, 'PROOF_DOCUMENT_TAX_DEPLOYED.md');
const PROD = (process.env.PROD_URL || 'https://wizarddigital-inv.com').replace(/\/$/, '');
const EXPECT =
  process.env.EXPECT_COMMIT ||
  spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).stdout.trim();

let pass = 0;
let fail = 0;
const lines = [
  '# DocumentTax Production Deploy Proof\n',
  `Run: ${new Date().toISOString()}\n`,
  `Prod: ${PROD}\n`,
  `Expect commit: \`${EXPECT.slice(0, 12)}\`\n`,
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

function ghJson(args) {
  const r = spawnSync('gh', args, { cwd: repoRoot, encoding: 'utf8', shell: true });
  if (r.status !== 0) return null;
  try {
    return JSON.parse(r.stdout);
  } catch {
    return null;
  }
}

console.log('═'.repeat(60));
console.log(' proof-document-tax-deployed');
console.log('═'.repeat(60));

const runs = ghJson([
  'run',
  'list',
  '--repo',
  'wizard-digital/SMART-ERP-POS',
  '--workflow',
  'deploy-production.yml',
  '--branch',
  'main',
  '--limit',
  '10',
  '--json',
  'databaseId,conclusion,status,headSha,url,displayTitle,createdAt',
]);

const success = Array.isArray(runs)
  ? runs.find(
      (r) =>
        r.conclusion === 'success' &&
        (r.headSha?.startsWith(EXPECT.slice(0, 7)) ||
          EXPECT.startsWith(r.headSha?.slice(0, 7) || '')),
    )
  : null;
const latest = Array.isArray(runs) ? runs.find((r) => r.conclusion === 'success') : null;

if (success) ok('Deploy run for DocumentTax commit', success.url || success.headSha);
else bad('Deploy run for DocumentTax commit', JSON.stringify(runs?.[0] || null));

if (latest) {
  ok('Latest successful deploy', `${latest.headSha?.slice(0, 12)} · ${latest.url}`);
  const match =
    latest.headSha?.startsWith(EXPECT.slice(0, 7)) ||
    EXPECT.startsWith(latest.headSha?.slice(0, 7) || '');
  if (match) ok('Latest deploy SHA is DocumentTax commit', latest.headSha?.slice(0, 12));
  else bad('Latest deploy SHA is DocumentTax commit', `got ${latest.headSha?.slice(0, 12)}`);
}

const health = await fetch(`${PROD}/api/health`).then(async (r) => ({
  status: r.status,
  data: await r.json().catch(() => null),
}));
if (health.status === 200 && health.data?.data?.status === 'healthy') {
  ok('Prod health healthy', `uptime=${Number(health.data?.data?.uptime || 0).toFixed(0)}s`);
} else {
  bad('Prod health healthy', String(health.status));
}

const html = await fetch(PROD).then((r) => r.text());
const fromHtml = [...html.matchAll(/\/assets\/[A-Za-z0-9_.-]+\.js/g)].map((m) => m[0]);
const indexAsset = fromHtml.find((a) => /\/index-.*\.js$/.test(a));
const discovered = new Set(fromHtml);
if (indexAsset) {
  const indexJs = await fetch(PROD + indexAsset).then((r) => r.text());
  for (const m of indexJs.matchAll(/assets\/([A-Za-z0-9_-]+\.js)/g)) {
    discovered.add(`/assets/${m[1]}`);
  }
  for (const m of indexJs.matchAll(/"([A-Za-z0-9_-]+-[A-Za-z0-9_-]+\.js)"/g)) {
    discovered.add(`/assets/${m[1]}`);
  }
  ok('Index + lazy chunks discovered', `n=${discovered.size}`);
} else {
  bad('Locate index-*.js', 'missing');
}

const needles = [
  'DocumentTax',
  'vatOutputRequiresRegisteredCustomer',
  'allowTaxOverride',
  'YYYY-MM-DD or DD/MM/YYYY',
  'product tax mappings',
  'Tax details',
];
const found = {};
const priority = [...discovered].filter((a) =>
  /index-|POSPage|SettingsPage|TaxEngine|CustomerDetail|date-picker|offlineCatalog/i.test(a),
);
const rest = [...discovered].filter((a) => !priority.includes(a));
for (const a of [...priority, ...rest]) {
  if (Object.keys(found).length === needles.length) break;
  try {
    const res = await fetch(PROD + a);
    if (!res.ok) continue;
    const js = await res.text();
    for (const n of needles) {
      if (!found[n] && js.includes(n)) found[n] = a;
    }
  } catch {
    /* ignore */
  }
}
for (const n of needles) {
  if (found[n]) ok(`SPA fingerprint "${n}"`, found[n]);
  else bad(`SPA fingerprint "${n}"`, 'missing from served bundles');
}

// Codebase proof of migrations + SSOT shipped in this commit tree
const fs = await import('node:fs');
const schema = fs.readFileSync(
  resolve(repoRoot, 'SamplePOS.Server/src/constants/schemaVersion.ts'),
  'utf8',
);
const m = schema.match(/CURRENT_SCHEMA_VERSION\s*=\s*(\d+)/);
if (m && Number(m[1]) >= 584) ok('Repo schema version >= 584', m[1]);
else bad('Repo schema version >= 584', m?.[1] || 'missing');
for (const f of [
  'shared/sql/582_customer_tax_profile.sql',
  'shared/sql/583_sales_tax_override.sql',
  'shared/sql/584_sale_items_tax_persistence.sql',
  'SamplePOS.Server/src/services/documentTaxService.ts',
]) {
  if (fs.existsSync(resolve(repoRoot, f))) ok(`Repo ships ${f.split('/').pop()}`);
  else bad(`Repo ships ${f}`);
}

lines.push('\n## Verdict\n');
lines.push(`- PASS: ${pass}`);
lines.push(`- FAIL: ${fail}`);
const verdict = fail === 0 ? 'PASS' : 'FAIL';
lines.push(
  `\n**Overall: ${verdict}** — DocumentTax ${verdict === 'PASS' ? 'is' : 'is NOT clearly'} live on production for \`${EXPECT.slice(0, 12)}\`.\n`,
);
writeFileSync(OUT, lines.join('\n') + '\n', 'utf8');
console.log('─'.repeat(60));
console.log(` Wrote ${OUT}`);
console.log(` PASS=${pass} FAIL=${fail} → ${verdict}`);
console.log('─'.repeat(60));
process.exit(fail === 0 ? 0 : 1);
