// Test the inventory valuation query directly
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://postgres:postgres@localhost:5432/samplepos'
});

const query = `
  WITH batch_quantities AS (
    SELECT 
      b.id as batch_id,
      b.inventory_item_id,
      b.batch_number,
      b.received_date,
      b.unit_cost,
      b.quantity as initial_quantity,
      b.expiry_date,
      b.remaining_quantity
    FROM inventory_batches b
    WHERE b.received_date <= $1
      AND b.remaining_quantity > 0
  ),
  product_valuation AS (
    SELECT 
      p.id as product_id,
      p.name as product_name,
      p.sku,
      p.category,
      SUM(bq.remaining_quantity) as total_quantity,
      AVG(bq.unit_cost) as unit_cost
    FROM inventory_items p
    INNER JOIN batch_quantities bq ON bq.inventory_item_id = p.id
    GROUP BY p.id, p.name, p.sku, p.category
  )
  SELECT 
    product_id,
    product_name,
    sku,
    category,
    total_quantity,
    unit_cost,
    (total_quantity * unit_cost) as total_value
  FROM product_valuation
  ORDER BY total_value DESC
`;

try {
  console.log('Running query...');
  const result = await pool.query(query, [new Date('2025-11-07')]);
  console.log('✅ Success! Rows:', result.rows.length);
  console.log(JSON.stringify(result.rows, null, 2));
  process.exit(0);
} catch (error) {
  console.error('❌ Failed:', error.message);
  process.exit(1);
}
