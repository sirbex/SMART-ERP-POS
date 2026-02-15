-- FINAL BALANCE CHECK
SELECT 'FINAL BALANCE CHECK' as status;
SELECT 'products_qty' as entity, COALESCE(SUM(quantity_on_hand), 0) as total FROM products
UNION ALL SELECT 'customer_balance', COALESCE(SUM(balance), 0) FROM customers
UNION ALL SELECT 'supplier_balance', COALESCE(SUM("OutstandingBalance"), 0) FROM suppliers
UNION ALL SELECT 'account_balance', COALESCE(SUM("CurrentBalance"), 0) FROM accounts
ORDER BY entity;
