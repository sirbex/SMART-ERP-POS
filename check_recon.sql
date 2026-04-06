-- GL inventory balance (account 1300)
SELECT 'GL_1300' AS src, COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0) AS val
FROM ledger_entries le
JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
JOIN accounts a ON le."AccountId" = a."Id"
WHERE a."AccountCode" = '1300'
UNION ALL
-- Product valuation: qty_on_hand * cost_price
SELECT 'PROD_VAL', COALESCE(SUM(ROUND(pi.quantity_on_hand * COALESCE(pv.cost_price, 0), 0)), 0)
FROM products p
JOIN product_inventory pi ON pi.product_id = p.id
JOIN product_valuation pv ON pv.product_id = p.id
WHERE pi.quantity_on_hand > 0
UNION ALL
-- Batch valuation: remaining_qty * cost_price
SELECT 'BATCH_VAL', COALESCE(SUM(ROUND(remaining_quantity * cost_price, 0)), 0)
FROM inventory_batches
WHERE remaining_quantity > 0;
