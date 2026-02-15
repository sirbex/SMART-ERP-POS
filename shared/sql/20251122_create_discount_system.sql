-- Discount System Database Schema
-- Created: November 22, 2025
-- Purpose: Support line-level and cart-level discounts with manager approval

-- ============================================================================
-- Table 1: discounts - Discount rules and configurations
-- ============================================================================
CREATE TABLE IF NOT EXISTS discounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('PERCENTAGE', 'FIXED_AMOUNT', 'BUY_X_GET_Y')),
  scope VARCHAR(20) NOT NULL CHECK (scope IN ('LINE_ITEM', 'CART', 'CUSTOMER')),
  value NUMERIC(10,2) NOT NULL CHECK (value >= 0),
  max_discount_amount NUMERIC(10,2) NULL CHECK (max_discount_amount >= 0),
  min_purchase_amount NUMERIC(10,2) NULL CHECK (min_purchase_amount >= 0),
  requires_approval BOOLEAN DEFAULT false,
  approval_roles JSONB NULL, -- Array of roles: ['MANAGER', 'ADMIN']
  is_active BOOLEAN DEFAULT true,
  valid_from TIMESTAMPTZ NULL,
  valid_until TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE discounts IS 'Discount rules and configurations for POS system';
COMMENT ON COLUMN discounts.type IS 'PERCENTAGE: % off, FIXED_AMOUNT: fixed $ off, BUY_X_GET_Y: promotional';
COMMENT ON COLUMN discounts.scope IS 'LINE_ITEM: per item, CART: whole cart, CUSTOMER: customer-specific';
COMMENT ON COLUMN discounts.value IS 'Percentage (0-100) or fixed amount depending on type';
COMMENT ON COLUMN discounts.requires_approval IS 'If true, manager PIN required to apply';
COMMENT ON COLUMN discounts.approval_roles IS 'Roles allowed to approve this discount (JSON array)';

-- ============================================================================
-- Table 2: discount_rules - Advanced discount conditions
-- ============================================================================
CREATE TABLE IF NOT EXISTS discount_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discount_id UUID NOT NULL REFERENCES discounts(id) ON DELETE CASCADE,
  min_quantity INTEGER NULL CHECK (min_quantity > 0),
  min_amount NUMERIC(10,2) NULL CHECK (min_amount >= 0),
  customer_group_id UUID NULL, -- REFERENCES customer_groups(id)
  product_ids UUID[] NULL, -- Array of product UUIDs
  category VARCHAR(100) NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE discount_rules IS 'Advanced conditions for when discount applies';
COMMENT ON COLUMN discount_rules.min_quantity IS 'Minimum quantity required to trigger discount';
COMMENT ON COLUMN discount_rules.min_amount IS 'Minimum purchase amount to trigger discount';
COMMENT ON COLUMN discount_rules.product_ids IS 'Specific products this discount applies to (NULL = all products)';
COMMENT ON COLUMN discount_rules.category IS 'Product category this discount applies to';

-- ============================================================================
-- Table 3: discount_authorizations - Audit trail for discount approvals
-- ============================================================================
CREATE TABLE IF NOT EXISTS discount_authorizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  discount_id UUID NULL REFERENCES discounts(id) ON DELETE SET NULL,
  discount_amount NUMERIC(10,2) NOT NULL CHECK (discount_amount >= 0),
  discount_type VARCHAR(20) NOT NULL,
  discount_percentage NUMERIC(5,2) NULL, -- For reporting
  original_amount NUMERIC(10,2) NOT NULL,
  final_amount NUMERIC(10,2) NOT NULL,
  reason TEXT NOT NULL,
  requested_by UUID NOT NULL REFERENCES users(id),
  requested_by_name VARCHAR(255) NOT NULL,
  approved_by UUID NULL REFERENCES users(id),
  approved_by_name VARCHAR(255) NULL,
  status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ NULL
);

COMMENT ON TABLE discount_authorizations IS 'Audit trail for all discount applications and approvals';
COMMENT ON COLUMN discount_authorizations.discount_id IS 'Reference to discount rule (NULL if ad-hoc discount)';
COMMENT ON COLUMN discount_authorizations.discount_percentage IS 'Calculated percentage for reporting purposes';
COMMENT ON COLUMN discount_authorizations.reason IS 'Business reason for discount (required for compliance)';
COMMENT ON COLUMN discount_authorizations.status IS 'PENDING: awaiting approval, APPROVED: manager approved, REJECTED: denied';

-- ============================================================================
-- Table 4: sale_discounts - Link discounts to sale items
-- ============================================================================
CREATE TABLE IF NOT EXISTS sale_discounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  sale_item_id UUID NULL REFERENCES sale_items(id) ON DELETE CASCADE, -- NULL for cart-level discounts
  discount_id UUID NULL REFERENCES discounts(id) ON DELETE SET NULL,
  discount_type VARCHAR(20) NOT NULL,
  discount_value NUMERIC(10,2) NOT NULL,
  discount_amount NUMERIC(10,2) NOT NULL CHECK (discount_amount >= 0),
  original_amount NUMERIC(10,2) NOT NULL,
  final_amount NUMERIC(10,2) NOT NULL,
  authorization_id UUID NULL REFERENCES discount_authorizations(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE sale_discounts IS 'Actual discounts applied to sales and line items';
COMMENT ON COLUMN sale_discounts.sale_item_id IS 'NULL for cart-level discounts, UUID for line-item discounts';
COMMENT ON COLUMN sale_discounts.discount_value IS 'Percentage (0-100) or fixed amount used';
COMMENT ON COLUMN sale_discounts.authorization_id IS 'Reference to approval record if manager approval was required';

-- ============================================================================
-- Indexes for Performance
-- ============================================================================

-- Query active discounts efficiently
CREATE INDEX IF NOT EXISTS idx_discounts_active 
  ON discounts(is_active, valid_from, valid_until) 
  WHERE is_active = true;

-- Lookup discount rules by discount
CREATE INDEX IF NOT EXISTS idx_discount_rules_discount 
  ON discount_rules(discount_id);

-- Query discount authorizations by sale
CREATE INDEX IF NOT EXISTS idx_discount_auth_sale 
  ON discount_authorizations(sale_id);

-- Query discount authorizations by status (pending approvals)
CREATE INDEX IF NOT EXISTS idx_discount_auth_status 
  ON discount_authorizations(status, created_at) 
  WHERE status = 'PENDING';

-- Query discount authorizations by approver (manager audit)
CREATE INDEX IF NOT EXISTS idx_discount_auth_approver 
  ON discount_authorizations(approved_by, approved_at) 
  WHERE approved_by IS NOT NULL;

-- Query sale discounts by sale
CREATE INDEX IF NOT EXISTS idx_sale_discounts_sale 
  ON sale_discounts(sale_id);

-- Query sale discounts by item (line-level)
CREATE INDEX IF NOT EXISTS idx_sale_discounts_item 
  ON sale_discounts(sale_item_id) 
  WHERE sale_item_id IS NOT NULL;

-- ============================================================================
-- Sample Data - Default Discount Rules
-- ============================================================================

-- Insert default discount configurations (ADMIN only)
INSERT INTO discounts (name, type, scope, value, requires_approval, approval_roles, is_active)
VALUES 
  ('Staff Discount 10%', 'PERCENTAGE', 'CART', 10.00, false, NULL, true),
  ('Manager Override 20%', 'PERCENTAGE', 'CART', 20.00, true, '["MANAGER", "ADMIN"]', true),
  ('Senior Citizen 5%', 'PERCENTAGE', 'CART', 5.00, false, NULL, true),
  ('Bulk Purchase 15%', 'PERCENTAGE', 'CART', 15.00, true, '["MANAGER", "ADMIN"]', true)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- Triggers for updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_discounts_updated_at ON discounts;
CREATE TRIGGER update_discounts_updated_at
  BEFORE UPDATE ON discounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Verification Queries
-- ============================================================================

-- Verify tables created
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('discounts', 'discount_rules', 'discount_authorizations', 'sale_discounts')
ORDER BY table_name;

-- Verify indexes created
SELECT indexname, tablename FROM pg_indexes 
WHERE schemaname = 'public' 
AND tablename IN ('discounts', 'discount_rules', 'discount_authorizations', 'sale_discounts')
ORDER BY tablename, indexname;

-- Verify sample data
SELECT id, name, type, scope, value, requires_approval FROM discounts WHERE is_active = true;
