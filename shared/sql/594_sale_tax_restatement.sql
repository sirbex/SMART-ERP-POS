-- Migration 594: Sale tax restatement (apply omitted / correct posted document tax)
-- Manager/Admin-only. Does not void sales; restamps sale + linked invoices + GL delta.

CREATE TABLE IF NOT EXISTS sale_tax_restatement_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID NOT NULL REFERENCES sales(id),
    posted_tax NUMERIC(18, 4) NOT NULL DEFAULT 0,
    new_tax NUMERIC(18, 4) NOT NULL DEFAULT 0,
    tax_delta NUMERIC(18, 4) NOT NULL DEFAULT 0,
    total_delta NUMERIC(18, 4) NOT NULL DEFAULT 0,
    tax_inclusive BOOLEAN NOT NULL DEFAULT FALSE,
    gl_transaction_id UUID,
    reason TEXT NOT NULL,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sale_tax_restatement_sale
    ON sale_tax_restatement_events (sale_id);

CREATE INDEX IF NOT EXISTS idx_sale_tax_restatement_created
    ON sale_tax_restatement_events (created_at DESC);

INSERT INTO rbac_permissions_catalog (key, module, action, description)
VALUES (
  'sales.tax_restatement',
  'sales',
  'update',
  'Restate tax on posted sales/invoices from product+customer DocumentTax rules (omit-VAT correction; manager/admin)'
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
SELECT r.id, 'sales.tax_restatement', '00000000-0000-0000-0000-000000000001'
FROM rbac_roles r
WHERE r.name IN ('Super Administrator', 'Administrator', 'Manager', 'Accountant')
ON CONFLICT (role_id, permission_key) DO NOTHING;
