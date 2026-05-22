#!/usr/bin/env node
/**
 * Recalculate invoice amount_paid/amount_due including posted credit/debit notes,
 * then sync customer.balance from SUM(invoice amount_due).
 *
 * Usage: node scripts/repair-customer-invoice-balances.mjs [customerId]
 */
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/pos_system';
const customerIdFilter = process.argv[2] || null;

const pool = new pg.Pool({ connectionString: DATABASE_URL });

async function recalcInvoice(client, invoiceId) {
  const res = await client.query(
    `SELECT
       i.total_amount,
       COALESCE(pay.cash_paid, 0) AS cash_paid,
       COALESCE(cn.cn_amount, 0) AS cn_amount,
       COALESCE(dn.dn_amount, 0) AS dn_amount
     FROM invoices i
     LEFT JOIN (
       SELECT invoice_id, SUM(amount) AS cash_paid
       FROM invoice_payments WHERE invoice_id = $1 GROUP BY invoice_id
     ) pay ON pay.invoice_id = i.id
     LEFT JOIN (
       SELECT reference_invoice_id, SUM(total_amount) AS cn_amount
       FROM invoices
       WHERE reference_invoice_id = $1 AND document_type = 'CREDIT_NOTE' AND status = 'POSTED'
       GROUP BY reference_invoice_id
     ) cn ON cn.reference_invoice_id = i.id
     LEFT JOIN (
       SELECT reference_invoice_id, SUM(total_amount) AS dn_amount
       FROM invoices
       WHERE reference_invoice_id = $1 AND document_type = 'DEBIT_NOTE' AND status = 'POSTED'
       GROUP BY reference_invoice_id
     ) dn ON dn.reference_invoice_id = i.id
     WHERE i.id = $1`,
    [invoiceId],
  );
  if (!res.rows[0]) return null;
  const total = Number(res.rows[0].total_amount);
  const settled = Number(res.rows[0].cash_paid) + Number(res.rows[0].cn_amount) - Number(res.rows[0].dn_amount);
  const amountPaid = Math.min(total, Math.max(0, settled));
  const amountDue = Math.max(0, total - amountPaid);
  await client.query(
    `UPDATE invoices SET amount_paid = $1, amount_due = $2,
       status = CASE
         WHEN $2 = 0 AND $1 > 0 THEN 'PAID'
         WHEN $2 > 0 AND $1 > 0 THEN 'PARTIALLY_PAID'
         ELSE 'UNPAID'
       END,
       updated_at = NOW()
     WHERE id = $3`,
    [amountPaid, amountDue, invoiceId],
  );
  return { invoiceId, total, amountPaid, amountDue, cashPaid: Number(res.rows[0].cash_paid), cn: Number(res.rows[0].cn_amount) };
}

async function syncCustomer(client, customerId) {
  await client.query(
    `UPDATE customers SET balance = (
       SELECT COALESCE(SUM(amount_due), 0) FROM invoices
       WHERE customer_id = $1
         AND COALESCE(document_type, 'INVOICE') = 'INVOICE'
         AND status NOT IN ('CANCELLED', 'VOIDED', 'DRAFT')
     ), updated_at = NOW() WHERE id = $1`,
    [customerId],
  );
}

async function main() {
  const client = await pool.connect();
  try {
    const invQuery = customerIdFilter
      ? `SELECT id, customer_id, invoice_number FROM invoices
         WHERE COALESCE(document_type, 'INVOICE') = 'INVOICE'
           AND customer_id = $1 AND status NOT IN ('CANCELLED', 'VOIDED', 'DRAFT')`
      : `SELECT id, customer_id, invoice_number FROM invoices
         WHERE COALESCE(document_type, 'INVOICE') = 'INVOICE'
           AND status NOT IN ('CANCELLED', 'VOIDED', 'DRAFT')`;
    const invRes = await client.query(invQuery, customerIdFilter ? [customerIdFilter] : []);
    const customers = new Set();
    for (const row of invRes.rows) {
      const r = await recalcInvoice(client, row.id);
      customers.add(row.customer_id);
      if (r && (r.cashPaid + r.cn > r.total + 0.01)) {
        console.warn('OVERPAYMENT on', row.invoice_number, r);
      }
    }
    for (const cid of customers) {
      await syncCustomer(client, cid);
      const c = await client.query('SELECT name, balance FROM customers WHERE id = $1', [cid]);
      console.log('Synced', c.rows[0]?.name, 'balance', c.rows[0]?.balance);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
