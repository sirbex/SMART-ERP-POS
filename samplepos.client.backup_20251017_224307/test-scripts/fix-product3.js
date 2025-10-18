/**
 * Fix Product 3 (minute maid) - Set proper price and add inventory
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

async function fixProduct3() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('🔧 Fixing Product 3 (minute maid)...\n');

    // 1. Update the price for Product 3
    console.log('📝 Step 1: Updating price from $0.00 to $25.00');
    await client.query(`
      UPDATE inventory_items 
      SET base_price = 25.00, updated_at = NOW() 
      WHERE id = 3
    `);

    // 2. Add inventory batches for Product 3
    console.log('📦 Step 2: Adding inventory batches');
    const batchResult = await client.query(`
      INSERT INTO inventory_batches (
        inventory_item_id, batch_number, quantity, remaining_quantity, 
        unit_cost, received_date, created_at
      ) VALUES 
        (3, 'MM-001', 100, 100, 20.00, NOW(), NOW()),
        (3, 'MM-002', 75, 75, 18.00, NOW(), NOW())
      RETURNING id, batch_number, quantity, unit_cost
    `);

    console.log('✅ Created batches:');
    console.table(batchResult.rows);

    // 3. Verify the fix
    console.log('\n🔍 Step 3: Verifying the fix');
    const verifyResult = await client.query(`
      SELECT 
        i.id, i.name, i.base_price,
        COALESCE(SUM(b.remaining_quantity), 0) as total_stock,
        COUNT(b.id) as batch_count
      FROM inventory_items i
      LEFT JOIN inventory_batches b ON i.id = b.inventory_item_id AND b.remaining_quantity > 0
      WHERE i.id = 3
      GROUP BY i.id, i.name, i.base_price
    `);

    console.log('Product 3 after fix:');
    console.table(verifyResult.rows);

    await client.query('COMMIT');
    console.log('\n🎉 Product 3 fixed successfully!');

    // 4. Test the API response
    console.log('\n🧪 Step 4: Testing API response...');
    
    // Import axios for testing
    const axios = (await import('axios')).default;
    
    try {
      const itemResponse = await axios.get('http://localhost:3001/api/inventory/items');
      const product3 = itemResponse.data.find(p => p.id === 3);
      
      const stockResponse = await axios.get('http://localhost:3001/api/inventory/products/3/stock');
      
      console.log('✅ API Test Results:');
      console.log('Price from /inventory/items:', product3?.price);
      console.log('Stock from /products/3/stock:', stockResponse.data.totalStock);
      
    } catch (apiError) {
      console.log('⚠️  API test failed (server may need restart):', apiError.message);
    }

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Fix failed:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

fixProduct3();