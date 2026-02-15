require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function checkColumn() {
  try {
    const result = await pool.query(`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'products'
      ORDER BY ordinal_position;
    `);
    
    console.log('Products table columns:');
    console.log('=======================');
    result.rows.forEach(row => {
      console.log(`${row.column_name.padEnd(25)} ${row.data_type.padEnd(20)} default: ${row.column_default || 'NULL'}`);
    });
    
    const hasIsActive = result.rows.some(row => row.column_name === 'is_active');
    console.log('\n');
    console.log(hasIsActive ? '✅ is_active column EXISTS' : '❌ is_active column MISSING');
    
  } catch (err) {
    console.error('❌ Query failed:', err.message);
  } finally {
    await pool.end();
  }
}

checkColumn();
