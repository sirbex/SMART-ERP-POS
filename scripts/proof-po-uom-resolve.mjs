#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(resolve(root, 'SamplePOS.Server/package.json'));
const pg = require('pg');

const envPath = resolve(root, 'SamplePOS.Server/.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

const { resolveCanonicalProductUom } = await import('../SamplePOS.Server/dist/SamplePOS.Server/src/modules/products/uomService.js');

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();

const cases = [
  { sku: '13', id: '98cc5e26-bd41-462d-b072-0e73a2c02229', uom: '78bf1928-1113-4208-a688-059ca75a9b7c', label: 'Box' },
  { sku: '5551', id: '4e6994bb-5cf8-42d1-a312-0093f28f9eb6', uom: 'f9c13a3e-7c00-4d5f-9147-55158753c00d', label: 'PACKET' },
];

console.log('=== resolveCanonicalProductUom (strict — no silent repair) ===\n');
for (const c of cases) {
  try {
    const r = await resolveCanonicalProductUom(c.id, c.uom, client);
    console.log(`${c.sku} (${c.label}): OK  factor=${r.conversionFactor}`);
    const pu = await client.query(
      `SELECT u.name, pu.conversion_factor FROM product_uoms pu JOIN uoms u ON u.id=pu.uom_id WHERE pu.product_id=$1 AND pu.uom_id=$2`,
      [c.id, c.uom],
    );
    console.log(`  product_uoms after call: ${pu.rows[0] ? `${pu.rows[0].name} factor=${pu.rows[0].conversion_factor}` : 'MISSING'}`);
  } catch (e) {
    console.log(`${c.sku} (${c.label}): FAIL  ${e.message}`);
  }
}

// Also prove base UoM (null uomId) always works
console.log('\n=== Control: same products with uomId=null (base) ===\n');
for (const c of cases) {
  try {
    const r = await resolveCanonicalProductUom(c.id, null, client);
    console.log(`${c.sku}: OK  factor=${r.conversionFactor} (base)`);
  } catch (e) {
    console.log(`${c.sku}: FAIL  ${e.message}`);
  }
}

client.release();
await pool.end();
