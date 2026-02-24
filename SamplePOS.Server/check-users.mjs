import pkg from 'pg';
const { Pool } = pkg;
const pool = new Pool({ connectionString: 'postgresql://postgres:password@localhost:5432/pos_system' });

const cols = await pool.query(`SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'users' ORDER BY ordinal_position`);
console.log('=== USERS TABLE COLUMNS ===');
cols.rows.forEach(r => console.log(`  ${r.column_name} (${r.data_type}) default=${r.column_default || 'none'}`));

const nameCheck = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name IN ('first_name', 'last_name', 'full_name')`);
console.log('\n=== NAME COLUMNS PRESENT ===');
nameCheck.rows.forEach(r => console.log(`  ${r.column_name}`));

const users = await pool.query(`SELECT email, full_name, role FROM users ORDER BY created_at`);
console.log('\n=== ALL USERS ===');
console.table(users.rows);

await pool.end();
