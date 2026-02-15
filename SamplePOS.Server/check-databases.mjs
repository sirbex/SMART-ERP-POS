import pkg from 'pg';
const { Pool } = pkg;

async function checkBothDatabases() {
  console.log('\n=== Checking Database Connections ===\n');
  
  // Check pos_system database (from .env)
  console.log('1. Checking pos_system database:');
  try {
    const pool1 = new Pool({
      connectionString: 'postgresql://postgres:password@localhost:5432/pos_system'
    });
    
    const tables1 = await pool1.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' 
      ORDER BY tablename
    `);
    
    console.log(`   ✅ Connected! Found ${tables1.rows.length} tables`);
    
    // Check for transactions table
    const txCount = await pool1.query('SELECT COUNT(*) FROM transactions');
    console.log(`   📊 transactions table: ${txCount.rows[0].count} rows`);
    
    await pool1.end();
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
  
  // Check samplepos database
  console.log('\n2. Checking samplepos database:');
  try {
    const pool2 = new Pool({
      connectionString: 'postgresql://postgres:postgres@localhost:5432/samplepos'
    });
    
    const tables2 = await pool2.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' 
      ORDER BY tablename
    `);
    
    console.log(`   ✅ Connected! Found ${tables2.rows.length} tables`);
    
    // Check for transactions table
    const txCount = await pool2.query('SELECT COUNT(*) FROM transactions');
    console.log(`   📊 transactions table: ${txCount.rows[0].count} rows`);
    
    await pool2.end();
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
  
  console.log('\n');
}

checkBothDatabases();
