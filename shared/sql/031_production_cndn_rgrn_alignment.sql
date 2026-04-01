-- ============================================================
-- Production Migration: CN/DN + Return GRN schema alignment
-- Idempotent: safe to run multiple times
-- Date: 2026-03-31
-- Fixes: Missing tables, columns, GL accounts for CN/DN and RGRN features
-- ============================================================

BEGIN;

-- ============================================================
-- 1. RETURN GRN TABLES
-- ============================================================

-- 1a. Add SUPPLIER_RETURN to movement_type enum
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'movement_type' AND e.enumlabel = 'SUPPLIER_RETURN'
  ) THEN
    ALTER TYPE movement_type ADD VALUE IF NOT EXISTS 'SUPPLIER_RETURN';
  END IF;
END $$;

COMMIT;
-- ALTER TYPE ADD VALUE cannot run inside a transaction block in some PG versions
-- so we commit and start a new transaction
BEGIN;

-- 1b. return_grn header table
CREATE TABLE IF NOT EXISTS return_grn (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    return_grn_number VARCHAR(50) UNIQUE NOT NULL,
    grn_id          UUID NOT NULL REFERENCES goods_receipts(id),
    supplier_id     UUID NOT NULL REFERENCES suppliers("Id"),
    return_date     DATE NOT NULL DEFAULT CURRENT_DATE,
    status          VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
                    CHECK (status IN ('DRAFT', 'POSTED')),
    reason          TEXT NOT NULL,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 1c. return_grn_lines table
CREATE TABLE IF NOT EXISTS return_grn_lines (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rgrn_id         UUID NOT NULL REFERENCES return_grn(id) ON DELETE CASCADE,
    product_id      UUID NOT NULL REFERENCES products(id),
    batch_id        UUID REFERENCES inventory_batches(id),
    uom_id          UUID REFERENCES uoms(id),
    quantity        DECIMAL(15, 4) NOT NULL CHECK (quantity > 0),
    base_quantity   DECIMAL(15, 4) NOT NULL CHECK (base_quantity > 0),
    unit_cost       DECIMAL(15, 2) NOT NULL DEFAULT 0,
    line_total      DECIMAL(15, 2) NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 1d. Indexes (idempotent via IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_return_grn_grn_id ON return_grn(grn_id);
CREATE INDEX IF NOT EXISTS idx_return_grn_supplier ON return_grn(supplier_id);
CREATE INDEX IF NOT EXISTS idx_return_grn_status ON return_grn(status);
CREATE INDEX IF NOT EXISTS idx_return_grn_lines_rgrn ON return_grn_lines(rgrn_id);
CREATE INDEX IF NOT EXISTS idx_return_grn_lines_product ON return_grn_lines(product_id);
CREATE INDEX IF NOT EXISTS idx_return_grn_lines_batch ON return_grn_lines(batch_id);

-- 1e. Add return_grn_id FK on supplier_invoices
ALTER TABLE supplier_invoices
    ADD COLUMN IF NOT EXISTS return_grn_id UUID REFERENCES return_grn(id);

-- ============================================================
-- 2. GL ACCOUNTS (missing in production)
-- ============================================================

-- 2a. Sales Returns & Allowances (4010)
INSERT INTO accounts (
    "Id", "AccountCode", "AccountName", "AccountType", "NormalBalance",
    "ParentAccountId", "Level", "IsPostingAccount", "IsActive",
    "Description", "CurrentBalance", "CreatedAt", "UpdatedAt",
    "AccountClassification", "AllowAutomatedPosting"
)
SELECT
    gen_random_uuid(), '4010', 'Sales Returns & Allowances', 'REVENUE', 'DEBIT',
    NULL, 1, true, true,
    'Contra revenue account for customer credit notes and sales returns',
    0, NOW(), NOW(), 'REVENUE', true
WHERE NOT EXISTS (
    SELECT 1 FROM accounts WHERE "AccountCode" = '4010'
);

-- 2b. Purchase Returns & Allowances (5010)
INSERT INTO accounts (
    "Id", "AccountCode", "AccountName", "AccountType", "NormalBalance",
    "ParentAccountId", "Level", "IsPostingAccount", "IsActive",
    "Description", "CurrentBalance", "CreatedAt", "UpdatedAt",
    "AccountClassification", "AllowAutomatedPosting"
)
SELECT
    gen_random_uuid(), '5010', 'Purchase Returns & Allowances', 'EXPENSE', 'CREDIT',
    NULL, 1, true, true,
    'Contra expense account for supplier credit notes and purchase returns',
    0, NOW(), NOW(), 'EXPENSE', true
WHERE NOT EXISTS (
    SELECT 1 FROM accounts WHERE "AccountCode" = '5010'
);

-- 2c. Tax Payable (2300)
INSERT INTO accounts (
    "Id", "AccountCode", "AccountName", "AccountType", "NormalBalance",
    "ParentAccountId", "Level", "IsPostingAccount", "IsActive",
    "Description", "CurrentBalance", "CreatedAt", "UpdatedAt",
    "AccountClassification", "AllowAutomatedPosting"
)
SELECT
    gen_random_uuid(), '2300', 'Tax Payable', 'LIABILITY', 'CREDIT',
    (SELECT "Id" FROM accounts WHERE "AccountCode" = '2000' LIMIT 1),
    1, true, true,
    'Tax collected on sales, payable to tax authority',
    0, NOW(), NOW(), NULL, true
WHERE NOT EXISTS (
    SELECT 1 FROM accounts WHERE "AccountCode" = '2300'
);

-- ============================================================
-- 3. VERIFICATION
-- ============================================================

SELECT 'Tables' AS check_type,
       (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'return_grn')::text || ' return_grn, ' ||
       (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'return_grn_lines')::text || ' return_grn_lines'
       AS result;

SELECT 'GL Accounts' AS check_type,
       string_agg("AccountCode" || ' (' || "AccountName" || ')', ', ' ORDER BY "AccountCode")
       AS result
FROM accounts
WHERE "AccountCode" IN ('1200', '2100', '2300', '4000', '4010', '5000', '5010');

SELECT 'supplier_invoices.return_grn_id' AS check_type,
       CASE WHEN EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_name = 'supplier_invoices' AND column_name = 'return_grn_id'
       ) THEN 'EXISTS' ELSE 'MISSING' END AS result;

COMMIT;
