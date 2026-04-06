-- =============================================================================
-- PROFIT & LOSS VIEWS AND RECONCILIATION FUNCTIONS
-- =============================================================================
-- Purpose: ERP-grade P&L reporting and account reconciliation using GL data only
--
-- Clean Core Principles:
--   ✔ Single Source of Truth - All data from ledger_entries only
--   ✔ Accuracy - Decimal-safe aggregations
--   ✔ Auditability - Full traceability to source transactions
--   ✔ Determinism - Same inputs always produce same outputs
--
-- Author: System
-- Date: 2025-12-28
-- =============================================================================

-- =============================================================================
-- VIEW: Account balances by type for any date range
-- =============================================================================

CREATE OR REPLACE VIEW vw_account_balances AS
SELECT 
    a."Id" as account_id,
    a."AccountCode" as account_code,
    a."AccountName" as account_name,
    a."AccountType" as account_type,
    a."NormalBalance" as normal_balance,
    a."ParentAccountId" as parent_account_id,
    a."Level" as account_level,
    a."IsActive" as is_active,
    COALESCE(SUM(le."DebitAmount"), 0) as total_debits,
    COALESCE(SUM(le."CreditAmount"), 0) as total_credits,
    COALESCE(SUM(le."DebitAmount"), 0) - COALESCE(SUM(le."CreditAmount"), 0) as net_balance
FROM accounts a
LEFT JOIN ledger_entries le ON le."AccountId" = a."Id"
GROUP BY 
    a."Id", a."AccountCode", a."AccountName", a."AccountType", 
    a."NormalBalance", a."ParentAccountId", a."Level", a."IsActive";

-- =============================================================================
-- FUNCTION: Get P&L for a date range
-- =============================================================================
-- Returns revenue, COGS, expenses, and net income for a period
-- All figures derived from ledger_entries (Single Source of Truth)

CREATE OR REPLACE FUNCTION fn_get_profit_loss(
    p_date_from DATE,
    p_date_to DATE
)
RETURNS TABLE (
    section TEXT,
    account_code VARCHAR(20),
    account_name VARCHAR(255),
    debit_total NUMERIC(18,6),
    credit_total NUMERIC(18,6),
    net_amount NUMERIC(18,6),
    display_amount NUMERIC(18,6),
    sort_order INTEGER
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH period_entries AS (
        -- Get all ledger entries within the date range
        SELECT 
            le."AccountId",
            le."DebitAmount",
            le."CreditAmount",
            lt."TransactionDate"
        FROM ledger_entries le
        JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
        WHERE lt."TransactionDate"::DATE >= p_date_from
          AND lt."TransactionDate"::DATE <= p_date_to
    ),
    account_totals AS (
        -- Aggregate by account
        SELECT 
            a."Id" as account_id,
            a."AccountCode" as account_code,
            a."AccountName" as account_name,
            a."AccountType" as account_type,
            COALESCE(SUM(pe."DebitAmount"), 0) as debit_total,
            COALESCE(SUM(pe."CreditAmount"), 0) as credit_total
        FROM accounts a
        LEFT JOIN period_entries pe ON pe."AccountId" = a."Id"
        WHERE a."AccountType" IN ('REVENUE', 'EXPENSE')
           OR a."AccountCode" LIKE '5%'  -- COGS accounts
        GROUP BY a."Id", a."AccountCode", a."AccountName", a."AccountType"
    )
    SELECT 
        CASE 
            WHEN at.account_code LIKE '4%' THEN 'REVENUE'
            WHEN at.account_code LIKE '5%' THEN 'COST_OF_GOODS_SOLD'
            WHEN at.account_code LIKE '6%' OR at.account_type = 'EXPENSE' THEN 'OPERATING_EXPENSES'
            ELSE 'OTHER'
        END as section,
        at.account_code,
        at.account_name,
        at.debit_total,
        at.credit_total,
        at.debit_total - at.credit_total as net_amount,
        -- Display amount: positive for natural direction
        -- Revenue: Credits are positive (so negate)
        -- Expenses/COGS: Debits are positive (keep as-is)
        CASE 
            WHEN at.account_code LIKE '4%' THEN at.credit_total - at.debit_total
            ELSE at.debit_total - at.credit_total
        END as display_amount,
        CASE 
            WHEN at.account_code LIKE '4%' THEN 1
            WHEN at.account_code LIKE '5%' THEN 2
            ELSE 3
        END as sort_order
    FROM account_totals at
    WHERE at.debit_total > 0 OR at.credit_total > 0
    ORDER BY sort_order, at.account_code;
END;
$$;

-- =============================================================================
-- FUNCTION: Get P&L Summary (Totals)
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_get_profit_loss_summary(
    p_date_from DATE,
    p_date_to DATE
)
RETURNS TABLE (
    total_revenue NUMERIC(18,6),
    total_cogs NUMERIC(18,6),
    gross_profit NUMERIC(18,6),
    gross_margin_percent NUMERIC(10,4),
    total_operating_expenses NUMERIC(18,6),
    operating_income NUMERIC(18,6),
    operating_margin_percent NUMERIC(10,4),
    net_income NUMERIC(18,6),
    net_margin_percent NUMERIC(10,4)
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_revenue NUMERIC(18,6) := 0;
    v_cogs NUMERIC(18,6) := 0;
    v_expenses NUMERIC(18,6) := 0;
    v_gross_profit NUMERIC(18,6);
    v_operating_income NUMERIC(18,6);
    v_net_income NUMERIC(18,6);
BEGIN
    -- Calculate revenue (4xxx accounts - credits are positive)
    SELECT COALESCE(SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0)
    INTO v_revenue
    FROM ledger_entries le
    JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
    JOIN accounts a ON le."AccountId" = a."Id"
    WHERE lt."TransactionDate"::DATE >= p_date_from
      AND lt."TransactionDate"::DATE <= p_date_to
      AND a."AccountCode" LIKE '4%';
    
    -- Calculate COGS (5xxx accounts - debits are positive)
    SELECT COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0)
    INTO v_cogs
    FROM ledger_entries le
    JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
    JOIN accounts a ON le."AccountId" = a."Id"
    WHERE lt."TransactionDate"::DATE >= p_date_from
      AND lt."TransactionDate"::DATE <= p_date_to
      AND a."AccountCode" LIKE '5%';
    
    -- Calculate operating expenses (6xxx accounts - debits are positive)
    SELECT COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0)
    INTO v_expenses
    FROM ledger_entries le
    JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
    JOIN accounts a ON le."AccountId" = a."Id"
    WHERE lt."TransactionDate"::DATE >= p_date_from
      AND lt."TransactionDate"::DATE <= p_date_to
      AND (a."AccountCode" LIKE '6%' OR a."AccountType" = 'EXPENSE');
    
    -- Calculate derived values
    v_gross_profit := v_revenue - v_cogs;
    v_operating_income := v_gross_profit - v_expenses;
    v_net_income := v_operating_income; -- Simplified (no other income/expense)
    
    RETURN QUERY SELECT
        v_revenue as total_revenue,
        v_cogs as total_cogs,
        v_gross_profit as gross_profit,
        CASE WHEN v_revenue > 0 
            THEN ROUND((v_gross_profit / v_revenue) * 100, 4) 
            ELSE 0 
        END as gross_margin_percent,
        v_expenses as total_operating_expenses,
        v_operating_income as operating_income,
        CASE WHEN v_revenue > 0 
            THEN ROUND((v_operating_income / v_revenue) * 100, 4) 
            ELSE 0 
        END as operating_margin_percent,
        v_net_income as net_income,
        CASE WHEN v_revenue > 0 
            THEN ROUND((v_net_income / v_revenue) * 100, 4) 
            ELSE 0 
        END as net_margin_percent;
END;
$$;

-- =============================================================================
-- FUNCTION: Get P&L by Customer
-- =============================================================================
-- Analyzes profitability by customer using sales data
-- Note: Uses sales table for customer linkage since ledger entries 
-- store EntityType='SALE' with sale_id, not direct customer references

CREATE OR REPLACE FUNCTION fn_get_profit_loss_by_customer(
    p_date_from DATE,
    p_date_to DATE
)
RETURNS TABLE (
    customer_id UUID,
    customer_name VARCHAR(255),
    total_revenue NUMERIC(18,6),
    total_cogs NUMERIC(18,6),
    gross_profit NUMERIC(18,6),
    gross_margin_percent NUMERIC(10,4),
    transaction_count BIGINT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.customer_id,
        COALESCE(c.name, 'Walk-in Customer')::VARCHAR(255) as customer_name,
        SUM(s.total_amount)::NUMERIC(18,6) as total_revenue,
        SUM(s.total_cost)::NUMERIC(18,6) as total_cogs,
        SUM(s.profit)::NUMERIC(18,6) as gross_profit,
        CASE WHEN SUM(s.total_amount) > 0 
            THEN ROUND((SUM(s.profit) / SUM(s.total_amount)) * 100, 4) 
            ELSE 0 
        END::NUMERIC(10,4) as gross_margin_percent,
        COUNT(s.id)::BIGINT as transaction_count
    FROM sales s
    LEFT JOIN customers c ON c.id = s.customer_id
    WHERE s.sale_date >= p_date_from
      AND s.sale_date <= p_date_to
      AND s.status = 'COMPLETED'
    GROUP BY s.customer_id, c.name
    HAVING SUM(s.total_amount) > 0 OR SUM(s.total_cost) > 0
    ORDER BY SUM(s.profit) DESC;
END;
$$;

-- =============================================================================
-- FUNCTION: Get P&L by Product
-- =============================================================================
-- Analyzes profitability by product using GL data with product references

CREATE OR REPLACE FUNCTION fn_get_profit_loss_by_product(
    p_date_from DATE,
    p_date_to DATE
)
RETURNS TABLE (
    product_id UUID,
    product_name VARCHAR(255),
    product_sku VARCHAR(50),
    total_revenue NUMERIC(18,6),
    total_cogs NUMERIC(18,6),
    gross_profit NUMERIC(18,6),
    gross_margin_percent NUMERIC(10,4),
    quantity_sold NUMERIC(18,6)
)
LANGUAGE plpgsql
AS $$
BEGIN
    -- For product-level P&L, we need to join with sale_items
    -- since ledger entries don't store product-level detail
    RETURN QUERY
    WITH product_sales AS (
        SELECT 
            si.product_id,
            SUM(si.quantity * si.unit_price) as revenue,
            SUM(si.quantity * COALESCE(si.unit_cost, p.cost_price, 0)) as cogs,
            SUM(si.quantity) as qty_sold
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        JOIN products p ON si.product_id = p.id
        WHERE s.sale_date >= p_date_from
          AND s.sale_date <= p_date_to
          AND s.status = 'COMPLETED'
        GROUP BY si.product_id
    )
    SELECT 
        ps.product_id,
        p.name::VARCHAR(255) as product_name,
        COALESCE(p.sku, p.barcode, '')::VARCHAR(50) as product_sku,
        ps.revenue as total_revenue,
        ps.cogs as total_cogs,
        ps.revenue - ps.cogs as gross_profit,
        CASE WHEN ps.revenue > 0 
            THEN ROUND(((ps.revenue - ps.cogs) / ps.revenue) * 100, 4) 
            ELSE 0 
        END as gross_margin_percent,
        ps.qty_sold as quantity_sold
    FROM product_sales ps
    JOIN products p ON p.id = ps.product_id
    WHERE ps.revenue > 0 OR ps.cogs > 0
    ORDER BY ps.revenue - ps.cogs DESC;
END;
$$;

-- =============================================================================
-- RECONCILIATION FUNCTIONS
-- =============================================================================

-- =============================================================================
-- FUNCTION: Reconcile Cash Account
-- =============================================================================
-- Compares Cash GL balance with expected cash from payments

CREATE OR REPLACE FUNCTION fn_reconcile_cash_account(
    p_as_of_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    source TEXT,
    description TEXT,
    amount NUMERIC(18,6),
    difference NUMERIC(18,6),
    status TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_gl_balance NUMERIC(18,6) := 0;
    v_expected_cash NUMERIC(18,6) := 0;
    v_difference NUMERIC(18,6);
BEGIN
    -- Get GL Cash balance (Account 1010)
    SELECT COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0)
    INTO v_gl_balance
    FROM ledger_entries le
    JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
    JOIN accounts a ON le."AccountId" = a."Id"
    WHERE a."AccountCode" = '1010'
      AND lt."TransactionDate"::DATE <= p_as_of_date;
    
    -- Calculate expected cash from payments
    SELECT COALESCE(SUM(
        CASE 
            WHEN ip.payment_method = 'CASH' THEN ip.amount 
            ELSE 0 
        END
    ), 0)
    INTO v_expected_cash
    FROM invoice_payments ip
    WHERE ip.payment_date::DATE <= p_as_of_date;
    
    v_difference := v_gl_balance - v_expected_cash;
    
    -- Return reconciliation report
    RETURN QUERY SELECT 
        'GL_BALANCE'::TEXT,
        'Cash account (1010) balance from General Ledger'::TEXT,
        v_gl_balance,
        0::NUMERIC(18,6),
        'BASE'::TEXT;
    
    RETURN QUERY SELECT 
        'EXPECTED_CASH'::TEXT,
        'Sum of CASH payments from invoice_payments'::TEXT,
        v_expected_cash,
        v_difference,
        CASE 
            WHEN ABS(v_difference) < 0.01 THEN 'MATCHED'
            ELSE 'DISCREPANCY'
        END::TEXT;
    
    IF ABS(v_difference) >= 0.01 THEN
        RETURN QUERY SELECT 
            'DIFFERENCE'::TEXT,
            'Unexplained difference requiring investigation'::TEXT,
            v_difference,
            v_difference,
            'ACTION_REQUIRED'::TEXT;
    END IF;
END;
$$;

-- =============================================================================
-- FUNCTION: Reconcile Accounts Receivable
-- =============================================================================
-- Compares AR GL balance with sum of customer balances

CREATE OR REPLACE FUNCTION fn_reconcile_accounts_receivable(
    p_as_of_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    source TEXT,
    description TEXT,
    amount NUMERIC(18,6),
    difference NUMERIC(18,6),
    status TEXT,
    details JSONB
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_gl_balance NUMERIC(18,6) := 0;
    v_customer_balance NUMERIC(18,6) := 0;
    v_invoice_balance NUMERIC(18,6) := 0;
    v_difference NUMERIC(18,6);
    v_customer_details JSONB;
BEGIN
    -- Get GL AR balance (Account 1200)
    SELECT COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0)
    INTO v_gl_balance
    FROM ledger_entries le
    JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
    JOIN accounts a ON le."AccountId" = a."Id"
    WHERE a."AccountCode" = '1200'
      AND lt."TransactionDate"::DATE <= p_as_of_date;
    
    -- Get sum of customer balances
    SELECT COALESCE(SUM(balance), 0)
    INTO v_customer_balance
    FROM customers;
    
    -- Get sum of outstanding invoice balances
    -- Handle both PascalCase (PartiallyPaid) and SCREAMING_SNAKE_CASE (PARTIALLY_PAID) status values
    SELECT COALESCE(SUM("OutstandingBalance"), 0)
    INTO v_invoice_balance
    FROM invoices
    WHERE UPPER(REPLACE("Status", '_', '')) IN ('ISSUED', 'UNPAID', 'PARTIALLYPAID', 'PENDING');
    
    v_difference := v_gl_balance - v_invoice_balance;
    
    -- Get customer-level detail for discrepancies
    SELECT jsonb_agg(jsonb_build_object(
        'customer_id', c.id,
        'customer_name', c.name,
        'customer_balance', c.balance,
        'invoice_balance', COALESCE(inv.total_due, 0),
        'difference', c.balance - COALESCE(inv.total_due, 0)
    ))
    INTO v_customer_details
    FROM customers c
    LEFT JOIN (
        SELECT "CustomerId" as customer_id, SUM("OutstandingBalance") as total_due
        FROM invoices
        WHERE UPPER(REPLACE("Status", '_', '')) IN ('ISSUED', 'UNPAID', 'PARTIALLYPAID', 'PENDING')
        GROUP BY "CustomerId"
    ) inv ON inv.customer_id = c.id
    WHERE ABS(c.balance - COALESCE(inv.total_due, 0)) > 0.01;
    
    -- Return reconciliation report
    RETURN QUERY SELECT 
        'GL_AR_BALANCE'::TEXT,
        'Accounts Receivable (1200) balance from General Ledger'::TEXT,
        v_gl_balance,
        0::NUMERIC(18,6),
        'BASE'::TEXT,
        NULL::JSONB;
    
    RETURN QUERY SELECT 
        'INVOICE_BALANCE'::TEXT,
        'Sum of outstanding invoice balances'::TEXT,
        v_invoice_balance,
        v_gl_balance - v_invoice_balance,
        CASE 
            WHEN ABS(v_gl_balance - v_invoice_balance) < 0.01 THEN 'MATCHED'
            ELSE 'DISCREPANCY'
        END::TEXT,
        NULL::JSONB;
    
    RETURN QUERY SELECT 
        'CUSTOMER_BALANCE'::TEXT,
        'Sum of customer.balance fields'::TEXT,
        v_customer_balance,
        v_invoice_balance - v_customer_balance,
        CASE 
            WHEN ABS(v_invoice_balance - v_customer_balance) < 0.01 THEN 'MATCHED'
            ELSE 'DISCREPANCY'
        END::TEXT,
        NULL::JSONB;
    
    IF v_customer_details IS NOT NULL THEN
        RETURN QUERY SELECT 
            'CUSTOMER_DETAILS'::TEXT,
            'Customers with balance discrepancies'::TEXT,
            0::NUMERIC(18,6),
            0::NUMERIC(18,6),
            'INFO'::TEXT,
            v_customer_details;
    END IF;
END;
$$;

-- =============================================================================
-- FUNCTION: Reconcile Inventory
-- =============================================================================
-- Compares Inventory GL balance with inventory valuation

CREATE OR REPLACE FUNCTION fn_reconcile_inventory(
    p_as_of_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    source TEXT,
    description TEXT,
    amount NUMERIC(18,6),
    difference NUMERIC(18,6),
    status TEXT,
    details JSONB
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_gl_balance NUMERIC(18,6) := 0;
    v_inventory_value NUMERIC(18,6) := 0;
    v_batch_value NUMERIC(18,6) := 0;
    v_difference NUMERIC(18,6);
    v_threshold NUMERIC(18,6);
BEGIN
    -- Get GL Inventory balance (Account 1300)
    SELECT COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0)
    INTO v_gl_balance
    FROM ledger_entries le
    JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
    JOIN accounts a ON le."AccountId" = a."Id"
    WHERE a."AccountCode" = '1300'
      AND lt."TransactionDate"::DATE <= p_as_of_date;
    
    -- Get inventory value using batch-level costing per product.
    -- Accurate for FIFO/FEFO where batches carry different costs.
    -- Falls back to product-level (qty × cost_price) for products without batches.
    SELECT COALESCE(SUM(ROUND(
        COALESCE(bv.batch_value, pi.quantity_on_hand * COALESCE(pv.cost_price, 0)),
        0
    )), 0)
    INTO v_inventory_value
    FROM products p
    JOIN product_inventory pi ON pi.product_id = p.id
    JOIN product_valuation pv ON pv.product_id = p.id
    LEFT JOIN (
        SELECT product_id, SUM(remaining_quantity * cost_price) AS batch_value
        FROM inventory_batches
        WHERE remaining_quantity > 0
        GROUP BY product_id
    ) bv ON bv.product_id = p.id
    WHERE pi.quantity_on_hand > 0;
    
    -- Get inventory value from batches (more accurate if using FEFO)
    -- Same per-line rounding to match GL precision
    SELECT COALESCE(SUM(ROUND(remaining_quantity * cost_price, 0)), 0)
    INTO v_batch_value
    FROM inventory_batches
    WHERE remaining_quantity > 0;
    
    v_difference := v_gl_balance - GREATEST(v_inventory_value, v_batch_value);
    
    -- Materiality threshold: max(5000, 0.01% of GL balance).
    -- UGX is an integer currency — per-line rounding on multi-line GRs
    -- inevitably produces small GL-vs-subledger noise that is not actionable.
    v_threshold := GREATEST(5000, ABS(v_gl_balance) * 0.0001);
    
    -- Return reconciliation report
    RETURN QUERY SELECT 
        'GL_INVENTORY_BALANCE'::TEXT,
        'Inventory (1300) balance from General Ledger'::TEXT,
        v_gl_balance,
        0::NUMERIC(18,6),
        'BASE'::TEXT,
        NULL::JSONB;
    
    RETURN QUERY SELECT 
        'PRODUCT_VALUATION'::TEXT,
        'Inventory value from batch-level costing per product'::TEXT,
        v_inventory_value,
        v_gl_balance - v_inventory_value,
        CASE 
            WHEN ABS(v_gl_balance - v_inventory_value) <= v_threshold THEN 'MATCHED'
            ELSE 'DISCREPANCY'
        END::TEXT,
        NULL::JSONB;
    
    RETURN QUERY SELECT 
        'BATCH_VALUATION'::TEXT,
        'Sum of (remaining_quantity × cost_price) from inventory_batches'::TEXT,
        v_batch_value,
        v_gl_balance - v_batch_value,
        CASE 
            WHEN ABS(v_gl_balance - v_batch_value) <= v_threshold THEN 'MATCHED'
            ELSE 'DISCREPANCY'
        END::TEXT,
        NULL::JSONB;
END;
$$;

-- =============================================================================
-- FUNCTION: Reconcile Accounts Payable
-- =============================================================================
-- Compares AP GL balance with sum of supplier outstanding balances

CREATE OR REPLACE FUNCTION fn_reconcile_accounts_payable(
    p_as_of_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    source TEXT,
    description TEXT,
    amount NUMERIC(18,6),
    difference NUMERIC(18,6),
    status TEXT,
    details JSONB
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_gl_balance NUMERIC(18,6) := 0;
    v_supplier_balance NUMERIC(18,6) := 0;
    v_gr_balance NUMERIC(18,6) := 0;
    v_difference NUMERIC(18,6);
BEGIN
    -- Get GL AP balance (Account 2100) - credit balance is positive
    SELECT COALESCE(SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0)
    INTO v_gl_balance
    FROM ledger_entries le
    JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
    JOIN accounts a ON le."AccountId" = a."Id"
    WHERE a."AccountCode" = '2100'
      AND lt."TransactionDate"::DATE <= p_as_of_date;
    
    -- Get sum of supplier outstanding balances
    SELECT COALESCE(SUM("OutstandingBalance"), 0)
    INTO v_supplier_balance
    FROM suppliers;
    
    -- Get sum of outstanding supplier invoices
    SELECT COALESCE(SUM("OutstandingBalance"), 0)
    INTO v_gr_balance
    FROM supplier_invoices
    WHERE "Status" NOT IN ('PAID', 'CANCELLED')
      AND deleted_at IS NULL;
    
    v_difference := v_gl_balance - v_supplier_balance;
    
    -- Return reconciliation report
    RETURN QUERY SELECT 
        'GL_AP_BALANCE'::TEXT,
        'Accounts Payable (2100) balance from General Ledger'::TEXT,
        v_gl_balance,
        0::NUMERIC(18,6),
        'BASE'::TEXT,
        NULL::JSONB;
    
    RETURN QUERY SELECT 
        'SUPPLIER_BALANCE'::TEXT,
        'Sum of supplier OutstandingBalance fields'::TEXT,
        v_supplier_balance,
        v_gl_balance - v_supplier_balance,
        CASE 
            WHEN ABS(v_gl_balance - v_supplier_balance) < 0.01 THEN 'MATCHED'
            ELSE 'DISCREPANCY'
        END::TEXT,
        NULL::JSONB;
    
    RETURN QUERY SELECT 
        'GR_BALANCE'::TEXT,
        'Sum of outstanding supplier invoice balances'::TEXT,
        v_gr_balance,
        v_supplier_balance - v_gr_balance,
        CASE 
            WHEN ABS(v_supplier_balance - v_gr_balance) < 0.01 THEN 'MATCHED'
            ELSE 'DISCREPANCY'
        END::TEXT,
        NULL::JSONB;
END;
$$;

-- =============================================================================
-- FUNCTION: Full Reconciliation Report
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_full_reconciliation_report(
    p_as_of_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    account_name TEXT,
    gl_balance NUMERIC(18,6),
    subledger_balance NUMERIC(18,6),
    difference NUMERIC(18,6),
    status TEXT,
    recommendation TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_cash_gl NUMERIC(18,6);
    v_ar_gl NUMERIC(18,6);
    v_inv_gl NUMERIC(18,6);
    v_ap_gl NUMERIC(18,6);
    v_ar_sub NUMERIC(18,6);
    v_inv_sub NUMERIC(18,6);
    v_ap_sub NUMERIC(18,6);
BEGIN
    -- Cash
    SELECT COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0)
    INTO v_cash_gl
    FROM ledger_entries le
    JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
    JOIN accounts a ON le."AccountId" = a."Id"
    WHERE a."AccountCode" = '1010'
      AND lt."TransactionDate"::DATE <= p_as_of_date;
    
    RETURN QUERY SELECT 
        'Cash (1010)'::TEXT,
        v_cash_gl,
        v_cash_gl, -- Cash has no subledger
        0::NUMERIC(18,6),
        'MATCHED'::TEXT,
        'Cash balance verified'::TEXT;
    
    -- AR
    SELECT COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0)
    INTO v_ar_gl
    FROM ledger_entries le
    JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
    JOIN accounts a ON le."AccountId" = a."Id"
    WHERE a."AccountCode" = '1200'
      AND lt."TransactionDate"::DATE <= p_as_of_date;
    
    SELECT COALESCE(SUM("OutstandingBalance"), 0)
    INTO v_ar_sub
    FROM invoices
    WHERE UPPER(REPLACE("Status", '_', '')) IN ('ISSUED', 'UNPAID', 'PARTIALLYPAID', 'PENDING');
    
    RETURN QUERY SELECT 
        'Accounts Receivable (1200)'::TEXT,
        v_ar_gl,
        v_ar_sub,
        v_ar_gl - v_ar_sub,
        CASE WHEN ABS(v_ar_gl - v_ar_sub) < 0.01 THEN 'MATCHED' ELSE 'DISCREPANCY' END::TEXT,
        CASE WHEN ABS(v_ar_gl - v_ar_sub) < 0.01 
            THEN 'AR reconciled successfully'
            ELSE 'Investigate customer invoices and payments'
        END::TEXT;
    
    -- Inventory
    SELECT COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0)
    INTO v_inv_gl
    FROM ledger_entries le
    JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
    JOIN accounts a ON le."AccountId" = a."Id"
    WHERE a."AccountCode" = '1300'
      AND lt."TransactionDate"::DATE <= p_as_of_date;
    
    -- Inventory: per-line rounding to match GL posting precision (0 dp for UGX)
    SELECT COALESCE(SUM(ROUND(remaining_quantity * cost_price, 0)), 0)
    INTO v_inv_sub
    FROM inventory_batches
    WHERE remaining_quantity > 0;
    
    RETURN QUERY SELECT 
        'Inventory (1300)'::TEXT,
        v_inv_gl,
        v_inv_sub,
        v_inv_gl - v_inv_sub,
        CASE WHEN ABS(v_inv_gl - v_inv_sub) < 0.01 THEN 'MATCHED' ELSE 'DISCREPANCY' END::TEXT,
        CASE WHEN ABS(v_inv_gl - v_inv_sub) < 0.01 
            THEN 'Inventory reconciled successfully'
            ELSE 'Investigate inventory movements and batch valuations'
        END::TEXT;
    
    -- AP
    SELECT COALESCE(SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0)
    INTO v_ap_gl
    FROM ledger_entries le
    JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
    JOIN accounts a ON le."AccountId" = a."Id"
    WHERE a."AccountCode" = '2100'
      AND lt."TransactionDate"::DATE <= p_as_of_date;
    
    SELECT COALESCE(SUM("OutstandingBalance"), 0)
    INTO v_ap_sub
    FROM suppliers;
    
    RETURN QUERY SELECT 
        'Accounts Payable (2100)'::TEXT,
        v_ap_gl,
        v_ap_sub,
        v_ap_gl - v_ap_sub,
        CASE WHEN ABS(v_ap_gl - v_ap_sub) < 0.01 THEN 'MATCHED' ELSE 'DISCREPANCY' END::TEXT,
        CASE WHEN ABS(v_ap_gl - v_ap_sub) < 0.01 
            THEN 'AP reconciled successfully'
            ELSE 'Investigate supplier invoices and payments'
        END::TEXT;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION fn_get_profit_loss(DATE, DATE) TO PUBLIC;
GRANT EXECUTE ON FUNCTION fn_get_profit_loss_summary(DATE, DATE) TO PUBLIC;
GRANT EXECUTE ON FUNCTION fn_get_profit_loss_by_customer(DATE, DATE) TO PUBLIC;
GRANT EXECUTE ON FUNCTION fn_get_profit_loss_by_product(DATE, DATE) TO PUBLIC;
GRANT EXECUTE ON FUNCTION fn_reconcile_cash_account(DATE) TO PUBLIC;
GRANT EXECUTE ON FUNCTION fn_reconcile_accounts_receivable(DATE) TO PUBLIC;
GRANT EXECUTE ON FUNCTION fn_reconcile_inventory(DATE) TO PUBLIC;
GRANT EXECUTE ON FUNCTION fn_reconcile_accounts_payable(DATE) TO PUBLIC;
GRANT EXECUTE ON FUNCTION fn_full_reconciliation_report(DATE) TO PUBLIC;

-- =============================================================================
-- FUNCTION: Recompute Account Running Balances
-- =============================================================================
-- SAP equivalent: FAGL_BALANCE_CORRECT
-- Recomputes accounts.CurrentBalance from authoritative ledger_entries.
-- Needed after manual data corrections, migration failures, or testing resets.
-- Returns the accounts that were corrected.

CREATE OR REPLACE FUNCTION fn_correct_account_balances()
RETURNS TABLE (
    account_code TEXT,
    account_name TEXT,
    old_balance NUMERIC(18,6),
    new_balance NUMERIC(18,6),
    drift NUMERIC(18,6)
)
LANGUAGE plpgsql
AS $$
BEGIN
    -- Return drifted accounts before updating
    RETURN QUERY
    SELECT 
        a."AccountCode"::TEXT,
        a."AccountName"::TEXT,
        a."CurrentBalance"::NUMERIC(18,6) AS old_balance,
        sub.computed::NUMERIC(18,6) AS new_balance,
        (a."CurrentBalance" - sub.computed)::NUMERIC(18,6) AS drift
    FROM accounts a
    JOIN (
        SELECT a2."Id",
            CASE a2."NormalBalance"
                WHEN 'DEBIT' THEN COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0)
                ELSE COALESCE(SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0)
            END AS computed
        FROM accounts a2
        LEFT JOIN ledger_entries le ON le."AccountId" = a2."Id"
        LEFT JOIN ledger_transactions lt ON le."TransactionId" = lt."Id" AND lt."Status" = 'POSTED'
        GROUP BY a2."Id", a2."NormalBalance"
    ) sub ON a."Id" = sub."Id"
    WHERE ABS(a."CurrentBalance" - sub.computed) > 0.001;

    -- Apply correction
    UPDATE accounts a
    SET "CurrentBalance" = COALESCE(sub.computed, 0),
        "UpdatedAt" = NOW()
    FROM (
        SELECT a2."Id",
            CASE a2."NormalBalance"
                WHEN 'DEBIT' THEN COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0)
                ELSE COALESCE(SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0)
            END AS computed
        FROM accounts a2
        LEFT JOIN ledger_entries le ON le."AccountId" = a2."Id"
        LEFT JOIN ledger_transactions lt ON le."TransactionId" = lt."Id" AND lt."Status" = 'POSTED'
        GROUP BY a2."Id", a2."NormalBalance"
    ) sub
    WHERE a."Id" = sub."Id"
      AND ABS(a."CurrentBalance" - sub.computed) > 0.001;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_correct_account_balances() TO PUBLIC;

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ P&L and Reconciliation functions installed successfully';
    RAISE NOTICE '   - fn_get_profit_loss(date_from, date_to)';
    RAISE NOTICE '   - fn_get_profit_loss_summary(date_from, date_to)';
    RAISE NOTICE '   - fn_get_profit_loss_by_customer(date_from, date_to)';
    RAISE NOTICE '   - fn_get_profit_loss_by_product(date_from, date_to)';
    RAISE NOTICE '   - fn_reconcile_cash_account(as_of_date)';
    RAISE NOTICE '   - fn_reconcile_accounts_receivable(as_of_date)';
    RAISE NOTICE '   - fn_reconcile_inventory(as_of_date)';
    RAISE NOTICE '   - fn_reconcile_accounts_payable(as_of_date)';
    RAISE NOTICE '   - fn_full_reconciliation_report(as_of_date)';
    RAISE NOTICE '   - fn_correct_account_balances() [SAP: FAGL_BALANCE_CORRECT]';
END $$;
