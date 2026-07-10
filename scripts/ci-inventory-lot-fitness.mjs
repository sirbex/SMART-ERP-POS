#!/usr/bin/env node
/**
 * Architecture fitness functions — Inventory Lot domain (Gate J).
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ARCHITECTURAL_AUXILIARY_PATHS,
  FEFO_READ_SELECTION_ALLOWLIST,
  countPendingDebt,
  isAuxiliaryPath,
} from './inventory-lot-fitness-policy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_SRC = path.join(ROOT, 'SamplePOS.Server/src');
const SHARED_LOT = path.join(ROOT, 'shared/inventory-lot');
const LOT_MODULE = 'modules/inventory-lot/';
const STRICT = process.env.LOT_CERTIFICATION_STRICT === '1' || process.argv.includes('--strict');

const errors = [];
const warnings = [];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage']);

function rel(p) {
  return path.relative(ROOT, p).replace(/\\/g, '/');
}

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
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

function fail(code, message) {
  errors.push(`[${code}] ${message}`);
}

function warn(code, message) {
  warnings.push(`[${code}] ${message}`);
}

const registrySrc = readFileSync(
  path.join(SERVER_SRC, 'modules/inventory-lot/inventoryLotTouchpointRegistry.ts'),
  'utf8',
);

function countRegistryStatus(status) {
  const re = new RegExp(`status:\\s*'${status}'`, 'g');
  return (registrySrc.match(re) ?? []).length;
}

const BATCH_WRITE_RE = /(?:INSERT\s+INTO|UPDATE)\s+inventory_batches\b/i;
const gatewayPrefix = 'SamplePOS.Server/src/modules/inventory-lot/';
const tsProduction = walk(SERVER_SRC).filter((f) => f.endsWith('.ts') && !/\.test\.ts$/.test(f));

for (const f of tsProduction) {
  const r = rel(f);
  if (r.startsWith(gatewayPrefix)) continue;
  if (isAuxiliaryPath(r)) continue;
  const text = readFileSync(f, 'utf8');
  if (!BATCH_WRITE_RE.test(text)) continue;
  const msg = `Direct inventory_batches write outside LotService gateway at ${r}`;
  if (STRICT) fail('J-01', msg);
  else warn('J-01', `${msg} — migrate before certification`);
}

const DAYS_UNTIL_EXPIRY_RE = /days_until_expiry/i;
const DAYS_ALLOWLIST = new Set(['shared/sql/004_create_quotations_system.sql']);

for (const f of [...walk(SERVER_SRC), ...walk(path.join(ROOT, 'shared/sql'))]) {
  const r = rel(f);
  if (!/\.(ts|sql)$/.test(r) || /\.test\./.test(r)) continue;
  if (r.includes(LOT_MODULE)) continue;
  if (DAYS_ALLOWLIST.has(r)) continue;
  if (!DAYS_UNTIL_EXPIRY_RE.test(readFileSync(f, 'utf8'))) continue;
  fail('J-02', `Duplicate days_until_expiry SQL at ${r} — use LotCalculator.getDaysRemaining`);
}

const FEFO_ORDER_RE = /ORDER\s+BY[\s\S]{0,80}expiry_date\s+ASC/i;
const fefoAllow = new Set(FEFO_READ_SELECTION_ALLOWLIST);

for (const f of tsProduction) {
  const r = rel(f);
  if (fefoAllow.has(r)) continue;
  const text = readFileSync(f, 'utf8');
  if (!FEFO_ORDER_RE.test(text)) continue;
  if (STRICT) fail('J-03', `Duplicate FEFO ordering at ${r} — use shared/inventory-lot/fefoEngine`);
  else warn('J-03', `FEFO ordering outside canonical engine at ${r}`);
}

const EXPIRY_WRITE_RE = /(?:inventory_batches|product_lots)[\s\S]{0,120}?expiry_date\s*=/i;

for (const f of tsProduction) {
  const r = rel(f);
  if (r.includes(LOT_MODULE)) continue;
  if (isAuxiliaryPath(r)) continue;
  const text = readFileSync(f, 'utf8');
  if (!EXPIRY_WRITE_RE.test(text)) continue;
  fail('J-04', `Lot expiry write outside gateway at ${r}`);
}

const notStarted = countRegistryStatus('NOT_STARTED');
if (notStarted > 0) {
  const msg = `${notStarted} touchpoint(s) still NOT_STARTED`;
  if (STRICT) fail('J-05', msg);
  else warn('J-05', msg);
}

const debtCount = countPendingDebt();
if (debtCount < 0) {
  fail('J-06', 'Could not parse PENDING_ARCHITECTURAL_DEBT');
} else if (debtCount > 0) {
  const msg = `${debtCount} pending architectural debt item(s) — certification requires 0`;
  if (STRICT) fail('J-06', msg);
  else warn('J-06', msg);
}

for (const name of ['lotInvariants.ts', 'lotRules.ts', 'fefoEngine.ts', 'fifoEngine.ts', 'lotValidation.ts']) {
  if (!existsSync(path.join(SHARED_LOT, name))) {
    fail('J-07', `Missing shared SSOT module shared/inventory-lot/${name}`);
  }
}

const gatewayFiles = walk(path.join(SERVER_SRC, LOT_MODULE)).filter((f) => f.endsWith('.ts'));
const forbiddenImportRe = /from\s+['"][^'"]*(?:returnGrnService|warehouseSupplierReturnDeduction|warehouseSaleVoidRestore)['"]/;
for (const f of gatewayFiles) {
  const r = rel(f);
  if (forbiddenImportRe.test(readFileSync(f, 'utf8'))) {
    fail('J-08', `Gateway imports non-gateway module at ${r}`);
  }
}

console.log('=== Inventory Lot Architecture Fitness (Gate J) ===');
console.log(`Mode: ${STRICT ? 'CERTIFICATION (strict)' : 'PR (blocking errors only)'}`);
console.log(`Auxiliary paths: ${ARCHITECTURAL_AUXILIARY_PATHS.length} | Debt items: ${debtCount}\n`);

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

console.log('PASSED — architectural fitness functions satisfied');
process.exit(0);
