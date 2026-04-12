const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:password@localhost:5432/pos_system' });
pool.query("UPDATE users SET failed_login_attempts = 0, lockout_until = NULL WHERE email = 'admin@samplepos.com'")
  .then(r => { console.log('Unlocked rows:', r.rowCount); pool.end(); })
  .catch(e => { console.error(e); pool.end(); });
