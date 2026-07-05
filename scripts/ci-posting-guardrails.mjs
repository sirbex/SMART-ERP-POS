#!/usr/bin/env node
/**
 * CI guardrails — Phase 1A posting integrity.
 * Fails build on undocumented GL bypasses and unapproved SQL GL triggers.
 *
 * Usage: node scripts/ci-posting-guardrails.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const warnings = [];

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage', 'release-evidence']);

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

function rel(p) {
  return path.relative(ROOT, p).replace(/\\/g, '/');
}

const files = walk(ROOT);
const tsJs = files.filter((f) => /\.(ts|tsx|js|mjs)$/.test(f));

// ── Rule 1: No INSERT INTO ledger_* outside accountingCore.ts ───────────────
for (const f of tsJs) {
  const r = rel(f);
  if (r.includes('accountingCore.ts')) continue;
  if (/\.test\.(ts|js|mjs)$/.test(r) || r.includes('__tests__')) continue;
  const text = readFileSync(f, 'utf8');
  if (/INSERT\s+INTO\s+ledger_(entries|transactions)/i.test(text)) {
    errors.push(`[AR-INV-6] Direct ledger INSERT in ${r} — use AccountingCore.createJournalEntry()`);
  }
}

// ── Rule 2: No NEW migrations may CREATE GL posting triggers without approval ─
// Legacy shared/sql trigger defs are historical; retired by migrations 250 + 061.
const APPROVED_TRIGGER_MARKER = 'GOVERNANCE_APPROVED_GL_TRIGGER';
for (const f of files.filter((x) => x.endsWith('.sql'))) {
  const r = rel(f);
  if (!r.includes('SamplePOS.Server/db/migrations/')) continue;
  const text = readFileSync(f, 'utf8');
  if (/CREATE\s+TRIGGER\s+trg_post_\w+_to_ledger/i.test(text)) {
    const retires = /DROP TRIGGER|DISABLE TRIGGER/i.test(text);
    if (!retires && !text.includes(APPROVED_TRIGGER_MARKER)) {
      errors.push(
        `[SQL] Migration ${r} creates GL posting trigger without DROP/DISABLE or ${APPROVED_TRIGGER_MARKER}`,
      );
    }
  }
}

// ── Rule 3: glEntryService AR lines — recordSaleRefundToGL / recordInvoicePaymentToGL must tag entity (static stub) ──
const glPath = path.join(ROOT, 'SamplePOS.Server/src/services/glEntryService.ts');
const glText = readFileSync(glPath, 'utf8');

function extractFn(name) {
  const re = new RegExp(`export async function ${name}[\\s\\S]*?(?=\\nexport async function |\\n// =====)`);
  return glText.match(re)?.[0] ?? '';
}

for (const fn of ['recordSaleRefundToGL', 'recordInvoicePaymentToGL']) {
  const block = extractFn(fn);
  if (block.includes('ACCOUNTS_RECEIVABLE') && !/entityType:\s*['"]customer['"]/.test(block)) {
    warnings.push(
      `[AR-INV-1] ${fn} posts to 1200 without entityType:'customer' — fix before enabling governance`,
    );
  }
}

// ── Rule 4: repost-missing-gl must not run in CI deploy without flag ────────
const repostScript = path.join(ROOT, 'SamplePOS.Server/scripts/repost-missing-gl.ts');
if (readFileSync(repostScript, 'utf8').includes('repostMissingGL')) {
  warnings.push('[AR-INV-6] repost-missing-gl.ts exists — classify RETIRE in Phase 5');
}

// ── Rule 5: Henber AR remediate scripts flagged ───────────────────────────────
for (const f of tsJs) {
  const r = rel(f);
  if (/henber-ar-phase3-remediate|henber-ar-phase3-reverse/.test(r)) {
    warnings.push(`[REMEDIATION] ${r} — production writes; freeze until Migration 534`);
  }
}

// ── Output ──────────────────────────────────────────────────────────────────
console.log('=== CI Posting Guardrails ===\n');

if (warnings.length) {
  console.log('Warnings:');
  for (const w of warnings) console.log(`  ⚠ ${w}`);
  console.log('');
}

if (errors.length) {
  console.log('Errors:');
  for (const e of errors) console.log(`  ✗ ${e}`);
  console.log(`\nFAILED (${errors.length} error(s))`);
  process.exit(1);
}

console.log('PASSED — no blocking posting bypass violations');
if (warnings.length) console.log(`(${warnings.length} warning(s) — address before Phase 1B enforcement)`);
process.exit(0);
