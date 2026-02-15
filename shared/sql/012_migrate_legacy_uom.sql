-- Migration 012: Migrate legacy unit_of_measure to product_uoms table
-- Date: 2025-11-13
-- Purpose: Consolidate UOM system - migrate all products to use product_uoms table exclusively
-- 
-- CRITICAL: This migration prepares for dropping unit_of_measure column
-- Run this BEFORE any code changes that remove unit_of_measure references

-- Step 1: Ensure required UOMs exist in master table
-- Map legacy values: PIECE/PCS → Each, CARTON → Carton, KG → killogtam

DO $$
DECLARE
    v_each_id UUID;
    v_carton_id UUID;
    v_kg_id UUID;
BEGIN
    -- Get or create 'Each' UOM (for PIECE and PCS)
    SELECT id INTO v_each_id FROM uoms WHERE UPPER(name) = 'EACH';
    IF v_each_id IS NULL THEN
        INSERT INTO uoms (name, symbol) VALUES ('Each', 'EA') RETURNING id INTO v_each_id;
        RAISE NOTICE 'Created Each UOM with ID: %', v_each_id;
    ELSE
        RAISE NOTICE 'Each UOM already exists with ID: %', v_each_id;
    END IF;

    -- Get Carton UOM (should exist)
    SELECT id INTO v_carton_id FROM uoms WHERE UPPER(name) = 'CARTON';
    IF v_carton_id IS NULL THEN
        INSERT INTO uoms (name, symbol) VALUES ('Carton', 'CTN') RETURNING id INTO v_carton_id;
        RAISE NOTICE 'Created Carton UOM with ID: %', v_carton_id;
    ELSE
        RAISE NOTICE 'Carton UOM already exists with ID: %', v_carton_id;
    END IF;

    -- Get killogtam/KG UOM (should exist)
    SELECT id INTO v_kg_id FROM uoms WHERE UPPER(name) = 'KILLOGTAM' OR UPPER(symbol) = 'KG';
    IF v_kg_id IS NULL THEN
        INSERT INTO uoms (name, symbol) VALUES ('killogtam', 'kg') RETURNING id INTO v_kg_id;
        RAISE NOTICE 'Created killogtam UOM with ID: %', v_kg_id;
    ELSE
        RAISE NOTICE 'killogtam/KG UOM already exists with ID: %', v_kg_id;
    END IF;

    -- Step 2: Create product_uoms for products that don't have any
    -- Map legacy unit_of_measure to appropriate UOM
    
    RAISE NOTICE '=== Starting product_uoms migration ===';
    
    -- Migrate products with PIECE or PCS → Each
    INSERT INTO product_uoms (product_id, uom_id, conversion_factor, is_default)
    SELECT 
        p.id,
        v_each_id,
        1.0,
        true
    FROM products p
    WHERE UPPER(p.unit_of_measure) IN ('PIECE', 'PCS')
      AND NOT EXISTS (
          SELECT 1 FROM product_uoms pu WHERE pu.product_id = p.id
      );
    
    RAISE NOTICE 'Migrated % products with PIECE/PCS', (
        SELECT COUNT(*) FROM products p
        WHERE UPPER(p.unit_of_measure) IN ('PIECE', 'PCS')
          AND EXISTS (SELECT 1 FROM product_uoms pu WHERE pu.product_id = p.id AND pu.uom_id = v_each_id)
    );

    -- Migrate products with CARTON → Carton
    INSERT INTO product_uoms (product_id, uom_id, conversion_factor, is_default)
    SELECT 
        p.id,
        v_carton_id,
        1.0,
        true
    FROM products p
    WHERE UPPER(p.unit_of_measure) = 'CARTON'
      AND NOT EXISTS (
          SELECT 1 FROM product_uoms pu WHERE pu.product_id = p.id
      );
    
    RAISE NOTICE 'Migrated % products with CARTON', (
        SELECT COUNT(*) FROM products p
        WHERE UPPER(p.unit_of_measure) = 'CARTON'
          AND EXISTS (SELECT 1 FROM product_uoms pu WHERE pu.product_id = p.id AND pu.uom_id = v_carton_id)
    );

    -- Migrate products with KG → killogtam
    INSERT INTO product_uoms (product_id, uom_id, conversion_factor, is_default)
    SELECT 
        p.id,
        v_kg_id,
        1.0,
        true
    FROM products p
    WHERE UPPER(p.unit_of_measure) = 'KG'
      AND NOT EXISTS (
          SELECT 1 FROM product_uoms pu WHERE pu.product_id = p.id
      );
    
    RAISE NOTICE 'Migrated % products with KG', (
        SELECT COUNT(*) FROM products p
        WHERE UPPER(p.unit_of_measure) = 'KG'
          AND EXISTS (SELECT 1 FROM product_uoms pu WHERE pu.product_id = p.id AND pu.uom_id = v_kg_id)
    );

    -- Step 3: Verify all products now have at least one product_uom
    RAISE NOTICE '=== Verification ===';
    
    IF EXISTS (
        SELECT 1 FROM products p
        WHERE NOT EXISTS (SELECT 1 FROM product_uoms pu WHERE pu.product_id = p.id)
    ) THEN
        RAISE EXCEPTION 'ERROR: Some products still have no product_uoms records!';
    ELSE
        RAISE NOTICE 'SUCCESS: All products now have product_uoms records';
    END IF;

    -- Report summary
    RAISE NOTICE '=== Migration Summary ===';
    RAISE NOTICE 'Total products: %', (SELECT COUNT(*) FROM products);
    RAISE NOTICE 'Products with product_uoms: %', (
        SELECT COUNT(DISTINCT p.id) FROM products p
        INNER JOIN product_uoms pu ON p.id = pu.product_id
    );
    RAISE NOTICE 'Total product_uoms records: %', (SELECT COUNT(*) FROM product_uoms);

END $$;

-- Verification queries (run after migration)
-- SELECT p.id, p.name, p.unit_of_measure, COUNT(pu.id) as uom_count 
-- FROM products p 
-- LEFT JOIN product_uoms pu ON p.id = pu.product_id 
-- GROUP BY p.id, p.name, p.unit_of_measure
-- HAVING COUNT(pu.id) = 0;

-- Expected result: 0 rows (all products should have at least one product_uom)
