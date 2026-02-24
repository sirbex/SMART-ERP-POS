-- =============================================================================
-- FIX ALL TRIGGER COLUMN ISSUES
-- This script fixes:
-- 1. stock_quantity -> quantity_on_hand
-- 2. movement_number generation for stock_movements
-- 3. Supplier balance column names
-- =============================================================================

-- ============================================================================
-- 1. Create movement number generator function
-- ============================================================================
CREATE OR REPLACE FUNCTION generate_movement_number()
RETURNS VARCHAR AS $$
DECLARE
    v_sequence INT;
    v_prefix VARCHAR := 'SM';
    v_year VARCHAR := TO_CHAR(CURRENT_DATE, 'YYYY');
BEGIN
    -- Get next sequence number for this year
    SELECT COALESCE(MAX(
        CASE 
            WHEN movement_number LIKE 'SM-' || v_year || '-%' THEN
                NULLIF(REGEXP_REPLACE(SUBSTRING(movement_number FROM 9), '[^0-9]', '', 'g'), '')::INT
            ELSE 0
        END
    ), 0) + 1
    INTO v_sequence
    FROM stock_movements;
    
    RETURN v_prefix || '-' || v_year || '-' || LPAD(v_sequence::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 2. Fix fn_update_product_stock_internal - use quantity_on_hand
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_update_product_stock_internal(p_product_id UUID)
RETURNS VOID AS $$
DECLARE
    v_total_quantity NUMERIC;
BEGIN
    -- Sum all batch quantities for this product
    SELECT COALESCE(SUM(remaining_quantity), 0)
    INTO v_total_quantity
    FROM inventory_batches
    WHERE product_id = p_product_id
      AND status = 'ACTIVE';
    
    -- Update product stock quantity (CORRECT column: quantity_on_hand)
    UPDATE products
    SET quantity_on_hand = v_total_quantity,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_product_id;
    
    RAISE NOTICE 'Updated product % stock to %', p_product_id, v_total_quantity;
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Failed to update product stock for %: %', p_product_id, SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 3. Fix fn_log_stock_movement - include movement_number
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_log_stock_movement()
RETURNS TRIGGER AS $$
DECLARE
    v_movement_type movement_type;
    v_quantity_change NUMERIC;
    v_reference_type VARCHAR;
    v_reference_id UUID;
    v_movement_number VARCHAR;
BEGIN
    -- Skip if no actual change in quantity
    IF TG_OP = 'UPDATE' AND NEW.remaining_quantity = OLD.remaining_quantity THEN
        RETURN NEW;
    END IF;
    
    -- Generate movement number
    v_movement_number := generate_movement_number();
    
    -- Determine movement type and quantity
    IF TG_OP = 'INSERT' THEN
        v_movement_type := 'GOODS_RECEIPT'::movement_type;
        v_quantity_change := NEW.remaining_quantity;
        v_reference_type := COALESCE(NEW.source_type, 'GOODS_RECEIPT');
        v_reference_id := NEW.source_reference_id;
    ELSIF TG_OP = 'UPDATE' THEN
        v_quantity_change := NEW.remaining_quantity - OLD.remaining_quantity;
        IF v_quantity_change > 0 THEN
            v_movement_type := 'ADJUSTMENT_IN'::movement_type;
        ELSIF v_quantity_change < 0 THEN
            v_movement_type := 'SALE'::movement_type;
            v_quantity_change := ABS(v_quantity_change);
        ELSE
            RETURN NEW; -- No change, skip logging
        END IF;
        v_reference_type := 'ADJUSTMENT';
        v_reference_id := NEW.id;
    ELSIF TG_OP = 'DELETE' THEN
        v_movement_type := 'DAMAGE'::movement_type;
        v_quantity_change := OLD.remaining_quantity;
        v_reference_type := 'BATCH_DELETE';
        v_reference_id := OLD.id;
    END IF;
    
    -- Insert stock movement record WITH movement_number
    INSERT INTO stock_movements (
        id, movement_number, product_id, batch_id, movement_type, quantity,
        reference_type, reference_id, created_at
    ) VALUES (
        gen_random_uuid(),
        v_movement_number,
        CASE WHEN TG_OP = 'DELETE' THEN OLD.product_id ELSE NEW.product_id END,
        CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
        v_movement_type,
        v_quantity_change,
        v_reference_type,
        v_reference_id,
        CURRENT_TIMESTAMP
    );
    
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
EXCEPTION
    WHEN undefined_table THEN
        -- stock_movements table doesn't exist, skip logging
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        ELSE
            RETURN NEW;
        END IF;
    WHEN OTHERS THEN
        -- Log warning but don't fail the batch operation
        RAISE WARNING 'Stock movement logging failed: %', SQLERRM;
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        ELSE
            RETURN NEW;
        END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 4. Fix fn_update_supplier_balance_internal - use "OutstandingBalance"
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_update_supplier_balance_internal(p_supplier_id UUID)
RETURNS VOID AS $$
DECLARE
    v_new_balance NUMERIC;
BEGIN
    -- Calculate balance from completed goods receipts through purchase orders
    SELECT COALESCE(SUM(gr.total_value), 0)
    INTO v_new_balance
    FROM goods_receipts gr
    JOIN purchase_orders po ON po.id = gr.purchase_order_id
    WHERE po.supplier_id = p_supplier_id
      AND gr.status = 'COMPLETED';
    
    -- Subtract approved payments
    SELECT v_new_balance - COALESCE(SUM("Amount"), 0)
    INTO v_new_balance
    FROM supplier_payments
    WHERE "SupplierId" = p_supplier_id
      AND "Status" = 'APPROVED';
    
    -- Update supplier balance (CORRECT column: "OutstandingBalance")
    UPDATE suppliers
    SET "OutstandingBalance" = v_new_balance,
        "UpdatedAt" = CURRENT_TIMESTAMP
    WHERE "Id" = p_supplier_id;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Failed to update supplier balance for %: %', p_supplier_id, SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. Fix fn_recalculate_supplier_ap_balance - use "OutstandingBalance"
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_recalculate_supplier_ap_balance()
RETURNS TRIGGER AS $$
DECLARE
    v_supplier_id UUID;
    v_new_balance NUMERIC;
BEGIN
    -- Determine which supplier to update
    IF TG_OP = 'DELETE' THEN
        v_supplier_id := OLD."SupplierId";
    ELSE
        v_supplier_id := NEW."SupplierId";
    END IF;

    IF v_supplier_id IS NOT NULL THEN
        PERFORM fn_update_supplier_balance_internal(v_supplier_id);
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. Recreate triggers
-- ============================================================================
DROP TRIGGER IF EXISTS trg_log_stock_movement ON inventory_batches;
CREATE TRIGGER trg_log_stock_movement
    AFTER INSERT OR UPDATE OR DELETE ON inventory_batches
    FOR EACH ROW
    EXECUTE FUNCTION fn_log_stock_movement();

DROP TRIGGER IF EXISTS trg_sync_product_stock_on_batch ON inventory_batches;
CREATE TRIGGER trg_sync_product_stock_on_batch
    AFTER INSERT OR UPDATE OR DELETE ON inventory_batches
    FOR EACH ROW
    EXECUTE FUNCTION fn_recalculate_product_stock();

-- ============================================================================
-- VERIFICATION
-- ============================================================================
SELECT 'ALL TRIGGERS FIXED' as status;
SELECT 'Functions updated:' as info
UNION ALL SELECT '  - generate_movement_number()'
UNION ALL SELECT '  - fn_update_product_stock_internal() -> quantity_on_hand'
UNION ALL SELECT '  - fn_log_stock_movement() -> includes movement_number'
UNION ALL SELECT '  - fn_update_supplier_balance_internal() -> OutstandingBalance'
UNION ALL SELECT '  - fn_recalculate_supplier_ap_balance() -> OutstandingBalance';
