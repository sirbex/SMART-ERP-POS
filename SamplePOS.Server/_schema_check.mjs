import pkg from 'pg'; const { Pool } = pkg;
const pool = new Pool({ connectionString: 'postgresql://postgres:password@localhost:5432/pos_system' });
const res = await pool.query("SELECT relname FROM pg_stat_user_tables ORDER BY relname");
console.log(res.rows.map(r => r.relname).join('\n'));
await pool.end();
