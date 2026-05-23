\set ON_ERROR_STOP on

\echo '=== 1. Sale header ==='
SELECT s.id, s.sale_number, s.status, s.customer_id, s.total_amount, s.subtotal,
       s.discount_amount, s.profit, s.total_cost, s.payment_method, s.cashier_id, u.email AS cashier_email,
       s.created_at, s.notes, s.idempotency_key, s.quote_id
FROM sales s
LEFT JOIN users u ON u.id = s.cashier_id
WHERE s.sale_number = 'SALE-2026-4063';

\echo '=== 2. BOU customer record ==='
SELECT c.id, c.name, c.is_active, pg.name AS price_group, pg.pricing_mode, c.balance
FROM customers c
LEFT JOIN price_groups pg ON pg.id = c.price_group_id
WHERE c.name ILIKE '%BOU%'
ORDER BY c.name
LIMIT 5;

\echo '=== 3. Sale line items ==='
SELECT si.id, si.product_id, p.name, si.quantity, si.base_qty, si.conversion_factor,
       si.unit_price, si.total_price, si.unit_cost, si.profit, si.discount_amount,
       si.batch_id
FROM sale_items si
LEFT JOIN products p ON p.id = si.product_id
WHERE si.sale_id = (SELECT id FROM sales WHERE sale_number = 'SALE-2026-4063');

\echo '=== 4. Stock movements for this sale ==='
SELECT sm.id, sm.movement_type, sm.quantity, sm.unit_cost,
       (sm.quantity::numeric * sm.unit_cost::numeric) AS movement_cost,
       sm.batch_id, ib.batch_number, ib.cost_price AS batch_cost, sm.created_at
FROM stock_movements sm
LEFT JOIN inventory_batches ib ON ib.id = sm.batch_id
WHERE sm.reference_type = 'SALE'
  AND sm.reference_id::text = (SELECT id::text FROM sales WHERE sale_number = 'SALE-2026-4063')
ORDER BY sm.created_at;

\echo '=== 5. Ozempic active batches (FEFO order) at sale time context ==='
SELECT ib.id, ib.batch_number, ib.received_date, ib.expiry_date,
       ib.remaining_quantity, ib.cost_price, ib.status
FROM inventory_batches ib
JOIN products p ON p.id = ib.product_id
WHERE p.name ILIKE '%Ozempic%0.5%'
  AND ib.status = 'ACTIVE'
ORDER BY ib.expiry_date ASC NULLS LAST, ib.received_date ASC;

\echo '=== 6. Invoice linked to sale ==='
SELECT i.id, i.invoice_number, i.customer_id, c.name, i.total_amount, i.status, i.sale_id
FROM invoices i
LEFT JOIN customers c ON c.id = i.customer_id
WHERE i.sale_id = (SELECT id FROM sales WHERE sale_number = 'SALE-2026-4063');

\echo '=== 7. Customer balance audit around sale time ==='
SELECT customer_id, customer_name, old_balance, new_balance, change_amount, change_source, created_at
FROM customer_balance_audit
WHERE customer_id IN (SELECT id FROM customers WHERE name ILIKE '%BOU%')
  AND created_at >= '2026-05-23 13:00:00'
  AND created_at <= '2026-05-23 14:30:00'
ORDER BY created_at;

\echo '=== 8. Recent sales mentioning BOU or same product same day ==='
SELECT s.sale_number, s.customer_id, c.name, s.total_amount, s.created_at
FROM sales s
LEFT JOIN customers c ON c.id = s.customer_id
WHERE s.created_at::date = '2026-05-23'
  AND (c.name ILIKE '%BOU%' OR s.total_amount BETWEEN 4700000 AND 4900000)
ORDER BY s.created_at DESC
LIMIT 15;
