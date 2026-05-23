\set ON_ERROR_STOP on

\echo '=== SALE-2026-4063 header ==='
SELECT s.id, s.sale_number, s.status, s.total_amount, s.subtotal, s.discount_amount,
       s.customer_id, c.name AS customer_name, s.payment_method, s.sale_date, s.notes
FROM sales s
LEFT JOIN customers c ON c.id = s.customer_id
WHERE s.sale_number = 'SALE-2026-4063';

\echo '=== Sale items ==='
SELECT si.id, p.name, si.quantity, si.unit_price, si.total_price, si.unit_cost, si.profit,
       si.discount_amount, p.selling_price
FROM sale_items si
LEFT JOIN products p ON p.id = si.product_id
WHERE si.sale_id = (SELECT id FROM sales WHERE sale_number = 'SALE-2026-4063');

\echo '=== Stock movements (batches) ==='
SELECT sm.quantity, sm.unit_cost, sm.reference, ib.batch_number
FROM stock_movements sm
LEFT JOIN inventory_batches ib ON ib.id = sm.batch_id
WHERE sm.reference LIKE '%4063%' OR sm.sale_id = (SELECT id FROM sales WHERE sale_number = 'SALE-2026-4063')
ORDER BY sm.created_at
LIMIT 20;

\echo '=== Invoice ==='
SELECT i.invoice_number, i.status, i.total_amount, i.amount_due, i.document_type
FROM invoices i
WHERE i.sale_id = (SELECT id FROM sales WHERE sale_number = 'SALE-2026-4063');

\echo '=== Customer BOU pricing mode ==='
SELECT c.id, c.name, pg.name AS price_group, pg.pricing_mode
FROM customers c
LEFT JOIN price_groups pg ON pg.id = c.price_group_id
WHERE c.name ILIKE '%BOU%' OR c.id = (
  SELECT customer_id FROM sales WHERE sale_number = 'SALE-2026-4063'
);
