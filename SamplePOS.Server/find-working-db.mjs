import pkg from 'pg';
const { Pool } = pkg;

async function findWorkingDatabase() {
  console.log('\n=== Finding Your Working Database ===\n');
  
  // Check pos_system (password: "password")
  console.log('1. Checking pos_system database:');
  try {
    const pool1 = new Pool({
      connectionString: 'postgresql://postgres:password@localhost:5432/pos_system'
    });
    
    const user = await pool1.query("SELECT email FROM users WHERE email = 'test@test.com'");
    const inventory = await pool1.query('SELECT COUNT(*) FROM inventory_items');
    const transactions = await pool1.query("SELECT COUNT(*) FROM transactions").catch(() => ({ rows: [{ count: 'N/A - table does not exist' }] }));
    
    console.log(`   User test@test.com: ${user.rows.length > 0 ? '✅ EXISTS' : '❌ NOT FOUND'}`);
    console.log(`   Inventory items: ${inventory.rows[0].count}`);
    console.log(`   Transactions: ${transactions.rows[0].count}`);
    
    if (user.rows.length > 0 && parseInt(inventory.rows[0].count) > 0) {
      console.log('\n   🎯 THIS IS YOUR WORKING DATABASE!\n');
    }
    
    await pool1.end();
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
  
  // Check samplepos (password: "postgres")
  console.log('2. Checking samplepos database:');
  try {
    const pool2 = new Pool({
      connectionString: 'postgresql://postgres:postgres@localhost:5432/samplepos'
    });
    
    const user = await pool2.query("SELECT email FROM users WHERE email = 'test@test.com'");
    const inventory = await pool2.query('SELECT COUNT(*) FROM inventory_items');
    const transactions = await pool2.query('SELECT COUNT(*) FROM transactions');
    
    console.log(`   User test@test.com: ${user.rows.length > 0 ? '✅ EXISTS' : '❌ NOT FOUND'}`);
    console.log(`   Inventory items: ${inventory.rows[0].count}`);
    console.log(`   Transactions: ${transactions.rows[0].count}`);
    
    if (user.rows.length > 0 && parseInt(inventory.rows[0].count) > 0) {
      console.log('\n   🎯 THIS IS YOUR WORKING DATABASE!\n');
    }
    
    await pool2.end();
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
  
  console.log('\n');
}

findWorkingDatabase();
