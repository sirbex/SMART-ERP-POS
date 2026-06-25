#!/usr/bin/env node
/**
 * Heal quote linkage for INV-2026-0025 (quote → POS order queue → credit sale path).
 * Idempotent — safe to re-run.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverRoot = path.join(root, 'SamplePOS.Server');
const require = createRequire(path.join(serverRoot, 'package.json'));
const pg = require('pg');
require('dotenv').config({ path: path.join(serverRoot, '.env') });

const TARGET_INVOICE = process.env.TARGET_INVOICE || 'INV-2026-0025';
const TARGET_QUOTE = process.env.TARGET_QUOTE || 'Q-2026-0044';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'pos_system',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
});

async function main() {
  const migrationSql = fs.readFileSync(
    path.join(root, 'shared/sql/add_pos_orders_quote_id.sql'),
    'utf8',
  );
  await pool.query(migrationSql);
  console.log('OK  migration add_pos_orders_quote_id');

  const inv = await pool.query(
    `SELECT i.id, i.invoice_number, i.sale_id, i.quote_id, i.reference, s.from_order_id
     FROM invoices i
     LEFT JOIN sales s ON s.id = i.sale_id
     WHERE i.invoice_number = $1`,
    [TARGET_INVOICE],
  );
  if (!inv.rows[0]) throw new Error(`Invoice ${TARGET_INVOICE} not found`);
  const invoice = inv.rows[0];

  const quote = await pool.query(
    `SELECT id, quote_number, reference, description, status
     FROM quotations WHERE quote_number = $1`,
    [TARGET_QUOTE],
  );
  if (!quote.rows[0]) throw new Error(`Quotation ${TARGET_QUOTE} not found`);
  const q = quote.rows[0];

  const refSnapshot = [q.reference, q.description].filter(Boolean).join('\n');

  if (invoice.from_order_id) {
    await pool.query(`UPDATE pos_orders SET quote_id = $1 WHERE id = $2 AND quote_id IS NULL`, [
      q.id,
      invoice.from_order_id,
    ]);
    console.log('OK  pos_orders.quote_id', invoice.from_order_id.slice(0, 8));
  }

  if (invoice.sale_id) {
    await pool.query(`UPDATE sales SET quote_id = $1 WHERE id = $2 AND quote_id IS NULL`, [
      q.id,
      invoice.sale_id,
    ]);
    console.log('OK  sales.quote_id', invoice.sale_id.slice(0, 8));
  }

  await pool.query(
    `UPDATE invoices
     SET quote_id = $1,
         reference = COALESCE(NULLIF(reference, ''), $2)
     WHERE id = $3`,
    [q.id, refSnapshot, invoice.id],
  );
  console.log('OK  invoices.quote_id + reference snapshot');

  if (q.status !== 'CONVERTED') {
    await pool.query(
      `UPDATE quotations
       SET status = 'CONVERTED',
           converted_to_sale_id = COALESCE(converted_to_sale_id, $1),
           converted_to_invoice_id = COALESCE(converted_to_invoice_id, $2),
           converted_at = COALESCE(converted_at, NOW()),
           updated_at = NOW()
       WHERE id = $3
         AND status != 'CONVERTED'`,
      [invoice.sale_id, invoice.id, q.id],
    );
    console.log('OK  quotation marked CONVERTED');
  } else {
    console.log('SKIP quotation already CONVERTED');
  }

  console.log(JSON.stringify({ invoice: TARGET_INVOICE, quote: TARGET_QUOTE, healed: true }, null, 2));
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
