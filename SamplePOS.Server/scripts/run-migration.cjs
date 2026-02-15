require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function runMigration() {
  try {
    const sqlPath = path.join(__dirname, '..', '..', 'shared', 'sql', '011_add_pricing_constraints.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('Running migration: 011_add_pricing_constraints.sql');
    await pool.query(sql);
    console.log('✅ Migration completed successfully');
    console.log('   - Added min_price column');
    console.log('   - Added max_discount_percentage column');
    
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
