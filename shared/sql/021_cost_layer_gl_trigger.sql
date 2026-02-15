-- Migration: 021_cost_layer_gl_trigger.sql
-- Purpose: Auto-post GL entries when cost layers are created without a goods receipt
-- This is a FAILSAFE to prevent GL/subledger discrepancies
-- Date: 2026-01-01

-- ============================================================
-- STEP 1: Add goods_receipt_id column to cost_layers if missing
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'cost_layers' AND column_name = 'goods_receipt_id'
  ) THEN
    ALTER TABLE cost_layers ADD COLUMN goods_receipt_id UUID REFERENCES goods_receipts(id);
    RAISE NOTICE 'Added goods_receipt_id column to cost_layers';
  END IF;
END $$;

-- ============================================================
-- STEP 2: Add gl_transaction_id column for audit trail
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'cost_layers' AND column_name = 'gl_transaction_id'
  ) THEN
    ALTER TABLE cost_layers ADD COLUMN gl_transaction_id UUID;
    RAISE NOTICE 'Added gl_transaction_id column to cost_layers';
  END IF;
END $$;

-- ============================================================
-- STEP 3: Create the failsafe trigger function
-- ============================================================
CREATE OR REPLACE FUNCTION fn_post_cost_layer_to_gl()
RETURNS TRIGGER AS $$
DECLARE
  v_txn_id UUID;
  v_total_value NUMERIC(15,2);
  v_inventory_account_id UUID;
  v_offset_account_id UUID;
  v_product_name VARCHAR(255);
  v_txn_number VARCHAR(50);
BEGIN
  v_total_value := NEW.quantity * NEW.unit_cost;
  
  -- Only post GL if:
  -- 1. No goods_receipt_id (orphaned cost layer - not from GR workflow)
  -- 2. No gl_transaction_id yet (not already posted)
  -- 3. Total value > 0
  IF NEW.goods_receipt_id IS NULL 
     AND NEW.gl_transaction_id IS NULL 
     AND v_total_value > 0 THEN
    
    -- Get account IDs (PascalCase column names)
    SELECT "Id" INTO v_inventory_account_id 
    FROM accounts WHERE "AccountCode" = '1300' AND "IsActive" = true;
    
    SELECT "Id" INTO v_offset_account_id 
    FROM accounts WHERE "AccountCode" = '3200' AND "IsActive" = true;
    
    -- Get product name for description
    SELECT name INTO v_product_name 
    FROM products WHERE id = NEW.product_id;
    
    -- Only proceed if both accounts exist
    IF v_inventory_account_id IS NOT NULL AND v_offset_account_id IS NOT NULL THEN
      v_txn_id := uuid_generate_v4();
      
      -- Generate transaction number: CLGL-YYYY-NNNNNN
      SELECT 'CLGL-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(
        (COALESCE(MAX(CAST(SUBSTRING("TransactionNumber" FROM 'CLGL-\d{4}-(\d+)') AS INTEGER)), 0) + 1)::TEXT, 
        6, '0')
      INTO v_txn_number
      FROM ledger_transactions 
      WHERE "TransactionNumber" LIKE 'CLGL-%';
      
      -- Create ledger transaction
      INSERT INTO ledger_transactions (
        "Id", "TransactionNumber", "TransactionDate", "Description",
        "ReferenceType", "ReferenceId", "TotalDebitAmount", "TotalCreditAmount", "Status", 
        "CreatedAt", "UpdatedAt", "IsReversed"
      ) VALUES (
        v_txn_id,
        v_txn_number,
        CURRENT_DATE,
        'TRIGGER: Cost layer ' || COALESCE(NEW.batch_number, 'N/A') || ' - ' || COALESCE(v_product_name, 'Unknown'),
        'COST_LAYER', 
        NEW.id, 
        v_total_value, 
        v_total_value, 
        'POSTED',
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP,
        false
      );
      
      -- Post DEBIT to Inventory (1300)
      INSERT INTO ledger_entries (
        "Id", "TransactionId", "AccountId", "EntryType", "Amount",
        "DebitAmount", "CreditAmount", "Description", "LineNumber", "CreatedAt"
      ) VALUES (
        uuid_generate_v4(), 
        v_txn_id, 
        v_inventory_account_id, 
        'DEBIT',
        v_total_value, 
        v_total_value, 
        0,
        'TRIGGER: Cost layer ' || COALESCE(NEW.batch_number, 'N/A'), 
        1, 
        CURRENT_TIMESTAMP
      );
      
      -- Post CREDIT to Opening Balance Equity (3200)
      INSERT INTO ledger_entries (
        "Id", "TransactionId", "AccountId", "EntryType", "Amount",
        "DebitAmount", "CreditAmount", "Description", "LineNumber", "CreatedAt"
      ) VALUES (
        uuid_generate_v4(), 
        v_txn_id, 
        v_offset_account_id, 
        'CREDIT',
        v_total_value, 
        0, 
        v_total_value,
        'TRIGGER: Cost layer offset ' || COALESCE(NEW.batch_number, 'N/A'), 
        2, 
        CURRENT_TIMESTAMP
      );
      
      -- Update cost layer with GL transaction reference
      NEW.gl_transaction_id := v_txn_id;
      
      RAISE NOTICE 'TRIGGER: Posted GL for cost layer (batch: %, value: %)', NEW.batch_number, v_total_value;
    ELSE
      RAISE WARNING 'TRIGGER: Missing accounts (1300 or 3200) - GL not posted';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- STEP 4: Create the trigger (drop if exists first)
-- ============================================================
DROP TRIGGER IF EXISTS trg_cost_layer_gl_failsafe ON cost_layers;

CREATE TRIGGER trg_cost_layer_gl_failsafe
  BEFORE INSERT ON cost_layers
  FOR EACH ROW
  EXECUTE FUNCTION fn_post_cost_layer_to_gl();

-- ============================================================
-- STEP 5: Add comments for documentation
-- ============================================================
COMMENT ON TRIGGER trg_cost_layer_gl_failsafe ON cost_layers IS 
'Failsafe trigger: Auto-posts GL entries (DR Inventory 1300, CR Opening Balance Equity 3200) 
when cost layers are created without a goods_receipt_id. Prevents GL/subledger discrepancies.
Transaction format: CLGL-YYYY-NNNNNN. Created: 2026-01-01';

COMMENT ON FUNCTION fn_post_cost_layer_to_gl() IS
'Failsafe function to auto-post GL entries for orphaned cost layers (no goods_receipt_id).
Posts to accounts 1300 (Inventory) and 3200 (Opening Balance Equity).
Created: 2026-01-01';

-- ============================================================
-- STEP 6: Verify trigger creation
-- ============================================================
DO $$
DECLARE
  v_trigger_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.triggers 
    WHERE trigger_name = 'trg_cost_layer_gl_failsafe'
    AND event_object_table = 'cost_layers'
  ) INTO v_trigger_exists;
  
  IF v_trigger_exists THEN
    RAISE NOTICE 'Trigger trg_cost_layer_gl_failsafe created successfully';
  ELSE
    RAISE EXCEPTION 'Failed to create trigger trg_cost_layer_gl_failsafe';
  END IF;
END $$;
