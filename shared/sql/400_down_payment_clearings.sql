-- ============================================================
-- Down Payment Clearings — SAP-style clearing bridge
-- Links customer deposits (pos_customer_deposits) to invoices
-- ============================================================

CREATE TABLE IF NOT EXISTS down_payment_clearings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clearing_number VARCHAR(50) UNIQUE NOT NULL,           -- CLR-2026-0001
    down_payment_id UUID NOT NULL REFERENCES pos_customer_deposits(id),
    invoice_id UUID NOT NULL REFERENCES invoices("Id"),
    amount NUMERIC(15, 2) NOT NULL,
    cleared_by UUID REFERENCES users(id),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT chk_clearing_amount_positive CHECK (amount > 0)
);

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_dpc_down_payment_id ON down_payment_clearings(down_payment_id);
CREATE INDEX IF NOT EXISTS idx_dpc_invoice_id ON down_payment_clearings(invoice_id);
CREATE INDEX IF NOT EXISTS idx_dpc_clearing_number ON down_payment_clearings(clearing_number);

-- Sequence for clearing numbers
CREATE SEQUENCE IF NOT EXISTS clearing_number_seq START 1;

-- Ensure GL account 2200 (Customer Deposits) exists for deposit liabilities
INSERT INTO accounts ("Id", "AccountCode", "AccountName", "AccountType", "ParentAccountId", "IsActive", "CreatedAt", "UpdatedAt")
SELECT gen_random_uuid(), '2200', 'Customer Deposits', 'LIABILITY', NULL, true, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE "AccountCode" = '2200');

-- Bump schema version
INSERT INTO schema_version (version) VALUES (2);
