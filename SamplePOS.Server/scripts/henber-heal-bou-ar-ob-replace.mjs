/**
 * Heal Henber BOU AR inconsistencies after OB replace:
 * 1) Fix receipt statuses from allocated/unallocated amounts
 * 2) FIFO-apply unallocated receipts onto open OB-000005
 */
import pg from 'pg';
import Decimal from 'decimal.js';

const pool = new pg.Pool({
  connectionString:
    'postgresql://postgres:55b9bed51c599b26e7115ab126a974e8@209.38.203.138:5432/pos_tenant_henber_pharmacy',
  statement_timeout: 120000,
});

const CUSTOMER_ID = '81c0d6d5-d939-4bad-a17b-86728b4b72e4';

async function resolveActorUserId(client) {
  const r = await client.query(
    `SELECT id FROM users WHERE full_name ILIKE 'Mercy%' OR email ILIKE '%mercy%' LIMIT 1`,
  );
  if (r.rows[0]?.id) return r.rows[0].id;
  const any = await client.query(`SELECT id FROM users ORDER BY created_at NULLS LAST LIMIT 1`);
  return any.rows[0]?.id ?? null;
}

async function fixAllPaymentStatuses(client) {
  const res = await client.query(
    `UPDATE ar_customer_payments
     SET status = CASE
           WHEN status IN ('REVERSED', 'CANCELLED', 'DRAFT') THEN status
           WHEN COALESCE(allocated_amount, 0) <= 0.009 THEN 'POSTED'
           WHEN COALESCE(unallocated_amount, 0) <= 0.009 THEN 'FULLY_ALLOCATED'
           ELSE 'PARTIALLY_ALLOCATED'
         END,
         updated_at = NOW()
     WHERE status NOT IN ('REVERSED', 'CANCELLED', 'DRAFT')
       AND (
         (COALESCE(allocated_amount, 0) <= 0.009 AND status IS DISTINCT FROM 'POSTED')
         OR (
           COALESCE(unallocated_amount, 0) <= 0.009
           AND COALESCE(allocated_amount, 0) > 0.009
           AND status IS DISTINCT FROM 'FULLY_ALLOCATED'
         )
         OR (
           COALESCE(allocated_amount, 0) > 0.009
           AND COALESCE(unallocated_amount, 0) > 0.009
           AND status IS DISTINCT FROM 'PARTIALLY_ALLOCATED'
         )
       )
     RETURNING payment_number, status, allocated_amount, unallocated_amount`,
  );
  console.log(`Fixed ${res.rowCount} payment status row(s) globally`);
  if (res.rows.length) console.table(res.rows);
}

async function allocateToOb(client, actorUserId) {
  const ob = await client.query(
    `SELECT id, invoice_number, amount_due, status
     FROM invoices
     WHERE customer_id = $1
       AND invoice_number = 'OB-000005'
       AND status NOT IN ('CANCELLED', 'VOIDED', 'DRAFT')`,
    [CUSTOMER_ID],
  );
  if (!ob.rows[0]) {
    console.log('OB-000005 not open — skip reallocate');
    return;
  }
  let remaining = new Decimal(ob.rows[0].amount_due);
  console.log(`OB-000005 open due: ${remaining.toFixed(2)}`);

  const receipts = await client.query(
    `SELECT id, payment_number, payment_date, payment_method, unallocated_amount
     FROM ar_customer_payments
     WHERE customer_id = $1
       AND status NOT IN ('REVERSED', 'CANCELLED', 'DRAFT')
       AND unallocated_amount > 0.009
     ORDER BY payment_date ASC, created_at ASC
     FOR UPDATE`,
    [CUSTOMER_ID],
  );

  for (const pay of receipts.rows) {
    if (remaining.lte(0.009)) break;
    const avail = new Decimal(pay.unallocated_amount);
    const amt = Decimal.min(remaining, avail);
    if (amt.lte(0.009)) continue;

    const paymentDate =
      pay.payment_date instanceof Date
        ? pay.payment_date.toISOString().slice(0, 10)
        : String(pay.payment_date).slice(0, 10);

    const rn = await client.query(
      `SELECT 'RCPT-' || LPAD((
         COALESCE(MAX(CAST(SUBSTRING(receipt_number FROM 'RCPT-([0-9]+)') AS INTEGER)), 0) + 1
       )::text, 6, '0') AS n
       FROM invoice_payments`,
    );
    const ip = await client.query(
      `INSERT INTO invoice_payments (
         receipt_number, invoice_id, amount, payment_method, payment_date, processed_by_id, created_at
       ) VALUES ($1, $2, $3, $4, $5::date, $6, NOW())
       RETURNING id`,
      [
        rn.rows[0].n,
        ob.rows[0].id,
        amt.toNumber(),
        pay.payment_method,
        paymentDate,
        actorUserId,
      ],
    );

    await client.query(
      `INSERT INTO ar_payment_allocations (
         payment_id, invoice_id, invoice_payment_id, amount_allocated,
         allocation_date, allocation_type, status, created_by_id, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5::date, 'FIFO', 'ACTIVE', $6, NOW(), NOW())`,
      [pay.id, ob.rows[0].id, ip.rows[0].id, amt.toNumber(), paymentDate, actorUserId],
    );

    await client.query(
      `UPDATE ar_customer_payments
       SET allocated_amount = allocated_amount + $2,
           unallocated_amount = total_amount - (allocated_amount + $2),
           status = CASE
             WHEN ABS(allocated_amount + $2) <= 0.009 THEN 'POSTED'
             WHEN total_amount - (allocated_amount + $2) <= 0.009 THEN 'FULLY_ALLOCATED'
             WHEN (allocated_amount + $2) > 0.009 THEN 'PARTIALLY_ALLOCATED'
             ELSE 'POSTED'
           END,
           updated_at = NOW()
       WHERE id = $1`,
      [pay.id, amt.toNumber()],
    );

    remaining = remaining.minus(amt);
    console.log(
      `Allocated ${amt.toFixed(2)} from ${pay.payment_number} → OB-000005 (remaining OB ${remaining.toFixed(2)})`,
    );
  }

  await client.query(
    `UPDATE invoices i
     SET amount_paid = COALESCE((
           SELECT SUM(a.amount_allocated)
           FROM ar_payment_allocations a
           WHERE a.invoice_id = i.id AND a.status = 'ACTIVE'
         ), 0),
         amount_due = GREATEST(0, total_amount - COALESCE((
           SELECT SUM(a.amount_allocated)
           FROM ar_payment_allocations a
           WHERE a.invoice_id = i.id AND a.status = 'ACTIVE'
         ), 0)),
         status = CASE
           WHEN GREATEST(0, total_amount - COALESCE((
             SELECT SUM(a.amount_allocated)
             FROM ar_payment_allocations a
             WHERE a.invoice_id = i.id AND a.status = 'ACTIVE'
           ), 0)) <= 0.009 THEN 'PAID'::invoice_status
           WHEN COALESCE((
             SELECT SUM(a.amount_allocated)
             FROM ar_payment_allocations a
             WHERE a.invoice_id = i.id AND a.status = 'ACTIVE'
           ), 0) > 0.009 THEN 'PARTIALLY_PAID'::invoice_status
           ELSE 'UNPAID'::invoice_status
         END,
         updated_at = NOW()
     WHERE id = $1`,
    [ob.rows[0].id],
  );

  await client.query(
    `WITH open_inv AS (
       SELECT COALESCE(SUM(amount_due), 0) AS due
       FROM invoices
       WHERE customer_id = $1
         AND COALESCE(document_type, 'INVOICE') IN ('INVOICE', 'OPENING_BALANCE')
         AND status NOT IN ('CANCELLED', 'VOIDED', 'DRAFT')
     ),
     unalloc AS (
       SELECT COALESCE(SUM(unallocated_amount), 0) AS ua
       FROM ar_customer_payments
       WHERE customer_id = $1
         AND status IN ('POSTED', 'PARTIALLY_ALLOCATED', 'FULLY_ALLOCATED')
     )
     UPDATE customers SET balance = GREATEST(0, (SELECT due FROM open_inv) - (SELECT ua FROM unalloc))
     WHERE id = $1`,
    [CUSTOMER_ID],
  );
}

async function snapshot() {
  const pays = await pool.query(
    `SELECT payment_number, status, total_amount, allocated_amount, unallocated_amount
     FROM ar_customer_payments WHERE customer_id = $1 ORDER BY payment_number`,
    [CUSTOMER_ID],
  );
  const ob = await pool.query(
    `SELECT invoice_number, status, total_amount, amount_paid, amount_due
     FROM invoices WHERE customer_id = $1 AND invoice_number = 'OB-000005'`,
    [CUSTOMER_ID],
  );
  const cust = await pool.query(`SELECT balance FROM customers WHERE id = $1`, [CUSTOMER_ID]);
  const unalloc = await pool.query(
    `SELECT COALESCE(SUM(unallocated_amount),0)::float8 AS ua
     FROM ar_customer_payments
     WHERE customer_id = $1 AND unallocated_amount > 0.009
       AND status NOT IN ('REVERSED','CANCELLED','DRAFT')`,
    [CUSTOMER_ID],
  );
  console.log('\n=== AFTER ===');
  console.table(pays.rows);
  console.table(ob.rows);
  console.log('Customer balance:', cust.rows[0]?.balance);
  console.log('Unallocated remaining:', unalloc.rows[0]?.ua);
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await fixAllPaymentStatuses(client);
    const actorUserId = await resolveActorUserId(client);
    console.log('Actor user:', actorUserId);
    await allocateToOb(client, actorUserId);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  await snapshot();
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
