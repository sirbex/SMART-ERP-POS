#!/usr/bin/env node
/**
 * Heal Category C MUoM orphans: active products with no base_uom_id AND no product_uoms.
 * These trigger offlineCatalog synthetic PIECE warnings on POS.
 *
 * Safe default: assign a base countable UoM (EACH/EA/TABLET/PIECE) with factor=1 only.
 * Does NOT invent pack conversion factors.
 *
 * Usage:
 *   node scripts/heal-muom-orphan-products.mjs
 *   node scripts/heal-muom-orphan-products.mjs --tenant=henber
 *   node scripts/heal-muom-orphan-products.mjs --tenant=henber --execute
 *   node scripts/heal-muom-orphan-products.mjs --tenant=henber --execute --uom=EACH
 *   node scripts/heal-muom-orphan-products.mjs --tenant=henber --execute --product=<uuid>
 *
 * Production:
 *   docker exec -w /app smarterp-backend node scripts/heal-muom-orphan-products.mjs --tenant=henber --execute
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const EXECUTE = process.argv.includes('--execute');
const productFilter = (() => {
  const m = process.argv.find((a) => a.startsWith('--product='));
  return m ? m.slice('--product='.length) : null;
})();
const uomArg = (() => {
  const m = process.argv.find((a) => a.startsWith('--uom='));
  return m ? m.slice('--uom='.length).trim() : null;
})();

const TENANT_DB = {
  henber: 'pos_tenant_henber_pharmacy',
  dynamics: 'pos_tenant_dynamics',
};

function loadDatabaseUrl() {
  const tenantArg = process.argv.find((a) => a.startsWith('--tenant='));
  const tenantKey = (tenantArg ? tenantArg.slice('--tenant='.length) : (process.env.TENANT || process.env.TENANT_DB || '')).toLowerCase();
  if (tenantKey === 'henber' && process.env.HENBER_DATABASE_URL) return process.env.HENBER_DATABASE_URL;
  const envPath = resolve(root, 'SamplePOS.Server/.env');
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m && !process.env[m[1].trim()]) {
        process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
      }
    }
  }
  if (process.env.DATABASE_URL) {
    if (!tenantKey || tenantKey === 'default' || tenantKey === 'system') return process.env.DATABASE_URL;
    const tenantDb = TENANT_DB[tenantKey] || tenantKey;
    return process.env.DATABASE_URL.replace(/\/([^/?]+)(\?.*)?$/, `/${tenantDb}$2`);
  }
  if (tenantKey && TENANT_DB[tenantKey]) {
    return `postgresql://postgres:password@localhost:5432/${TENANT_DB[tenantKey]}`;
  }
  // Docker production (smarterp-backend container)
  return 'postgresql://postgres:55b9bed51c599b26e7115ab126a974e8@postgres:5432/pos_tenant_henber_pharmacy';
}

const FIND_SQL = `
  SELECT p.id, p.name, p.sku, p.created_at
  FROM products p
  WHERE p.is_active = true
    AND p.base_uom_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM product_uoms pu WHERE pu.product_id = p.id)
    ${productFilter ? 'AND p.id = $1' : ''}
  ORDER BY p.name
`;

async function findMasterUom(client, patterns) {
  for (const pat of patterns) {
    const res = await client.query(
      `SELECT id, name, symbol FROM uoms
       WHERE UPPER(name) = $1 OR UPPER(COALESCE(symbol, '')) = $1
       LIMIT 1`,
      [pat.toUpperCase()],
    );
    if (res.rows[0]) return res.rows[0];
  }
  return null;
}

async function resolveBaseUom(client) {
  if (uomArg) {
    const explicit = await findMasterUom(client, [uomArg]);
    if (!explicit) throw new Error(`UoM "${uomArg}" not found in uoms master table`);
    return explicit;
  }
  const preferred = ['EACH', 'EA', 'PIECE', 'PC', 'PCS', 'TABLET', 'TAB', 'UNIT'];
  const found = await findMasterUom(client, preferred);
  if (!found) {
    throw new Error(
      'No base UoM found (EACH/EA/PIECE/TABLET). Create one in UoM management or pass --uom=SYMBOL',
    );
  }
  return found;
}

async function main() {
  const dbUrl = loadDatabaseUrl();
  const pool = new pg.Pool({ connectionString: dbUrl });
  const params = productFilter ? [productFilter] : [];

  console.log(`=== heal-muom-orphan-products [${EXECUTE ? 'EXECUTE' : 'DRY-RUN'}] ===`);
  console.log('DB:', dbUrl.replace(/\/\/[^@]+@/, '//***@'));

  const client = await pool.connect();
  try {
    const baseUom = await resolveBaseUom(client);
    console.log(`Base UoM: ${baseUom.symbol || baseUom.name} (${baseUom.id})`);
    if (uomArg) console.log(`(explicit --uom=${uomArg})`);

    const { rows } = await client.query(FIND_SQL, params);
    console.log(`\nCategory C orphans: ${rows.length}\n`);

    if (rows.length === 0) {
      console.log('Nothing to heal.');
      return;
    }

    for (const r of rows) {
      console.log(
        `  ${r.sku || '(no sku)'}  ${r.name}  → base=${baseUom.symbol || baseUom.name} factor=1`,
      );
    }

    if (!EXECUTE) {
      console.log('\nDry run — pass --execute to insert product_uoms and set base_uom_id');
      return;
    }

    await client.query('BEGIN');
    let healed = 0;
    for (const r of rows) {
      await client.query(
        `INSERT INTO product_uoms (product_id, uom_id, conversion_factor, is_default, created_at, updated_at)
         VALUES ($1, $2, 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT (product_id, uom_id) DO UPDATE SET
           is_default = true, conversion_factor = 1, updated_at = CURRENT_TIMESTAMP`,
        [r.id, baseUom.id],
      );
      await client.query(
        `UPDATE products SET base_uom_id = $2, updated_at = NOW() WHERE id = $1`,
        [r.id, baseUom.id],
      );
      healed += 1;
    }
    await client.query('COMMIT');
    console.log(`\nHealed ${healed} product(s)`);

    const verify = await client.query(
      `SELECT COUNT(*)::int AS n FROM products p
       WHERE p.is_active = true AND p.base_uom_id IS NULL
         AND NOT EXISTS (SELECT 1 FROM product_uoms pu WHERE pu.product_id = p.id)`,
    );
    console.log(`Remaining Category C orphans: ${verify.rows[0].n} (expected 0)`);
    if (Number(verify.rows[0].n) > 0) process.exitCode = 1;
    else console.log('\n✓ Refresh POS catalog (reload POS or wait for sync).');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
