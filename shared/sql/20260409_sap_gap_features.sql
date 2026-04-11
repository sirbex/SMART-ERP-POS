-- =====================================================================
-- SAP Gap Features Migration
-- Date: 2026-04-09
-- Features: Cost Centers, Enhanced Period Control, GR/IR Clearing,
--           Dunning, Withholding Tax, Asset Accounting, JE Approval,
--           Payment Program, Multi-Currency
-- =====================================================================

BEGIN;

-- =====================================================================
-- 1. COST CENTERS (SAP CO-Lite)
-- =====================================================================

CREATE TABLE IF NOT EXISTS cost_centers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(20) UNIQUE NOT NULL,            -- e.g. CC-SALES, CC-ADMIN
  name VARCHAR(100) NOT NULL,
  description TEXT,
  parent_id UUID REFERENCES cost_centers(id),  -- Hierarchy support
  manager_id UUID,                             -- Responsible person
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cost_centers_code ON cost_centers(code);
CREATE INDEX IF NOT EXISTS idx_cost_centers_parent ON cost_centers(parent_id);

-- Cost center assignments on ledger entries
ALTER TABLE ledger_entries
  ADD COLUMN IF NOT EXISTS "CostCenterId" UUID REFERENCES cost_centers(id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_cost_center ON ledger_entries("CostCenterId");

-- Cost center budgets (optional planning)
CREATE TABLE IF NOT EXISTS cost_center_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cost_center_id UUID NOT NULL REFERENCES cost_centers(id),
  period_year INT NOT NULL,
  period_month INT NOT NULL,
  budget_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  actual_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(cost_center_id, period_year, period_month)
);

-- =====================================================================
-- 2. ENHANCED PERIOD CONTROL (Special Periods + Per-Account-Type)
-- =====================================================================

-- Special periods (13-16) for year-end adjustments
ALTER TABLE financial_periods
  ADD COLUMN IF NOT EXISTS period_year INTEGER,
  ADD COLUMN IF NOT EXISTS period_month INTEGER,
  ADD COLUMN IF NOT EXISTS is_special BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS special_purpose VARCHAR(50);  -- YEAR_END_CLOSE, AUDIT_ADJUSTMENT, TAX_ADJUSTMENT, RECLASSIFICATION

-- Per-account-type period control
CREATE TABLE IF NOT EXISTS period_account_type_controls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id UUID NOT NULL REFERENCES financial_periods(id),
  account_type VARCHAR(20) NOT NULL,  -- ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE
  is_open BOOLEAN NOT NULL DEFAULT true,
  closed_by UUID,
  closed_at TIMESTAMPTZ,
  UNIQUE(period_id, account_type)
);

-- =====================================================================
-- 3. GR/IR CLEARING ACCOUNT
-- =====================================================================

-- Add GR/IR Clearing account to chart of accounts (if not exists)
INSERT INTO accounts ("Id", "AccountCode", "AccountName", "AccountType", "NormalBalance", "IsActive", "ParentAccountId", "Description", "Level", "IsPostingAccount", "CurrentBalance", "CreatedAt", "UpdatedAt")
SELECT gen_random_uuid(), '2150', 'GR/IR Clearing', 'LIABILITY', 'CREDIT', true, NULL,
       'Goods Receipt / Invoice Receipt clearing account for 3-way matching (SAP equivalent)', 1, true, 0, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE "AccountCode" = '2150');

-- GR/IR matching records
CREATE TABLE IF NOT EXISTS grir_clearing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID NOT NULL,
  goods_receipt_id UUID,
  invoice_id UUID,
  po_amount NUMERIC(15,2) NOT NULL,
  gr_amount NUMERIC(15,2),
  invoice_amount NUMERIC(15,2),
  variance NUMERIC(15,2) DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN',  -- OPEN, PARTIALLY_MATCHED, MATCHED, VARIANCE
  matched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_grir_po ON grir_clearing(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_grir_status ON grir_clearing(status);

-- =====================================================================
-- 4. DUNNING / COLLECTIONS
-- =====================================================================

-- Dunning levels configuration
CREATE TABLE IF NOT EXISTS dunning_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  level_number INT NOT NULL UNIQUE,           -- 1, 2, 3, 4
  name VARCHAR(50) NOT NULL,                  -- Friendly Reminder, First Notice, etc.
  days_overdue INT NOT NULL,                  -- Trigger after N days overdue
  fee_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  fee_percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
  interest_rate NUMERIC(5,4) NOT NULL DEFAULT 0,  -- Annual rate
  letter_template TEXT,                       -- Template for dunning letter
  block_further_credit BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Dunning history for each customer
CREATE TABLE IF NOT EXISTS dunning_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL,
  dunning_level_id UUID NOT NULL REFERENCES dunning_levels(id),
  dunning_date DATE NOT NULL,
  total_overdue NUMERIC(15,2) NOT NULL,
  fee_charged NUMERIC(15,2) NOT NULL DEFAULT 0,
  interest_charged NUMERIC(15,2) NOT NULL DEFAULT 0,
  items JSONB NOT NULL DEFAULT '[]',           -- Array of overdue invoices included
  letter_sent BOOLEAN NOT NULL DEFAULT false,
  letter_sent_at TIMESTAMPTZ,
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dunning_history_customer ON dunning_history(customer_id);
CREATE INDEX IF NOT EXISTS idx_dunning_history_date ON dunning_history(dunning_date);

-- Track customer dunning level
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS current_dunning_level INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_blocked BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_dunning_date DATE;

-- =====================================================================
-- 5. WITHHOLDING TAX
-- =====================================================================

CREATE TABLE IF NOT EXISTS withholding_tax_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(20) UNIQUE NOT NULL,           -- WHT-01, WHT-02
  name VARCHAR(100) NOT NULL,                 -- e.g. "Service Withholding Tax"
  rate NUMERIC(5,4) NOT NULL,                 -- e.g. 0.06 for 6%
  applies_to VARCHAR(20) NOT NULL DEFAULT 'SUPPLIER',  -- SUPPLIER, CUSTOMER, BOTH
  threshold_amount NUMERIC(15,2),             -- Minimum invoice to apply
  account_code VARCHAR(20) NOT NULL DEFAULT '2350',  -- GL account for WHT payable
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add WHT Payable account to chart of accounts
INSERT INTO accounts ("Id", "AccountCode", "AccountName", "AccountType", "NormalBalance", "IsActive", "ParentAccountId", "Description", "Level", "IsPostingAccount", "CurrentBalance", "CreatedAt", "UpdatedAt")
SELECT gen_random_uuid(), '2350', 'Withholding Tax Payable', 'LIABILITY', 'CREDIT', true, NULL,
       'Withholding tax collected on behalf of tax authority', 1, true, 0, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE "AccountCode" = '2350');

-- WHT on individual transactions
CREATE TABLE IF NOT EXISTS withholding_tax_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wht_type_id UUID NOT NULL REFERENCES withholding_tax_types(id),
  transaction_type VARCHAR(30) NOT NULL,       -- SUPPLIER_PAYMENT, CUSTOMER_INVOICE
  transaction_id UUID NOT NULL,                -- References the source transaction
  base_amount NUMERIC(15,2) NOT NULL,          -- Amount before WHT
  wht_amount NUMERIC(15,2) NOT NULL,           -- Tax withheld
  net_amount NUMERIC(15,2) NOT NULL,           -- Amount actually paid/received
  gl_transaction_id UUID,                      -- Link to ledger_transactions
  certificate_number VARCHAR(50),              -- Tax certificate reference
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wht_entries_type ON withholding_tax_entries(transaction_type, transaction_id);

-- =====================================================================
-- 6. ASSET ACCOUNTING (Basic Depreciation)
-- =====================================================================

-- Asset categories with default depreciation
CREATE TABLE IF NOT EXISTS asset_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  useful_life_months INT NOT NULL,             -- Default useful life
  depreciation_method VARCHAR(20) NOT NULL DEFAULT 'STRAIGHT_LINE',  -- STRAIGHT_LINE, DECLINING_BALANCE
  depreciation_rate NUMERIC(5,4),              -- For declining balance method
  asset_account_code VARCHAR(20) NOT NULL,     -- BS: Fixed Assets account
  depreciation_account_code VARCHAR(20) NOT NULL,  -- PL: Depreciation Expense
  accum_depreciation_account_code VARCHAR(20) NOT NULL,  -- BS: Accumulated Depreciation (contra)
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add Fixed Asset accounts to chart of accounts
INSERT INTO accounts ("Id", "AccountCode", "AccountName", "AccountType", "NormalBalance", "IsActive", "ParentAccountId", "Description", "Level", "IsPostingAccount", "CurrentBalance", "CreatedAt", "UpdatedAt")
SELECT gen_random_uuid(), '1500', 'Fixed Assets', 'ASSET', 'DEBIT', true, NULL,
       'Tangible fixed assets (equipment, furniture, vehicles)', 1, true, 0, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE "AccountCode" = '1500');

INSERT INTO accounts ("Id", "AccountCode", "AccountName", "AccountType", "NormalBalance", "IsActive", "ParentAccountId", "Description", "Level", "IsPostingAccount", "CurrentBalance", "CreatedAt", "UpdatedAt")
SELECT gen_random_uuid(), '1550', 'Accumulated Depreciation', 'ASSET', 'CREDIT', true, NULL,
       'Contra asset — accumulated depreciation on fixed assets', 1, true, 0, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE "AccountCode" = '1550');

-- Individual fixed assets
CREATE TABLE IF NOT EXISTS fixed_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_number VARCHAR(50) UNIQUE NOT NULL,    -- FA-2026-0001
  name VARCHAR(200) NOT NULL,
  description TEXT,
  category_id UUID NOT NULL REFERENCES asset_categories(id),
  acquisition_date DATE NOT NULL,
  acquisition_cost NUMERIC(15,2) NOT NULL,
  salvage_value NUMERIC(15,2) NOT NULL DEFAULT 0,
  useful_life_months INT NOT NULL,
  depreciation_method VARCHAR(20) NOT NULL DEFAULT 'STRAIGHT_LINE',
  depreciation_start_date DATE NOT NULL,
  accumulated_depreciation NUMERIC(15,2) NOT NULL DEFAULT 0,
  net_book_value NUMERIC(15,2) NOT NULL,       -- Service-computed
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE, DISPOSED, WRITTEN_OFF
  disposed_date DATE,
  disposal_amount NUMERIC(15,2),
  disposal_gl_transaction_id UUID,
  cost_center_id UUID REFERENCES cost_centers(id),
  location VARCHAR(200),
  serial_number VARCHAR(100),
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_number ON fixed_assets(asset_number);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_category ON fixed_assets(category_id);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_status ON fixed_assets(status);

-- Depreciation schedule (monthly entries)
CREATE TABLE IF NOT EXISTS depreciation_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES fixed_assets(id),
  period_year INT NOT NULL,
  period_month INT NOT NULL,
  depreciation_amount NUMERIC(15,2) NOT NULL,
  accumulated_total NUMERIC(15,2) NOT NULL,
  net_book_value NUMERIC(15,2) NOT NULL,
  gl_transaction_id UUID,                      -- Link to ledger_transactions
  posted_at TIMESTAMPTZ,
  posted_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(asset_id, period_year, period_month)
);

-- =====================================================================
-- 7. JOURNAL ENTRY APPROVAL WORKFLOW
-- =====================================================================

-- Approval thresholds & rules
CREATE TABLE IF NOT EXISTS je_approval_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  min_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  max_amount NUMERIC(15,2),                    -- NULL = no upper limit
  required_role VARCHAR(50) NOT NULL,          -- MANAGER, ADMIN, CFO
  auto_approve BOOLEAN NOT NULL DEFAULT false, -- Auto-approve below threshold
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Approval requests for journal entries
CREATE TABLE IF NOT EXISTS je_approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL,                -- References ledger_transactions "Id"
  requested_by UUID NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',  -- PENDING, APPROVED, REJECTED
  total_amount NUMERIC(15,2) NOT NULL,
  approval_rule_id UUID REFERENCES je_approval_rules(id),
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_je_approval_status ON je_approval_requests(status);
CREATE INDEX IF NOT EXISTS idx_je_approval_transaction ON je_approval_requests(transaction_id);

-- =====================================================================
-- 8. PAYMENT PROGRAM (Batch AP Payments)
-- =====================================================================

CREATE TABLE IF NOT EXISTS payment_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_number VARCHAR(50) UNIQUE NOT NULL,      -- PR-2026-0001
  run_date DATE NOT NULL,
  payment_method VARCHAR(30) NOT NULL,         -- BANK_TRANSFER, CHECK, MOBILE_MONEY
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT', -- DRAFT, PROPOSED, APPROVED, EXECUTED, CANCELLED
  total_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_items INT NOT NULL DEFAULT 0,
  bank_account_code VARCHAR(20),               -- Source bank account
  due_date_cutoff DATE,                        -- Pay invoices due by this date
  min_amount NUMERIC(15,2) DEFAULT 0,
  max_amount NUMERIC(15,2),
  notes TEXT,
  proposed_by UUID,
  proposed_at TIMESTAMPTZ,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  executed_by UUID,
  executed_at TIMESTAMPTZ,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payment_runs_status ON payment_runs(status);
CREATE INDEX IF NOT EXISTS idx_payment_runs_date ON payment_runs(run_date);

CREATE TABLE IF NOT EXISTS payment_run_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_run_id UUID NOT NULL REFERENCES payment_runs(id),
  supplier_id UUID NOT NULL,
  invoice_id UUID,                             -- Optional specific invoice
  amount NUMERIC(15,2) NOT NULL,
  payment_reference VARCHAR(100),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',  -- PENDING, PAID, FAILED, SKIPPED
  gl_transaction_id UUID,                      -- Link to ledger_transactions
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payment_run_items_run ON payment_run_items(payment_run_id);
CREATE INDEX IF NOT EXISTS idx_payment_run_items_supplier ON payment_run_items(supplier_id);

-- =====================================================================
-- 9. MULTI-CURRENCY SUPPORT
-- =====================================================================

CREATE TABLE IF NOT EXISTS currencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(10) UNIQUE NOT NULL,            -- ISO 4217: UGX, USD, EUR
  name VARCHAR(50) NOT NULL,
  symbol VARCHAR(5) NOT NULL,
  decimal_places INT NOT NULL DEFAULT 2,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed base currencies
INSERT INTO currencies (id, code, name, symbol, decimal_places) VALUES
  (gen_random_uuid(), 'UGX', 'Ugandan Shilling', 'UGX', 0),
  (gen_random_uuid(), 'USD', 'US Dollar', '$', 2),
  (gen_random_uuid(), 'EUR', 'Euro', '€', 2),
  (gen_random_uuid(), 'GBP', 'British Pound', '£', 2),
  (gen_random_uuid(), 'KES', 'Kenyan Shilling', 'KES', 2)
ON CONFLICT (code) DO NOTHING;

-- Exchange rates (daily rates with rate type for different purposes)
CREATE TABLE IF NOT EXISTS exchange_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_currency VARCHAR(10) NOT NULL REFERENCES currencies(code),
  to_currency VARCHAR(10) NOT NULL REFERENCES currencies(code),
  rate NUMERIC(18,8) NOT NULL,                 -- High precision for FX
  rate_type VARCHAR(20) NOT NULL DEFAULT 'SPOT', -- SPOT, BUDGET, AVERAGE
  effective_date DATE NOT NULL,
  source VARCHAR(50) DEFAULT 'MANUAL',         -- MANUAL, API, BANK
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(from_currency, to_currency, rate_type, effective_date)
);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_date ON exchange_rates(effective_date);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_pair ON exchange_rates(from_currency, to_currency);

-- Add currency columns to ledger entries for parallel ledger
ALTER TABLE ledger_entries
  ADD COLUMN IF NOT EXISTS "TransactionCurrency" VARCHAR(10) DEFAULT 'UGX',
  ADD COLUMN IF NOT EXISTS "TransactionAmount" NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS "ExchangeRate" NUMERIC(18,8) DEFAULT 1;

-- System currency configuration (singleton)
CREATE TABLE IF NOT EXISTS system_currency_config (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- Singleton
  functional_currency VARCHAR(10) NOT NULL DEFAULT 'UGX' REFERENCES currencies(code),
  reporting_currency VARCHAR(10) REFERENCES currencies(code),
  exchange_rate_type VARCHAR(20) NOT NULL DEFAULT 'SPOT',
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO system_currency_config (functional_currency) VALUES ('UGX') ON CONFLICT DO NOTHING;

-- Realized/Unrealized gain/loss accounts
INSERT INTO accounts ("Id", "AccountCode", "AccountName", "AccountType", "NormalBalance", "IsActive", "ParentAccountId", "Description", "Level", "IsPostingAccount", "CurrentBalance", "CreatedAt", "UpdatedAt")
SELECT gen_random_uuid(), '4300', 'Realized FX Gain/Loss', 'REVENUE', 'CREDIT', true, NULL,
       'Realized foreign exchange gains and losses', 1, true, 0, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE "AccountCode" = '4300');

INSERT INTO accounts ("Id", "AccountCode", "AccountName", "AccountType", "NormalBalance", "IsActive", "ParentAccountId", "Description", "Level", "IsPostingAccount", "CurrentBalance", "CreatedAt", "UpdatedAt")
SELECT gen_random_uuid(), '4310', 'Unrealized FX Gain/Loss', 'REVENUE', 'CREDIT', true, NULL,
       'Unrealized foreign exchange gains and losses from revaluation', 1, true, 0, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE "AccountCode" = '4310');

COMMIT;
