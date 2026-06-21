#!/usr/bin/env node
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'SamplePOS.Server', 'package.json'));
const pg = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/postgres';
const pool = new pg.Pool({ connectionString: DATABASE_URL });

async function dropDb(name) {
  await pool.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [name],
  );
  await pool.query(`DROP DATABASE IF EXISTS ${name.replace(/[^a-z0-9_]/gi, '')}`);
  console.log('dropped', name);
}

async function main() {
  const { rows } = await pool.query(
    `SELECT datname FROM pg_database WHERE datname LIKE 'pos_tenant_proof%' OR datname = 'pos_template'`,
  );
  for (const r of rows) await dropDb(r.datname);

  const master = new pg.Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/pos_system',
  });
  await master.query(`DELETE FROM tenants WHERE slug LIKE 'proof-%'`);
  console.log('cleaned tenant registry');
  await master.end();
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
