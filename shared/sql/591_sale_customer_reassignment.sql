-- Migration 591: Sale customer reassignment (wrong-customer correction)
-- Pattern: supplier_reassignment_events + Manager/Admin-only RBAC

CREATE TABLE IF NOT EXISTS sale_customer_reassignment_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID NOT NULL REFERENCES sales(id),
    from_customer_id UUID, -- null = walk-in
    to_customer_id UUID NOT NULL,
    amount NUMERIC(18, 4) NOT NULL DEFAULT 0 CHECK (amount >= 0),
    account_scope VARCHAR(20) NOT NULL DEFAULT 'AR'
        CHECK (account_scope IN ('AR', 'NONE')),
    gl_transaction_id UUID,
    reason TEXT NOT NULL,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sale_customer_reassignment_sale
    ON sale_customer_reassignment_events (sale_id);

CREATE INDEX IF NOT EXISTS idx_sale_customer_reassignment_to
    ON sale_customer_reassignment_events (to_customer_id, created_at DESC);

-- Permission: only Super Administrator, Administrator, Manager (not cashier/accountant by default)
INSERT INTO rbac_permissions_catalog (key, module, action, description)
VALUES (
  'sales.reassign_customer',
  'sales',
  'update',
  'Reassign sales to another customer (wrong customer correction; manager/admin only)'
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
SELECT r.id, 'sales.reassign_customer', '00000000-0000-0000-0000-000000000001'
FROM rbac_roles r
WHERE r.name IN ('Super Administrator', 'Administrator', 'Manager')
ON CONFLICT (role_id, permission_key) DO NOTHING;
