-- Migration 020: Service Accounting Fix
-- Enables proper GL posting for service items vs inventory items
-- Date: December 30, 2025
-- 
-- BUSINESS IMPACT:
-- - Service revenue posts to 4100 (Service Revenue)
-- - Inventory revenue posts to 4000 (Sales Revenue)
-- - Service items skip COGS/Inventory GL entries
-- - Financial reports can separate product vs service revenue

-- ============================================================================
-- PART 1: ADD INCOME ACCOUNT TO PRODUCTS
-- ============================================================================

-- Add income_account_id to products table
-- This links service products to GL account 4100 (Service Revenue)
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS income_account_id UUID 
REFERENCES accounts("Id") ON DELETE SET NULL;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_products_income_account 
ON products(income_account_id) 
WHERE income_account_id IS NOT NULL;

-- Set default service revenue account (4100) for all service products
UPDATE products 
SET income_account_id = (
  SELECT "Id" FROM accounts 
  WHERE "AccountCode" = '4100' 
  LIMIT 1
)
WHERE product_type = 'service' 
  AND income_account_id IS NULL;

-- Add comment
COMMENT ON COLUMN products.income_account_id IS 
'Revenue GL account for this product. Service products use 4100 (Service Revenue), inventory typically uses 4000 (Sales Revenue)';

-- ============================================================================
-- PART 2: ADD PRODUCT TYPE TRACKING TO SALE_ITEMS
-- ============================================================================

-- Add product_type to sale_items so we know what type of item was sold
ALTER TABLE sale_items 
ADD COLUMN IF NOT EXISTS product_type VARCHAR(20) DEFAULT 'inventory';

-- Add is_service computed column for easy filtering
ALTER TABLE sale_items 
ADD COLUMN IF NOT EXISTS is_service BOOLEAN 
GENERATED ALWAYS AS (product_type = 'service') STORED;

-- Add income_account_id to track which GL account to credit
ALTER TABLE sale_items 
ADD COLUMN IF NOT EXISTS income_account_id UUID 
REFERENCES accounts("Id") ON DELETE SET NULL;

-- Add constraint to validate product_type (drop IF EXISTS not supported, use DO block)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'chk_sale_items_product_type'
  ) THEN
    ALTER TABLE sale_items 
    ADD CONSTRAINT chk_sale_items_product_type 
    CHECK (product_type IN ('inventory', 'consumable', 'service'));
  END IF;
END $$;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_sale_items_product_type 
ON sale_items(product_type);

CREATE INDEX IF NOT EXISTS idx_sale_items_is_service 
ON sale_items(is_service) 
WHERE is_service = true;

CREATE INDEX IF NOT EXISTS idx_sale_items_income_account 
ON sale_items(income_account_id) 
WHERE income_account_id IS NOT NULL;

-- Add comments
COMMENT ON COLUMN sale_items.product_type IS 
'Type of product sold: inventory (track stock), consumable (track but expensed), service (no stock tracking)';

COMMENT ON COLUMN sale_items.is_service IS 
'Computed: true when product_type = service. Used to skip COGS/Inventory GL entries';

COMMENT ON COLUMN sale_items.income_account_id IS 
'GL account to credit for revenue. Service items use 4100, inventory items use 4000';

-- ============================================================================
-- PART 3: BACKFILL EXISTING DATA
-- ============================================================================

-- Update existing"Id" FROM accounts WHERE "AccountCode" = '4100' LIMIT 1)
        ELSE 
          (SELECT "Id" FROM accounts WHERE "AccountCode"
    income_account_id = COALESCE(
      p.income_account_id,
      -- Default: service → 4100, inventory/consumable → 4000
      CASE 
        WHEN p.product_type = 'service' THEN 
          (SELECT id FROM chart_of_accounts WHERE account_code = '4100' LIMIT 1)
        ELSE 
          (SELECT id FROM chart_of_accounts WHERE account_code = '4000' LIMIT 1)
      END
    )
FROM products p
WHERE si.product_id = p.id
  AND si.product_type = 'inventory'; -- Only update if still has default value

-- Log backfill results
DO $$
DECLARE
  total_items INTEGER;
  service_items INTEGER;
  inventory_items INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_items FROM sale_items;
  SELECT COUNT(*) INTO service_items FROM sale_items WHERE is_service = true;
  SELECT COUNT(*) INTO inventory_items FROM sale_items WHERE is_service = false;
  
  RAISE NOTICE 'Backfill complete: % total sale items', total_items;
  RAISE NOTICE '  - % service items (will credit 4100)', service_items;
  RAISE NOTICE '  - % inventory/consumable items (will credit 4000)', inventory_items;
END $$;

-- ============================================================================
-- PART 4: ADD TRIGGER TO AUTO-POPULATE PRODUCT_TYPE ON INSERT
-- ============================================================================

-- Function to auto-populate product_type and income_account_id
CREATE OR REPLACE FUNCTION fn_sale_items_set_product_type()
RETURNS TRIGGER AS $$
DECLARE
  v_product_type VARCHAR(20);
  v_income_account_id UUID;
BEGIN
  -- Get product type and income account from products table
  SELECT 
    product_type,
    COALESCE(
      income_account_id,
      -- Default fallback if product doesn't have income_account_id set
      CASE 
        WHEN product_type = 'service' THEN 
          (SELECT "Id" FROM accounts WHERE "AccountCode" = '4100' LIMIT 1)
        ELSE 
          (SELECT "Id" FROM accounts WHERE "AccountCode" = '4000' LIMIT 1)
      END
    )
  INTO v_product_type, v_income_account_id
  FROM products
  WHERE id = NEW.product_id;
  
  -- Set the values if not already provided
  IF NEW.product_type IS NULL OR NEW.product_type = 'inventory' THEN
    NEW.product_type := COALESCE(v_product_type, 'inventory');
  END IF;
  
  IF NEW.income_account_id IS NULL THEN
    NEW.income_account_id := v_income_account_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trg_sale_items_set_product_type ON sale_items;

-- Create trigger
CREATE TRIGGER trg_sale_items_set_product_type
  BEFORE INSERT ON sale_items
  FOR EACH ROW
  EXECUTE FUNCTION fn_sale_items_set_product_type();

COMMENT ON TRIGGER trg_sale_items_set_product_type ON sale_items IS 
'Auto-populates product_type and income_account_id from products table on insert. Ensures proper GL account selection for revenue posting.';

-- ============================================================================
-- PART 5: VALIDATION QUERIES
-- ============================================================================

-- Verify service products have income account
DO $$
DECLARE
  missing_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO missing_count
  FROM products
  WHERE product_type = 'service' AND income_account_id IS NULL;
  
  IF missing_count > 0 THEN
    RAISE WARNING '% service products missing income_account_id - will default to 4100', missing_count;
  ELSE
    RAISE NOTICE 'All service products have income_account_id configured';
  END IF;
END $$;

-- Verify sale_items have product_type
DO $$
DECLARE
  untyped_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO untyped_count
  FROM sale_items
  WHERE product_type IS NULL;
  
  IF untyped_count > 0 THEN
    RAISE WARNING '% sale_items missing product_type - update required', untyped_count;
  ELSE
    RAISE NOTICE 'All sale_items have product_type populated';
  END IF;
END $$;

-- ============================================================================
-- PART 6: SUCCESS MESSAGE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '==============================================================';
  RAISE NOTICE 'Migration 020: Service Accounting Fix - COMPLETED';
  RAISE NOTICE '==============================================================';
  RAISE NOTICE 'Products table:';
  RAISE NOTICE '  ✓ income_account_id column added';
  RAISE NOTICE '  ✓ Service products linked to GL 4100';
  RAISE NOTICE '';
  RAISE NOTICE 'Sale_items table:';
  RAISE NOTICE '  ✓ product_type column added';
  RAISE NOTICE '  ✓ is_service computed column added';
  RAISE NOTICE '  ✓ income_account_id column added';
  RAISE NOTICE '  ✓ Auto-population trigger created';
  RAISE NOTICE '';
  RAISE NOTICE 'GL Posting Impact:';
  RAISE NOTICE '  → Service items will credit 4100 (Service Revenue)';
  RAISE NOTICE '  → Inventory items will credit 4000 (Sales Revenue)';
  RAISE NOTICE '  → Service items will skip COGS/Inventory entries';
  RAISE NOTICE '==============================================================';
END $$;
