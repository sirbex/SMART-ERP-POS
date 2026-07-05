#!/usr/bin/env node
/**
 * Verify production proof credentials before Steps 3–5.
 *
 * Usage:
 *   node scripts/verify-proof-production-env.mjs
 *   node scripts/verify-proof-production-env.mjs --step 3
 *   node scripts/verify-proof-production-env.mjs --step 4
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(path.join(path.dirname(fileURLToPath(import.meta.url)), '../SamplePOS.Server/package.json'));
const pg = require('pg');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ENV_FILE = path.join(ROOT, '.env.proof.production');

const stepArg = process.argv.indexOf('--step');
const step = stepArg >= 0 ? Number(process.argv[stepArg + 1]) : 0;

function loadEnvFile() {
  if (!fs.existsSync(ENV_FILE)) {
    console.error('Missing .env.proof.production — copy env.proof.production.template and configure.');
    process.exit(2);
  }
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    if (!process.env[key]) process.env[key] = val;
  }
}

function maskUrl(url) {
  return String(url || '').replace(/:([^:@/]+)@/, ':***@');
}

async function checkDb() {
  const url = process.env.HENBER_DATABASE_URL;
  if (!url) {
    console.error('  FAIL  HENBER_DATABASE_URL not set');
    return false;
  }
  const pool = new pg.Pool({ connectionString: url, connectionTimeoutMillis: 15000 });
  try {
    const r = await pool.query('SELECT current_database() AS db');
    console.log(`  PASS  Henber DB — ${r.rows[0].db} (${maskUrl(url)})`);
    return true;
  } catch (e) {
    console.error(`  FAIL  Henber DB — ${e instanceof Error ? e.message : e}`);
    return false;
  } finally {
    await pool.end();
  }
}

async function checkApi() {
  const base = process.env.BASE_URL;
  const email = process.env.TEST_EMAIL;
  const password = process.env.TEST_PASSWORD;
  if (!base) {
    console.error('  FAIL  BASE_URL not set');
    return false;
  }
  if (!email || !password) {
    console.error('  FAIL  TEST_EMAIL / TEST_PASSWORD not set (needed for Step 4 smoke)');
    return false;
  }
  try {
    const health = await fetch(`${base.replace(/\/$/, '')}/api/health`);
    if (!health.ok) {
      console.error(`  FAIL  ${base}/api/health — HTTP ${health.status}`);
      return false;
    }
    console.log(`  PASS  ${base}/api/health — HTTP 200`);
  } catch (e) {
    console.error(`  FAIL  API health — ${e instanceof Error ? e.message : e}`);
    return false;
  }
  try {
    const r = await fetch(`${base.replace(/\/$/, '')}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const j = await r.json();
    if (!j.success) {
      console.error(`  FAIL  Tenant login (${email}) — ${j.error || 'unknown'}`);
      return false;
    }
    console.log(`  PASS  Tenant login — ${email}`);
    return true;
  } catch (e) {
    console.error(`  FAIL  Tenant login — ${e instanceof Error ? e.message : e}`);
    return false;
  }
}

loadEnvFile();

console.log('\nProduction proof credential check');
console.log(`  Env file: ${path.relative(ROOT, ENV_FILE)}`);
if (step) console.log(`  Step:     ${step}`);
console.log('');

let ok = true;

if (!step || step === 3) {
  console.log('Step 3 — Henber AP/AR decompose (DB):');
  ok = (await checkDb()) && ok;
  console.log('');
}

if (!step || step >= 4) {
  console.log('Step 4 — Post-deploy smoke (API + DB):');
  ok = (await checkDb()) && ok;
  ok = (await checkApi()) && ok;
  console.log('');
}

if (!ok) {
  console.error('Credential check FAILED — fix .env.proof.production before running production proofs.');
  process.exit(1);
}

console.log('Credential check PASSED');
process.exit(0);
