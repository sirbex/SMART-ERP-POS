#!/usr/bin/env node
/**
 * Wipe all transactional data for Blis tenant (pos_tenant_blis).
 * Preserves master data: products, customers, suppliers, users, COA, settings, tables.
 *
 * Usage (production, inside smarterp-backend):
 *   CONFIRM='RESET ALL TRANSACTIONS' DRY_RUN=0 node blis-reset-transactions.mjs
 *
 * Safety:
 *   - DRY_RUN=1 (default) only prints counts
 *   - CONFIRM must be exactly RESET ALL TRANSACTIONS
 *   - Creates mandatory pg_dump backup via systemManagementService
 */
import pg from 'pg';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIRM_PHRASE = 'RESET ALL TRANSACTIONS';
const DRY_RUN = process.env.DRY_RUN !== '0' && process.env.DRY_RUN !== 'false';
const CONFIRM = process.env.CONFIRM || '';
const REASON =
  process.env.RESET_REASON ||
  'Blis go-live fresh start: clear all testing transactions, deposits, and customer balances';

function blisDatabaseUrl() {
  if (process.env.BLIS_DATABASE_URL) return process.env.BLIS_DATABASE_URL;
  const base = process.env.DATABASE_URL;
  if (!base) {
    throw new Error('DATABASE_URL is required (rewritten to pos_tenant_blis)');
  }
  return base.replace(/\/([^/?]+)(\?.*)?$/, '/pos_tenant_blis$2');
}

async function countIfExists(client, table) {
  try {
    const r = await client.query(`SELECT COUNT(*)::int AS n FROM ${table}`);
    return r.rows[0].n;
  } catch {
    return null;
  }
}

async function preview(pool) {
  const client = await pool.connect();
  try {
    const tables = [
      'sales',
      'sale_payments',
      'customer_deposits',
      'pos_customer_deposits',
      'customer_payments',
      'ar_customer_payments',
      'invoices',
      'pos_orders',
      'restaurant_kot',
      'ledger_transactions',
      'supplier_invoices',
      'goods_receipts',
      'stock_movements',
      'bank_transactions',
      'cash_register_sessions',
    ];
    console.log('=== Blis (pos_tenant_blis) reset preview ===');
    let total = 0;
    for (const t of tables) {
      const n = await countIfExists(client, t);
      if (n === null) {
        console.log(`  ${t}: (missing)`);
      } else {
        console.log(`  ${t}: ${n}`);
        total += n;
      }
    }
    const custBal = await client.query(
      `SELECT COUNT(*)::int AS n FROM customers WHERE COALESCE(balance, 0) <> 0`,
    ).catch(() => ({ rows: [{ n: 0 }] }));
    console.log(`  customers with non-zero balance: ${custBal.rows[0].n}`);
    console.log(`  (sample txn rows counted): ${total}`);
    return total;
  } finally {
    client.release();
  }
}

async function loadService() {
  // Production image layout: /app/dist/SamplePOS.Server/src/...
  const candidates = [
    path.join('/app', 'dist/SamplePOS.Server/src/modules/system-management/systemManagementService.js'),
    path.join(__dirname, '../SamplePOS.Server/dist/SamplePOS.Server/src/modules/system-management/systemManagementService.js'),
    path.join(__dirname, '../dist/SamplePOS.Server/src/modules/system-management/systemManagementService.js'),
  ];
  for (const p of candidates) {
    try {
      const mod = await import(pathToFileURL(p).href);
      if (mod.systemManagementService) return mod.systemManagementService;
    } catch {
      /* try next */
    }
  }
  throw new Error('Could not import systemManagementService from container dist');
}

async function main() {
  const url = blisDatabaseUrl();
  // createBackup reads db name from DATABASE_URL — force Blis before service call.
  process.env.DATABASE_URL = url;
  console.log('Target DB URL host/db:', url.replace(/:[^:@/]+@/, ':****@'));

  const pool = new pg.Pool({ connectionString: url });
  try {
    await preview(pool);

    if (DRY_RUN) {
      console.log('\nDRY_RUN=1 — no changes. Re-run with DRY_RUN=0 CONFIRM=\'RESET ALL TRANSACTIONS\'');
      return;
    }
    if (CONFIRM !== CONFIRM_PHRASE) {
      throw new Error(`CONFIRM must be exactly "${CONFIRM_PHRASE}"`);
    }

    const admin = await pool.query(
      `SELECT id, email
       FROM users WHERE is_active = true
       ORDER BY created_at ASC
       LIMIT 1`,
    );
    const user = admin.rows[0];
    if (!user) throw new Error('No active user in pos_tenant_blis for audit trail');

    console.log(`\nExecuting reset as ${user.email} (${user.id})...`);
    const service = await loadService();
    const result = await service.resetTransactionalData(
      pool,
      user.id,
      user.email,
      CONFIRM_PHRASE,
      REASON,
      'github-actions',
      'blis-reset-transactions.mjs',
    );

    console.log('\n=== RESET COMPLETE ===');
    console.log(JSON.stringify(result, null, 2));
    await preview(pool);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Blis reset FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
});
