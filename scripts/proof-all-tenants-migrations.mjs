#!/usr/bin/env node
/**
 * Post-deploy: verify every discovered tenant DB has the same latest schema_migrations.
 * Run ON THE SERVER (or anywhere with docker access to postgres).
 *
 *   POSTGRES_CONTAINER=samplepos-postgres node scripts/proof-all-tenants-migrations.mjs
 */
import { execSync } from 'node:child_process';

const CONTAINER = process.env.POSTGRES_CONTAINER || 'samplepos-postgres';
const SQL_DIR = process.env.SQL_DIR || 'shared/sql';

let pass = 0;
let fail = 0;
function ok(m) {
  pass++;
  console.log(`  PASS  ${m}`);
}
function bad(m, d = '') {
  fail++;
  console.error(`  FAIL  ${m}${d ? ` — ${d}` : ''}`);
}

function psql(db, sql) {
  const args = ['exec', CONTAINER, 'psql', '-U', 'postgres', '-d', db, '-t', '-A', '-c', sql];
  try {
    return execSync('docker', args, { encoding: 'utf8' }).trim();
  } catch (e) {
    return null;
  }
}

function psqlList(sql) {
  const out = psql('postgres', sql);
  if (out == null) return null;
  return out.split('\n').map((s) => s.trim()).filter(Boolean);
}

console.log('\n=== All-tenant migration parity proof ===');
console.log(`Container: ${CONTAINER}\n`);

const discovered = psqlList(
  `SELECT datname FROM pg_database WHERE datistemplate = false AND (datname IN ('pos_system','pos_template') OR datname LIKE 'pos_tenant_%') ORDER BY 1`,
);
if (!discovered?.length) {
  bad('Discover databases', 'docker psql failed — is POSTGRES_CONTAINER correct?');
  process.exit(1);
}
ok(`Discovered ${discovered.length} database(s)`, discovered.join(', '));

const registry =
  discovered.includes('pos_system') &&
  psqlList(
    `SELECT database_name FROM tenants WHERE status IS DISTINCT FROM 'DELETED' AND database_name IS NOT NULL ORDER BY 1`,
  );
if (registry?.length) {
  for (const reg of registry) {
    if (!discovered.includes(reg)) {
      bad(`Registry DB exists in tenants table`, `${reg} missing on postgres`);
    }
  }
}

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const sqlFiles = fs
  .readdirSync(path.join(root, SQL_DIR))
  .filter((f) => f.endsWith('.sql'))
  .sort();
const latest = sqlFiles[sqlFiles.length - 1];
console.log(`\nLatest migration file in repo: ${latest}\n`);

for (const db of discovered) {
  const exists = psql('postgres', `SELECT 1 FROM pg_database WHERE datname='${db}'`);
  if (exists !== '1') {
    bad(`[${db}] database exists`);
    continue;
  }
  const applied = psql(db, `SELECT COUNT(*)::text FROM schema_migrations WHERE filename='${latest}'`);
  if (applied === '1') {
    ok(`[${db}] has ${latest}`);
  } else {
    bad(`[${db}] missing ${latest}`, `applied flag=${applied ?? 'query failed'}`);
  }
}

console.log('\n========================================');
console.log(`RESULT: ${pass} passed, ${fail} failed`);
console.log('========================================\n');
process.exit(fail === 0 ? 0 : 1);
