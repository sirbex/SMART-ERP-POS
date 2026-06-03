/**
 * One-shot heal: re-derive every supplier invoice from ledger SSOT, then sync caches.
 * Safe to re-run (idempotent). Does not post GL — subledger only.
 *
 * Usage:
 *   npx tsx scripts/heal-supplier-open-item-balances.ts
 *   SUPPLIER_ID=<uuid> npx tsx scripts/heal-supplier-open-item-balances.ts
 */
import pg from 'pg';
import {
  syncSupplierBalanceFromOpenItems,
} from '../src/modules/supplier-payments/apReconciliationEngine.js';
import { repairSupplierInvoiceOutstandingFromLedger } from '../src/modules/supplier-payments/supplierPaymentRepository.js';

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/pos_system';
const SUPPLIER_ID = process.env.SUPPLIER_ID;

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 3 });
  const client = await pool.connect();

  try {
    const supplierFilter = SUPPLIER_ID
      ? `WHERE "Id" = $1`
      : `WHERE "IsActive" = true`;
    const params = SUPPLIER_ID ? [SUPPLIER_ID] : [];
    const suppliers = await client.query<{ Id: string; CompanyName: string }>(
      `SELECT "Id", "CompanyName" FROM suppliers ${supplierFilter} ORDER BY "CompanyName"`,
      params,
    );

    let invoicesRepaired = 0;
    let suppliersChanged = 0;
    await client.query('BEGIN');
    for (const row of suppliers.rows) {
      const inv = await repairSupplierInvoiceOutstandingFromLedger(client, row.Id);
      invoicesRepaired += inv.repaired;
      const { oldBalance, newBalance } = await syncSupplierBalanceFromOpenItems(
        client,
        row.Id,
        'HEAL_OPEN_ITEM_BALANCE',
      );
      if (inv.repaired > 0 || oldBalance !== newBalance) {
        suppliersChanged++;
        console.log(
          `  ${row.CompanyName}: invoices repaired ${inv.repaired}/${inv.scanned}, balance ${oldBalance.toFixed(2)} → ${newBalance.toFixed(2)}`,
        );
      }
    }
    await client.query('COMMIT');
    console.log(
      `\nHealed ${suppliersChanged}/${suppliers.rows.length} supplier(s); ${invoicesRepaired} invoice row(s) realigned from ledger.`,
    );
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
