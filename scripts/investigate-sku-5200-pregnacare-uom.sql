-- Forensic MUoM: Pregnacare plus / SKU-5200 (PKT purchase, base-unit sale)
-- Run on tenant DB. Inventory is ALWAYS in base units; PKT is a display/purchase UoM.

\echo '=== Product + inventory (base units) ==='
SELECT p.id, p.sku, p.name, p.base_uom_id, p.purchase_uom_id,
       pi.quantity_on_hand AS inv_qty_base,
       pv.cost_price AS cost_per_base,
       pv.selling_price AS sell_per_base,
       COALESCE(SUM(b.remaining_quantity), pi.quantity_on_hand) AS batch_total_base
FROM products p
LEFT JOIN product_inventory pi ON pi.product_id = p.id
LEFT JOIN product_valuation pv ON pv.product_id = p.id
LEFT JOIN inventory_batches b ON b.product_id = p.id AND b.status = 'ACTIVE'
WHERE p.sku ILIKE '%5200%' OR p.name ILIKE '%Pregnacare%plus%'
GROUP BY p.id, p.sku, p.name, p.base_uom_id, p.purchase_uom_id,
         pi.quantity_on_hand, pv.cost_price, pv.selling_price;

\echo '=== product_uoms (must have is_default base + PKT with factor > 1) ==='
SELECT pu.id AS product_uom_row_id,
       pu.uom_id AS master_uom_id,
       u.name, u.symbol,
       pu.conversion_factor,
       pu.is_default,
       ROUND((pv.selling_price * pu.conversion_factor)::numeric, 2) AS sell_display,
       ROUND((pv.cost_price * pu.conversion_factor)::numeric, 2) AS cost_display
FROM products p
JOIN product_uoms pu ON pu.product_id = p.id
JOIN uoms u ON u.id = pu.uom_id
LEFT JOIN product_valuation pv ON pv.product_id = p.id
WHERE p.sku ILIKE '%5200%' OR p.name ILIKE '%Pregnacare%plus%'
ORDER BY pu.is_default DESC, pu.conversion_factor;

\echo '=== Expected POS stock if configured correctly (1 PKT = 30 base) ==='
-- If inv_qty_base=90 and PKT factor=30 → POS shows 3 PKT or 90 base units
SELECT p.sku,
       pi.quantity_on_hand AS base_stock,
       pu.symbol AS pack_uom,
       pu.conversion_factor AS pack_factor,
       FLOOR(pi.quantity_on_hand / NULLIF(pu.conversion_factor, 0)) AS pos_pkt_stock
FROM products p
JOIN product_inventory pi ON pi.product_id = p.id
JOIN product_uoms pu ON pu.product_id = p.id AND pu.is_default = false
JOIN uoms u ON u.id = pu.uom_id AND (u.symbol ILIKE '%PKT%' OR u.name ILIKE '%PACK%')
WHERE p.sku ILIKE '%5200%' OR p.name ILIKE '%Pregnacare%plus%';

\echo '=== Recent PO / GR (check base_qty snapshot) ==='
SELECT po.po_number, po.status, poi.quantity AS order_qty, poi.uom_id,
       poi.base_qty, poi.conversion_factor, poi.unit_cost, poi.line_total
FROM purchase_order_items poi
JOIN purchase_orders po ON po.id = poi.purchase_order_id
JOIN products p ON p.id = poi.product_id
WHERE p.sku ILIKE '%5200%' OR p.name ILIKE '%Pregnacare%plus%'
ORDER BY po.created_at DESC NULLS LAST
LIMIT 5;

SELECT gr.gr_number, gri.received_quantity, gri.uom_id,
       gri.base_qty, gri.conversion_factor, gri.unit_cost
FROM goods_receipt_items gri
JOIN goods_receipts gr ON gr.id = gri.goods_receipt_id
JOIN products p ON p.id = gri.product_id
WHERE p.sku ILIKE '%5200%' OR p.name ILIKE '%Pregnacare%plus%'
ORDER BY gr.received_date DESC NULLS LAST
LIMIT 5;
