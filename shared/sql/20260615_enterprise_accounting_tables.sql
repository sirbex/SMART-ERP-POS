-- ============================================================================
-- Enterprise Accounting Tables Migration
-- 
-- Creates tables required by new enterprise-grade accounting services:
--   1. gl_reconciliations / gl_reconciliation_lines (GL entry reconciliation)
--   2. tax_definitions / product_tax_mappings / tax_exemptions (Tax engine)
--   3. Reconciliation columns on ledger_entries
--   4. Retained Earnings account (3100) if missing
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. GL RECONCILIATION TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS gl_reconciliations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reconcile_number VARCHAR(30) UNIQUE NOT NULL,
  account_code VARCHAR(20) NOT NULL,
  is_full BOOLEAN NOT NULL DEFAULT true,
  total_debit NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_credit NUMERIC(15,2) NOT NULL DEFAULT 0,
  residual NUMERIC(15,2) NOT NULL DEFAULT 0,
  reconciled_by UUID,
  reconciled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gl_recon_account ON gl_reconciliations(account_code);
CREATE INDEX IF NOT EXISTS idx_gl_recon_number ON gl_reconciliations(reconcile_number);

CREATE TABLE IF NOT EXISTS gl_reconciliation_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_id UUID NOT NULL REFERENCES gl_reconciliations(id) ON DELETE CASCADE,
  ledger_entry_id UUID NOT NULL,
  reconciled_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gl_recon_lines_recon ON gl_reconciliation_lines(reconciliation_id);
CREATE INDEX IF NOT EXISTS idx_gl_recon_lines_entry ON gl_reconciliation_lines(ledger_entry_id);

-- ============================================================================
-- 2. RECONCILIATION COLUMNS ON LEDGER_ENTRIES
-- ============================================================================

ALTER TABLE ledger_entries
  ADD COLUMN IF NOT EXISTS "IsReconciled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "ReconciledAmount" NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "ReconcileNumber" VARCHAR(30);

CREATE INDEX IF NOT EXISTS idx_le_reconciled ON ledger_entries("IsReconciled")
  WHERE "IsReconciled" = false;

-- ============================================================================
-- 3. TAX ENGINE TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS tax_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(30) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(20) NOT NULL DEFAULT 'PERCENTAGE'
    CHECK (type IN ('PERCENTAGE', 'FIXED')),
  rate NUMERIC(10,4) NOT NULL DEFAULT 0,
  is_inclusive BOOLEAN NOT NULL DEFAULT false,
  is_compound BOOLEAN NOT NULL DEFAULT false,
  sequence INTEGER NOT NULL DEFAULT 10,
  scope VARCHAR(20) NOT NULL DEFAULT 'SALE'
    CHECK (scope IN ('SALE', 'PURCHASE', 'BOTH')),
  tax_payable_account VARCHAR(20) NOT NULL DEFAULT '2300',
  tax_receivable_account VARCHAR(20) NOT NULL DEFAULT '1250',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tax_def_active ON tax_definitions(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_tax_def_scope ON tax_definitions(scope);

CREATE TABLE IF NOT EXISTS product_tax_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL,
  tax_id UUID NOT NULL REFERENCES tax_definitions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(product_id, tax_id)
);

CREATE INDEX IF NOT EXISTS idx_ptm_product ON product_tax_mappings(product_id);

CREATE TABLE IF NOT EXISTS tax_exemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL,
  reason VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT true,
  valid_from DATE,
  valid_until DATE,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tax_exempt_customer ON tax_exemptions(customer_id);
CREATE INDEX IF NOT EXISTS idx_tax_exempt_active ON tax_exemptions(is_active) WHERE is_active = true;

-- ============================================================================
-- 4. SEED: Retained Earnings Account (3100)
-- ============================================================================

INSERT INTO accounts ("Id", "AccountCode", "AccountName", "AccountType", "NormalBalance", "IsActive", "CreatedAt", "UpdatedAt", "Level", "CurrentBalance", "IsPostingAccount", "AllowAutomatedPosting")
VALUES (
  gen_random_uuid(),
  '3100',
  'Retained Earnings',
  'EQUITY',
  'CREDIT',
  true,
  NOW(), NOW(), 1, 0, true, true
) ON CONFLICT ("AccountCode") DO NOTHING;

-- ============================================================================
-- 5. SEED: Default Tax Definitions (Uganda VAT 18%)
-- ============================================================================

INSERT INTO tax_definitions (code, name, type, rate, is_inclusive, is_compound, sequence, scope)
VALUES
  ('VAT18', 'VAT 18%', 'PERCENTAGE', 18.0000, false, false, 10, 'BOTH'),
  ('VAT18_INC', 'VAT 18% (Inclusive)', 'PERCENTAGE', 18.0000, true, false, 10, 'BOTH'),
  ('WHT6', 'Withholding Tax 6%', 'PERCENTAGE', 6.0000, false, false, 20, 'PURCHASE'),
  ('EXEMPT', 'Tax Exempt', 'PERCENTAGE', 0.0000, false, false, 0, 'BOTH')
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- 6. SEED: Tax Receivable Account (1250) if missing
-- ============================================================================

INSERT INTO accounts ("Id", "AccountCode", "AccountName", "AccountType", "NormalBalance", "IsActive", "CreatedAt", "UpdatedAt", "Level", "CurrentBalance", "IsPostingAccount", "AllowAutomatedPosting")
VALUES (
  gen_random_uuid(),
  '1250',
  'Tax Receivable',
  'ASSET',
  'DEBIT',
  true,
  NOW(), NOW(), 1, 0, true, true
) ON CONFLICT ("AccountCode") DO NOTHING;

COMMIT;
