-- Migration 415: Sale refund type (REFUND vs EXCHANGE) and exchange credit tracking
BEGIN;

ALTER TABLE sale_refunds
  ADD COLUMN IF NOT EXISTS refund_type VARCHAR(20) NOT NULL DEFAULT 'REFUND'
    CHECK (refund_type IN ('REFUND', 'EXCHANGE'));

ALTER TABLE sale_refunds
  ADD COLUMN IF NOT EXISTS exchange_applied_amount DECIMAL(15, 2) NOT NULL DEFAULT 0;

ALTER TABLE sale_refunds
  ADD COLUMN IF NOT EXISTS exchange_applied_sale_id UUID REFERENCES sales(id);

COMMENT ON COLUMN sale_refunds.refund_type IS
  'REFUND = cash/AR repayment; EXCHANGE = store credit for replacement sale at POS';

-- sales.exchange permission (product swap — partial return, no cash out)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'rbac_permissions') THEN
    INSERT INTO rbac_permissions (key, module, action, description)
    VALUES ('sales.exchange', 'sales', 'exchange', 'Exchange wrong products on completed sales (partial return, POS replacement)')
    ON CONFLICT (key) DO NOTHING;

    INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
    SELECT r.id, 'sales.exchange', '00000000-0000-0000-0000-000000000000'
    FROM rbac_roles r
    WHERE r.name IN ('admin', 'manager', 'cashier')
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

COMMIT;
