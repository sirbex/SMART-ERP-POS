#!/usr/bin/env node
/**
 * Heal on-hand for a posted customer credit note that returned goods but left batches at 0.
 * Does NOT insert duplicate stock movements — only fixes inventory_batches + sync.
 *
 * Usage:
 *   node scripts/heal-cn-return-on-hand.mjs CN-2026-0003
 *   TENANT=henber node scripts/heal-cn-return-on-hand.mjs CN-2026-0003
 *   TENANT=dynamics node scripts/heal-cn-return-on-hand.mjs CN-2026-0003
 *
 * On production (smarterp-backend):
 *   docker exec -w /app -e TENANT=henber smarterp-backend node heal-cn-return-on-hand.mjs CN-2026-0003
 */
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../SamplePOS.Server/.env') });

const cnNumber = process.argv[2] || process.env.CN_NUMBER;
if (!cnNumber) {
  console.error('Usage: node scripts/heal-cn-return-on-hand.mjs <CN-2026-XXXX>');
  process.exit(1);
}

const TENANT_DB = {
  henber: 'pos_tenant_henber_pharmacy',
  dynamics: 'pos_tenant_dynamics',
};

function resolveDatabaseUrl() {
  if (process.env.HENBER_DATABASE_URL && (process.env.TENANT || 'henber') === 'henber') {
    return process.env.HENBER_DATABASE_URL;
  }
  const tenantKey = (process.env.TENANT || process.env.TENANT_DB || 'henber').toLowerCase();
  const tenantDb = TENANT_DB[tenantKey] || tenantKey;
  const base = process.env.DATABASE_URL;
  if (base) {
    return base.replace(/\/([^/?]+)(\?.*)?$/, `/${tenantDb}$2`);
  }
  return `postgresql://postgres:55b9bed51c599b26e7115ab126a974e8@postgres:5432/${tenantDb}`;
}

const distRoot = process.env.SAMPLEPOS_DIST_ROOT || '/app/dist/SamplePOS.Server/src';
const localDist = new URL('../SamplePOS.Server/dist/', import.meta.url).pathname;

async function loadModule(relativePath) {
  for (const href of [`${distRoot}/${relativePath}`, `${localDist}${relativePath}`]) {
    try {
      return await import(href);
    } catch {
      /* try next */
    }
  }
  const { register } = await import('tsx/esm/api');
  register();
  return import(`../SamplePOS.Server/src/${relativePath.replace(/\.js$/, '.ts')}`);
}

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl() });
const { resyncOnHandFromPostedCustomerCreditNote } = await loadModule(
  'utils/customerReturnInventory.js',
);

const client = await pool.connect();
try {
  console.log('DB:', resolveDatabaseUrl().replace(/\/\/[^@]+@/, '//***@'));
  console.log('CN:', cnNumber);

  await client.query('BEGIN');
  const cnRes = await client.query(
    `SELECT id, invoice_number, returns_goods, status
     FROM invoices
     WHERE invoice_number = $1 AND document_type = 'CREDIT_NOTE'`,
    [cnNumber],
  );
  const cn = cnRes.rows[0];
  if (!cn) throw new Error(`Credit note ${cnNumber} not found`);
  if (!cn.returns_goods) throw new Error(`${cnNumber} is not a returns-goods credit note`);
  if (String(cn.status).toUpperCase() !== 'POSTED') {
    throw new Error(`${cnNumber} must be POSTED (status=${cn.status})`);
  }

  const lines = await client.query(
    `SELECT "ProductId" AS product_id, "Description" AS description,
            "Quantity" AS quantity, "UnitPrice" AS unit_price, "ProductName" AS product_name
     FROM invoice_line_items WHERE "InvoiceId" = $1`,
    [cn.id],
  );

  console.log(`Healing ${cnNumber} (${lines.rows.length} lines)...`);
  for (const line of lines.rows) {
    if (!line.product_id) {
      console.warn(`  SKIP ${line.product_name}: no ProductId on line`);
      continue;
    }
    const before = await client.query(
      `SELECT quantity_on_hand FROM products WHERE id = $1`,
      [line.product_id],
    );
    const beforeQoh = Number(before.rows[0]?.quantity_on_hand ?? 0);

    const r = await resyncOnHandFromPostedCustomerCreditNote(client, {
      productId: line.product_id,
      enteredQty: Number(line.quantity),
      lineDescription: line.description,
      noteId: cn.id,
      noteNumber: cn.invoice_number,
      fallbackUnitCost: Number(line.unit_price),
    });

    const after = await client.query(
      `SELECT quantity_on_hand FROM products WHERE id = $1`,
      [line.product_id],
    );
    const afterQoh = Number(after.rows[0]?.quantity_on_hand ?? 0);
    console.log(
      `  ${line.product_name}: on_hand ${beforeQoh} → ${afterQoh} (+${r.baseQty} batch ${r.batchId?.slice(0, 8) ?? 'n/a'}…)`,
    );
  }
  await client.query('COMMIT');
  console.log('Done.');
} catch (e) {
  await client.query('ROLLBACK');
  console.error(e?.message || e);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
