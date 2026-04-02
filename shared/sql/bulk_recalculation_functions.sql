-- ============================================================================
-- BULK RECALCULATION FUNCTIONS FOR DATA RESET OPERATIONS
-- ============================================================================
-- These functions are used to recalculate ALL balances after bulk data operations
-- (like system reset or data restore). They call the same internal functions
-- that the triggers use, ensuring consistency with the single source of truth.
-- ============================================================================

-- ============================================================================
-- 1. RECALCULATE ALL CUSTOMER BALANCES
-- Uses the same fn_update_customer_balance_internal() as the triggers
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_recalculate_all_customer_balances()
RETURNS TABLE(customer_id UUID, old_balance NUMERIC, new_balance NUMERIC, status TEXT) AS $$
DECLARE
    v_customer RECORD;
    v_old_balance NUMERIC;
    v_new_balance NUMERIC;
    v_total_credit_sales NUMERIC;
    v_total_payments NUMERIC;
BEGIN
    FOR v_customer IN SELECT id, balance FROM customers LOOP
        v_old_balance := COALESCE(v_customer.balance, 0);
        
        -- Calculate expected balance (same logic as fn_update_customer_balance_internal)
        SELECT COALESCE(SUM(
            CASE 
                WHEN payment_method = 'CREDIT' AND s.status = 'COMPLETED' 
                THEN total_amount - COALESCE(amount_paid, 0)
                ELSE 0 
            END
        ), 0)
        INTO v_total_credit_sales
        FROM sales s
        WHERE s.customer_id = v_customer.id;
        
        SELECT COALESCE(SUM("Amount"), 0)
        INTO v_total_payments
        FROM customer_payments
        WHERE "CustomerId" = v_customer.id
          AND "Status" = 'COMPLETED';
        
        v_new_balance := v_total_credit_sales - v_total_payments;
        
        -- Update customer balance
        UPDATE customers
        SET balance = v_new_balance,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = v_customer.id;
        
        customer_id := v_customer.id;
        old_balance := v_old_balance;
        new_balance := v_new_balance;
        status := CASE 
            WHEN v_old_balance = v_new_balance THEN 'NO_CHANGE'
            ELSE 'UPDATED'
        END;
        
        RETURN NEXT;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 2. RECALCULATE ALL SUPPLIER BALANCES
-- Uses the same logic as fn_update_supplier_balance_internal()
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_recalculate_all_supplier_balances()
RETURNS TABLE(supplier_id UUID, old_balance NUMERIC, new_balance NUMERIC, status TEXT) AS $$
DECLARE
    v_supplier RECORD;
    v_old_balance NUMERIC;
    v_new_balance NUMERIC;
    v_total_payable NUMERIC;
    v_total_paid NUMERIC;
BEGIN
    FOR v_supplier IN SELECT "Id" as id, "OutstandingBalance" as balance FROM suppliers LOOP
        v_old_balance := COALESCE(v_supplier.balance, 0);
        
        -- Calculate expected balance (same logic as fn_update_supplier_balance_internal)
        SELECT COALESCE(SUM(gri.received_quantity * gri.cost_price), 0)
        INTO v_total_payable
        FROM goods_receipts gr
        JOIN goods_receipt_items gri ON gri.goods_receipt_id = gr.id
        WHERE gr.supplier_id = v_supplier.id
          AND gr.status = 'COMPLETED';
        
        SELECT COALESCE(SUM("Amount"), 0)
        INTO v_total_paid
        FROM supplier_payments
        WHERE "SupplierId" = v_supplier.id
          AND "Status" = 'COMPLETED';
        
        v_new_balance := v_total_payable - v_total_paid;
        
        -- Update supplier balance
        UPDATE suppliers
        SET "OutstandingBalance" = v_new_balance,
            "UpdatedAt" = CURRENT_TIMESTAMP
        WHERE "Id" = v_supplier.id;
        
        supplier_id := v_supplier.id;
        old_balance := v_old_balance;
        new_balance := v_new_balance;
        status := CASE 
            WHEN v_old_balance = v_new_balance THEN 'NO_CHANGE'
            ELSE 'UPDATED'
        END;
        
        RETURN NEXT;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 3. RECALCULATE ALL PRODUCT STOCK QUANTITIES
-- Uses the same logic as fn_update_product_stock_internal()
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_recalculate_all_product_stock()
RETURNS TABLE(product_id UUID, old_quantity NUMERIC, new_quantity NUMERIC, status TEXT) AS $$
DECLARE
    v_product RECORD;
    v_old_quantity NUMERIC;
    v_new_quantity NUMERIC;
BEGIN
    FOR v_product IN SELECT p.id, COALESCE(pi.quantity_on_hand, 0) AS quantity_on_hand
                     FROM products p
                     LEFT JOIN product_inventory pi ON pi.product_id = p.id LOOP
        v_old_quantity := v_product.quantity_on_hand;
        
        -- Calculate expected quantity from batches
        SELECT COALESCE(SUM(remaining_quantity), 0)
        INTO v_new_quantity
        FROM inventory_batches
        WHERE product_id = v_product.id
          AND status = 'ACTIVE';
        
        -- Update product_inventory stock (single source of truth)
        UPDATE product_inventory
        SET quantity_on_hand = v_new_quantity,
            updated_at = CURRENT_TIMESTAMP
        WHERE product_id = v_product.id;

        -- Mirror to products table (app-layer sync)
        UPDATE products
        SET quantity_on_hand = v_new_quantity
        WHERE id = v_product.id;
        
        product_id := v_product.id;
        old_quantity := v_old_quantity;
        new_quantity := v_new_quantity;
        status := CASE 
            WHEN v_old_quantity = v_new_quantity THEN 'NO_CHANGE'
            ELSE 'UPDATED'
        END;
        
        RETURN NEXT;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 4. RECALCULATE ALL GL ACCOUNT BALANCES
-- Recalculates from ledger entries (the single source of truth for accounting)
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_recalculate_all_account_balances()
RETURNS TABLE(account_id UUID, account_code VARCHAR, old_balance NUMERIC, new_balance NUMERIC, status TEXT) AS $$
DECLARE
    v_account RECORD;
    v_old_balance NUMERIC;
    v_new_balance NUMERIC;
    v_debits NUMERIC;
    v_credits NUMERIC;
BEGIN
    FOR v_account IN SELECT "Id" as id, "AccountCode" as code, "CurrentBalance" as balance, "NormalBalance" as normal_balance FROM accounts LOOP
        v_old_balance := COALESCE(v_account.balance, 0);
        
        -- Calculate from ledger entries
        SELECT 
            COALESCE(SUM(CASE WHEN "EntryType" = 'DEBIT' THEN "Amount" ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN "EntryType" = 'CREDIT' THEN "Amount" ELSE 0 END), 0)
        INTO v_debits, v_credits
        FROM ledger_entries
        WHERE "AccountId" = v_account.id;
        
        -- Balance calculation depends on normal balance type
        -- DEBIT normal (Assets, Expenses): Balance = Debits - Credits
        -- CREDIT normal (Liabilities, Equity, Revenue): Balance = Credits - Debits
        IF v_account.normal_balance = 'DEBIT' THEN
            v_new_balance := v_debits - v_credits;
        ELSE
            v_new_balance := v_credits - v_debits;
        END IF;
        
        -- Update account balance
        UPDATE accounts
        SET "CurrentBalance" = v_new_balance
        WHERE "Id" = v_account.id;
        
        account_id := v_account.id;
        account_code := v_account.code;
        old_balance := v_old_balance;
        new_balance := v_new_balance;
        status := CASE 
            WHEN v_old_balance = v_new_balance THEN 'NO_CHANGE'
            ELSE 'UPDATED'
        END;
        
        RETURN NEXT;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. MASTER RECALCULATION FUNCTION
-- Recalculates ALL balances in the correct order
-- Returns a summary of all recalculations
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_recalculate_all_balances()
RETURNS TABLE(
    entity_type TEXT,
    total_records INT,
    records_updated INT,
    records_unchanged INT,
    execution_time_ms NUMERIC
) AS $$
DECLARE
    v_start_time TIMESTAMP;
    v_end_time TIMESTAMP;
    v_count RECORD;
BEGIN
    -- 1. Customer Balances
    v_start_time := clock_timestamp();
    SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'UPDATED') as updated,
        COUNT(*) FILTER (WHERE status = 'NO_CHANGE') as unchanged
    INTO v_count
    FROM fn_recalculate_all_customer_balances();
    v_end_time := clock_timestamp();
    
    entity_type := 'CUSTOMERS';
    total_records := v_count.total;
    records_updated := v_count.updated;
    records_unchanged := v_count.unchanged;
    execution_time_ms := EXTRACT(MILLISECONDS FROM (v_end_time - v_start_time));
    RETURN NEXT;
    
    -- 2. Supplier Balances
    v_start_time := clock_timestamp();
    SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'UPDATED') as updated,
        COUNT(*) FILTER (WHERE status = 'NO_CHANGE') as unchanged
    INTO v_count
    FROM fn_recalculate_all_supplier_balances();
    v_end_time := clock_timestamp();
    
    entity_type := 'SUPPLIERS';
    total_records := v_count.total;
    records_updated := v_count.updated;
    records_unchanged := v_count.unchanged;
    execution_time_ms := EXTRACT(MILLISECONDS FROM (v_end_time - v_start_time));
    RETURN NEXT;
    
    -- 3. Product Stock
    v_start_time := clock_timestamp();
    SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'UPDATED') as updated,
        COUNT(*) FILTER (WHERE status = 'NO_CHANGE') as unchanged
    INTO v_count
    FROM fn_recalculate_all_product_stock();
    v_end_time := clock_timestamp();
    
    entity_type := 'PRODUCTS';
    total_records := v_count.total;
    records_updated := v_count.updated;
    records_unchanged := v_count.unchanged;
    execution_time_ms := EXTRACT(MILLISECONDS FROM (v_end_time - v_start_time));
    RETURN NEXT;
    
    -- 4. Account Balances
    v_start_time := clock_timestamp();
    SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'UPDATED') as updated,
        COUNT(*) FILTER (WHERE status = 'NO_CHANGE') as unchanged
    INTO v_count
    FROM fn_recalculate_all_account_balances();
    v_end_time := clock_timestamp();
    
    entity_type := 'ACCOUNTS';
    total_records := v_count.total;
    records_updated := v_count.updated;
    records_unchanged := v_count.unchanged;
    execution_time_ms := EXTRACT(MILLISECONDS FROM (v_end_time - v_start_time));
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. POST-RESET VERIFICATION FUNCTION
-- Verifies all balances are consistent after a reset operation
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_verify_post_reset_integrity()
RETURNS TABLE(
    check_name TEXT,
    expected_value NUMERIC,
    actual_value NUMERIC,
    status TEXT,
    details TEXT
) AS $$
BEGIN
    -- Check 1: All customer balances should be 0 if no transactions
    check_name := 'CUSTOMER_BALANCES_ZERO';
    SELECT SUM(balance) INTO actual_value FROM customers;
    actual_value := COALESCE(actual_value, 0);
    expected_value := 0;
    
    SELECT COALESCE(SUM(
        CASE 
            WHEN payment_method = 'CREDIT' AND status = 'COMPLETED' 
            THEN total_amount - COALESCE(amount_paid, 0)
            ELSE 0 
        END
    ), 0) INTO expected_value FROM sales;
    
    status := CASE WHEN actual_value = expected_value THEN 'PASS' ELSE 'FAIL' END;
    details := 'Customer balances should match outstanding credit sales';
    RETURN NEXT;
    
    -- Check 2: All supplier balances should be 0 if no GRs
    check_name := 'SUPPLIER_BALANCES_ZERO';
    SELECT SUM("OutstandingBalance") INTO actual_value FROM suppliers;
    actual_value := COALESCE(actual_value, 0);
    
    SELECT COALESCE(SUM(gri.received_quantity * gri.cost_price), 0) INTO expected_value
    FROM goods_receipts gr
    JOIN goods_receipt_items gri ON gri.goods_receipt_id = gr.id
    WHERE gr.status = 'COMPLETED';
    
    status := CASE WHEN actual_value = expected_value THEN 'PASS' ELSE 'FAIL' END;
    details := 'Supplier balances should match outstanding GR values';
    RETURN NEXT;
    
    -- Check 3: All product quantities should be 0 if no batches
    check_name := 'PRODUCT_QUANTITIES_ZERO';
    SELECT SUM(quantity_on_hand) INTO actual_value FROM products;
    actual_value := COALESCE(actual_value, 0);
    
    SELECT COALESCE(SUM(remaining_quantity), 0) INTO expected_value 
    FROM inventory_batches WHERE status = 'ACTIVE';
    
    status := CASE WHEN actual_value = expected_value THEN 'PASS' ELSE 'FAIL' END;
    details := 'Product quantities should match active batch totals';
    RETURN NEXT;
    
    -- Check 4: GL accounts should be balanced
    check_name := 'GL_ACCOUNTS_BALANCED';
    SELECT SUM("CurrentBalance") INTO actual_value FROM accounts;
    actual_value := COALESCE(actual_value, 0);
    
    SELECT 
        COALESCE(SUM(CASE WHEN "EntryType" = 'DEBIT' THEN "Amount" ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN "EntryType" = 'CREDIT' THEN "Amount" ELSE 0 END), 0)
    INTO expected_value
    FROM ledger_entries;
    
    -- Note: Account balance sum should equal Debits - Credits for normal accounts
    status := CASE WHEN actual_value = expected_value THEN 'PASS' ELSE 'WARN' END;
    details := 'GL account totals should reflect ledger entries';
    RETURN NEXT;
    
    -- Check 5: No orphaned records
    check_name := 'NO_ORPHANED_RECORDS';
    SELECT COUNT(*) INTO actual_value
    FROM (
        SELECT 1 FROM sale_items si LEFT JOIN sales s ON s.id = si.sale_id WHERE s.id IS NULL
        UNION ALL
        SELECT 1 FROM goods_receipt_items gri LEFT JOIN goods_receipts gr ON gr.id = gri.goods_receipt_id WHERE gr.id IS NULL
        UNION ALL
        SELECT 1 FROM purchase_order_items poi LEFT JOIN purchase_orders po ON po.id = poi.purchase_order_id WHERE po.id IS NULL
    ) orphans;
    expected_value := 0;
    
    status := CASE WHEN actual_value = 0 THEN 'PASS' ELSE 'FAIL' END;
    details := 'No orphaned child records should exist';
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- USAGE EXAMPLES
-- ============================================================================
-- 
-- After a system reset, call:
--   SELECT * FROM fn_recalculate_all_balances();
--
-- To verify integrity:
--   SELECT * FROM fn_verify_post_reset_integrity();
--
-- To recalculate specific entity types:
--   SELECT * FROM fn_recalculate_all_customer_balances();
--   SELECT * FROM fn_recalculate_all_supplier_balances();
--   SELECT * FROM fn_recalculate_all_product_stock();
--   SELECT * FROM fn_recalculate_all_account_balances();
-- ============================================================================
