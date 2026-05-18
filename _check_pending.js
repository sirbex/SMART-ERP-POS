const fs = require('fs');
const { Pool } = require('/app/node_modules/pg');

const files = fs.readdirSync('/shared/sql')
  .filter(f => f.endsWith('.sql'))
  .filter(f => !/^999_rollback|^apply-|^fix_|^backfill_/i.test(f))
  .sort();

const pool = new Pool({ host: 'smarterp-postgres', database: 'pos_tenant_acme_store', user: 'postgres', password: 'password' });
pool.query('SELECT filename FROM schema_migrations ORDER BY filename').then(res => {
  const applied = new Set(res.rows.map(r => r.filename));
  const pending = files.filter(f => !applied.has(f));
  console.log('TOTAL eligible on disk:', files.length);
  console.log('Applied in DB:', applied.size);
  console.log('PENDING:', pending.length);
  pending.forEach(f => console.log('PENDING:', f));
  pool.end();
});
