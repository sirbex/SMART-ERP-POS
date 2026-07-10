#!/usr/bin/env node
/**
 * CI guardrails — Inventory Lot domain (ADR-002 §13.4).
 * Blocks new lot-attribute writes outside modules/inventory-lot/.
 *
 * Usage: node scripts/ci-inventory-lot-guardrails.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_SRC = path.join(ROOT, 'SamplePOS.Server/src');
const LOT_MODULE = 'modules/inventory-lot/';
const errors = [];
const warnings = [];

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage']);

/** Grandfathered until fully migrated — do not add paths here. */
const EXPIRY_WRITE_ALLOWLIST = new Set([
  'SamplePOS.Server/src/modules/inventory/warehouse/expiryAutomationService.ts',
]);

/** Existing days_until_expiry SQL — no new occurrences outside this set. */
const DAYS_UNTIL_EXPIRY_ALLOWLIST = new Set([
  'shared/sql/004_create_quotations_system.sql',
]);

function rel(p) {
  return path.relative(ROOT, p).replace(/\\/g, '/');
}

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

const MASTER_EXPIRY_RE = /(?:inventory_batches|product_lots)[\s\S]{0,120}?expiry_date\s*=/i;
const DAYS_UNTIL_EXPIRY_RE = /days_until_expiry/i;

const tsFiles = walk(SERVER_SRC).filter((f) => /\.ts$/.test(f) && !/\.test\.ts$/.test(f));

for (const f of tsFiles) {
  const r = rel(f);
  if (r.includes(LOT_MODULE)) continue;

  const text = readFileSync(f, 'utf8');
  if (!MASTER_EXPIRY_RE.test(text)) continue;

  if (EXPIRY_WRITE_ALLOWLIST.has(r)) {
    warnings.push(`[LOT-EXP] Grandfathered expiry write in ${r} — migrate to postgresLotRepository`);
    continue;
  }

  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (MASTER_EXPIRY_RE.test(lines[i])) {
      errors.push(
        `[LOT-EXP] Lot expiry write outside inventory-lot at ${r}:${i + 1} — use LotService / postgresLotRepository`,
      );
    }
  }
}

const sqlAndTs = [
  ...walk(SERVER_SRC).filter((f) => /\.(ts|sql)$/.test(f)),
  ...walk(path.join(ROOT, 'shared/sql')).filter((f) => f.endsWith('.sql')),
];

for (const f of sqlAndTs) {
  const r = rel(f);
  if (/\.test\.(ts|js|mjs)$/.test(r) || r.includes('__tests__')) continue;
  if (!DAYS_UNTIL_EXPIRY_RE.test(readFileSync(f, 'utf8'))) continue;
  if (DAYS_UNTIL_EXPIRY_ALLOWLIST.has(r)) continue;
  if (r.includes(LOT_MODULE)) continue;
  errors.push(
    `[LOT-RPT] days_until_expiry SQL in ${r} — use LotCalculator.getDaysRemaining`,
  );
}

console.log('=== CI Inventory Lot Guardrails (ADR-002) ===\n');

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

console.log('PASSED — no blocking inventory-lot domain violations');
if (warnings.length) console.log(`(${warnings.length} grandfathered warning(s))`);
process.exit(0);
