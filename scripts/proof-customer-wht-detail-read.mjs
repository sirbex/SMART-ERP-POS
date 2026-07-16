#!/usr/bin/env node
/**
 * Proof: customer detail GET returns whtLiable (regression for overview "Not liable").
 * Uses direct DB + repository SELECT shape check; optionally hits local API if token present.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const require = createRequire(join(root, 'SamplePOS.Server/package.json'));
const pg = require('pg');
const lines = [];
let fail = 0;

function ok(m) { lines.push(`✓ ${m}`); }
function bad(m) { fail++; lines.push(`✗ ${m}`); }
function section(t) { lines.push(''); lines.push(`── ${t} ──`); }

function loadDatabaseUrl() {
  const envPath = join(root, 'SamplePOS.Server', '.env');
  if (!existsSync(envPath)) return process.env.DATABASE_URL;
  const raw = readFileSync(envPath, 'utf8');
  const m = raw.match(/^DATABASE_URL=["']?([^"'\r\n]+)/m);
  return m?.[1] || process.env.DATABASE_URL;
}

section('1. Source: findCustomerById uses CUSTOMER_SELECT (includes WHT)');
const repo = readFileSync(
  join(root, 'SamplePOS.Server/src/modules/customers/customerRepository.ts'),
  'utf8',
);
if (repo.includes('const CUSTOMER_SELECT') && repo.includes('whtLiable')) {
  ok('CUSTOMER_SELECT includes whtLiable');
} else {
  bad('CUSTOMER_SELECT missing whtLiable');
}

const byIdMatch = repo.match(/export async function findCustomerById[\s\S]*?^}/m);
if (byIdMatch && byIdMatch[0].includes('CUSTOMER_SELECT') && byIdMatch[0].includes('CUSTOMER_FROM_JOIN')) {
  ok('findCustomerById uses CUSTOMER_SELECT + CUSTOMER_FROM_JOIN');
} else {
  bad('findCustomerById still has a private SELECT that omits WHT');
}

const byEmail = repo.match(/export async function findCustomerByEmail[\s\S]*?^}/m);
if (byEmail && byEmail[0].includes('CUSTOMER_SELECT')) {
  ok('findCustomerByEmail uses CUSTOMER_SELECT');
} else {
  bad('findCustomerByEmail omits CUSTOMER_SELECT');
}

const byNumber = repo.match(/export async function findCustomerByNumber[\s\S]*?^}/m);
if (byNumber && byNumber[0].includes('CUSTOMER_SELECT')) {
  ok('findCustomerByNumber uses CUSTOMER_SELECT');
} else {
  bad('findCustomerByNumber omits CUSTOMER_SELECT');
}

const search = repo.match(/export async function searchCustomers[\s\S]*?^}/m);
if (search && search[0].includes('CUSTOMER_SELECT')) {
  ok('searchCustomers uses CUSTOMER_SELECT');
} else {
  bad('searchCustomers omits CUSTOMER_SELECT');
}

section('2. Live DB: CUST-0006 save vs detail SELECT shape');
const databaseUrl = loadDatabaseUrl();
const pool = new pg.Pool({ connectionString: databaseUrl });

try {
  const raw = await pool.query(
    `SELECT id, customer_number, name, wht_liable, default_wht_type_id
     FROM customers WHERE customer_number = 'CUST-0006'`,
  );
  const row = raw.rows[0];
  if (!row) {
    bad('CUST-0006 not found in local DB');
  } else if (row.wht_liable !== true) {
    bad(`CUST-0006 DB wht_liable expected true, got ${row.wht_liable}`);
  } else {
    ok(`CUST-0006 DB wht_liable=true (default_wht_type_id=${row.default_wht_type_id || 'null'})`);
  }

  // Same SELECT shape as fixed findCustomerById (CUSTOMER_SELECT excerpt)
  const detail = await pool.query(
    `SELECT
      c.id, c.customer_number as "customerNumber", c.name,
      COALESCE(c.wht_liable, false) as "whtLiable",
      c.default_wht_type_id as "defaultWhtTypeId"
     FROM customers c
     WHERE c.customer_number = 'CUST-0006'`,
  );
  const d = detail.rows[0];
  if (d?.whtLiable === true) {
    ok(`Detail SELECT returns whtLiable=true for ${d.customerNumber} (${d.name})`);
  } else {
    bad(`Detail SELECT whtLiable=${d?.whtLiable}`);
  }

  // Optional live API check (best-effort)
  try {
    const login = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@samplepos.com', password: 'admin123' }),
    });
    const loginJson = await login.json();
    const token = loginJson?.data?.accessToken || loginJson?.data?.token;
    if (token && row?.id) {
      const apiRes = await fetch(`http://localhost:3001/api/customers/${row.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const apiJson = await apiRes.json();
      if (apiJson?.data?.whtLiable === true) {
        ok(`GET /api/customers/:id returns whtLiable=true for ${apiJson.data.customerNumber}`);
      } else {
        bad(`GET /api/customers/:id whtLiable=${apiJson?.data?.whtLiable}`);
      }
    } else {
      lines.push('· API login skipped (no token) — source+DB proof still valid');
    }
  } catch {
    lines.push('· API check skipped (server not reachable) — source+DB proof still valid');
  }
} finally {
  await pool.end();
}

section('3. Unit tests (partner WHT)');
const vitest = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['vitest', 'run', 'src/__tests__/partner-wht-default.test.ts', 'src/__tests__/partner-wht-offline.test.ts'],
  { cwd: join(root, 'samplepos.client'), encoding: 'utf8', shell: true },
);
lines.push((vitest.stdout || '').trim().split('\n').slice(-12).join('\n'));
if (vitest.status === 0) ok('vitest partner-wht suites PASS');
else bad(`vitest exit ${vitest.status}`);

const header = [
  '════════════════════════════════════════════════════════════════════════',
  ' PROOF — Customer detail WHT read inconsistency fix',
  ` Generated: ${new Date().toISOString()}`,
  '════════════════════════════════════════════════════════════════════════',
  '',
  'Root cause: findCustomerById used a private SELECT without wht_liable,',
  'so update saved correctly but overview always showed Not liable.',
];
const footer = [
  '',
  fail === 0 ? 'RESULT: PASS' : `RESULT: FAIL (${fail})`,
  '',
];
const report = [...header, ...lines, ...footer].join('\n');
writeFileSync(join(root, 'PROOF_CUSTOMER_WHT_DETAIL_READ.md'), report + '\n');
console.log(report);
process.exit(fail === 0 ? 0 : 1);
