import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgresql://postgres:password@localhost:5432/pos_system' });

try {
  const custId = 'e4b2e62e-ecab-4e1c-a312-b3f28bddf3c3';
  const startDate = new Date('2025-12-01');
  const endDate = new Date('2026-02-23');
  const params = [custId, startDate, endDate];

  const q = `
    SELECT 
      s.id as sale_id,
      s.sale_number,
      s.sale_date,
      s.total_amount,
      COALESCE(i."AmountPaid", s.amount_paid) as amount_paid,
      COALESCE(i."OutstandingBalance", s.total_amount - s.amount_paid) as balance_due,
      COALESCE(i."Status", s.status::text) as payment_status,
      array_agg(
        json_build_object(
          'product_name', COALESCE(p.name, si.product_name, 'Custom Item'),
          'quantity', si.quantity,
          'unit_price', si.unit_price,
          'subtotal', si.total_price
        )
      ) as items
    FROM sales s
    LEFT JOIN invoices i ON i."SaleId" = s.id
    LEFT JOIN sale_items si ON si.sale_id = s.id
    LEFT JOIN products p ON p.id = si.product_id
    WHERE s.customer_id = $1 AND s.sale_date BETWEEN $2 AND $3
    GROUP BY s.id, s.sale_number, s.sale_date, s.total_amount, s.amount_paid, s.status,
             i."AmountPaid", i."OutstandingBalance", i."Status"
    ORDER BY s.sale_date DESC
  `;

  const r = await pool.query(q, params);
  console.log('Rows:', r.rows.length);
  for (const row of r.rows) {
    console.log(`  ${row.sale_number}: total=${row.total_amount}, paid=${row.amount_paid}, due=${row.balance_due}, status=${row.payment_status}`);
  }
} catch (e) {
  console.log('ERROR:', e.message);
  console.log('STACK:', e.stack);
} finally {
  await pool.end();
}
