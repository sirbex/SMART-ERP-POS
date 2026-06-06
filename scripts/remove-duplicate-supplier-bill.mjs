#!/usr/bin/env node
/**
 * Remove a duplicate pending supplier bill (soft-delete) when safe.
 *
 * Usage:
 *   node scripts/remove-duplicate-supplier-bill.mjs SBILL-2026-0243
 *   node scripts/remove-duplicate-supplier-bill.mjs SBILL-2026-0243 --execute
 *
 * Requires DATABASE_URL or HENBER_DATABASE_URL.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

function loadPg() {
  const roots = [
    path.resolve(scriptDir, '../SamplePOS.Server'),
    path.resolve(scriptDir, '..'),
    process.cwd(),
    '/app',
  ];
  for (const root of roots) {
    const pkgPath = path.join(root, 'package.json');
    if (!fs.existsSync(pkgPath)) continue;
    try {
      const req = createRequire(pkgPath);
      return req('pg');
    } catch {
      /* try next root */
    }
  }
  throw new Error('Could not resolve pg — run from repo root or SamplePOS.Server');
}

const pg = loadPg();

const billNumber = process.argv[2];
const execute = process.argv.includes('--execute');

if (!billNumber) {
  console.error('Usage: node scripts/remove-duplicate-supplier-bill.mjs <SBILL-number> [--execute]');
  process.exit(1);
}

function loadDatabaseUrl() {
  if (process.env.HENBER_DATABASE_URL) return process.env.HENBER_DATABASE_URL;
  if (process.env.DATABASE_URL) {
    const base = process.env.DATABASE_URL;
    if (process.env.TENANT === 'henber' || /henber/i.test(billNumber)) {
      return base.replace(/\/([^/?]+)(\?.*)?$/, '/pos_tenant_henber_pharmacy$2');
    }
    return base;
  }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  for (const rel of ['SamplePOS.Server/.env', '.env']) {
    const envPath = path.join(root, rel);
    if (!fs.existsSync(envPath)) continue;
    const m = fs.readFileSync(envPath, 'utf8').match(/^DATABASE_URL=(.+)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  throw new Error('Set DATABASE_URL or HENBER_DATABASE_URL');
}

const pool = new pg.Pool({ connectionString: loadDatabaseUrl() });

async function main() {
  const { rows } = await pool.query(
    `SELECT
       si."Id" AS id,
       si."SupplierInvoiceNumber" AS bill_number,
       si."Status" AS status,
       si."TotalAmount" AS total,
       COALESCE(si."AmountPaid", 0) AS paid,
       si."OutstandingBalance" AS outstanding,
       si.is_posted_to_gl,
       si.deleted_at,
       si."InternalReferenceNumber" AS internal_ref,
       si."SupplierId" AS supplier_id,
       s."CompanyName" AS supplier_name,
       (SELECT COUNT(*)::int FROM ledger_transactions lt
        WHERE lt."ReferenceId" = si."Id" AND lt."Status" = 'POSTED') AS posted_gl_count,
       (SELECT COUNT(*)::int FROM supplier_payment_allocations spa
        WHERE spa."SupplierInvoiceId" = si."Id" AND spa.deleted_at IS NULL) AS alloc_count,
       (SELECT json_agg(json_build_object('grn_id', sigl.grn_id, 'receipt_number', gr.receipt_number))
        FROM supplier_invoice_grn_links sigl
        LEFT JOIN goods_receipts gr ON gr.id = sigl.grn_id
        WHERE sigl.invoice_id = si."Id") AS gr_links
     FROM supplier_invoices si
     LEFT JOIN suppliers s ON s."Id" = si."SupplierId"
     WHERE si."SupplierInvoiceNumber" = $1
       AND si.deleted_at IS NULL`,
    [billNumber],
  );

  if (rows.length === 0) {
    console.error(`Bill ${billNumber} not found or already deleted.`);
    process.exit(1);
  }

  const inv = rows[0];
  console.log('Found bill:', JSON.stringify(inv, null, 2));

  const status = String(inv.status || '').toUpperCase();
  const paid = Number(inv.paid) || 0;
  const postedGl = Number(inv.posted_gl_count) || 0;
  const allocs = Number(inv.alloc_count) || 0;

  if (paid > 0.01) {
    console.error('Refusing: bill has payments allocated.');
    process.exit(1);
  }
  if (postedGl > 0 || inv.is_posted_to_gl) {
    console.error('Refusing: bill is posted to GL — cancel/reverse via accounting workflow.');
    process.exit(1);
  }
  if (allocs > 0) {
    console.error('Refusing: bill has payment allocations.');
    process.exit(1);
  }
  if (status === 'DELETED' || status === 'CANCELLED') {
    console.log('Bill already terminal status:', status);
    process.exit(0);
  }

  if (!execute) {
    console.log('\nDry run OK. Re-run with --execute to soft-delete this duplicate bill.');
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE supplier_invoices
       SET deleted_at = NOW(), "Status" = 'DELETED', "OutstandingBalance" = 0, "UpdatedAt" = NOW()
       WHERE "Id" = $1 AND deleted_at IS NULL`,
      [inv.id],
    );

    await client.query(
      `DELETE FROM supplier_invoice_grn_links WHERE invoice_id = $1`,
      [inv.id],
    );

    if (inv.supplier_id) {
        await client.query(
          `UPDATE suppliers
           SET "OutstandingBalance" = (
             SELECT COALESCE(SUM("OutstandingBalance"), 0)
             FROM supplier_invoices
             WHERE "SupplierId" = $1
               AND deleted_at IS NULL
               AND COALESCE("Status", '') NOT IN ('Cancelled', 'CANCELLED', 'DELETED', 'Voided', 'VOIDED')
           ),
           "UpdatedAt" = NOW()
           WHERE "Id" = $1`,
          [inv.supplier_id],
        );
    }

    await client.query('COMMIT');
    console.log(`\nRemoved duplicate bill ${billNumber} (${inv.id}).`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => pool.end());
