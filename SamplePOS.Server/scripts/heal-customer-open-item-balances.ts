/**
 * One-shot heal: sync every active customer balance via AR open-item SSOT.
 * Safe to re-run (idempotent). Does not post GL — subledger only.
 *
 * Usage: npx tsx scripts/heal-customer-open-item-balances.ts
 */
import pg from 'pg';
import * as openItemEngine from '../src/modules/ar-payments/openItemAllocationEngine.js';

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/pos_system';

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 3 });
  const client = await pool.connect();

  try {
    const customers = await client.query<{ id: string; name: string }>(
      `SELECT id, name FROM customers WHERE is_active = true ORDER BY name`,
    );

    let changed = 0;
    await client.query('BEGIN');
    for (const row of customers.rows) {
      const { oldBalance, newBalance } = await openItemEngine.syncCustomerBalanceFromOpenItems(
        client,
        row.id,
        'HEAL_OPEN_ITEM_BALANCE',
      );
      if (oldBalance !== newBalance) {
        changed++;
        console.log(
          `  ${row.name}: ${oldBalance.toFixed(2)} → ${newBalance.toFixed(2)}`,
        );
      }
    }
    await client.query('COMMIT');
    console.log(`\nHealed ${changed}/${customers.rows.length} customer balance(s).`);
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
