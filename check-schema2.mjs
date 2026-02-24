import { createRequire } from 'module';
const require = createRequire(import.meta.url + '/../SamplePOS.Server/');
const pg = require('pg');
const pool = new pg.Pool({ connectionString: 'postgresql://postgres:password@localhost:5432/pos_system' });

const tables = ['ledger_transactions', 'ledger_entries', 'chart_of_accounts', 'customers', 'suppliers', 'inventory_batches'];
for (const t of tables) {
  const r = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name=$1 ORDER BY ordinal_position`, [t]);
  console.log(`\n${t}: ${r.rows.map(r => r.column_name).join(', ')}`);
}
await pool.end();
