-- ============================================================================
-- FIX: fn_sale_items_set_product_type() trigger function
-- Issue: References non-existent 'chart_of_accounts' table (should be 'accounts')
-- ============================================================================

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

  -- Set the product_type on the sale_item (overrides user input)
  NEW.product_type := COALESCE(v_product_type, 'inventory');
  
  -- Set the income_account_id (overrides user input)
  NEW.income_account_id := v_income_account_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Log the fix
DO $$
BEGIN
  RAISE NOTICE 'Fixed fn_sale_items_set_product_type() - now uses correct "accounts" table';
END $$;
