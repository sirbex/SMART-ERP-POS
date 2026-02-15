import pkg from 'pg';
const { Pool } = pkg;

async function investigatePosSystem() {
  const pool = new Pool({
    connectionString: 'postgresql://postgres:password@localhost:5432/pos_system'
  });
  
  try {
    console.log('\n=== pos_system Database Investigation ===\n');
    
    // Check for test user
    const user = await pool.query("SELECT email, full_name FROM users WHERE email = 'test@test.com'");
    console.log('1. User test@test.com:', user.rows.length > 0 ? '✅ EXISTS' : '❌ NOT FOUND');
    if (user.rows.length > 0) {
      console.log(`   Name: ${user.rows[0].full_name || 'N/A'}`);
    }
    
    // List all tables
    const tables = await pool.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' 
      ORDER BY tablename
    `);
    console.log(`\n2. Tables in pos_system (${tables.rows.length} total):`);
    
    // Check for inventory-related tables
    const inventoryTables = tables.rows.filter(t => 
      t.tablename.includes('inventory') || 
      t.tablename.includes('product') || 
      t.tablename.includes('item')
    );
    
    console.log('\n   Inventory-related tables:');
    for (const table of inventoryTables) {
      const count = await pool.query(`SELECT COUNT(*) FROM ${table.tablename}`);
      console.log(`   - ${table.tablename}: ${count.rows[0].count} rows`);
    }
    
    // Check for transaction/sales tables
    const salesTables = tables.rows.filter(t => 
      t.tablename.includes('transaction') || 
      t.tablename.includes('sale') || 
      t.tablename.includes('order')
    );
    
    console.log('\n   Sales/Transaction tables:');
    for (const table of salesTables) {
      const count = await pool.query(`SELECT COUNT(*) FROM ${table.tablename}`);
      console.log(`   - ${table.tablename}: ${count.rows[0].count} rows`);
    }
    
    console.log('\n');
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

investigatePosSystem();
