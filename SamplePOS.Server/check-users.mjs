import pkg from 'pg';
const { Pool } = pkg;

async function checkUsers() {
  console.log('\n=== Checking Users in Both Databases ===\n');
  
  // Check samplepos database
  console.log('1. samplepos database:');
  try {
    const pool = new Pool({
      connectionString: 'postgresql://postgres:postgres@localhost:5432/samplepos'
    });
    
    const users = await pool.query('SELECT id, email, name FROM users LIMIT 5');
    console.log(`   Found ${users.rows.length} users:`);
    users.rows.forEach(user => {
      console.log(`     - ${user.email} (${user.name})`);
    });
    
    await pool.end();
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
  
  // Check pos_system database  
  console.log('\n2. pos_system database:');
  try {
    const pool = new Pool({
      connectionString: 'postgresql://postgres:password@localhost:5432/pos_system'
    });
    
    const users = await pool.query('SELECT id, email, name FROM users LIMIT 5');
    console.log(`   Found ${users.rows.length} users:`);
    users.rows.forEach(user => {
      console.log(`     - ${user.email} (${user.name})`);
    });
    
    await pool.end();
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
  
  console.log('\n');
}

checkUsers();
