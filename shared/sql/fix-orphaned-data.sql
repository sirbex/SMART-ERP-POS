-- COMPLETE SYSTEM CLEANUP - CORRECT FK ORDER
-- Run this to fix ALL data inconsistencies

-- Phase 0: Clear ledger/accounting data FIRST (has FKs)
DELETE FROM ledger_entries;
DELETE FROM ledger_transactions;

-- Phase 1: Clear in correct FK dependency order
DELETE FROM stock_movements;
DELETE FROM inventory_batches;
DELETE FROM cost_layers;

-- Phase 2: Reset product quantities
UPDATE products SET quantity_on_hand = 0, updated_at = NOW() WHERE quantity_on_hand != 0;

-- Phase 3: Reset account balances
UPDATE accounts SET "CurrentBalance" = 0 WHERE "CurrentBalance" != 0;

-- Phase 4: Reset supplier balances
UPDATE suppliers SET "OutstandingBalance" = 0, "UpdatedAt" = NOW() WHERE "OutstandingBalance" != 0;

-- Phase 5: Reset customer balances
UPDATE customers SET balance = 0, updated_at = NOW() WHERE balance != 0;

-- Verification
SELECT 'VERIFICATION COMPLETE' as status;
SELECT 'ledger_entries' as entity, COUNT(*) as count FROM ledger_entries
UNION ALL SELECT 'ledger_transactions', COUNT(*) FROM ledger_transactions
UNION ALL SELECT 'stock_movements', COUNT(*) FROM stock_movements
UNION ALL SELECT 'inventory_batches', COUNT(*) FROM inventory_batches
UNION ALL SELECT 'cost_layers', COUNT(*) FROM cost_layers;

SELECT 'BALANCE CHECK' as status;
SELECT 'products_qty', COALESCE(SUM(quantity_on_hand), 0) as total FROM products
UNION ALL SELECT 'customer_balance', COALESCE(SUM(balance), 0) FROM customers
UNION ALL SELECT 'supplier_balance', COALESCE(SUM("OutstandingBalance"), 0) FROM suppliers
UNION ALL SELECT 'account_balance', COALESCE(SUM("CurrentBalance"), 0) FROM accounts;
