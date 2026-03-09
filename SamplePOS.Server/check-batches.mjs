import pg from 'pg';
const pool = new pg.Pool({ connectionString: 'postgresql://postgres:password@localhost:5432/pos_system' });

async function main() {
  const res = await pool.query(
    'SELECT id, batch_number, remaining_quantity, status, expiry_date FROM inventory_batches WHERE product_id = $1',
    ['03584d70-4f63-4b0c-a9bf-b9030e1167f0']
  );
  console.log('Batches for KAMAGRA:', JSON.stringify(res.rows, null, 2));

  const res2 = await pool.query(
    'SELECT quantity_on_hand, reorder_level FROM product_inventory WHERE product_id = $1',
    ['03584d70-4f63-4b0c-a9bf-b9030e1167f0']
  );
  console.log('Product inventory:', JSON.stringify(res2.rows, null, 2));

  const res3 = await pool.query(
    'SELECT min_days_before_expiry_sale, track_expiry FROM products WHERE id = $1',
    ['03584d70-4f63-4b0c-a9bf-b9030e1167f0']
  );
  console.log('Product expiry config:', JSON.stringify(res3.rows, null, 2));

  // Test the exact query used in salesService
  const res4 = await pool.query(
    `SELECT id, remaining_quantity, expiry_date, cost_price
     FROM inventory_batches
     WHERE product_id = $1 AND remaining_quantity > 0 AND status = 'ACTIVE'
     ORDER BY expiry_date ASC NULLS LAST, received_date ASC`,
    ['03584d70-4f63-4b0c-a9bf-b9030e1167f0']
  );
  console.log('Batches from sales query (no filter):', JSON.stringify(res4.rows, null, 2));

  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
