-- Deep dive into Brain Active Denk (the 4B batch)

\echo '=== Brain Active Denk product record ==='
SELECT id, name, quantity_on_hand, cost_price, selling_price
FROM products WHERE name ILIKE '%brain active%';

\echo '=== All batches for Brain Active Denk ==='
SELECT id, batch_number, initial_quantity, remaining_quantity, cost_price,
       source_type, source_reference_id, created_at::DATE, expiry_date
FROM inventory_batches
WHERE product_id = (SELECT id FROM products WHERE name ILIKE '%brain active%')
ORDER BY created_at;

\echo '=== All stock_movements for Brain Active Denk ==='
SELECT sm.*, p.name AS product_name
FROM stock_movements sm
JOIN products p ON p.id = sm.product_id
WHERE p.name ILIKE '%brain active%'
ORDER BY sm.created_at;

\echo '=== sale_items for SALE-2026-0045 ==='
SELECT si.*, p.name AS product_name
FROM sale_items si
JOIN products p ON p.id = si.product_id
WHERE si.sale_id = (SELECT id FROM sales WHERE sale_number = 'SALE-2026-0045');

\echo '=== refund_items for REF-2026-0008 through REF-2026-0014 (SALE-2026-0045 refunds) ==='
SELECT ri.*, p.name AS product_name
FROM refund_items ri
JOIN products p ON p.id = ri.product_id
WHERE ri.refund_id IN (
  SELECT id FROM refunds WHERE original_sale_id = (SELECT id FROM sales WHERE sale_number = 'SALE-2026-0045')
)
ORDER BY ri.refund_id, p.name;

\echo '=== Refunds for SALE-2026-0045 ==='
SELECT r.id, r.refund_number, r.status, r.refund_date, r.total_refund_amount
FROM refunds r
WHERE r.original_sale_id = (SELECT id FROM sales WHERE sale_number = 'SALE-2026-0045')
ORDER BY r.created_at;
