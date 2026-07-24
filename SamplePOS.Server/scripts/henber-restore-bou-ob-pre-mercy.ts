/**
 * Restore Henber BOU AR opening balance to pre-Mercy figure (12,820,715).
 * Uses production replaceCustomerOpeningBalance (cancel OB-000005 + post new OB + FIFO reallocate).
 *
 * DRY_RUN=1 node --import tsx scripts/henber-restore-bou-ob-pre-mercy.ts
 * DRY_RUN=0 node --import tsx scripts/henber-restore-bou-ob-pre-mercy.ts
 */
import pg from 'pg';
import { replaceCustomerOpeningBalance } from '../src/modules/customers/customerService.js';

const CUSTOMER_ID = '81c0d6d5-d939-4bad-a17b-86728b4b72e4';
const TARGET_AMOUNT = 12_820_715;
const DRY_RUN = process.env.DRY_RUN !== '0';

const pool = new pg.Pool({
  connectionString:
    'postgresql://postgres:55b9bed51c599b26e7115ab126a974e8@209.38.203.138:5432/pos_tenant_henber_pharmacy',
  statement_timeout: 180_000,
});

async function snapshot(label: string) {
  const obs = await pool.query(
    `SELECT invoice_number, status, total_amount::float8 AS total,
            amount_paid::float8 AS paid, amount_due::float8 AS due, issue_date::text AS issue
     FROM invoices
     WHERE customer_id = $1 AND document_type = 'OPENING_BALANCE'
     ORDER BY created_at`,
    [CUSTOMER_ID],
  );
  const pays = await pool.query(
    `SELECT payment_number, status,
            total_amount::float8 AS total,
            allocated_amount::float8 AS alloc,
            unallocated_amount::float8 AS unalloc
     FROM ar_customer_payments WHERE customer_id = $1 ORDER BY payment_number`,
    [CUSTOMER_ID],
  );
  const cust = await pool.query(`SELECT name, balance::float8 AS balance FROM customers WHERE id = $1`, [
    CUSTOMER_ID,
  ]);
  const ua = await pool.query(
    `SELECT COALESCE(SUM(unallocated_amount),0)::float8 AS ua
     FROM ar_customer_payments
     WHERE customer_id = $1 AND unallocated_amount > 0.009
       AND status NOT IN ('REVERSED','CANCELLED','DRAFT')`,
    [CUSTOMER_ID],
  );
  console.log(`\n=== ${label} ===`);
  console.table(obs.rows);
  console.table(pays.rows);
  console.log('Customer:', cust.rows[0], 'Unallocated:', ua.rows[0]?.ua);
}

async function main() {
  await snapshot('BEFORE');

  const active = await pool.query<{ id: string; invoice_number: string; total_amount: string }>(
    `SELECT id, invoice_number, total_amount::text
     FROM invoices
     WHERE customer_id = $1
       AND document_type = 'OPENING_BALANCE'
       AND status NOT IN ('CANCELLED','VOIDED')
     LIMIT 1`,
    [CUSTOMER_ID],
  );
  if (!active.rows[0]) {
    throw new Error('No active customer OB found for BOU');
  }
  if (active.rows[0].invoice_number !== 'OB-000005') {
    throw new Error(
      `Expected active OB-000005, found ${active.rows[0].invoice_number} — aborting`,
    );
  }

  const oldOb = await pool.query<{ issue: string }>(
    `SELECT issue_date::date::text AS issue
     FROM invoices WHERE customer_id = $1 AND invoice_number = 'OB-000002'`,
    [CUSTOMER_ID],
  );
  let asOfDate = (oldOb.rows[0]?.issue || '2026-05-27').slice(0, 10);
  const period = await pool.query<{ status: string }>(
    `SELECT "Status" AS status
     FROM financial_periods
     WHERE period_year = EXTRACT(YEAR FROM $1::date)::int
       AND period_month = EXTRACT(MONTH FROM $1::date)::int`,
    [asOfDate],
  );
  if (period.rows[0] && period.rows[0].status !== 'OPEN') {
    const fallback = await pool.query<{ issue: string }>(
      `SELECT issue_date::date::text AS issue FROM invoices
       WHERE customer_id = $1 AND invoice_number = 'OB-000005'`,
      [CUSTOMER_ID],
    );
    asOfDate = (fallback.rows[0]?.issue || '2026-07-01').slice(0, 10);
    console.log(
      `Period for original OB date is ${period.rows[0].status} — using asOfDate ${asOfDate}`,
    );
  }

  const mercy = await pool.query<{ id: string; full_name: string }>(
    `SELECT id, full_name FROM users WHERE full_name ILIKE 'Mercy%' OR email ILIKE '%mercy%' LIMIT 1`,
  );
  const actor =
    mercy.rows[0] ??
    (await pool.query<{ id: string; full_name: string }>(`SELECT id, full_name FROM users LIMIT 1`))
      .rows[0];
  if (!actor) throw new Error('No user to attribute restore');

  console.log('\nPlan:');
  console.log(`  Cancel ${active.rows[0].invoice_number} (${active.rows[0].total_amount})`);
  console.log(`  Post new OB ${TARGET_AMOUNT} asOf ${asOfDate}`);
  console.log(`  Actor: ${actor.full_name} (${actor.id})`);
  console.log(`  DRY_RUN=${DRY_RUN}`);

  if (DRY_RUN) {
    console.log('\nDry run only — set DRY_RUN=0 to execute.');
    await pool.end();
    return;
  }

  const result = await replaceCustomerOpeningBalance(pool, {
    customerId: CUSTOMER_ID,
    amount: TARGET_AMOUNT,
    asOfDate,
    userId: actor.id,
    userName: actor.full_name,
    userRole: 'ADMIN',
    postReason: 'Restore pre-Mercy BOU opening balance 12820715',
    replaceReason: 'Restore BOU opening balance to pre-Mercy amount 12,820,715 (cancel OB-000005)',
    confirmImpact: true,
  });

  console.log('\nReplace result:', result);
  await snapshot('AFTER');

  const newOb = await pool.query(
    `SELECT invoice_number, status, total_amount::float8, amount_paid::float8, amount_due::float8
     FROM invoices WHERE id = $1`,
    [result.invoiceId],
  );
  console.log('New OB row:', newOb.rows[0]);

  if (Number(newOb.rows[0]?.amount_due) > 0.009) {
    console.error('WARNING: new OB still has amount_due — allocations may be incomplete');
    process.exitCode = 2;
  }

  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
