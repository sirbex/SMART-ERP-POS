#!/usr/bin/env node
/** Compare PO vs GR line qty/cost for a goods receipt */
import pg from 'pg';

const grNumber = process.argv[2] || 'GR-2026-0375';
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/pos_system',
});
const c = await pool.connect();
try {
  const gr = await c.query(
    `SELECT gr.id, gr.receipt_number, gr.purchase_order_id
     FROM goods_receipts gr
     WHERE gr.receipt_number = $1`,
    [grNumber],
  );
  const row = gr.rows[0];
  if (!row) {
    console.log('GR not found:', grNumber);
    process.exit(1);
  }
  console.log('\n=== GR ===', row);

  const lines = await c.query(
    `SELECT p.name,
            ROUND(COALESCE(poi.ordered_quantity, 0)::numeric, 4) AS po_ordered,
            ROUND(gri.received_quantity::numeric, 4) AS gr_received,
            ROUND(gri.cost_price::numeric, 2) AS gr_unit_cost,
            ROUND(poi.unit_price::numeric, 2) AS po_unit_price,
            u.symbol AS uom,
            COALESCE(gri.conversion_factor, pu.conversion_factor, 1)::text AS factor,
            ROUND((gri.received_quantity * gri.cost_price)::numeric, 2) AS line_total
     FROM goods_receipt_items gri
     JOIN products p ON p.id = gri.product_id
     LEFT JOIN purchase_order_items poi ON poi.id = gri.po_item_id
     LEFT JOIN uoms u ON u.id = COALESCE(gri.uom_id, poi.uom_id)
     LEFT JOIN product_uoms pu ON pu.product_id = gri.product_id
       AND pu.uom_id = COALESCE(gri.uom_id, poi.uom_id)
     WHERE gri.goods_receipt_id = $1
     ORDER BY p.name`,
    [row.id],
  );
  console.log('\n=== Lines (DB = PO display units) ===');
  console.table(lines.rows);

  const total = lines.rows.reduce((s, r) => s + Number(r.line_total), 0);
  console.log('Sum (display qty × display cost):', total);
} finally {
  c.release();
  await pool.end();
}
