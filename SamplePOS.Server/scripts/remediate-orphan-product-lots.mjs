#!/usr/bin/env node
/**
 * Remediate orphan product_lots rows (INV-001 zero tolerance).
 *
 * Strategy per row:
 *   1. If matching inventory_batches exists (product_id + lot_number) → link projection
 *   2. Else if remaining_quantity = 0 and no balances → archive projection
 *   3. Else → FAIL with manual review required
 *
 * Usage:
 *   node SamplePOS.Server/scripts/remediate-orphan-product-lots.mjs
 *   node SamplePOS.Server/scripts/remediate-orphan-product-lots.mjs --dry-run
 */
import pg from 'pg';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dryRun = process.argv.includes('--dry-run');
const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function loadUrl() {
  for (const rel of ['.env', '.env.test', '.env.local']) {
    const p = resolve(serverRoot, rel);
    if (!existsSync(p)) continue;
    const m = readFileSync(p, 'utf8').match(/^DATABASE_URL=(.+)$/m);
    if (m) return m[1].replace(/^"|"$/g, '');
  }
  return process.env.DATABASE_URL;
}

const dbUrl = loadUrl();
if (!dbUrl) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: dbUrl });

const orphans = await pool.query(`
  SELECT pl.id, pl.product_id, pl.lot_number, pl.status, pl.expiry_date
  FROM product_lots pl
  WHERE pl.inventory_batch_id IS NULL
  ORDER BY pl.created_at DESC
`);

console.log(`Orphan product_lots: ${orphans.rows.length}`);
if (orphans.rows.length === 0) {
  await pool.end();
  process.exit(0);
}

let linked = 0;
let archived = 0;
const manual = [];

for (const row of orphans.rows) {
  const batch = await pool.query(
    `SELECT id, remaining_quantity FROM inventory_batches
     WHERE product_id = $1 AND batch_number = $2
     LIMIT 1`,
    [row.product_id, row.lot_number],
  );

  if (batch.rows[0]?.id) {
    console.log(`LINK ${row.id} → batch ${batch.rows[0].id} (${row.lot_number})`);
    if (!dryRun) {
      await pool.query(
        `UPDATE product_lots
         SET inventory_batch_id = $1, updated_at = NOW()
         WHERE id = $2`,
        [batch.rows[0].id, row.id],
      );
    }
    linked++;
    continue;
  }

  const bal = await pool.query(
    `SELECT COALESCE(SUM(quantity_on_hand), 0)::numeric AS qty
     FROM inventory_balances WHERE product_lot_id = $1`,
    [row.id],
  );
  const onHand = parseFloat(bal.rows[0]?.qty ?? '0');

  if (onHand <= 0.001 && ['DEPLETED', 'DISPOSED', 'ARCHIVED', 'EXPIRED'].includes(row.status)) {
    console.log(`ARCHIVE orphan ${row.id} (${row.lot_number}) — no batch, zero balance`);
    if (!dryRun) {
      await pool.query(
        `UPDATE product_lots SET status = 'ARCHIVED', updated_at = NOW() WHERE id = $1`,
        [row.id],
      );
    }
    archived++;
    continue;
  }

  manual.push(row);
}

if (manual.length > 0) {
  console.error('\nManual review required:');
  for (const r of manual) {
    console.error(`  - ${r.id} product=${r.product_id} lot=${r.lot_number} status=${r.status}`);
  }
  await pool.end();
  process.exit(1);
}

console.log(`\nDone: linked=${linked} archived=${archived} dryRun=${dryRun}`);
await pool.end();
