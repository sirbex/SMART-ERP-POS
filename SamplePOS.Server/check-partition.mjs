import pg from 'pg';

const pool = new pg.Pool({
  connectionString: 'postgresql://postgres:password@localhost:5432/pos_system'
});

try {
  const r1 = await pool.query("SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'product_inventory')");
  console.log('product_inventory exists:', r1.rows[0].exists);

  const r2 = await pool.query("SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'product_valuation')");
  console.log('product_valuation exists:', r2.rows[0].exists);

  const r3 = await pool.query("SELECT tgname FROM pg_trigger WHERE tgname = 'trg_product_create_children'");
  console.log('trigger exists:', r3.rows.length > 0);

  // Check if the columns still exist on products table
  const r4 = await pool.query(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'products' AND column_name IN ('cost_price','selling_price','quantity_on_hand','reorder_level','costing_method','average_cost','last_cost')
    ORDER BY column_name
  `);
  console.log('Volatile columns on products table:', r4.rows.map(r => r.column_name));

  // Try to insert a test product and see what happens
  console.log('\n--- Attempting test product INSERT ---');
  const testResult = await pool.query(`
    INSERT INTO products (sku, name, cost_price, selling_price, costing_method, reorder_level)
    VALUES ('TEST-DELETE-ME-' || gen_random_uuid()::text, 'Test Product Delete Me', 100, 200, 'FIFO', 5)
    RETURNING id, product_number, name, cost_price, selling_price, quantity_on_hand, reorder_level
  `);
  console.log('INSERT returned:', testResult.rows[0]);

  // Check if child rows were created
  const prodId = testResult.rows[0].id;
  const inv = await pool.query('SELECT * FROM product_inventory WHERE product_id = $1', [prodId]);
  console.log('product_inventory row:', inv.rows[0]);

  const val = await pool.query('SELECT * FROM product_valuation WHERE product_id = $1', [prodId]);
  console.log('product_valuation row:', val.rows[0]);

  // Clean up
  await pool.query('DELETE FROM product_valuation WHERE product_id = $1', [prodId]);
  await pool.query('DELETE FROM product_inventory WHERE product_id = $1', [prodId]);
  await pool.query('DELETE FROM products WHERE id = $1', [prodId]);
  console.log('\nTest product cleaned up.');

} catch (err) {
  console.error('ERROR:', err.message);
  console.error('Detail:', err.detail);
  console.error('Code:', err.code);
} finally {
  await pool.end();
}
