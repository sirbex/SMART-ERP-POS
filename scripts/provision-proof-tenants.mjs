#!/usr/bin/env node
/**
 * Provision two proof tenants and verify schema integrity (no migration drift).
 *
 * Usage:
 *   BASE_URL=http://localhost:3001 node scripts/provision-proof-tenants.mjs
 *
 * Env:
 *   PLATFORM_EMAIL / PLATFORM_PASSWORD — super admin (default platform@samplepos.com / Platform123)
 *   DATABASE_URL — master DB for post-provision audit
 */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  buildMigrationTableAnchors,
  findDriftedMigrationFiles,
  TENANT_REQUIRED_TABLES,
} from './lib/migrationTableAnchors.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(__dirname, '..', 'SamplePOS.Server', 'package.json'));
const pg = require('pg');
const bcrypt = require('bcrypt');

const BASE = process.env.BASE_URL || 'http://localhost:3001';
const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/pos_system';
const PLATFORM_EMAIL = process.env.PLATFORM_EMAIL || 'platform@samplepos.com';
const PLATFORM_PASSWORD = process.env.PLATFORM_PASSWORD || 'Platform123';

const STAMP = Date.now().toString(36).slice(-5);
const TENANTS = [
  {
    slug: `proof-alpha-${STAMP}`,
    name: `Proof Alpha ${STAMP}`,
  },
  {
    slug: `proof-beta-${STAMP}`,
    name: `Proof Beta ${STAMP}`,
  },
];

let passed = 0;
let failed = 0;

function ok(msg, detail = '') {
  passed++;
  console.log(`  PASS  ${msg}${detail ? ` — ${detail}` : ''}`);
}

function bad(msg, detail = '') {
  failed++;
  console.error(`  FAIL  ${msg}${detail ? ` — ${detail}` : ''}`);
}

async function ensureSuperAdmin(pool) {
  const { rows } = await pool.query(
    'SELECT id, email FROM super_admins WHERE email = $1',
    [PLATFORM_EMAIL],
  );
  if (rows.length > 0) return;

  const hash = await bcrypt.hash(PLATFORM_PASSWORD, 12);
  await pool.query(
    `INSERT INTO super_admins (email, password_hash, full_name)
     VALUES ($1, $2, 'Platform Proof Admin')
     ON CONFLICT (email) DO NOTHING`,
    [PLATFORM_EMAIL, hash],
  );
  console.log(`  ℹ️  Created super admin ${PLATFORM_EMAIL}`);
}

async function platformLogin() {
  const res = await fetch(`${BASE}/api/platform/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: PLATFORM_EMAIL, password: PLATFORM_PASSWORD }),
  });
  const body = await res.json();
  if (!res.ok || !body?.data?.token) {
    throw new Error(`Platform login failed (${res.status}): ${JSON.stringify(body)}`);
  }
  return body.data.token;
}

async function provisionTenant(token, spec) {
  const payload = {
    slug: spec.slug,
    name: spec.name,
    plan: 'STARTER',
    billingEmail: `${spec.slug}@proof.local`,
    country: 'UG',
    currency: 'UGX',
    timezone: 'Africa/Kampala',
    ownerEmail: `admin@${spec.slug}.local`,
    ownerPassword: 'ProofPass1',
    ownerFullName: `${spec.name} Admin`,
  };

  const res = await fetch(`${BASE}/api/platform/tenants`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Provision ${spec.slug} failed (${res.status}): ${JSON.stringify(body)}`);
  }
  return body.data;
}

async function auditTenantDb(pool, label, anchors) {
  const { rows } = await pool.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
  );
  const { rows: viewRows } = await pool.query(
    `SELECT viewname FROM pg_views WHERE schemaname = 'public'`,
  );
  const existing = new Set(rows.map((r) => r.tablename));
  const views = new Set(viewRows.map((r) => r.viewname));

  const missingRequired = TENANT_REQUIRED_TABLES.filter((t) => !existing.has(t));
  const drifted = findDriftedMigrationFiles(existing, anchors, views);

  const hasAr = existing.has('ar_customer_payments') && existing.has('ar_payment_allocations');
  const hasDelivery = existing.has('delivery_notes') && existing.has('delivery_note_lines');
  const hasProductPartition =
    existing.has('product_inventory') && existing.has('product_valuation');

  return {
    label,
    tableCount: existing.size,
    missingRequired,
    drifted,
    hasAr,
    hasDelivery,
    hasProductPartition,
    ok: missingRequired.length === 0 && drifted.length === 0,
  };
}

async function waitForBackend(maxMs = 90000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Backend not ready at ${BASE} after ${maxMs}ms`);
}

async function main() {
  console.log('\n=== Provision 2 proof tenants + schema audit ===\n');
  console.log(`API: ${BASE}`);
  console.log(`Stamp: ${STAMP}\n`);

  await waitForBackend();

  const masterPool = new pg.Pool({ connectionString: DATABASE_URL });
  try {
    await ensureSuperAdmin(masterPool);
  } finally {
    await masterPool.end();
  }

  const token = await platformLogin();
  ok('Platform super-admin login');

  const created = [];
  for (const spec of TENANTS) {
    const tenant = await provisionTenant(token, spec);
    created.push(tenant);
    ok(`Provisioned tenant ${spec.slug}`, tenant.databaseName);
  }

  // Allow startup sync / first-request migration to settle
  await new Promise((r) => setTimeout(r, 3000));

  const anchors = buildMigrationTableAnchors();
  const auditPool = new pg.Pool({ connectionString: DATABASE_URL });

  try {
    for (const tenant of created) {
      const tenantPool = new pg.Pool({
        host: tenant.databaseHost || 'localhost',
        port: tenant.databasePort || 5432,
        database: tenant.databaseName,
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || process.env.DATABASE_PASSWORD || 'password',
        max: 2,
      });

      try {
        const report = await auditTenantDb(tenantPool, tenant.slug, anchors);

        if (report.ok) {
          ok(
            `${tenant.slug} schema clean`,
            `${report.tableCount} tables, AR=${report.hasAr}, DN=${report.hasDelivery}, PI=${report.hasProductPartition}`,
          );
        } else {
          bad(`${tenant.slug} schema drift`);
          if (report.missingRequired.length) {
            console.error(`        missing required: ${report.missingRequired.join(', ')}`);
          }
          if (report.drifted.length) {
            console.error(`        drift migrations: ${report.drifted.join(', ')}`);
          }
        }

        // Explicit Bliss regression check
        if (report.hasAr) ok(`${tenant.slug} has ar_customer_payments`);
        else bad(`${tenant.slug} missing ar_customer_payments (Bliss regression)`);
      } finally {
        await tenantPool.end().catch(() => {});
      }
    }
  } finally {
    await auditPool.end();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  console.log('\nTenant slugs created:');
  for (const t of created) {
    console.log(`  - ${t.slug} → ${t.databaseName}`);
    console.log(`    login: admin@${t.slug}.local / ProofPass1`);
  }

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('\nFatal:', err.message || err);
  process.exit(1);
});
