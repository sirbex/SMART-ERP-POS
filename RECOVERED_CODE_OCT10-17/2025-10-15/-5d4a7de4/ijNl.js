/**
 * Database Initialization Script
 * Run this to initialize the PostgreSQL database with all required tables
 */

const { pool } = require('./pool');
const fs = require('fs');
const path = require('path');

async function initializeDatabase() {
  console.log('🚀 Starting database initialization...\n');

  try {
    // Test connection first
    console.log('📡 Testing database connection...');
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() as now, version() as version');
    console.log('✅ Connected to PostgreSQL');
    console.log(`   Time: ${result.rows[0].now}`);
    console.log(`   Version: ${result.rows[0].version.split(',')[0]}\n`);

    // Read schema file
    console.log('📄 Reading schema file...');
    const schemaPath = path.join(__dirname, '../../../src/db/schema.sql');
    
    if (!fs.existsSync(schemaPath)) {
      throw new Error(`Schema file not found at: ${schemaPath}`);
    }

    const schema = fs.readFileSync(schemaPath, 'utf8');
    console.log('✅ Schema file loaded\n');

    // Execute schema
    console.log('🔨 Creating tables and indexes...');
    
    // Split schema into statements and execute one by one
    const statements = schema
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    for (const statement of statements) {
      try {
        await client.query(statement + ';');
      } catch (error) {
        // Ignore "already exists" errors
        if (!error.message.includes('already exists')) {
          throw error;
        }
      }
    }
    
    console.log('✅ Database schema created successfully\n');

    // Verify tables were created
    console.log('✔️  Verifying tables...');
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    console.log(`   Found ${tables.rows.length} tables:`);
    tables.rows.forEach(row => {
      console.log(`   - ${row.table_name}`);
    });

    client.release();

    console.log('\n🎉 Database initialization completed successfully!');
    console.log('\n📝 Next steps:');
    console.log('   1. Server is ready to accept connections');
    console.log('   2. You can now create products and process transactions');
    console.log('   3. For Multi-UOM features, run the Multi-UOM migrations:');
    console.log('      npx sequelize-cli db:migrate');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Database initialization failed:');
    console.error(error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.error('\n💡 PostgreSQL is not running or cannot be reached.');
      console.error('   Please ensure PostgreSQL is installed and running.');
      console.error('   Default connection: localhost:5432');
    } else if (error.code === '3D000') {
      console.error('\n💡 Database does not exist.');
      console.error('   Please create the database first:');
      console.error('   CREATE DATABASE samplepos;');
    } else if (error.code === '28P01') {
      console.error('\n💡 Authentication failed.');
      console.error('   Please check your database credentials in .env file');
    }

    process.exit(1);
  }
}

// Run initialization
initializeDatabase();
