#!/usr/bin/env node
/** Explain profit on a sale — pricing mode, unit price vs cost */
import pg from 'pg';

const saleNumber = process.argv[2] || 'SALE-2026-0007';
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/pos_system',
});
const c = await pool.connect();
try {
  const sale = await c.query(
    `SELECT s.id, s.sale_number, s.customer_id, s.total_amount, s.total_cost, s.profit,
            s.amount_paid, s.payment_method, s.sale_date, cu.name AS customer_name,
            cu.price_group_id, pg.name AS price_group_name, pg.pricing_mode
     FROM sales s
     LEFT JOIN customers cu ON cu.id = s.customer_id
     LEFT JOIN price_groups pg ON pg.id = cu.price_group_id
     WHERE s.sale_number = $1`,
    [saleNumber],
  );
  const s = sale.rows[0];
  if (!s) {
    console.log('Sale not found:', saleNumber);
    process.exit(1);
  }
  console.log('\n=== Sale ===');
  console.log(s);

  const items = await c.query(
    `SELECT product_id, product_name, quantity, unit_price, unit_cost, total_price, profit,
            base_qty, conversion_factor, uom_id
     FROM sale_items WHERE sale_id = $1`,
    [s.id],
  );
  console.log('\n=== Line items ===');
  for (const it of items.rows) {
    const up = Number(it.unit_price);
    const uc = Number(it.unit_cost);
    console.log({
      product: it.product_name,
      unit_price: up,
      unit_cost: uc,
      profit: Number(it.profit),
      margin: up - uc,
      at_cost_would_be: uc,
    });
  }

  const prod = items.rows[0]?.product_id;
  let productRow = null;
  if (prod) {
    const p = await c.query(
      `SELECT name, selling_price, cost_price FROM products WHERE id = $1`,
      [prod],
    );
    productRow = p.rows[0];
    console.log('\n=== Product master (now) ===', productRow);
    const cf = Number(items.rows[0]?.conversion_factor ?? 1);
    if (productRow && cf !== 1) {
      console.log('Pack/at-cost price from master:', Number(productRow.cost_price) * cf);
      console.log('Retail from master:', Number(productRow.selling_price) * cf);
    }
  }

  const inv = await c.query(
    `SELECT invoice_number, document_type, total_amount, amount_paid, amount_due, status
     FROM invoices WHERE sale_id = $1`,
    [s.id],
  );
  console.log('\n=== Linked invoice ===', inv.rows[0] || 'none');

  const cns = await c.query(
    `SELECT invoice_number, total_amount, status, reason
     FROM invoices WHERE reference_invoice_id = (SELECT id FROM invoices WHERE sale_id = $1 LIMIT 1)
       AND document_type = 'CREDIT_NOTE'`,
    [s.id],
  );
  console.log('\n=== Credit notes on invoice ===', cns.rows);

  const batches = await c.query(
    `SELECT ib.cost_price, ib.remaining_quantity, ib.received_date
     FROM inventory_batches ib
     WHERE ib.product_id = $1 AND ib.status = 'ACTIVE'
     ORDER BY ib.expiry_date ASC NULLS LAST, ib.received_date DESC LIMIT 3`,
    [items.rows[0]?.product_id],
  );
  console.log('\n=== Active batches (FEFO cost source) ===', batches.rows);

  console.log('\n=== Why profit =', Number(s.profit), '===');
  console.log('Charged (revenue):', Number(s.total_amount));
  console.log('FIFO cost on sale:', Number(s.total_cost));
  console.log('Customer pricing_mode:', s.pricing_mode || '(STANDARD / not AT_COST)');
  const up = Number(items.rows[0]?.unit_price ?? 0);
  const uc = Number(items.rows[0]?.unit_cost ?? 0);
  const masterCost = Number(productRow?.cost_price ?? 0);
  const cf = Number(items.rows[0]?.conversion_factor ?? 1);
  const atCostPack = masterCost * cf;
  if (s.pricing_mode !== 'AT_COST') {
    console.log('→ Customer was NOT on an AT_COST price group at sale time (or no group).');
  } else if (Math.abs(up - uc) < 0.02) {
    console.log('→ Sold at FIFO cost: profit ≈ 0 (true at-cost vs batch cost).');
  } else if (Math.abs(up - atCostPack) < 0.02) {
    console.log('→ Charged AT_COST pack price', atCostPack, 'but FIFO COGS', uc, '→ profit', up - uc);
  } else {
    console.log('→ AT_COST customer but line charged', up, 'not cost', masterCost, 'or FIFO', uc);
    console.log('  Sale predates enforcement, pricing failed, or cashier used non-engine price.');
  }
  const cnTotal = cns.rows.filter((x) => x.status === 'POSTED').reduce((a, x) => a + Number(x.total_amount), 0);
  if (cnTotal > 0) {
    console.log('→ Posted CN total', cnTotal, '→ net invoice', Number(s.total_amount) - cnTotal, '(sale.profit NOT updated)');
  }
} finally {
  c.release();
  await pool.end();
}
