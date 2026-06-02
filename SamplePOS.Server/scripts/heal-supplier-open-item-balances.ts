/**
 * One-shot heal: sync every supplier balance via AP open-item SSOT.
 * Safe to re-run (idempotent). Does not post GL — subledger only.
 *
 * Usage: npx tsx scripts/heal-supplier-open-item-balances.ts
 */
import pg from 'pg';
import { syncSupplierBalanceFromOpenItems } from '../src/modules/supplier-payments/apReconciliationEngine.js';

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/pos_system';

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 3 });
  const client = await pool.connect();

  try {
    const suppliers = await client.query<{ Id: string; CompanyName: string }>(
      `SELECT "Id", "CompanyName" FROM suppliers WHERE "IsActive" = true ORDER BY "CompanyName"`,
    );

    let changed = 0;
    await client.query('BEGIN');
    for (const row of suppliers.rows) {
      const { oldBalance, newBalance } = await syncSupplierBalanceFromOpenItems(
        client,
        row.Id,
        'HEAL_OPEN_ITEM_BALANCE',
      );
      if (oldBalance !== newBalance) {
        changed++;
        console.log(
          `  ${row.CompanyName}: ${oldBalance.toFixed(2)} → ${newBalance.toFixed(2)}`,
        );
      }
    }
    await client.query('COMMIT');
    console.log(`\nHealed ${changed}/${suppliers.rows.length} supplier balance(s).`);
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
