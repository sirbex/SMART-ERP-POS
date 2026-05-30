#!/usr/bin/env node
/**
 * Cancel a supplier opening balance on Henber (or any tenant) with full GL reversal.
 *
 * Usage:
 *   node scripts/henber-cancel-supplier-ob.mjs
 *   OB_NUMBER=OB-000001 SUPPLIER_SEARCH=SALUD node scripts/henber-cancel-supplier-ob.mjs
 *   DRY_RUN=1 node scripts/henber-cancel-supplier-ob.mjs
 *
 * On production server (after deploy):
 *   docker exec -w /app smarterp-backend node henber-cancel-supplier-ob.mjs
 */
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../SamplePOS.Server/.env') });

const OB_NUMBER = process.env.OB_NUMBER || 'OB-000001';
const SUPPLIER_SEARCH = (process.env.SUPPLIER_SEARCH || 'SALUD').trim();
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
const CANCEL_REASON =
  process.env.CANCEL_REASON ||
  'Remove erroneous Salud opening balance to re-post correct cutover figure';

function henberDatabaseUrl() {
  if (process.env.HENBER_DATABASE_URL) return process.env.HENBER_DATABASE_URL;
  const base = process.env.DATABASE_URL;
  if (base) {
    return base.replace(/\/([^/?]+)(\?.*)?$/, '/pos_tenant_henber_pharmacy$2');
  }
  return 'postgresql://postgres:55b9bed51c599b26e7115ab126a974e8@postgres:5432/pos_tenant_henber_pharmacy';
}

const pool = new pg.Pool({ connectionString: henberDatabaseUrl() });

async function resolveAdminUserId(client) {
  if (process.env.ADMIN_USER_ID) return process.env.ADMIN_USER_ID;
  const res = await client.query(
    `SELECT id FROM users WHERE is_active = true ORDER BY created_at ASC LIMIT 1`,
  );
  const id = res.rows[0]?.id;
  if (!id) throw new Error('No active user found for audit/GL userId');
  return id;
}

async function apSnapshot(client, supplierId) {
  const sup = await client.query(
    `SELECT "CompanyName", "OutstandingBalance" FROM suppliers WHERE "Id" = $1`,
    [supplierId],
  );
  const gl = await client.query(
    `SELECT COALESCE(SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0) AS ap_net
     FROM ledger_entries le
     JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
     JOIN accounts a ON a."Id" = le."AccountId"
     WHERE a."AccountCode" = '2100'
       AND UPPER(le."EntityType") = 'SUPPLIER'
       AND le."EntityId" = $1::text
       AND lt."Status" = 'POSTED'
       AND COALESCE(lt."IsReversed", false) = false`,
    [supplierId],
  );
  return {
    name: sup.rows[0]?.CompanyName,
    outstanding: Number(sup.rows[0]?.OutstandingBalance ?? 0),
    glNet: Number(gl.rows[0]?.ap_net ?? 0),
  };
}

async function loadOb(client) {
  const res = await client.query(
    `SELECT si."Id", si."SupplierId", si."SupplierInvoiceNumber", si."Status",
            si."TotalAmount", si."AmountPaid", si."OutstandingBalance", si."InvoiceDate",
            s."CompanyName"
     FROM supplier_invoices si
     JOIN suppliers s ON s."Id" = si."SupplierId"
     WHERE si."SupplierInvoiceNumber" = $1
       AND si.document_type = 'OPENING_BALANCE'
       AND si.deleted_at IS NULL
       AND s."CompanyName" ILIKE $2`,
    [OB_NUMBER, `%${SUPPLIER_SEARCH}%`],
  );
  return res.rows[0];
}

async function diagnoseOb(client, ob) {
  const alloc = await client.query(
    `SELECT COUNT(*)::int AS n FROM supplier_payment_allocations
     WHERE "SupplierInvoiceId" = $1 AND deleted_at IS NULL`,
    [ob.Id],
  );
  const glTxn = await client.query(
    `SELECT "Id", "TransactionNumber", "IsReversed", "TotalDebitAmount", "TotalCreditAmount"
     FROM ledger_transactions
     WHERE "ReferenceType" = 'SUPPLIER_OPENING_BALANCE' AND "ReferenceId" = $1`,
    [ob.Id],
  );
  const entries = await client.query(
    `SELECT a."AccountCode", le."DebitAmount", le."CreditAmount", le."Description"
     FROM ledger_entries le
     JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
     JOIN accounts a ON a."Id" = le."AccountId"
     WHERE lt."ReferenceType" = 'SUPPLIER_OPENING_BALANCE' AND lt."ReferenceId" = $1`,
    [ob.Id],
  );
  return { allocCount: alloc.rows[0]?.n ?? 0, glTxn: glTxn.rows, entries: entries.rows };
}

const distRoot = process.env.SAMPLEPOS_DIST_ROOT || '/app/dist/SamplePOS.Server/src';
const localDist = new URL('../SamplePOS.Server/dist/', import.meta.url).pathname;

async function loadModule(relativePath) {
  const candidates = [
    `${distRoot}/${relativePath}`,
    `${localDist}${relativePath}`,
  ];
  let lastErr;
  for (const href of candidates) {
    try {
      return await import(href);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

try {
  const { cancelSupplierOpeningBalance } = await loadModule(
    'modules/supplier-payments/supplierPaymentService.js',
  );
  const { recalcAllSupplierBalances } = await loadModule('modules/system/glRepairService.js');

  const client = await pool.connect();
  try {
    console.log('DB:', henberDatabaseUrl().replace(/\/\/[^@]+@/, '//***@'));
    console.log('Target:', OB_NUMBER, '| supplier ILIKE', SUPPLIER_SEARCH, '| DRY_RUN=', DRY_RUN);

    const ob = await loadOb(client);
    if (!ob) {
      throw new Error(`No opening balance ${OB_NUMBER} for supplier matching "${SUPPLIER_SEARCH}"`);
    }

    console.log('\n--- OB record ---');
    console.table([ob]);

    const diag = await diagnoseOb(client, ob);
    console.log('\n--- Linked data ---');
    console.log('Allocations:', diag.allocCount);
    if (diag.glTxn.length) console.table(diag.glTxn);
    if (diag.entries.length) console.table(diag.entries);

    const before = await apSnapshot(client, ob.SupplierId);
    console.log('\n--- Supplier AP before ---');
    console.log(before);

    if (String(ob.Status || '').toUpperCase() === 'CANCELLED') {
      console.log('\nOB already Cancelled — you can post a new opening balance in Supplier Payments.');
      process.exit(0);
    }

    if (DRY_RUN) {
      console.log('\nDRY_RUN — no cancel applied.');
      process.exit(0);
    }

    const adminId = await resolveAdminUserId(client);
    console.log('\nCancelling with userId', adminId);

    const result = await cancelSupplierOpeningBalance(pool, ob.Id, adminId, CANCEL_REASON, {
      userName: 'System',
      userRole: 'ADMIN',
    });
    console.log('Cancel result:', result);

    const recalc = await recalcAllSupplierBalances(pool);
    console.log('recalcAllSupplierBalances:', recalc);

    const afterOb = await loadOb(client);
    const after = await apSnapshot(client, ob.SupplierId);
    const afterDiag = await diagnoseOb(client, afterOb);

    console.log('\n--- After cancel ---');
    console.log('OB status:', afterOb?.Status);
    console.log('GL reversed:', afterDiag.glTxn.some((t) => t.IsReversed) || afterDiag.glTxn.length === 0);
    console.log('Supplier AP after:', after);

    const activeOb = await client.query(
      `SELECT "Id" FROM supplier_invoices
       WHERE "SupplierId" = $1 AND document_type = 'OPENING_BALANCE'
         AND deleted_at IS NULL
         AND UPPER("Status") NOT IN ('CANCELLED', 'VOIDED', 'DELETED')`,
      [ob.SupplierId],
    );
    console.log(
      activeOb.rows.length === 0
        ? '\n✅ No active OB — safe to post new opening balance for this supplier.'
        : '\n⚠ Active OB still exists — investigate before re-posting.',
    );
  } finally {
    client.release();
  }
} catch (e) {
  console.error(e?.message || e);
  process.exit(1);
} finally {
  await pool.end();
}
