import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: 'postgresql://postgres:postgres@localhost:5432/samplepos'
});

async function listTables() {
  try {
    const result = await pool.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      ORDER BY tablename
    `);
    
    console.log('\n=== Tables in Database ===');
    result.rows.forEach(row => {
      console.log(`  - ${row.tablename}`);
    });
    console.log(`\nTotal: ${result.rows.length} tables\n`);
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

listTables();
