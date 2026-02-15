import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: 'postgresql://postgres:postgres@localhost:5432/samplepos'
});

async function checkUsersTable() {
  try {
    // Get columns
    const columns = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      ORDER BY ordinal_position
    `);
    
    console.log('\n=== Users Table Structure ===');
    console.log('Columns:');
    columns.rows.forEach(c => console.log('  -', c.column_name));
    
    // Get sample users
    const users = await pool.query('SELECT id, email FROM users LIMIT 5');
    console.log(`\nSample users (${users.rows.length} found):`);
    users.rows.forEach(u => console.log(`  - ${u.email} (ID: ${u.id})`));
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkUsersTable();
