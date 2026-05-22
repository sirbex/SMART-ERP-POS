#!/usr/bin/env node
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/pos_system';
const customerIdFilter = process.argv[2] || null;
const pool = new pg.Pool({ connectionString: DATABASE_URL });

async function recalcInvoice(client, invoiceId) {
  const res = await client.query(
    `SELECT i.total_amount, COALESCE(pay.cash_paid, 0) AS cash_paid,
            COALESCE(cn.cn_amount, 0) AS cn_amount, COALESCE(dn.dn_amount, 0) AS dn_amount
     FROM invoices i
     LEFT JOIN (SELECT invoice_id, SUM(amount) AS cash_paid FROM invoice_payments WHERE invoice_id = $1 GROUP BY invoice_id) pay ON pay.invoice_id = i.id
     LEFT JOIN (SELECT reference_invoice_id, SUM(total_amount) AS cn_amount FROM invoices WHERE reference_invoice_id = $1 AND document_type = 'CREDIT_NOTE' AND status = 'POSTED' GROUP BY reference_invoice_id) cn ON cn.reference_invoice_id = i.id
     LEFT JOIN (SELECT reference_invoice_id, SUM(total_amount) AS dn_amount FROM invoices WHERE reference_invoice_id = $1 AND document_type = 'DEBIT_NOTE' AND status = 'POSTED' GROUP BY reference_invoice_id) dn ON dn.reference_invoice_id = i.id
     WHERE i.id = $1`,
    [invoiceId],
  );
  if (!res.rows[0]) return null;
  const total = Number(res.rows[0].total_amount);
  const settled = Number(res.rows[0].cash_paid) + Number(res.rows[0].cn_amount) - Number(res.rows[0].dn_amount);
  const amountPaid = Math.min(total, Math.max(0, settled));
  const amountDue = Math.max(0, total - amountPaid);
  await client.query(
    `UPDATE invoices SET amount_paid = $1::numeric, amount_due = $2::numeric,
       status = CASE WHEN $2::numeric = 0 AND $1::numeric > 0 THEN 'PAID'::invoice_status
                     WHEN $2::numeric > 0 AND $1::numeric > 0 THEN 'PARTIALLY_PAID'::invoice_status
                     ELSE 'UNPAID'::invoice_status END,
       updated_at = NOW() WHERE id = $3`,
    [amountPaid, amountDue, invoiceId],
  );

  const inv = await client.query('SELECT sale_id FROM invoices WHERE id = $1', [invoiceId]);
  const saleId = inv.rows[0]?.sale_id;
  if (saleId) {
    const isFullySettled = amountDue <= 0 && amountPaid > 0;
    const sale = await client.query('SELECT payment_method FROM sales WHERE id = $1', [saleId]);
    const method = sale.rows[0]?.payment_method;
    const newMethod = isFullySettled && method === 'CREDIT' ? 'CASH' : method;
    await client.query(
      `UPDATE sales SET amount_paid = $1::numeric,
         payment_method = COALESCE($2::payment_method, payment_method) WHERE id = $3`,
      [amountPaid, newMethod, saleId],
    );
  }

  return { total, amountPaid, amountDue, cash: Number(res.rows[0].cash_paid), cn: Number(res.rows[0].cn_amount) };
}

async function main() {
  const client = await pool.connect();
  try {
    const q = customerIdFilter
      ? `SELECT id, customer_id, invoice_number FROM invoices WHERE customer_id = $1 AND COALESCE(document_type,'INVOICE') = 'INVOICE' AND status NOT IN ('CANCELLED','VOIDED','DRAFT')`
      : `SELECT id, customer_id, invoice_number FROM invoices WHERE COALESCE(document_type,'INVOICE') = 'INVOICE' AND status NOT IN ('CANCELLED','VOIDED','DRAFT')`;
    const rows = (await client.query(q, customerIdFilter ? [customerIdFilter] : [])).rows;
    const customers = new Set();
    for (const row of rows) {
      const r = await recalcInvoice(client, row.id);
      customers.add(row.customer_id);
      console.log(row.invoice_number, r);
      if (r && r.cash + r.cn > r.total + 0.01) {
        console.warn('  OVERPAYMENT: cash+cn exceeds invoice total');
      }
    }
    for (const cid of customers) {
      await client.query(
        `UPDATE customers SET balance = (
           SELECT COALESCE(SUM(amount_due), 0) FROM invoices
           WHERE customer_id = $1 AND COALESCE(document_type, 'INVOICE') = 'INVOICE'
             AND status NOT IN ('CANCELLED', 'VOIDED', 'DRAFT')
         ), updated_at = NOW() WHERE id = $1`,
        [cid],
      );
      const c = (await client.query('SELECT name, balance FROM customers WHERE id = $1', [cid])).rows[0];
      console.log('Customer', c.name, 'balance', c.balance);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
