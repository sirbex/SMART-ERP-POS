-- ============================================================================
-- Migration 071: Link customer groups to default price groups
--
-- When a customer is assigned to a group, the group's default_price_group_id
-- can be applied to customers.price_group_id (only when currently NULL).
-- Separates discount/rules (customer group) from pricing mode (price group).
-- ============================================================================

BEGIN;

ALTER TABLE customer_groups
    ADD COLUMN IF NOT EXISTS default_price_group_id UUID
        REFERENCES price_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_customer_groups_default_price_group
    ON customer_groups (default_price_group_id)
    WHERE default_price_group_id IS NOT NULL;

COMMENT ON COLUMN customer_groups.default_price_group_id IS
    'Optional price group applied on customer assign when the customer has no price_group_id yet (e.g. At Cost partners)';

COMMIT;
