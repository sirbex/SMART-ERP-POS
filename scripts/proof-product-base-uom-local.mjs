#!/usr/bin/env node
/**
 * Live proof: legacy product_uoms without base_uom_id can receive conversion UoMs.
 * Requires local API :3001 and DATABASE_URL (or SamplePOS.Server/.env).
 */
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'SamplePOS.Server', 'package.json'));
const pg = require('pg');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE_URL || 'http://localhost:3001';
const EMAIL = process.env.TEST_EMAIL || 'admin@samplepos.com';
const PASSWORD = process.env.TEST_PASSWORD || 'admin123';

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = path.join(ROOT, 'SamplePOS.Server', '.env');
  const text = fs.readFileSync(envPath, 'utf8');
  const m = text.match(/^DATABASE_URL=(.+)$/m);
  if (!m) throw new Error('DATABASE_URL not found');
  return m[1].replace(/^"|"$/g, '');
}

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`Login failed ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const token = json.data?.token ?? json.data?.accessToken;
  if (!token) throw new Error('No token in login response');
  return token;
}

async function main() {
  const pool = new pg.Pool({ connectionString: loadDatabaseUrl() });
  const client = await pool.connect();
  let productId;
  let baseUomId;
  let packUomId;
  let restored = false;

  try {
    const token = await login();
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    const uomRes = await client.query(
      `SELECT id, name FROM uoms ORDER BY name LIMIT 20`,
    );
    if (uomRes.rows.length < 2) {
      console.log('SKIP — need at least 2 master UoMs');
      process.exit(0);
    }
    baseUomId = uomRes.rows[0].id;
    packUomId = uomRes.rows.find((r) => r.id !== baseUomId)?.id;
    if (!packUomId) {
      console.log('SKIP — need 2 distinct master UoMs');
      process.exit(0);
    }

    const prodRes = await client.query(
      `INSERT INTO products (name, sku, is_active)
       VALUES ($1, $2, true)
       RETURNING id`,
      [`UoM proof ${Date.now()}`, `UOM-PROOF-${Date.now()}`],
    );
    productId = prodRes.rows[0].id;

    await client.query(
      `INSERT INTO product_uoms (product_id, uom_id, conversion_factor, is_default)
       VALUES ($1, $2, 1, false)`,
      [productId, baseUomId],
    );
    await client.query(`UPDATE products SET base_uom_id = NULL WHERE id = $1`, [productId]);

    const addRes = await fetch(`${BASE}/api/products/${productId}/uoms`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        uomId: packUomId,
        conversionFactor: 12,
        isDefault: false,
      }),
    });
    const addBody = await addRes.text();
    if (!addRes.ok) {
      console.error('FAIL add conversion UoM', addRes.status, addBody.slice(0, 2000));
      process.exit(1);
    }

    const baseCheck = await client.query(
      `SELECT base_uom_id FROM products WHERE id = $1`,
      [productId],
    );
    const convCheck = await client.query(
      `SELECT COUNT(*)::int AS n FROM item_uom_conversions WHERE item_id = $1`,
      [productId],
    );
    const defaultCheck = await client.query(
      `SELECT COUNT(*)::int AS n FROM product_uoms WHERE product_id = $1 AND is_default = true`,
      [productId],
    );

    if (!baseCheck.rows[0]?.base_uom_id) {
      console.error('FAIL products.base_uom_id still NULL after add');
      process.exit(1);
    }
    if (convCheck.rows[0].n < 1) {
      console.error('FAIL item_uom_conversions not created');
      process.exit(1);
    }
    if (defaultCheck.rows[0].n !== 1) {
      console.error('FAIL expected exactly one is_default product_uom');
      process.exit(1);
    }

    console.log(
      `PASS product-base-uom legacy repair product=${productId} base=${baseCheck.rows[0].base_uom_id} conversions=${convCheck.rows[0].n}`,
    );
    restored = true;
  } finally {
    if (productId && restored) {
      await client.query(`DELETE FROM item_uom_conversions WHERE item_id = $1`, [productId]);
      await client.query(`DELETE FROM product_uoms WHERE product_id = $1`, [productId]);
      await client.query(`DELETE FROM products WHERE id = $1`, [productId]);
    } else if (productId) {
      await client.query(`DELETE FROM product_uoms WHERE product_id = $1`, [productId]);
      await client.query(`DELETE FROM products WHERE id = $1`, [productId]);
    }
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error('FAIL', e.message);
  process.exit(1);
});
