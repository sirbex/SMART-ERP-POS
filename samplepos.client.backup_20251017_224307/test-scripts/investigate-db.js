/**
 * Database Investigation Script
 * Check the actual data stored in PostgreSQL
 */

import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'samplepos',
  password: 'password',
  port: 5432,
});

async function investigateDatabase() {
  try {
    console.log('🔍 Investigating Database Data...\n');

    // Check inventory_items table
    console.log('=== INVENTORY_ITEMS TABLE ===');
    const itemsResult = await pool.query(`
      SELECT id, sku, name, base_price, category, is_active, reorder_level, metadata, created_at, updated_at 
      FROM inventory_items 
      ORDER BY id
    `);
    console.log('Items in database:');
    console.table(itemsResult.rows);

    // Check inventory_batches table
    console.log('\n=== INVENTORY_BATCHES TABLE ===');
    const batchesResult = await pool.query(`
      SELECT id, inventory_item_id, batch_number, quantity, remaining_quantity, 
             unit_cost, received_date, expiry_date, created_at
      FROM inventory_batches 
      ORDER BY inventory_item_id, created_at
    `);
    console.log('Batches in database:');
    console.table(batchesResult.rows);

    // Summary by product
    console.log('\n=== SUMMARY BY PRODUCT ===');
    const summaryResult = await pool.query(`
      SELECT 
        i.id,
        i.name,
        i.sku,
        i.base_price,
        COALESCE(SUM(b.remaining_quantity), 0) as total_quantity,
        COUNT(CASE WHEN b.remaining_quantity > 0 THEN b.id END) as active_batch_count,
        AVG(CASE WHEN b.remaining_quantity > 0 THEN b.unit_cost END) as avg_unit_cost
      FROM inventory_items i
      LEFT JOIN inventory_batches b ON i.id = b.inventory_item_id
      GROUP BY i.id, i.name, i.sku, i.base_price
      ORDER BY i.id
    `);
    console.log('Product Summary:');
    console.table(summaryResult.rows);

    console.log('\n🎉 Database investigation complete!');

  } catch (error) {
    console.error('❌ Database investigation failed:', error);
  } finally {
    await pool.end();
  }
}

investigateDatabase();