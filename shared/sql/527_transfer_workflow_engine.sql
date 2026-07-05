-- Migration 527: Permission-driven transfer workflow engine (Phase E)
-- Extends store_transfers with workflow mode + audit; transfer policy on system_settings.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transfer_workflow_mode') THEN
        CREATE TYPE transfer_workflow_mode AS ENUM (
            'REQUEST',
            'DIRECT',
            'EMERGENCY_OVERRIDE'
        );
    END IF;
END $$;

ALTER TABLE store_transfers
    ADD COLUMN IF NOT EXISTS workflow_mode transfer_workflow_mode NOT NULL DEFAULT 'REQUEST',
    ADD COLUMN IF NOT EXISTS override_reason TEXT,
    ADD COLUMN IF NOT EXISTS override_comments TEXT,
    ADD COLUMN IF NOT EXISTS executed_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS permission_used VARCHAR(100),
    ADD COLUMN IF NOT EXISTS total_inventory_value NUMERIC(18, 2);

COMMENT ON COLUMN store_transfers.workflow_mode IS
    'REQUEST = approval workflow; DIRECT = immediate completion; EMERGENCY_OVERRIDE = policy bypass with reason.';

ALTER TABLE system_settings
    ADD COLUMN IF NOT EXISTS transfer_policy_require_approval_all BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS transfer_policy_allow_direct BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS transfer_policy_value_threshold NUMERIC(18, 2),
    ADD COLUMN IF NOT EXISTS transfer_policy_qty_threshold NUMERIC(18, 4),
    ADD COLUMN IF NOT EXISTS transfer_policy_special_stores_require_approval BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN system_settings.transfer_policy_require_approval_all IS
    'When true, users without inventory.transfer.direct must use the request workflow.';
COMMENT ON COLUMN system_settings.transfer_policy_value_threshold IS
    'Transfers above this inventory value require approval even for direct permission holders.';
COMMENT ON COLUMN system_settings.transfer_policy_qty_threshold IS
    'Transfers above this total quantity require approval even for direct permission holders.';

CREATE TABLE IF NOT EXISTS store_transfer_audit_events (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_transfer_id   UUID NOT NULL REFERENCES store_transfers(id) ON DELETE CASCADE,
    event_type          VARCHAR(50) NOT NULL,
    workflow_mode       transfer_workflow_mode NOT NULL,
    permission_used     VARCHAR(100),
    user_id             UUID REFERENCES users(id) ON DELETE SET NULL,
    user_role           VARCHAR(50),
    payload             JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_store_transfer_audit_transfer
    ON store_transfer_audit_events (store_transfer_id, created_at DESC);

COMMENT ON TABLE store_transfer_audit_events IS
    'Immutable audit trail for transfer workflow lifecycle events.';

INSERT INTO schema_version (version) VALUES (527) ON CONFLICT DO NOTHING;
