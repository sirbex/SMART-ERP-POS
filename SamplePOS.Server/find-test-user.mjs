import pkg from 'pg';
const { Pool } = pkg;

async function findTestUser() {
  console.log('\n=== Searching for test@test.com user ===\n');
  
  // Check pos_system database
  console.log('1. Checking pos_system database:');
  try {
    const pool1 = new Pool({
      connectionString: 'postgresql://postgres:password@localhost:5432/pos_system'
    });
    
    const user = await pool1.query("SELECT id, email FROM users WHERE email = 'test@test.com'");
    if (user.rows.length > 0) {
      console.log('   ✅ FOUND! test@test.com exists in pos_system');
      console.log(`   User ID: ${user.rows[0].id}`);
    } else {
      console.log('   ❌ Not found in pos_system');
    }
    
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
    
    const user = await pool2.query("SELECT id, email FROM users WHERE email = 'test@test.com'");
    if (user.rows.length > 0) {
      console.log('   ✅ FOUND! test@test.com exists in samplepos');
      console.log(`   User ID: ${user.rows[0].id}`);
    } else {
      console.log('   ❌ Not found in samplepos');
    }
    
    await pool2.end();
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
  
  console.log('\n');
}

findTestUser();
