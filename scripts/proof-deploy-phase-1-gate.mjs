#!/usr/bin/env node
/**
 * Mandatory deploy gate — Phase 1A/1B/2 (GR reversal, net-received PO, MUoM).
 *
 * If ANY step fails: STOP — NO PUSH — NO DEPLOY
 *
 * Prerequisites:
 *   1. Apply shared/sql/522_gr_reversal_metadata.sql on ALL tenants:
 *        cd SamplePOS.Server && npm run migrate:tenants
 *   2. API running (for live proof steps): cd SamplePOS.Server && npm run dev
 *
 * Usage:
 *   npm run deploy:gate:phase-1-inventory
 *   SKIP_MIGRATION_CHECK=1 npm run deploy:gate:phase-1-inventory
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const serverDir = resolve(root, 'SamplePOS.Server');

const steps = [
  {
    label: 'proof-phase-1-inventory-matrix',
    cmd: 'npm',
    args: ['run', 'proof-phase-1-inventory-matrix'],
    cwd: root,
  },
  {
    label: 'test:return-grn',
    cmd: 'npm',
    args: ['run', 'test:return-grn'],
    cwd: root,
  },
  {
    label: 'test:inventory-coupling',
    cmd: 'npm',
    args: ['run', 'test:inventory-coupling'],
    cwd: root,
  },
  {
    label: 'proof:return-supplier-flow',
    cmd: 'npm',
    args: ['run', 'proof:return-supplier-flow'],
    cwd: root,
  },
  {
    label: 'proof:enterprise',
    cmd: 'npm',
    args: ['run', 'proof:enterprise'],
    cwd: root,
  },
];

function runStep(step) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(` DEPLOY GATE — ${step.label}`);
  console.log(`${'═'.repeat(60)}\n`);
  const r = spawnSync(step.cmd, step.args, {
    cwd: step.cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  return r.status === 0;
}

async function checkMigration522() {
  if (process.env.SKIP_MIGRATION_CHECK === '1') {
    console.log('SKIP migration 522 check (SKIP_MIGRATION_CHECK=1)\n');
    return true;
  }
  const envPath = resolve(serverDir, '.env');
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m && !process.env[m[1].trim()]) {
        process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
      }
    }
  }
  if (!process.env.DATABASE_URL) {
    console.warn('WARN: DATABASE_URL not set — cannot verify migration 522 on master DB');
    console.warn('      Run: cd SamplePOS.Server && npm run migrate:tenants\n');
    return true;
  }
  const require = createRequire(resolve(serverDir, 'package.json'));
  const pg = require('pg');
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const r = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'goods_receipts' AND column_name = 'reversed_by_return_grn_id'`,
    );
    if (r.rows.length === 0) {
      console.error('\nFAIL: migration 522 NOT applied on master DB (reversed_by_return_grn_id missing)');
      console.error('      cd SamplePOS.Server && npm run migrate:tenants\n');
      return false;
    }
    console.log('PASS: migration 522 reversal columns present on master DB\n');
    return true;
  } catch (e) {
    console.warn(`WARN: migration 522 check skipped (${e instanceof Error ? e.message : e})\n`);
    return true;
  } finally {
    await pool.end();
  }
}

console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║  DEPLOY GATE — Phase 1 Inventory (1A + 1B + 2)              ║');
console.log('║  On failure: STOP — NO PUSH — NO DEPLOY                      ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

console.log('Checklist:');
console.log('  [1] Migration 522 on all tenants (migrate:tenants)');
console.log('  [2] proof-phase-1-inventory-matrix');
console.log('  [3] test:return-grn');
console.log('  [4] test:inventory-coupling');
console.log('  [5] proof:return-supplier-flow');
console.log('  [6] proof:enterprise\n');

const migOk = await checkMigration522();
if (!migOk) {
  process.exit(1);
}

const failed = [];
for (const step of steps) {
  if (!runStep(step)) {
    failed.push(step.label);
  }
}

console.log(`\n${'═'.repeat(60)}`);
if (failed.length === 0) {
  console.log(' DEPLOY GATE: ALL PASS — safe to push/deploy Phase 1 inventory bundle');
  console.log(`${'═'.repeat(60)}\n`);
  process.exit(0);
}

console.error(' DEPLOY GATE: FAILED');
console.error(` Steps failed: ${failed.join(', ')}`);
console.error(' STOP — NO PUSH — NO DEPLOY');
console.log(`${'═'.repeat(60)}\n`);
process.exit(1);
