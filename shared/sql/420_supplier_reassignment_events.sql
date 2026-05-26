-- Phase F: audit trail for post-GR supplier reassignment (AP / GR-IR reclass)

CREATE TABLE IF NOT EXISTS supplier_reassignment_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grn_id UUID NOT NULL REFERENCES goods_receipts(id),
    from_supplier_id UUID NOT NULL,
    to_supplier_id UUID NOT NULL,
    amount NUMERIC(18, 4) NOT NULL CHECK (amount > 0),
    account_scope VARCHAR(20) NOT NULL DEFAULT 'GRIR'
        CHECK (account_scope IN ('GRIR', 'AP')),
    gl_transaction_id UUID,
    reason TEXT NOT NULL,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supplier_reassignment_grn
    ON supplier_reassignment_events (grn_id);

CREATE INDEX IF NOT EXISTS idx_supplier_reassignment_from_supplier
    ON supplier_reassignment_events (from_supplier_id, created_at DESC);
