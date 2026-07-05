#!/usr/bin/env node
/**
 * Proof: warehouse layer coupling — batch remaining = sum(store balances) per lot.
 *
 * Gate 1 — DB scan (no mismatches)
 * Gate 2 — Adhesive [113] on PO-0063 = 10 total
 * Gate 3 — Jest warehouseInventoryCoupling + return flow mocks
 *
 * Usage: node scripts/proof-warehouse-layer-coupling.mjs
 */
import pg from 'pg';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(serverRoot, '..');
const OUT = process.env.PROOF_OUT || resolve(root, 'PROOF_WAREHOUSE_LAYER_COUPLING.md');

let pass = 0;
let fail = 0;
const lines = [`# Warehouse Layer Coupling Proof\n`, `Run: ${new Date().toISOString()}\n`];

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
function assert(c, n, d = '') {
  if (c) ok(n, d);
  else bad(n, d);
}

function loadUrl() {
  for (const rel of ['.env', '.env.local']) {
    const p = resolve(serverRoot, rel);
    if (!existsSync(p)) continue;
    const m = readFileSync(p, 'utf8').match(/^DATABASE_URL=(.+)$/m);
    if (m) return m[1].replace(/^"|"$/g, '');
  }
  return process.env.DATABASE_URL;
}

const mismatchSql = `
  SELECT pl.lot_number, p.sku, p.name,
         COALESCE(SUM(ib.quantity_on_hand), 0)::numeric AS balance_total,
         COALESCE(b.remaining_quantity, 0)::numeric AS batch_remaining
  FROM product_lots pl
  LEFT JOIN inventory_balances ib ON ib.product_lot_id = pl.id
  LEFT JOIN inventory_batches b ON b.id = pl.inventory_batch_id
  JOIN products p ON p.id = pl.product_id
  WHERE pl.inventory_batch_id IS NOT NULL
  GROUP BY pl.id, pl.lot_number, p.sku, p.name, b.remaining_quantity
  HAVING ABS(
    COALESCE(SUM(ib.quantity_on_hand), 0)::numeric - COALESCE(b.remaining_quantity, 0)::numeric
  ) > 0.001
  ORDER BY p.sku, pl.lot_number
  LIMIT 20`;

const pool = new pg.Pool({ connectionString: loadUrl() });

try {
  console.log('═'.repeat(60));
  console.log(' proof-warehouse-layer-coupling');
  console.log('═'.repeat(60));

  const ms = await pool.query(
    `SELECT COALESCE(is_multistore_enabled, false) AS enabled FROM system_settings LIMIT 1`,
  );
  const multistore = ms.rows[0]?.enabled === true;
  ok('Read multistore setting', String(multistore));

  if (multistore) {
    const mismatches = await pool.query(mismatchSql);
    assert(mismatches.rows.length === 0, 'No lot-level batch/balance mismatches', `${mismatches.rows.length} found`);
    if (mismatches.rows.length > 0) {
      for (const r of mismatches.rows) {
        lines.push(`  - ${r.sku} ${r.lot_number}: balances=${r.balance_total} batch=${r.batch_remaining}`);
      }
    }

    const adhesive = await pool.query(
      `SELECT COALESCE(SUM(ib.quantity_on_hand), 0)::numeric AS total
       FROM inventory_balances ib
       JOIN products p ON p.id = ib.product_id
       WHERE p.sku = '113'`,
    );
    const batch = await pool.query(
      `SELECT COALESCE(SUM(remaining_quantity), 0)::numeric AS total
       FROM inventory_batches ib
       JOIN products p ON p.id = ib.product_id
       WHERE p.sku = '113' AND ib.status = 'ACTIVE'`,
    );
    const bal = Number(adhesive.rows[0]?.total ?? 0);
    const bat = Number(batch.rows[0]?.total ?? 0);
    assert(Math.abs(bal - bat) < 0.001, 'Adhesive [113] balances match batches', `bal=${bal} batch=${bat}`);
    assert(Math.abs(bal - 10) < 0.001, 'Adhesive [113] total stock = 10', `total=${bal}`);
  } else {
    ok('Skip lot coupling scan', 'multistore off');
  }

  console.log('\n' + '═'.repeat(60));
  console.log(' Jest');
  console.log('═'.repeat(60));

  const jest = spawnSync(
    'node',
    [
      '--experimental-vm-modules',
      './node_modules/jest/bin/jest.js',
      'src/services/warehouseInventoryCoupling.test.ts',
      'src/modules/return-grn/returnGrnService.returnFlow.test.ts',
      '--runInBand',
    ],
    { cwd: serverRoot, stdio: 'inherit', shell: false },
  );
  assert(jest.status === 0, 'Jest warehouse coupling + return flow');

  lines.push(`\n## Summary\n\n**${fail === 0 ? 'PASS' : 'FAIL'}** — ${pass} passed, ${fail} failed\n`);
  writeFileSync(OUT, lines.join('\n'));
  console.log('\n' + '═'.repeat(60));
  console.log(fail === 0 ? ` ALL PASS (${pass})` : ` FAILED (${fail} fail, ${pass} pass)`);
  console.log(` Report: ${OUT}`);
  console.log('═'.repeat(60));
  process.exit(fail === 0 ? 0 : 1);
} finally {
  await pool.end();
}
