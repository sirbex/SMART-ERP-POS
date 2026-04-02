-- Migration 060: Fix inventory reconciliation — sync products.quantity_on_hand
-- 
-- ROOT CAUSE: The SAP-style vertical partition (migration 410) moved quantity_on_hand 
-- to product_inventory as the single source of truth, but products.quantity_on_hand was
-- never updated by sales/adjustments, causing drift.
--
-- FIX: Application-layer CTE queries now update BOTH tables atomically.
-- SQL functions below also write both. No triggers — all logic in app layer.
--
-- This migration:
-- 1. Fixes current drift (one-time data sync)
-- 2. Replaces fn_recalculate_all_product_stock to write BOTH tables
-- 3. Replaces fn_update_product_stock_internal to write BOTH tables
-- 4. Drops the orphaned index on products.quantity_on_hand
-- 5. Drops legacy trigger if it exists (app-layer handles sync)

BEGIN;

-- ============================================================================
-- STEP 1: Fix current drift (one-time) — sync products.quantity_on_hand FROM product_inventory
-- ============================================================================
UPDATE products p
SET quantity_on_hand = COALESCE(pi.quantity_on_hand, 0),
    updated_at = CURRENT_TIMESTAMP
FROM product_inventory pi
WHERE pi.product_id = p.id
  AND p.quantity_on_hand IS DISTINCT FROM pi.quantity_on_hand;

-- Also fix any products without a product_inventory row
UPDATE products p
SET quantity_on_hand = 0,
    updated_at = CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM product_inventory pi WHERE pi.product_id = p.id)
  AND p.quantity_on_hand != 0;

-- ============================================================================
-- STEP 2: Replace fn_recalculate_all_product_stock — writes BOTH tables
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_recalculate_all_product_stock()
RETURNS TABLE(product_id UUID, old_quantity NUMERIC, new_quantity NUMERIC, status TEXT) AS $$
DECLARE
    v_product RECORD;
    v_old_quantity NUMERIC;
    v_new_quantity NUMERIC;
BEGIN
    FOR v_product IN SELECT p.id, COALESCE(pi.quantity_on_hand, 0) AS quantity_on_hand
                     FROM products p
                     LEFT JOIN product_inventory pi ON pi.product_id = p.id LOOP
        v_old_quantity := v_product.quantity_on_hand;

        SELECT COALESCE(SUM(remaining_quantity), 0)
        INTO v_new_quantity
        FROM inventory_batches
        WHERE product_id = v_product.id
          AND status = 'ACTIVE';

        -- Update product_inventory (single source of truth)
        UPDATE product_inventory
        SET quantity_on_hand = v_new_quantity,
            updated_at = CURRENT_TIMESTAMP
        WHERE product_id = v_product.id;

        -- Mirror to products table (app-layer sync)
        UPDATE products
        SET quantity_on_hand = v_new_quantity
        WHERE id = v_product.id;

        product_id := v_product.id;
        old_quantity := v_old_quantity;
        new_quantity := v_new_quantity;
        status := CASE
            WHEN v_old_quantity = v_new_quantity THEN 'NO_CHANGE'
            ELSE 'UPDATED'
        END;

        RETURN NEXT;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 3: Replace fn_update_product_stock_internal — writes BOTH tables
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_update_product_stock_internal(p_product_id UUID)
RETURNS VOID AS $$
DECLARE
    v_total_quantity NUMERIC;
BEGIN
    SELECT COALESCE(SUM(remaining_quantity), 0)
    INTO v_total_quantity
    FROM inventory_batches
    WHERE product_id = p_product_id
      AND status = 'ACTIVE';

    UPDATE product_inventory
    SET quantity_on_hand = v_total_quantity,
        updated_at = CURRENT_TIMESTAMP
    WHERE product_id = p_product_id;

    -- Mirror to products table (app-layer sync)
    UPDATE products
    SET quantity_on_hand = v_total_quantity
    WHERE id = p_product_id;

    RAISE NOTICE 'Updated product % stock to %', p_product_id, v_total_quantity;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 4: Drop orphaned index on products.quantity_on_hand
-- ============================================================================
DROP INDEX IF EXISTS idx_products_active_reorder;

-- Recreate on product_inventory (correct table)
CREATE INDEX IF NOT EXISTS idx_pi_active_reorder
  ON product_inventory(quantity_on_hand, reorder_level)
  WHERE quantity_on_hand <= reorder_level;

-- ============================================================================
-- STEP 5: Drop legacy trigger (app-layer handles sync, no triggers needed)
-- ============================================================================
DROP TRIGGER IF EXISTS trg_sync_product_qty ON product_inventory;
DROP FUNCTION IF EXISTS fn_sync_product_qty_from_pi();

COMMIT;
