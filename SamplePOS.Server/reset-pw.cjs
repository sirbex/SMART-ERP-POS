const bcrypt = require('bcrypt');
const { Pool } = require('pg');

async function main() {
  const hash = await bcrypt.hash('Test1234!', 12);
  const pool = new Pool({ connectionString: 'postgresql://postgres:password@localhost:5432/pos_system' });
  await pool.query('UPDATE users SET password_hash = $1, failed_login_attempts = 0 WHERE email = $2', [hash, 'manager@test.com']);
  const r = await pool.query('SELECT email, substring(password_hash, 1, 20) as h FROM users WHERE email = $1', ['manager@test.com']);
  console.log('Updated:', r.rows[0]);
  await pool.end();
}
main().catch(console.error);
