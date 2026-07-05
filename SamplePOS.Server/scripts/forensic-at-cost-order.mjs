#!/usr/bin/env node
/**
 * Forensic: why BELOW_ALLOCATED_COST fired for an AT_COST order line.
 *
 * Usage:
 *   node SamplePOS.Server/scripts/forensic-at-cost-order.mjs \
 *     --product ebadc2e2-6cda-4727-a780-65006d6fef86 \
 *     --order 806f5df6-1cfb-44fa-a96e-c4d32926bef3
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(path.join(path.dirname(fileURLToPath(import.meta.url)), '../package.json'));
const pg = require('pg');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const ENV_FILE = path.join(ROOT, '.env.proof.production');

function loadEnv() {
  if (!fs.existsSync(ENV_FILE)) {
    console.error('Missing .env.proof.production');
    process.exit(2);
  }
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : null;
}

loadEnv();
const url = process.env.HENBER_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error('HENBER_DATABASE_URL not set');
  process.exit(2);
}

const productId = arg('product');
const orderId = arg('order');
const simulateQty = arg('qty') ? Number(arg('qty')) : null;
const simulateUnitPrice = arg('unit-price') ? Number(arg('unit-price')) : null;
if (!productId) {
  console.error('Usage: --product <uuid> [--order <uuid>] [--qty N] [--unit-price N]');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url });

async function main() {
  console.log('═'.repeat(72));
  console.log(' AT_COST ORDER FORENSIC (read-only)');
  console.log('═'.repeat(72));
  console.log(`Product: ${productId}`);
  if (orderId) console.log(`Order:   ${orderId}`);
  console.log('');

  const prod = await pool.query(
    `SELECT p.id, p.name, p.sku, pv.cost_price, pv.average_cost, pv.selling_price, pv.costing_method,
            COALESCE(p.min_days_before_expiry_sale, 0) AS min_days_before_expiry_sale
     FROM products p
     LEFT JOIN product_valuation pv ON pv.product_id = p.id
     WHERE p.id = $1`,
    [productId],
  );
  console.log('── Product master ──');
  console.table(prod.rows);

  const uoms = await pool.query(
    `SELECT pu.uom_id, u.name, u.symbol, pu.conversion_factor, pu.is_default
     FROM product_uoms pu
     JOIN uoms u ON u.id = pu.uom_id
     WHERE pu.product_id = $1
     ORDER BY pu.is_default DESC, pu.conversion_factor`,
    [productId],
  );
  console.log('\n── Product UoMs ──');
  console.table(uoms.rows);

  const batches = await pool.query(
    `SELECT id, batch_number, remaining_quantity, quantity, cost_price, received_date, expiry_date, status, notes
     FROM inventory_batches
     WHERE product_id = $1 AND status = 'ACTIVE' AND remaining_quantity > 0
     ORDER BY expiry_date ASC NULLS LAST, received_date ASC`,
    [productId],
  );
  console.log('\n── Active inventory_batches (FEFO order) ──');
  console.table(batches.rows);

  async function simulateLine(sellQty, submitted) {
    const factor = 1;
    const baseQty = sellQty * factor;
    const lineRev = sellQty * submitted;

    console.log('\n── Simulated FEFO walk (same order as posting) ──');
    console.log(`Selling qty: ${sellQty}, base_qty: ${baseQty}, factor: ${factor}`);
    console.log(`Submitted unit: ${submitted}, line revenue: ${lineRev}`);

    let remaining = baseQty;
    let totalCost = 0;
    const layers = [];
    for (const b of batches.rows) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, Number(b.remaining_quantity));
      const layerCost = take * Number(b.cost_price);
      totalCost += layerCost;
      layers.push({
        batch: b.batch_number,
        take,
        cost_price: b.cost_price,
        received_date: b.received_date,
        layer_total: layerCost,
      });
      remaining -= take;
    }
    console.table(layers);

    const masterCost = Number(prod.rows[0]?.cost_price || 0);
    const avgCost = Number(prod.rows[0]?.average_cost || 0);
    const shortfallUnit = avgCost > 0 ? avgCost : masterCost;
    if (remaining > 0.001) {
      const shortfallCost = remaining * shortfallUnit;
      console.log(`SHORTFALL: ${remaining} base @ ${shortfallUnit} = ${shortfallCost}`);
      totalCost += shortfallCost;
    }

    const costPerSelling = sellQty > 0 ? totalCost / sellQty : 0;
    console.log('\n── Allocation summary ──');
    console.log({
      totalAllocatedCost: totalCost,
      costPerSellingUnit: costPerSelling,
      submittedUnitPrice: submitted,
      lineRevenue: lineRev,
      belowCost: lineRev + 0.01 < totalCost,
      masterCostPerBase: masterCost,
      averageCost: avgCost,
    });
  }

  if (simulateQty != null && simulateUnitPrice != null) {
    await simulateLine(simulateQty, simulateUnitPrice);
  }

  if (orderId) {
    const order = await pool.query(
      `SELECT o.id, o.order_number, o.customer_id, o.status, o.total_amount,
              c.name AS customer_name, c.pricing_mode
       FROM orders o
       LEFT JOIN customers c ON c.id = o.customer_id
       WHERE o.id = $1`,
      [orderId],
    );
    console.log('\n── Order header ──');
    console.table(order.rows);

    const items = await pool.query(
      `SELECT oi.*, u.name AS uom_name, u.symbol
       FROM order_items oi
       LEFT JOIN uoms u ON u.id = oi.uom_id
       WHERE oi.order_id = $1`,
      [orderId],
    );
    console.log('\n── Order items ──');
    console.table(items.rows);

    for (const item of items.rows) {
      if (item.product_id !== productId) continue;
      const sellQty = Number(item.quantity);
      const submitted = Number(item.unit_price);
      await simulateLine(sellQty, submitted);
    }
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
