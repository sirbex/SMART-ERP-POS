#!/usr/bin/env node
/**
 * Live proof — Bliss (or PROD_URL tenant) customers API + schema integrity.
 *
 * Usage:
 *   PROD_URL=https://bliss-interior-ltd.wizarddigital-inv.com \
 *   TEST_EMAIL=... TEST_PASSWORD=... \
 *   node scripts/proof-quotation-customer-schema-live.mjs
 *
 * Optional DB drift (on server with docker):
 *   POSTGRES_CONTAINER=samplepos-postgres \
 *   REFERENCE_DB=pos_tenant_henber_pharmacy \
 *   TARGET_DB=pos_tenant_bliss_interior_ltd \
 *   node scripts/proof-quotation-customer-schema-live.mjs
 */
import { spawnSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROD = process.env.PROD_URL || 'https://bliss-interior-ltd.wizarddigital-inv.com';
const EMAIL = process.env.TEST_EMAIL || process.env.BLISS_TEST_EMAIL || '';
const PASS = process.env.TEST_PASSWORD || process.env.BLISS_TEST_PASSWORD || '';
const CONTAINER = process.env.POSTGRES_CONTAINER || '';
const PROD_SSH = process.env.PROD_SSH_HOST || process.env.PROD_SSH || '';
const REFERENCE_DB = process.env.REFERENCE_DB || 'pos_tenant_henber_pharmacy';
const TARGET_DB = process.env.TARGET_DB || 'pos_tenant_bliss_interior_ltd';

/** Critical columns — must match SamplePOS.Server tenantSchemaIntegrity.ts */
const CRITICAL_COLUMNS = [
  ['customers', 'customer_group_id'],
  ['customers', 'price_group_id'],
  ['products', 'max_stock_level'],
  ['products', 'reorder_point'],
  ['products', 'optimal_stock_level'],
  ['quotation_items', 'uom_name'],
  ['quotation_items', 'uom_id'],
  ['quotations', 'content_hash'],
  ['price_groups', 'pricing_mode'],
  ['customer_groups', 'default_price_group_id'],
];

let pass = 0;
let fail = 0;

function ok(name, detail = '') {
  pass += 1;
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`);
}
function bad(name, detail = '') {
  fail += 1;
  console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}
function assert(cond, name, detail = '') {
  if (cond) ok(name, detail);
  else bad(name, detail);
}

async function login(base) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASS }),
  });
  if (!res.ok) return { ok: false, status: res.status, body: await res.text().catch(() => '') };
  const json = await res.json();
  const token = json.data?.token ?? json.data?.accessToken;
  if (!token) return { ok: false, status: res.status, body: 'no token' };
  return { ok: true, token };
}

function psql(db, sql) {
  if (CONTAINER) {
    const r = spawnSync(
      'docker',
      ['exec', CONTAINER, 'psql', '-U', 'postgres', '-d', db, '-t', '-A', '-c', sql],
      { encoding: 'utf8' }
    );
    if (r.status !== 0) return null;
    return (r.stdout || '').trim();
  }
  if (PROD_SSH) {
    const remote = `docker exec samplepos-postgres psql -U postgres -d ${db} -t -A -c ${JSON.stringify(sql)}`;
    const r = spawnSync('ssh', ['-o', 'BatchMode=yes', PROD_SSH, remote], { encoding: 'utf8' });
    if (r.status !== 0) return null;
    return (r.stdout || '').trim();
  }
  return null;
}

function runDriftAudit() {
  const tables =
    'customers,customer_groups,price_groups,price_rules,pricing_tiers,products,product_uoms,uoms,quotations,quotation_items';
  const tableList = tables
    .split(',')
    .map((t) => `'${t}'`)
    .join(',');
  const sql = `SELECT table_name||'|'||column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN (${tableList}) ORDER BY 1`;

  if (CONTAINER) {
    return spawnSync(process.execPath, [join(root, 'scripts/audit-tenant-schema-drift.mjs')], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, POSTGRES_CONTAINER: CONTAINER, REFERENCE_DB, TARGET_DB },
    });
  }

  if (PROD_SSH) {
    const remote = `
SQL=${JSON.stringify(sql)}
docker exec samplepos-postgres psql -U postgres -d ${REFERENCE_DB} -t -A -c "$SQL" > /tmp/ref_cols.txt
docker exec samplepos-postgres psql -U postgres -d ${TARGET_DB} -t -A -c "$SQL" > /tmp/target_cols.txt
MISSING=$(comm -23 /tmp/ref_cols.txt /tmp/target_cols.txt | wc -l | tr -d ' ')
echo "Missing on target: $MISSING"
if [ "$MISSING" != "0" ]; then comm -23 /tmp/ref_cols.txt /tmp/target_cols.txt | head -20; exit 1; fi
exit 0
`.trim();
    return spawnSync('ssh', ['-o', 'BatchMode=yes', PROD_SSH, remote], { encoding: 'utf8' });
  }

  return null;
}

function columnExists(db, table, column) {
  const out = psql(
    db,
    `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='${table}' AND column_name='${column}' LIMIT 1`
  );
  return out === '1';
}

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║  LIVE PROOF — Quotation customer + schema (Bliss)           ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');
console.log(`Tenant: ${PROD}\n`);

console.log('1. API HEALTH');
const health = await fetch(`${PROD}/api/health`);
assert(health.ok, 'GET /api/health', String(health.status));

console.log('\n2. AUTH + CUSTOMERS API');
if (!EMAIL || !PASS) {
  bad('Credentials set', 'Set TEST_EMAIL and TEST_PASSWORD');
} else {
  const auth = await login(PROD);
  assert(auth.ok, 'POST /api/auth/login', auth.ok ? 'token received' : `${auth.status} ${auth.body?.slice(0, 80)}`);
  if (auth.ok) {
    const headers = { Authorization: `Bearer ${auth.token}` };
    const list = await fetch(`${PROD}/api/customers?page=1&limit=5000`, { headers });
    assert(list.ok, 'GET /api/customers?page=1&limit=5000', String(list.status));
    const listJson = list.ok ? await list.json() : null;
    assert(listJson?.success === true, 'customers list success flag');
    assert(Array.isArray(listJson?.data), 'customers list data array');

    const probeEmail = `proof-${Date.now()}@schema.test`;
    const create = await fetch(`${PROD}/api/customers`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `Proof Customer ${Date.now()}`,
        email: probeEmail,
        phone: '0700000000',
        creditLimit: 500000,
      }),
    });
    assert(create.status === 201 || create.ok, 'POST /api/customers (Quick Add shape)', String(create.status));
    if (create.ok) {
      const created = await create.json();
      assert(created.success === true && created.data?.id, 'customer persisted with id', created.data?.id?.slice(0, 8));
    }
  }
}

console.log('\n3. CRITICAL DB COLUMNS');
if (!CONTAINER && !PROD_SSH) {
  console.log('  SKIP  Set POSTGRES_CONTAINER (local docker) or PROD_SSH_HOST (e.g. root@209.38.203.138)');
} else {
  for (const [table, col] of CRITICAL_COLUMNS) {
    assert(
      columnExists(TARGET_DB, table, col),
      `[${TARGET_DB}] ${table}.${col}`,
      columnExists(REFERENCE_DB, table, col) ? 'reference ok' : 'reference missing'
    );
  }

  const drift = runDriftAudit();
  if (drift) {
    assert(
      drift.status === 0,
      'audit-tenant-schema-drift.mjs (target vs reference)',
      drift.stdout?.trim().split('\n').slice(-2).join(' | ') || drift.stderr?.trim() || 'drift detected'
    );
  } else {
    bad('audit-tenant-schema-drift.mjs', 'could not run drift audit');
  }
}

console.log('\n' + '═'.repeat(64));
console.log(`Results: ${pass} passed, ${fail} failed`);
if (fail === 0) {
  console.log('✅ LIVE PROOF — ALL PASS');
} else {
  console.log('❌ LIVE PROOF — FAILED');
}
console.log('═'.repeat(64));
process.exit(fail > 0 ? 1 : 0);
