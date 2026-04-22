-- Migration 012: Batch Expiry Audit Trail
-- Creates batch_expiry_audit table for SAP-style expiry change governance
-- Every expiry date change on an inventory batch is permanently recorded here.

CREATE TABLE IF NOT EXISTS batch_expiry_audit (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id        UUID NOT NULL REFERENCES inventory_batches(id) ON DELETE RESTRICT,
    batch_number    VARCHAR(100) NOT NULL,
    product_id      UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    product_name    VARCHAR(255) NOT NULL,
    old_expiry_date DATE,
    new_expiry_date DATE NOT NULL,
    changed_by_id   UUID NOT NULL,
    changed_by_name VARCHAR(255) NOT NULL,
    reason          TEXT NOT NULL,
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address      VARCHAR(50),
    CONSTRAINT chk_expiry_reason_not_empty CHECK (LENGTH(TRIM(reason)) > 0)
);

CREATE INDEX idx_batch_expiry_audit_batch     ON batch_expiry_audit(batch_id);
CREATE INDEX idx_batch_expiry_audit_product   ON batch_expiry_audit(product_id);
CREATE INDEX idx_batch_expiry_audit_changed_at ON batch_expiry_audit(changed_at DESC);

COMMENT ON TABLE batch_expiry_audit IS
  'Immutable audit log of every batch expiry date change. SAP Material Master governance.';
