-- ============================================================================
-- BANKING MODULE - Advanced but Simple
-- ============================================================================
-- Follows accounting principles:
--   ✔ Double-entry bookkeeping (all transactions post to GL)
--   ✔ Immutable transactions (no edits, only reversals)
--   ✔ Full audit trail
--   ✔ Bank reconciliation support
--   ✔ Pattern learning for categorization
-- ============================================================================

-- 1. Bank Accounts (links to existing GL accounts)
-- Each physical bank account maps to a GL account (1010, 1020, 1030, etc.)
CREATE TABLE IF NOT EXISTS bank_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Identification
    name VARCHAR(100) NOT NULL,                    -- "Stanbic Main Account"
    account_number VARCHAR(50),                    -- "1234567890"
    bank_name VARCHAR(100),                        -- "Stanbic Bank"
    branch VARCHAR(100),
    
    -- Link to existing GL account (CRITICAL - this is the accounting link)
    gl_account_id UUID NOT NULL REFERENCES accounts("Id"),
    
    -- Balance tracking (denormalized for performance, reconciled with GL)
    current_balance NUMERIC(18,2) DEFAULT 0,
    last_reconciled_balance NUMERIC(18,2),
    last_reconciled_at TIMESTAMPTZ,
    
    -- Metadata
    is_default BOOLEAN DEFAULT FALSE,              -- Default account for deposits
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure only one default per type
CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_accounts_default 
    ON bank_accounts(is_default) WHERE is_default = TRUE;

-- 2. Bank Transaction Categories (pre-defined for quick selection)
CREATE TABLE IF NOT EXISTS bank_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL UNIQUE,              -- 'SALES_DEPOSIT', 'BANK_FEE', etc.
    name VARCHAR(100) NOT NULL,                    -- "Sales Deposit"
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('IN', 'OUT')),
    default_account_id UUID REFERENCES accounts("Id"),  -- Default contra account
    is_system BOOLEAN DEFAULT FALSE,               -- System categories can't be deleted
    is_active BOOLEAN DEFAULT TRUE,
    display_order INT DEFAULT 100,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Bank Transactions (central record of all bank activity)
CREATE TABLE IF NOT EXISTS bank_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_number VARCHAR(50) NOT NULL UNIQUE,  -- BTX-2025-0001
    bank_account_id UUID NOT NULL REFERENCES bank_accounts(id),
    transaction_date DATE NOT NULL,
    
    -- Transaction details
    type VARCHAR(20) NOT NULL CHECK (type IN ('DEPOSIT', 'WITHDRAWAL', 'TRANSFER_IN', 'TRANSFER_OUT', 'FEE', 'INTEREST')),
    category_id UUID REFERENCES bank_categories(id),
    description VARCHAR(500) NOT NULL,
    reference VARCHAR(100),                          -- Check #, transfer ref, etc.
    amount NUMERIC(18,2) NOT NULL CHECK (amount > 0), -- Always positive
    
    -- Running balance after this transaction
    running_balance NUMERIC(18,2),
    
    -- GL posting (CRITICAL - double-entry link)
    contra_account_id UUID REFERENCES accounts("Id"),
    gl_transaction_id UUID REFERENCES ledger_transactions("Id"),
    
    -- Source linking (WHERE did this come from?)
    source_type VARCHAR(50) CHECK (source_type IN ('SALE', 'EXPENSE', 'CUSTOMER_PAYMENT', 'SUPPLIER_PAYMENT', 'STATEMENT_IMPORT', 'MANUAL', 'TRANSFER')),
    source_id UUID,                                  -- Links to sales.id, expenses.id, etc.
    
    -- Statement matching (for reconciliation)
    statement_line_id UUID,
    matched_at TIMESTAMPTZ,
    match_confidence INT CHECK (match_confidence BETWEEN 0 AND 100),
    
    -- Reconciliation status
    is_reconciled BOOLEAN DEFAULT FALSE,
    reconciled_at TIMESTAMPTZ,
    reconciled_by VARCHAR(100),
    
    -- Transfer linking (pairs TRANSFER_IN with TRANSFER_OUT)
    transfer_pair_id UUID REFERENCES bank_transactions(id),
    
    -- Reversal tracking (immutability principle)
    is_reversed BOOLEAN DEFAULT FALSE,
    reversed_at TIMESTAMPTZ,
    reversed_by VARCHAR(100),
    reversal_reason VARCHAR(500),
    reversal_transaction_id UUID REFERENCES bank_transactions(id),
    
    -- Audit
    created_by VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_bank_txn_account_date ON bank_transactions(bank_account_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_bank_txn_source ON bank_transactions(source_type, source_id) WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bank_txn_reconciled ON bank_transactions(is_reconciled) WHERE is_reconciled = FALSE;
CREATE INDEX IF NOT EXISTS idx_bank_txn_reversed ON bank_transactions(is_reversed) WHERE is_reversed = FALSE;

-- 4. Bank Templates (for CSV statement import)
CREATE TABLE IF NOT EXISTS bank_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    bank_name VARCHAR(100),
    
    -- Column mappings (JSON for flexibility)
    column_mappings JSONB NOT NULL,
    /*
    Example:
    {
        "dateColumn": 0,
        "dateFormat": "DD/MM/YYYY",
        "descriptionColumn": 2,
        "amountColumn": 3,
        "debitColumn": null,
        "creditColumn": null,
        "balanceColumn": 5,
        "referenceColumn": 1,
        "negativeIsDebit": true
    }
    */
    
    skip_header_rows INT DEFAULT 1,
    skip_footer_rows INT DEFAULT 0,
    delimiter VARCHAR(5) DEFAULT ',',
    
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Bank Statements (imported statement files)
CREATE TABLE IF NOT EXISTS bank_statements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    statement_number VARCHAR(50) NOT NULL UNIQUE,   -- STM-2025-0001
    bank_account_id UUID NOT NULL REFERENCES bank_accounts(id),
    
    -- Period covered
    statement_date DATE NOT NULL,
    period_start DATE,
    period_end DATE,
    
    -- Balances from statement
    opening_balance NUMERIC(18,2),
    closing_balance NUMERIC(18,2),
    
    -- Import tracking
    file_name VARCHAR(255),
    template_id UUID REFERENCES bank_templates(id),
    total_lines INT DEFAULT 0,
    matched_lines INT DEFAULT 0,
    created_lines INT DEFAULT 0,
    skipped_lines INT DEFAULT 0,
    
    -- Status
    status VARCHAR(20) DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
    
    -- Audit
    imported_by VARCHAR(100),
    imported_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- 6. Bank Statement Lines (individual transactions from imported statement)
CREATE TABLE IF NOT EXISTS bank_statement_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    statement_id UUID NOT NULL REFERENCES bank_statements(id) ON DELETE CASCADE,
    line_number INT NOT NULL,
    
    -- Raw data from import
    transaction_date DATE,
    description VARCHAR(500),
    reference VARCHAR(100),
    amount NUMERIC(18,2) NOT NULL,                   -- Positive=IN, Negative=OUT
    running_balance NUMERIC(18,2),
    
    -- Matching status
    match_status VARCHAR(20) DEFAULT 'UNMATCHED' CHECK (match_status IN ('UNMATCHED', 'MATCHED', 'CREATED', 'SKIPPED')),
    matched_transaction_id UUID REFERENCES bank_transactions(id),
    match_confidence INT,
    
    -- Pattern suggestions
    suggested_category_id UUID REFERENCES bank_categories(id),
    suggested_account_id UUID REFERENCES accounts("Id"),
    
    -- Processing
    processed_at TIMESTAMPTZ,
    processed_by VARCHAR(100),
    skip_reason VARCHAR(255),
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stmt_lines_statement ON bank_statement_lines(statement_id);
CREATE INDEX IF NOT EXISTS idx_stmt_lines_status ON bank_statement_lines(match_status);

-- 7. Transaction Patterns (learned from user categorizations)
CREATE TABLE IF NOT EXISTS bank_transaction_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100),                               -- Auto-generated or user-defined
    
    -- Matching rules (JSON for flexibility)
    match_rules JSONB NOT NULL,
    /*
    Example:
    {
        "descriptionContains": ["UMEME", "ELECTRICITY"],
        "descriptionRegex": null,
        "amountMin": 100000,
        "amountMax": 500000,
        "direction": "OUT"
    }
    */
    
    -- Action when matched
    category_id UUID REFERENCES bank_categories(id),
    contra_account_id UUID REFERENCES accounts("Id"),
    
    -- Learning metrics
    confidence INT DEFAULT 50 CHECK (confidence BETWEEN 0 AND 100),
    times_used INT DEFAULT 0,
    times_rejected INT DEFAULT 0,
    last_used_at TIMESTAMPTZ,
    
    -- Thresholds
    auto_apply_threshold INT DEFAULT 90,             -- Auto-apply if confidence >= this
    
    -- Source
    is_system BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_by VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Recurring Transaction Rules (for expected regular transactions)
CREATE TABLE IF NOT EXISTS bank_recurring_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    bank_account_id UUID REFERENCES bank_accounts(id),
    
    -- Matching rules
    match_rules JSONB NOT NULL,
    
    -- Expected schedule
    frequency VARCHAR(20) CHECK (frequency IN ('WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY')),
    expected_day INT,                                -- Day of month (1-31) or day of week (1-7)
    expected_amount NUMERIC(18,2),
    tolerance_percent INT DEFAULT 10,                -- Allow ±10% variance
    
    -- Categorization
    category_id UUID REFERENCES bank_categories(id),
    contra_account_id UUID REFERENCES accounts("Id"),
    
    -- Tracking
    last_matched_at TIMESTAMPTZ,
    last_matched_amount NUMERIC(18,2),
    next_expected_at DATE,
    miss_count INT DEFAULT 0,                        -- How many times it was expected but not found
    
    is_active BOOLEAN DEFAULT TRUE,
    created_by VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Bank Alerts (for unusual activity)
CREATE TABLE IF NOT EXISTS bank_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_account_id UUID REFERENCES bank_accounts(id),
    transaction_id UUID REFERENCES bank_transactions(id),
    statement_line_id UUID REFERENCES bank_statement_lines(id),
    
    alert_type VARCHAR(50) NOT NULL CHECK (alert_type IN (
        'UNUSUAL_AMOUNT', 'DUPLICATE_SUSPECTED', 'UNRECOGNIZED', 
        'LOW_BALANCE', 'OVERDUE_RECURRING', 'RECONCILIATION_DIFFERENCE'
    )),
    severity VARCHAR(20) DEFAULT 'WARNING' CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
    message TEXT NOT NULL,
    details JSONB,
    
    -- Resolution
    status VARCHAR(20) DEFAULT 'NEW' CHECK (status IN ('NEW', 'REVIEWED', 'DISMISSED', 'RESOLVED')),
    resolution_notes VARCHAR(500),
    reviewed_by VARCHAR(100),
    reviewed_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bank_alerts_status ON bank_alerts(status) WHERE status = 'NEW';

-- ============================================================================
-- SEED DATA: Default Categories
-- ============================================================================

INSERT INTO bank_categories (id, code, name, direction, is_system, display_order) VALUES
    -- Deposits (Money IN)
    (gen_random_uuid(), 'SALES_DEPOSIT', 'Sales Deposit', 'IN', TRUE, 10),
    (gen_random_uuid(), 'CUSTOMER_PAYMENT', 'Customer Payment', 'IN', TRUE, 20),
    (gen_random_uuid(), 'INTEREST_EARNED', 'Interest Earned', 'IN', TRUE, 30),
    (gen_random_uuid(), 'REFUND_RECEIVED', 'Refund Received', 'IN', TRUE, 40),
    (gen_random_uuid(), 'OTHER_INCOME', 'Other Income', 'IN', TRUE, 50),
    (gen_random_uuid(), 'TRANSFER_IN', 'Transfer In', 'IN', TRUE, 60),
    
    -- Withdrawals (Money OUT)
    (gen_random_uuid(), 'SUPPLIER_PAYMENT', 'Supplier Payment', 'OUT', TRUE, 110),
    (gen_random_uuid(), 'EXPENSE_PAYMENT', 'Expense Payment', 'OUT', TRUE, 120),
    (gen_random_uuid(), 'BANK_CHARGES', 'Bank Charges', 'OUT', TRUE, 130),
    (gen_random_uuid(), 'SALARY_PAYMENT', 'Salary Payment', 'OUT', TRUE, 140),
    (gen_random_uuid(), 'TAX_PAYMENT', 'Tax Payment', 'OUT', TRUE, 150),
    (gen_random_uuid(), 'LOAN_REPAYMENT', 'Loan Repayment', 'OUT', TRUE, 160),
    (gen_random_uuid(), 'TRANSFER_OUT', 'Transfer Out', 'OUT', TRUE, 170),
    (gen_random_uuid(), 'OTHER_EXPENSE', 'Other Expense', 'OUT', TRUE, 180)
ON CONFLICT (code) DO NOTHING;

-- Update categories with default GL accounts
UPDATE bank_categories SET default_account_id = (SELECT "Id" FROM accounts WHERE "AccountCode" = '4000')
WHERE code = 'SALES_DEPOSIT' AND default_account_id IS NULL;

UPDATE bank_categories SET default_account_id = (SELECT "Id" FROM accounts WHERE "AccountCode" = '1200')
WHERE code = 'CUSTOMER_PAYMENT' AND default_account_id IS NULL;

UPDATE bank_categories SET default_account_id = (SELECT "Id" FROM accounts WHERE "AccountCode" = '7100')
WHERE code = 'BANK_CHARGES' AND default_account_id IS NULL;

UPDATE bank_categories SET default_account_id = (SELECT "Id" FROM accounts WHERE "AccountCode" = '2100')
WHERE code = 'SUPPLIER_PAYMENT' AND default_account_id IS NULL;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Generate transaction number
CREATE OR REPLACE FUNCTION fn_generate_bank_txn_number()
RETURNS VARCHAR(50) AS $$
DECLARE
    v_year INT;
    v_next_num INT;
BEGIN
    v_year := EXTRACT(YEAR FROM CURRENT_DATE);
    
    SELECT COALESCE(MAX(
        CAST(SUBSTRING(transaction_number FROM 10) AS INT)
    ), 0) + 1
    INTO v_next_num
    FROM bank_transactions
    WHERE transaction_number LIKE 'BTX-' || v_year || '-%';
    
    RETURN 'BTX-' || v_year || '-' || LPAD(v_next_num::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Generate statement number
CREATE OR REPLACE FUNCTION fn_generate_statement_number()
RETURNS VARCHAR(50) AS $$
DECLARE
    v_year INT;
    v_next_num INT;
BEGIN
    v_year := EXTRACT(YEAR FROM CURRENT_DATE);
    
    SELECT COALESCE(MAX(
        CAST(SUBSTRING(statement_number FROM 10) AS INT)
    ), 0) + 1
    INTO v_next_num
    FROM bank_statements
    WHERE statement_number LIKE 'STM-' || v_year || '-%';
    
    RETURN 'STM-' || v_year || '-' || LPAD(v_next_num::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Update bank account balance trigger
CREATE OR REPLACE FUNCTION fn_update_bank_balance()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.is_reversed = FALSE THEN
        -- Calculate balance change
        IF NEW.type IN ('DEPOSIT', 'TRANSFER_IN', 'INTEREST') THEN
            UPDATE bank_accounts 
            SET current_balance = current_balance + NEW.amount,
                updated_at = NOW()
            WHERE id = NEW.bank_account_id;
        ELSE
            UPDATE bank_accounts 
            SET current_balance = current_balance - NEW.amount,
                updated_at = NOW()
            WHERE id = NEW.bank_account_id;
        END IF;
        
        -- Set running balance
        SELECT current_balance INTO NEW.running_balance
        FROM bank_accounts WHERE id = NEW.bank_account_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bank_txn_balance ON bank_transactions;
CREATE TRIGGER trg_bank_txn_balance
    BEFORE INSERT ON bank_transactions
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_bank_balance();

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE bank_accounts IS 'Physical bank accounts linked to GL accounts. Each row = one bank account.';
COMMENT ON TABLE bank_transactions IS 'All bank transactions. Every transaction posts to GL. Immutable - reversals create new entries.';
COMMENT ON TABLE bank_categories IS 'Pre-defined categories for quick transaction classification.';
COMMENT ON TABLE bank_templates IS 'CSV import templates per bank. Configure once, reuse for all imports.';
COMMENT ON TABLE bank_statements IS 'Imported bank statements. Tracks reconciliation progress.';
COMMENT ON TABLE bank_statement_lines IS 'Individual lines from imported statements. Matched to bank_transactions.';
COMMENT ON TABLE bank_transaction_patterns IS 'Learned patterns from user categorizations. Confidence increases with use.';
COMMENT ON TABLE bank_recurring_rules IS 'Expected recurring transactions (rent, salaries, etc.).';
COMMENT ON TABLE bank_alerts IS 'Alerts for unusual activity, duplicates, reconciliation issues.';
