#!/usr/bin/env node
/**
 * Merge live Bliss rollback proofs into PROOF_WAREHOUSE_LAYER_POS_SELLABLE_SSOT.json
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(serverRoot, '..');
const proofName = 'PROOF_WAREHOUSE_LAYER_POS_SELLABLE_SSOT.json';

function extractJson(stdout) {
  const start =
    stdout.lastIndexOf('\n{') >= 0 ? stdout.lastIndexOf('\n{') + 1 : stdout.indexOf('{');
  if (start < 0) throw new Error('no JSON object in stdout');
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < stdout.length; i++) {
    const ch = stdout[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return JSON.parse(stdout.slice(start, i + 1));
    }
  }
  throw new Error('unbalanced JSON in stdout');
}

function runProof(scriptRel) {
  const script = path.join(serverRoot, scriptRel);
  const r = spawnSync(process.execPath, [script], {
    cwd: serverRoot,
    encoding: 'utf8',
    timeout: 180000,
  });
  let parsed;
  try {
    parsed = extractJson(r.stdout || '');
  } catch (err) {
    parsed = {
      verdict: 'FAIL',
      parseError: true,
      message: err instanceof Error ? err.message : String(err),
      stdoutTail: (r.stdout || '').slice(-1200),
      stderrTail: (r.stderr || '').slice(-600),
    };
  }
  return {
    exitCode: r.status,
    verdict: parsed?.verdict ?? (r.status === 0 ? 'PASS' : 'FAIL'),
    result: parsed,
  };
}

const returnLive = runProof('scripts/proof-bliss-return-sku3273-rollback.mjs');
const adjustLive = runProof('scripts/proof-bliss-adjust-sku3730-rollback.mjs');

const proofPaths = [
  path.join(repoRoot, proofName),
  path.join(serverRoot, proofName),
];

for (const p of proofPaths) {
  if (!existsSync(p)) continue;
  const payload = JSON.parse(readFileSync(p, 'utf8'));
  payload.liveEvidence = {
    returnSku3273: {
      exitCode: returnLive.exitCode,
      verdict: returnLive.verdict,
      result: returnLive.result,
    },
    adjustSku3730: {
      exitCode: adjustLive.exitCode,
      verdict: adjustLive.verdict,
      result: adjustLive.result,
    },
  };
  const livePass = returnLive.verdict === 'PASS' && adjustLive.verdict === 'PASS';
  payload.liveVerdict = livePass ? 'PASS' : 'FAIL';
  payload.generatedAt = new Date().toISOString();
  // Structural gates already recorded; overall requires live PASS too
  if (payload.passed === payload.total && livePass) {
    payload.verdict = 'PASS';
    delete payload.failReason;
  } else if (payload.passed === payload.total && !livePass) {
    payload.verdict = 'FAIL';
    payload.failReason = 'Structural gates passed but live rollback proofs failed';
  }
  writeFileSync(p, `${JSON.stringify(payload, null, 2)}\n`);
}

const mdPaths = [
  path.join(repoRoot, 'PROOF_WAREHOUSE_LAYER_POS_SELLABLE_SSOT.md'),
  path.join(serverRoot, 'PROOF_WAREHOUSE_LAYER_POS_SELLABLE_SSOT.md'),
];
const liveSection = [
  '',
  '## Live evidence (rollback-safe)',
  '',
  `- Return SKU-3273: **${returnLive.verdict}** (exit ${returnLive.exitCode}) — gap reason \`${returnLive.result?.steps?.find?.((s) => s.step === 'pos_gaps')?.gaps?.[0]?.reason ?? 'n/a'}\``,
  `- Adjust SKU-3730 +8: **${adjustLive.verdict}** (exit ${adjustLive.exitCode}) — batch ${adjustLive.result?.steps?.find?.((s) => s.step === 'after')?.row?.batch_qty ?? 'n/a'}, lots=${adjustLive.result?.steps?.find?.((s) => s.step === 'after')?.row?.lot_count ?? 'n/a'}`,
  '',
].join('\n');

for (const mdPath of mdPaths) {
  if (!existsSync(mdPath)) continue;
  let md = readFileSync(mdPath, 'utf8');
  // Refresh top verdict from JSON
  const jsonPath = mdPath.replace(/\.md$/, '.json');
  if (existsSync(jsonPath)) {
    const j = JSON.parse(readFileSync(jsonPath, 'utf8'));
    md = md.replace(
      /Verdict: \*\*[^*]+\*\* \(\d+\/\d+\)/,
      `Verdict: **${j.verdict}** (${j.passed}/${j.total}) live=${j.liveVerdict ?? 'n/a'}`,
    );
  }
  if (md.includes('## Live evidence')) {
    md = md.replace(/## Live evidence[\s\S]*?(?=\n## |\n*$)/, liveSection.trim() + '\n\n');
  } else {
    md = md.trimEnd() + '\n' + liveSection;
  }
  writeFileSync(mdPath, md);
}

console.log(
  JSON.stringify(
    {
      returnSku3273: returnLive.verdict,
      adjustSku3730: adjustLive.verdict,
      overall:
        returnLive.verdict === 'PASS' && adjustLive.verdict === 'PASS' ? 'PASS' : 'FAIL',
    },
    null,
    2,
  ),
);
process.exit(returnLive.verdict === 'PASS' && adjustLive.verdict === 'PASS' ? 0 : 1);
