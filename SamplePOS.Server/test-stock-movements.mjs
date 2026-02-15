import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: 'postgresql://postgres:postgres@localhost:5432/samplepos'
});

async function checkStockMovements() {
  try {
    // Check schema
    const schema = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'stock_movements' 
      ORDER BY ordinal_position
    `);
    console.log('=== Stock Movements Schema ===');
    console.log(JSON.stringify(schema.rows, null, 2));

    // Check row count
    const count = await pool.query('SELECT COUNT(*) FROM stock_movements');
    console.log('\n=== Row Count ===');
    console.log(count.rows[0].count);

    // Check what product_id references
    const refs = await pool.query(`
      SELECT 
        kcu.column_name, 
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name 
      FROM information_schema.table_constraints AS tc 
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' 
        AND tc.table_name='stock_movements'
        AND kcu.column_name = 'product_id'
    `);
    console.log('\n=== Foreign Key for product_id ===');
    console.log(JSON.stringify(refs.rows, null, 2));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkStockMovements();
