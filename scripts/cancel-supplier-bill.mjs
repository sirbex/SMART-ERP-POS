#!/usr/bin/env node
/**
 * Cancel a posted supplier bill (reverse GL + mark Cancelled).
 * Uses server cancelSupplierInvoiceForCorrection — safe for duplicate bills.
 * UI: Accounting → Supplier Payments → Cancel bill (purchasing.cancel_bill).
 *
 * Usage:
 *   node scripts/cancel-supplier-bill.mjs SBILL-2026-0243 [--execute]
 */
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const billNumber = process.argv[2];
const execute = process.argv.includes('--execute');

if (!billNumber) {
  console.error('Usage: node scripts/cancel-supplier-bill.mjs <SBILL-number> [--execute]');
  process.exit(1);
}

function loadDatabaseUrl() {
  if (process.env.HENBER_DATABASE_URL) return process.env.HENBER_DATABASE_URL;
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL.replace(/\/([^/?]+)(\?.*)?$/, '/pos_tenant_henber_pharmacy$2');
  }
  throw new Error('Set HENBER_DATABASE_URL or DATABASE_URL');
}

const pool = new pg.Pool({ connectionString: loadDatabaseUrl() });

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const serviceCandidates = [
  '/app/dist/SamplePOS.Server/src/modules/supplier-payments/supplierPaymentService.js',
  path.resolve(scriptDir, '../SamplePOS.Server/dist/SamplePOS.Server/src/modules/supplier-payments/supplierPaymentService.js'),
];
const servicePath = serviceCandidates.find((p) => fs.existsSync(p));
if (!servicePath) throw new Error('supplierPaymentService.js not found — build server first');
const { cancelSupplierInvoiceForCorrection } = await import(pathToFileURL(servicePath).href);

async function main() {
  const { rows } = await pool.query(
    `SELECT "Id", "SupplierInvoiceNumber", "Status", COALESCE("AmountPaid",0) AS paid,
            COALESCE(is_posted_to_gl,false) AS posted
     FROM supplier_invoices
     WHERE "SupplierInvoiceNumber" = $1 AND deleted_at IS NULL`,
    [billNumber],
  );

  if (rows.length === 0) {
    console.error(`Bill ${billNumber} not found.`);
    process.exit(1);
  }

  const inv = rows[0];
  console.log('Found:', inv);

  if (Number(inv.paid) > 0.01) {
    console.error('Refusing: bill has payments.');
    process.exit(1);
  }

  const status = String(inv.status || inv.Status || '').toUpperCase();
  if (status === 'CANCELLED' || status === 'DELETED') {
    console.log('Already cancelled/deleted.');
    return;
  }

  if (!execute) {
    console.log('\nDry run OK. Re-run with --execute to reverse GL and cancel this bill.');
    return;
  }

  const admin = await pool.query(
    `SELECT id FROM users WHERE UPPER(role) = 'ADMIN' AND is_active = true ORDER BY created_at LIMIT 1`,
  );
  const userId = admin.rows[0]?.id;
  if (!userId) throw new Error('No admin user found');

  const result = await cancelSupplierInvoiceForCorrection(
    pool,
    inv.Id ?? inv.id,
    userId,
    `Duplicate bill removal — ${billNumber} was created in error`,
  );

  console.log('Cancelled:', result);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => pool.end());
