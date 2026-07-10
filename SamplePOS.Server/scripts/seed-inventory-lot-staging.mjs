#!/usr/bin/env node
/**
 * Seed production-scale lot data for Gate C staging proofs.
 *
 * Usage:
 *   node SamplePOS.Server/scripts/seed-inventory-lot-staging.mjs
 *   node SamplePOS.Server/scripts/seed-inventory-lot-staging.mjs --clean
 *   LOT_PROOF_SEED_COUNT=10000 node SamplePOS.Server/scripts/seed-inventory-lot-staging.mjs
 *
 * Rows use batch_number prefix LOT-PROOF-SEED- (safe to delete with --clean).
 */
import pg from 'pg';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PREFIX = 'LOT-PROOF-SEED-';
const TARGET = Math.max(1000, parseInt(process.env.LOT_PROOF_SEED_COUNT || '10000', 10));
const CHUNK = 500;
const CLEAN = process.argv.includes('--clean');

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
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: dbUrl });

try {
  const productRes = await pool.query(
    `SELECT id FROM products WHERE is_active = true ORDER BY created_at ASC LIMIT 1`,
  );
  const productId = productRes.rows[0]?.id;
  if (!productId) {
    console.error('No active product found — create a product first');
    process.exit(1);
  }

  if (CLEAN) {
    const del = await pool.query(
      `DELETE FROM inventory_batches WHERE batch_number LIKE $1`,
      [`${PREFIX}%`],
    );
    console.log(`Cleaned ${del.rowCount} proof seed batches`);
    if (!process.argv.includes('--seed')) {
      process.exit(0);
    }
  }

  const existing = await pool.query(
    `SELECT COUNT(*)::int AS n FROM inventory_batches WHERE batch_number LIKE $1 AND status = 'ACTIVE'`,
    [`${PREFIX}%`],
  );
  const have = existing.rows[0]?.n ?? 0;
  if (have >= TARGET) {
    console.log(`Already seeded: ${have} active batches (target ${TARGET})`);
    process.exit(0);
  }

  const need = TARGET - have;
  console.log(`Seeding ${need} batches for product ${productId} (prefix ${PREFIX})`);

  const t0 = performance.now();
  let inserted = 0;

  for (let offset = have + 1; offset <= TARGET; offset += CHUNK) {
    const end = Math.min(offset + CHUNK - 1, TARGET);
    const count = end - offset + 1;
    await pool.query(
      `INSERT INTO inventory_batches (
         product_id, batch_number, quantity, remaining_quantity,
         expiry_date, cost_price, source_type, status, received_date
       )
       SELECT
         $1::uuid,
         $2 || lpad(i::text, 6, '0'),
         1,
         1,
         ('2026-' || lpad((1 + (i % 12))::text, 2, '0') || '-15')::date,
         10 + (i % 50),
         'OPENING_BALANCE',
         'ACTIVE',
         ('2026-01-' || lpad((1 + (i % 28))::text, 2, '0'))::date
       FROM generate_series($3::int, $4::int) AS i`,
      [productId, PREFIX, offset, end],
    );
    inserted += count;
    if (inserted % 2000 === 0 || end === TARGET) {
      console.log(`  … ${inserted}/${need} inserted`);
    }
  }

  const ms = Math.round(performance.now() - t0);
  const total = await pool.query(
    `SELECT COUNT(*)::int AS n FROM inventory_batches WHERE batch_number LIKE $1 AND status = 'ACTIVE'`,
    [`${PREFIX}%`],
  );
  console.log(`Done in ${ms} ms — ${total.rows[0].n} active proof seed batches`);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
} finally {
  await pool.end();
}
