#!/usr/bin/env node
/**
 * Henber — reverse mistaken AP heal, rebuild GPB, repost missing GL (no healAPDrift).
 */
import pg from 'pg';
import { AccountingCore } from '/app/dist/SamplePOS.Server/src/services/accountingCore.js';
import {
  repostAllMissingGL,
  rebuildPeriodBalances,
  recalcAllSupplierBalances,
} from '/app/dist/SamplePOS.Server/src/modules/system/glRepairService.js';

function henberDatabaseUrl() {
  if (process.env.HENBER_DATABASE_URL) return process.env.HENBER_DATABASE_URL;
  const base = process.env.DATABASE_URL;
  if (base) {
    return base.replace(/\/([^/?]+)(\?.*)?$/, '/pos_tenant_henber_pharmacy$2');
  }
  return 'postgresql://postgres:55b9bed51c599b26e7115ab126a974e8@postgres:5432/pos_tenant_henber_pharmacy';
}

const pool = new pg.Pool({ connectionString: henberDatabaseUrl() });
const BAD_AP_HEAL_TXN = '56cd8eed-34d7-4402-9170-a52af7aa7098';
const BAD_AP_HEAL_KEY = 'AP-DRIFT-HEAL-2026-05-29';

async function resolveAdminUserId(client) {
  if (process.env.ADMIN_USER_ID) return process.env.ADMIN_USER_ID;
  const res = await client.query(
    `SELECT id FROM users WHERE is_active = true ORDER BY created_at ASC LIMIT 1`,
  );
  return res.rows[0]?.id;
}

try {
  const adminUserId = await resolveAdminUserId(pool);
  console.log('Henber DB:', henberDatabaseUrl().replace(/\/\/[^@]+@/, '//***@'));

  const existing = await pool.query(
    `SELECT "Id", "TransactionNumber", "IsReversed"
     FROM ledger_transactions
     WHERE "Id" = $1 OR "IdempotencyKey" = $2
     LIMIT 1`,
    [BAD_AP_HEAL_TXN, BAD_AP_HEAL_KEY],
  );
  const row = existing.rows[0];
  if (row && !row.IsReversed) {
    console.log('\n→ Reversing mistaken AP heal', row.TransactionNumber);
    const rev = await AccountingCore.reverseTransaction(
      {
        originalTransactionId: row.Id,
        reversalDate: new Date().toISOString().slice(0, 10),
        reason: 'Reverse AP heal — used wrong subledger metric (suppliers cache vs invoices)',
        userId: adminUserId,
        idempotencyKey: `REVERSAL-${row.Id}`,
      },
      pool,
    );
    console.log('  Reversed:', rev.transactionNumber);
  } else if (row?.IsReversed) {
    console.log('\n→ AP heal already reversed');
  } else {
    console.log('\n→ No AP heal journal found to reverse (may already be fixed)');
  }

  console.log('\n→ repostAllMissingGL...');
  console.log('  ', (await repostAllMissingGL(pool)).summary);

  console.log('\n→ rebuildPeriodBalances...');
  console.log('  ', await rebuildPeriodBalances(pool));

  console.log('\n→ recalcAllSupplierBalances...');
  console.log('  ', await recalcAllSupplierBalances(pool));

  console.log('\nOK: GPB rebuilt; AP heal reversed. Refresh Report Integrity (no blind AP heal).');
} catch (e) {
  console.error(e?.message || e);
  process.exit(1);
} finally {
  await pool.end();
}
