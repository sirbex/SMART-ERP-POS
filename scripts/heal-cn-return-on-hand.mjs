#!/usr/bin/env node
/**
 * Heal on-hand for a posted customer credit note that returned goods but left batches at 0.
 * Does NOT insert duplicate stock movements — only fixes inventory_batches + sync.
 *
 * Usage:
 *   node scripts/heal-cn-return-on-hand.mjs CN-2026-0003
 *   TENANT_DB=pos_tenant_dynamics node scripts/heal-cn-return-on-hand.mjs CN-2026-0003
 */
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../SamplePOS.Server/.env') });

const cnNumber = process.argv[2];
if (!cnNumber) {
  console.error('Usage: node scripts/heal-cn-return-on-hand.mjs <CN-2026-XXXX>');
  process.exit(1);
}

const baseUrl = process.env.DATABASE_URL || '';
const tenantDb = process.env.TENANT_DB;
const conn = tenantDb
  ? baseUrl.replace(/\/[^/]+$/, `/${tenantDb}`)
  : baseUrl;

const pool = new pg.Pool({ connectionString: conn });

const { resyncOnHandFromPostedCustomerCreditNote } = await import(
  '../SamplePOS.Server/dist/utils/customerReturnInventory.js'
).catch(async () => {
  // Dev: run via tsx if dist not built
  const { register } = await import('tsx/esm/api');
  register();
  return import('../SamplePOS.Server/src/utils/customerReturnInventory.ts');
});

const client = await pool.connect();
try {
  await client.query('BEGIN');
  const cnRes = await client.query(
    `SELECT id, invoice_number, returns_goods
     FROM invoices
     WHERE invoice_number = $1 AND document_type = 'CREDIT_NOTE'`,
    [cnNumber],
  );
  const cn = cnRes.rows[0];
  if (!cn) throw new Error(`Credit note ${cnNumber} not found`);
  if (!cn.returns_goods) throw new Error(`${cnNumber} is not a returns-goods credit note`);

  const lines = await client.query(
    `SELECT "ProductId" AS product_id, "Description" AS description,
            "Quantity" AS quantity, "UnitPrice" AS unit_price, "ProductName" AS product_name
     FROM invoice_line_items WHERE "InvoiceId" = $1`,
    [cn.id],
  );

  console.log(`Healing ${cnNumber} (${lines.rows.length} lines)...`);
  for (const line of lines.rows) {
    if (!line.product_id) continue;
    const r = await resyncOnHandFromPostedCustomerCreditNote(client, {
      productId: line.product_id,
      enteredQty: Number(line.quantity),
      lineDescription: line.description,
      noteId: cn.id,
      noteNumber: cn.invoice_number,
      fallbackUnitCost: Number(line.unit_price),
    });
    const qoh = await client.query(
      `SELECT quantity_on_hand FROM product_inventory WHERE product_id = $1`,
      [line.product_id],
    );
    console.log(
      `  ${line.product_name}: +${r.baseQty} → batch ${r.batchId?.slice(0, 8)}… on_hand=${qoh.rows[0]?.quantity_on_hand ?? '?'}`,
    );
  }
  await client.query('COMMIT');
  console.log('Done.');
} catch (e) {
  await client.query('ROLLBACK');
  console.error(e);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
