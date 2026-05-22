#!/usr/bin/env node
/**
 * Local proof: AT_COST charge = FEFO issue cost per base (not master cost_price).
 *
 * Usage:
 *   node scripts/proof-at-cost-issue-price.mjs
 *   node scripts/proof-at-cost-issue-price.mjs SALE-2026-0007
 *
 * Requires DATABASE_URL (default pos_system) and built/TSX runtime.
 */
import pg from 'pg';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const saleNumber = process.argv[2] || 'SALE-2026-0007';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/pos_system',
});

function fail(msg) {
  console.error('\nFAIL:', msg);
  process.exit(1);
}

function ok(msg) {
  console.log('OK:', msg);
}

/** Run resolveAtCostPerBaseUnit via tsx (uses real module + Money rounding). */
function resolveIssuePriceViaTsx(productId, baseQty, valuation) {
  const r = spawnSync(
    'npx',
    ['tsx', 'scripts/proof-at-cost-resolve.ts', productId, String(baseQty)],
    {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf8',
      shell: true,
      env: { ...process.env, VALUATION_JSON: JSON.stringify(valuation) },
    },
  );
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    fail('tsx resolveAtCostPerBaseUnit failed');
  }
  const lines = (r.stdout || '').trim().split('\n').filter((l) => l.startsWith('{'));
  const line = lines[lines.length - 1];
  if (!line) fail('No JSON from proof-at-cost-resolve.ts');
  return JSON.parse(line);
}

const c = await pool.connect();
let exitCode = 0;
try {
  const sale = await c.query(
    `SELECT s.id, s.sale_number, cu.id AS customer_id, cu.name, pg.pricing_mode
     FROM sales s
     JOIN customers cu ON cu.id = s.customer_id
     LEFT JOIN price_groups pg ON pg.id = cu.price_group_id
     WHERE s.sale_number = $1`,
    [saleNumber],
  );
  const s = sale.rows[0];
  if (!s) fail(`Sale not found: ${saleNumber}`);
  if (s.pricing_mode !== 'AT_COST') fail(`Sale ${saleNumber} customer is not AT_COST`);

  const items = await c.query(
    `SELECT product_id, product_name, quantity, unit_price, unit_cost, conversion_factor, base_qty
     FROM sale_items WHERE sale_id = $1`,
    [s.id],
  );
  const line = items.rows[0];
  if (!line) fail('No sale lines');

  const baseQty = Number(line.base_qty ?? line.quantity);
  const conv = Number(line.conversion_factor ?? 1);
  const soldUnitPrice = Number(line.unit_price);
  const fifoUnitCost = Number(line.unit_cost);

  const valRes = await c.query(
    `SELECT COALESCE(pv.selling_price, p.selling_price) AS selling_price,
            COALESCE(pv.cost_price, p.cost_price) AS cost_price,
            COALESCE(pv.average_cost, 0) AS average_cost,
            COALESCE(pv.costing_method, 'FIFO') AS costing_method
     FROM products p
     LEFT JOIN product_valuation pv ON pv.product_id = p.id
     WHERE p.id = $1`,
    [line.product_id],
  );
  const val = valRes.rows[0];
  const masterCost = Number(val.cost_price);
  const masterPackAtCost = masterCost * conv;

  const fefo = await c.query(
    `SELECT remaining_quantity::text, cost_price::text
     FROM inventory_batches
     WHERE product_id = $1 AND remaining_quantity > 0 AND status = 'ACTIVE'
       AND (expiry_date IS NULL OR expiry_date > CURRENT_DATE)
     ORDER BY expiry_date ASC NULLS LAST, received_date ASC`,
    [line.product_id],
  );

  let remaining = baseQty;
  let total = 0;
  for (const b of fefo.rows) {
    if (remaining <= 0) break;
    const avail = Number(b.remaining_quantity);
    const take = Math.min(remaining, avail);
    total += take * Number(b.cost_price);
    remaining -= take;
  }
  const expectedPerBase = baseQty > 0 ? Math.round(total / baseQty) : masterCost;
  const expectedPackPrice = expectedPerBase * conv;

  const valuation = {
    sellingPrice: String(val.selling_price),
    costPrice: String(val.cost_price),
    averageCost: String(val.average_cost),
    costingMethod: val.costing_method,
  };

  console.log('\n=== AT_COST issue-price proof ===');
  console.log('Sale:', saleNumber, '| Customer:', s.name);
  console.log('Product:', line.product_name);
  console.log('Base qty:', baseQty, '| Conv factor:', conv);
  console.log('Master cost/base:', masterCost, '| Old AT_COST pack (master×conv):', masterPackAtCost);
  console.log('FEFO layer total / base:', total, '/', baseQty, '→ per base:', expectedPerBase);
  console.log('Expected pack charge (issue×conv):', expectedPackPrice);
  console.log('Historical sale: charged', soldUnitPrice, '| FIFO COGS (pack)', fifoUnitCost);

  const resolved = resolveIssuePriceViaTsx(line.product_id, baseQty, valuation);
  const enginePack = resolved.unitPricePerBase * conv;

  console.log('\nEngine resolveAtCostPerBaseUnit:', resolved);
  console.log('Engine pack price:', enginePack);

  if (Math.abs(resolved.unitPricePerBase - expectedPerBase) > 0.01) {
    fail(`Engine per-base ${resolved.unitPricePerBase} != FEFO expected ${expectedPerBase}`);
  }
  ok(`Issue cost per base = ${resolved.unitPricePerBase} (matches FEFO walk)`);

  if (Math.abs(enginePack - fifoUnitCost) > 0.02) {
    fail(`Engine pack ${enginePack} != sale FIFO unit_cost ${fifoUnitCost}`);
  }
  ok(`Engine pack price matches sale FIFO COGS (${fifoUnitCost})`);

  if (Math.abs(soldUnitPrice - masterPackAtCost) < 0.02 && Math.abs(soldUnitPrice - enginePack) > 0.02) {
    ok('Historical sale used master×conv (bug we fixed); new sales would charge ' + enginePack);
  } else if (Math.abs(soldUnitPrice - enginePack) < 0.02) {
    ok('Sale already charged at issue cost');
  }

  if (Math.abs(masterPackAtCost - enginePack) < 0.02) {
    console.warn('\nWARN: Master pack price equals issue price — proof is weak; use a product with mixed batch costs.');
  }

  console.log('\n=== PASS: AT_COST issue-cost pricing aligns with FEFO COGS ===\n');
} catch (e) {
  console.error(e);
  exitCode = 1;
} finally {
  c.release();
  await pool.end();
  process.exit(exitCode);
}
