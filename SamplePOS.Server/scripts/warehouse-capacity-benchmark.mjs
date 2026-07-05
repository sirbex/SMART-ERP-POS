#!/usr/bin/env node
/**
 * Capacity benchmark — multistore inventory at production scale.
 *
 * Seeds (configurable):
 *   - 10–20 store_locations
 *   - 50,000+ product_lots
 *   - 100,000+ inventory_balances
 *
 * Runs EXPLAIN ANALYZE + concurrent POS stock lookups.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... node SamplePOS.Server/scripts/warehouse-capacity-benchmark.mjs
 *   BENCHMARK_SEED=0  — skip seed, benchmark existing data only
 *   PROOF_OUT=PROOF_WAREHOUSE_CAPACITY_BENCHMARK.md
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { performance } from 'node:perf_hooks';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const require = createRequire(path.join(__dirname, '..', 'package.json'));
const pg = require('pg');

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/pos_wh_audit';
const SEED = process.env.BENCHMARK_SEED !== '0';
const STORE_COUNT = Number(process.env.BENCHMARK_STORES || 15);
const LOT_COUNT = Number(process.env.BENCHMARK_LOTS || 50000);
const BALANCE_COUNT = Number(process.env.BENCHMARK_BALANCES || 100000);
const CONCURRENCY = Number(process.env.BENCHMARK_CONCURRENCY || 100);
const OUT = process.env.PROOF_OUT || path.join(ROOT, 'PROOF_WAREHOUSE_CAPACITY_BENCHMARK.md');

const lines = [];
function log(s = '') {
  lines.push(s);
  console.log(s);
}

async function seedCapacityData(client) {
  log('\n── Seeding capacity dataset ──');
  const t0 = performance.now();

  await client.query(`UPDATE system_settings SET is_multistore_enabled = true`);

  const productRes = await client.query(`SELECT id FROM products WHERE is_active = true LIMIT 1`);
  let productId = productRes.rows[0]?.id;
  if (!productId) {
    const uom = await client.query(`SELECT id FROM uoms LIMIT 1`);
    const ins = await client.query(
      `INSERT INTO products (name, sku, base_uom_id, is_active, product_type, track_expiry)
       VALUES ('BENCH-PROD', $1, $2, true, 'inventory', false) RETURNING id`,
      [`BENCH-${Date.now()}`, uom.rows[0]?.id],
    );
    productId = ins.rows[0].id;
  }

  for (let i = 0; i < STORE_COUNT; i++) {
    const code = `BENCH-S${String(i).padStart(2, '0')}`;
    const type = i < 2 ? 'MAIN' : i < STORE_COUNT - 2 ? 'SELLING' : 'TRANSIT';
    const pos = type === 'SELLING';
    await client.query(
      `INSERT INTO store_locations (code, name, store_type, is_active, is_pos_selling, is_default_receiving)
       VALUES ($1, $2, $3::store_type, true, $4, $5)
       ON CONFLICT (code) DO NOTHING`,
      [code, `Benchmark ${code}`, type, pos, i === 0],
    );
  }

  const stores = await client.query(
    `SELECT id FROM store_locations WHERE code LIKE 'BENCH-%' OR store_type = 'SELLING' LIMIT $1`,
    [STORE_COUNT],
  );
  const storeIds = stores.rows.map((r) => r.id);
  if (storeIds.length === 0) throw new Error('No benchmark stores');

  log(`  Stores: ${storeIds.length}`);
  log(`  Target lots: ${LOT_COUNT.toLocaleString()}, balances: ${BALANCE_COUNT.toLocaleString()}`);

  const existingLots = Number(
    (await client.query(`SELECT COUNT(*)::int AS c FROM product_lots WHERE lot_number LIKE 'BENCH-%'`))
      .rows[0]?.c ?? 0,
  );
  if (existingLots < LOT_COUNT) {
    const need = LOT_COUNT - existingLots;
    log(`  Inserting ${need.toLocaleString()} product_lots (batched)...`);
    const batchSize = 5000;
    for (let offset = 0; offset < need; offset += batchSize) {
      const n = Math.min(batchSize, need - offset);
      await client.query(
        `INSERT INTO product_lots (product_id, lot_number, expiry_date, cost_price, status)
         SELECT $1, 'BENCH-' || lpad(( $2 + g)::text, 8, '0'), CURRENT_DATE + (g % 365)::int, 10.00, 'ACTIVE'
         FROM generate_series(1, $3) g`,
        [productId, existingLots + offset, n],
      );
    }
  }

  const existingBal = Number(
    (
      await client.query(
        `SELECT COUNT(*)::int AS c FROM inventory_balances ib
         JOIN product_lots pl ON pl.id = ib.product_lot_id
         WHERE pl.lot_number LIKE 'BENCH-%'`,
      )
    ).rows[0]?.c ?? 0,
  );
  if (existingBal < BALANCE_COUNT) {
    const need = BALANCE_COUNT - existingBal;
    log(`  Inserting ${need.toLocaleString()} inventory_balances (batched, multi-store)...`);
    const batchSize = 10000;
    for (let offset = 0; offset < need; offset += batchSize) {
      const n = Math.min(batchSize, need - offset);
      await client.query(
        `WITH lots AS (
           SELECT pl.id AS lot_id, row_number() OVER (ORDER BY pl.id) AS rn
           FROM product_lots pl WHERE pl.lot_number LIKE 'BENCH-%' ORDER BY pl.id
         ),
         bench_stores AS (
           SELECT id, row_number() OVER (ORDER BY code) AS ord
           FROM store_locations WHERE code LIKE 'BENCH-%'
         ),
         pairs AS (
           SELECT l.lot_id, bs.id AS store_id
           FROM lots l
           CROSS JOIN bench_stores bs
           WHERE bs.ord = 1 + ((l.rn + bs.ord) % (SELECT COUNT(*)::int FROM bench_stores))
         )
         INSERT INTO inventory_balances (store_location_id, product_id, product_lot_id, quantity_on_hand)
         SELECT p.store_id, $1, p.lot_id, 1 + (random() * 19)::int
         FROM pairs p
         ORDER BY p.lot_id, p.store_id
         OFFSET $2 LIMIT $3
         ON CONFLICT (store_location_id, product_lot_id) DO NOTHING`,
        [productId, offset, n],
      );
    }
  }

  const counts = await client.query(`
    SELECT
      (SELECT COUNT(*)::bigint FROM product_lots WHERE lot_number LIKE 'BENCH-%') AS lots,
      (SELECT COUNT(*)::bigint FROM inventory_balances ib
       JOIN product_lots pl ON pl.id = ib.product_lot_id WHERE pl.lot_number LIKE 'BENCH-%') AS balances,
      (SELECT COUNT(*)::int FROM store_locations WHERE is_active) AS stores
  `);
  log(`  Seeded in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
  log(`  Actual: ${JSON.stringify(counts.rows[0])}`);
  return { productId, storeIds, counts: counts.rows[0] };
}

async function explainAnalyze(client, label, sql, params) {
  log(`\n── EXPLAIN ANALYZE: ${label} ──`);
  const r = await client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${sql}`, params);
  const plan = r.rows.map((row) => row['QUERY PLAN']).join('\n');
  log(plan);
  const ms = plan.match(/Execution Time: ([\d.]+) ms/);
  const seqScan = /Seq Scan on inventory_balances/.test(plan);
  return { executionMs: ms ? Number(ms[1]) : null, seqScanOnBalances: seqScan, plan };
}

async function concurrentPosLookups(pool, storeId, productId, n) {
  log(`\n── Concurrent POS lookups (n=${n}) ──`);
  const sql = `
    SELECT SUM(GREATEST(ib.quantity_on_hand - ib.quantity_reserved - ib.quantity_committed, 0)) AS total_stock
    FROM inventory_balances ib
    INNER JOIN product_lots pl ON pl.id = ib.product_lot_id
    INNER JOIN store_locations sl ON sl.id = ib.store_location_id
    INNER JOIN products p ON p.id = ib.product_id
    WHERE ib.product_id = $1 AND sl.id = $2
      AND sl.is_active = true AND pl.status = 'ACTIVE' AND NOT ib.blocked
      AND ib.quantity_on_hand > 0
      AND (pl.expiry_date IS NULL OR pl.expiry_date > CURRENT_DATE)`;

  const t0 = performance.now();
  const clients = await Promise.all(
    Array.from({ length: n }, async () => {
      const c = await pool.connect();
      try {
        return await c.query(sql, [productId, storeId]);
      } finally {
        c.release();
      }
    }),
  );
  const elapsed = performance.now() - t0;
  log(`  Total wall time: ${elapsed.toFixed(1)}ms`);
  log(`  Avg per request: ${(elapsed / n).toFixed(2)}ms`);
  log(`  Sample result qty: ${clients[0]?.rows[0]?.total_stock ?? 'null'}`);
  return { elapsedMs: elapsed, avgMs: elapsed / n };
}

async function main() {
  log('═'.repeat(72));
  log(' WAREHOUSE CAPACITY BENCHMARK');
  log(` Database: ${DATABASE_URL.replace(/:[^:@]+@/, ':***@')}`);
  log(` Generated: ${new Date().toISOString()}`);
  log('═'.repeat(72));

  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: Math.min(CONCURRENCY + 5, 50) });
  const client = await pool.connect();

  try {
    let meta;
    if (SEED) {
      meta = await seedCapacityData(client);
    } else {
      const productRes = await client.query(`SELECT id FROM products WHERE is_active LIMIT 1`);
      const storeRes = await client.query(
        `SELECT id FROM store_locations WHERE store_type = 'SELLING' OR is_pos_selling LIMIT 1`,
      );
      meta = {
        productId: productRes.rows[0]?.id,
        storeIds: [storeRes.rows[0]?.id],
        counts: {},
      };
    }

    const storeId = meta.storeIds[0];
    const productId = meta.productId;

    const posPlan = await explainAnalyze(
      client,
      'POS stock lookup',
      `SELECT SUM(GREATEST(ib.quantity_on_hand - ib.quantity_reserved - ib.quantity_committed, 0))
       FROM inventory_balances ib
       INNER JOIN product_lots pl ON pl.id = ib.product_lot_id
       INNER JOIN store_locations sl ON sl.id = ib.store_location_id
       WHERE ib.product_id = $1 AND sl.id = $2 AND sl.is_active AND pl.status = 'ACTIVE'
         AND NOT ib.blocked AND ib.quantity_on_hand > 0`,
      [productId, storeId],
    );

    const fefoPlan = await explainAnalyze(
      client,
      'FEFO allocation',
      `SELECT ib.id FROM inventory_balances ib
       INNER JOIN product_lots pl ON pl.id = ib.product_lot_id
       WHERE ib.store_location_id = $1 AND ib.product_id = $2
         AND pl.status = 'ACTIVE' AND NOT ib.blocked AND ib.quantity_on_hand > 0
       ORDER BY pl.expiry_date ASC NULLS LAST, pl.received_date ASC LIMIT 50`,
      [storeId, productId],
    );

    const summaryPlan = await explainAnalyze(
      client,
      'Store stock summary',
      `SELECT ib.product_id, SUM(GREATEST(ib.quantity_on_hand - ib.quantity_reserved - ib.quantity_committed, 0))
       FROM inventory_balances ib
       INNER JOIN product_lots pl ON pl.id = ib.product_lot_id
       INNER JOIN store_locations sl ON sl.id = ib.store_location_id
       WHERE sl.is_active AND (sl.is_pos_selling OR sl.store_type = 'SELLING')
         AND pl.status = 'ACTIVE' AND NOT ib.blocked AND ib.quantity_on_hand > 0
       GROUP BY ib.product_id`,
      [],
    );

    const conc = await concurrentPosLookups(pool, storeId, productId, CONCURRENCY);

    log('\n── Summary ──');
    log(`  POS lookup: ${posPlan.executionMs}ms, seq scan on balances: ${posPlan.seqScanOnBalances}`);
    log(`  FEFO: ${fefoPlan.executionMs}ms`);
    log(`  Summary: ${summaryPlan.executionMs}ms`);
    log(`  Concurrent ${CONCURRENCY}x POS avg: ${conc.avgMs.toFixed(2)}ms`);

    const pass =
      (posPlan.executionMs ?? 999) < 500 &&
      (fefoPlan.executionMs ?? 999) < 500 &&
      conc.avgMs < 200;
    log(`\nRESULT: ${pass ? 'CAPACITY BENCHMARK PASS' : 'REVIEW — latency thresholds exceeded'}`);
  } finally {
    client.release();
    await pool.end();
  }

  fs.writeFileSync(OUT, lines.join('\n') + '\n');
  log(`\nWrote ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
