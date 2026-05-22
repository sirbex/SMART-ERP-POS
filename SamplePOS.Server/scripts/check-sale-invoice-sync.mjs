#!/usr/bin/env node
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/pos_system',
});

const client = await pool.connect();
try {
  const inv = await client.query(
    `SELECT i.invoice_number, i.amount_paid, i.amount_due, i.status,
            s.sale_number, s.total_amount, s.amount_paid AS sale_paid, s.profit, s.total_cost
     FROM invoices i
     LEFT JOIN sales s ON s.id = i.sale_id
     WHERE i.invoice_number IN ('INV-2026-0002')`,
  );
  console.log('beccapowers invoice+sale:', inv.rows[0]);

  const sale7 = await client.query(
    `SELECT sale_number, total_amount, amount_paid, profit, total_cost, payment_method
     FROM sales WHERE sale_number = 'SALE-2026-0007'`,
  );
  console.log('SALE-2026-0007:', sale7.rows[0]);
} finally {
  client.release();
  await pool.end();
}
