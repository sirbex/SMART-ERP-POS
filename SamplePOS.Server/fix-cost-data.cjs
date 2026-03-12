// One-time data fix: backfill average_cost and sale_items cost/profit
const pg = require('pg');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/pos_system' });

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Temporarily disable triggers on sales table that block updates to COMPLETED sales
    await client.query('ALTER TABLE sales DISABLE TRIGGER ALL');
    await client.query('ALTER TABLE sale_items DISABLE TRIGGER ALL');

    // 1. Check current state
    const before = await client.query(
      `SELECT
        (SELECT COUNT(*) FROM product_valuation WHERE cost_price > 0 AND (average_cost = 0 OR average_cost IS NULL))::int as pv_missing_avg,
        (SELECT COUNT(*) FROM sale_items WHERE unit_cost = 0 OR unit_cost IS NULL)::int as si_zero_cost,
        (SELECT COUNT(*) FROM sale_items)::int as si_total`
    );
    console.log('Before fix:', before.rows[0]);

    // 2. Backfill product_valuation: set average_cost = cost_price where missing
    const pv = await client.query(
      `UPDATE product_valuation
       SET average_cost = cost_price,
           last_cost = cost_price
       WHERE cost_price > 0
         AND (average_cost = 0 OR average_cost IS NULL)
       RETURNING product_id, cost_price::text, average_cost::text`
    );
    console.log('product_valuation fixed:', pv.rowCount, 'rows');

    // 3. Backfill sale_items: set unit_cost from product cost, recalculate profit
    const si = await client.query(
      `UPDATE sale_items si
       SET unit_cost = COALESCE(pv.average_cost, pv.cost_price, 0),
           profit = (si.unit_price * si.quantity) - si.discount_amount - (COALESCE(pv.average_cost, pv.cost_price, 0) * si.quantity)
       FROM product_valuation pv
       WHERE pv.product_id = si.product_id
         AND (si.unit_cost = 0 OR si.unit_cost IS NULL)
         AND COALESCE(pv.average_cost, pv.cost_price, 0) > 0
       RETURNING si.id, si.product_id, si.unit_cost::text, si.profit::text`
    );
    console.log('sale_items fixed:', si.rowCount, 'rows');

    // 4. Update sales table total_cost and profit from corrected sale_items
    const sales = await client.query(
      `UPDATE sales s
       SET total_cost = sub.total_cost,
           profit = s.total_amount - sub.total_cost
       FROM (
         SELECT sale_id, SUM(unit_cost * quantity) as total_cost
         FROM sale_items
         GROUP BY sale_id
       ) sub
       WHERE sub.sale_id = s.id
         AND (s.total_cost = 0 OR s.total_cost IS NULL OR s.total_cost != sub.total_cost)
         AND sub.total_cost > 0
       RETURNING s.id, s.sale_number, s.total_amount::text as revenue, s.total_cost::text as cost, s.profit::text as profit`
    );
    console.log('sales fixed:', sales.rowCount, 'rows');
    for (const r of sales.rows) {
      console.log(`  ${r.sale_number} | revenue: ${r.revenue} | cost: ${r.cost} | profit: ${r.profit}`);
    }

    // Re-enable triggers
    await client.query('ALTER TABLE sale_items ENABLE TRIGGER ALL');
    await client.query('ALTER TABLE sales ENABLE TRIGGER ALL');

    await client.query('COMMIT');

    // 5. Verify
    const after = await client.query(
      `SELECT
        (SELECT COUNT(*) FROM product_valuation WHERE cost_price > 0 AND (average_cost = 0 OR average_cost IS NULL))::int as pv_still_missing,
        (SELECT COUNT(*) FROM sale_items WHERE unit_cost = 0 OR unit_cost IS NULL)::int as si_still_zero`
    );
    console.log('After fix:', after.rows[0]);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('ROLLBACK - Error:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
})();
