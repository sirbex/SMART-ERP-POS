-- ============================================================================
-- Migration 410: Product Vertical Partition (SAP-style)
-- 
-- Splits volatile columns out of the `products` table into two focused tables:
--   product_inventory  – hot writes (every sale / goods receipt)
--   product_valuation  – warm writes (goods receipts / price changes)
--
-- The `products` master row now only changes when someone edits the product
-- catalog (name, SKU, category, etc.), keeping its indexes compact and
-- eliminating VACUUM pressure from stock/price churn.
--
-- A backward-compatible VIEW `products_full` is provided so existing
-- reporting SQL that joins `products` can be migrated incrementally.
--
-- SAFE: Additive migration — no columns dropped, no data lost.
-- ============================================================================

BEGIN;

-- ────────────── 1. product_inventory ──────────────

CREATE TABLE IF NOT EXISTS product_inventory (
    product_id      UUID PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
    quantity_on_hand DECIMAL(15, 4)  NOT NULL DEFAULT 0.0000,
    reorder_level    DECIMAL(15, 4)  NOT NULL DEFAULT 0.0000,
    updated_at       TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE product_inventory
  IS 'Hot inventory data — updated on every sale, goods receipt, and stock adjustment.';

-- Populate from existing products
INSERT INTO product_inventory (product_id, quantity_on_hand, reorder_level, updated_at)
SELECT id, COALESCE(quantity_on_hand, 0), COALESCE(reorder_level, 0), COALESCE(updated_at, CURRENT_TIMESTAMP)
FROM products
ON CONFLICT (product_id) DO NOTHING;

-- Indexes tuned for 3 M+ rows
CREATE INDEX IF NOT EXISTS idx_product_inventory_reorder
  ON product_inventory (product_id)
  WHERE quantity_on_hand <= reorder_level;

-- ────────────── 2. product_valuation ──────────────

CREATE TABLE IF NOT EXISTS product_valuation (
    product_id       UUID PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
    cost_price       DECIMAL(15, 2)  NOT NULL DEFAULT 0.00,
    selling_price    DECIMAL(15, 2)  NOT NULL DEFAULT 0.00,
    costing_method   costing_method  NOT NULL DEFAULT 'FIFO',
    average_cost     DECIMAL(15, 2)  NOT NULL DEFAULT 0.00,
    last_cost        DECIMAL(15, 2)  NOT NULL DEFAULT 0.00,
    pricing_formula  TEXT,
    auto_update_price BOOLEAN        NOT NULL DEFAULT false,
    updated_at       TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE product_valuation
  IS 'Valuation & pricing data — updated on goods receipts and price changes.';

-- Populate from existing products
INSERT INTO product_valuation (
    product_id, cost_price, selling_price, costing_method,
    average_cost, last_cost, pricing_formula, auto_update_price, updated_at
)
SELECT
    id,
    COALESCE(cost_price, 0),
    COALESCE(selling_price, 0),
    COALESCE(costing_method, 'FIFO'),
    COALESCE(average_cost, 0),
    COALESCE(last_cost, 0),
    pricing_formula,
    COALESCE(auto_update_price, false),
    COALESCE(updated_at, CURRENT_TIMESTAMP)
FROM products
ON CONFLICT (product_id) DO NOTHING;

-- Covering index for POS lookups (index-only scan on hot path)
CREATE INDEX IF NOT EXISTS idx_product_valuation_selling
  ON product_valuation (product_id)
  INCLUDE (selling_price, cost_price, costing_method);

-- ────────────── 3. Backward-compatible VIEW ──────────────

CREATE OR REPLACE VIEW products_full AS
SELECT
    p.id,
    p.product_number,
    p.sku,
    p.barcode,
    p.name,
    p.description,
    p.category,
    p.generic_name,
    p.conversion_factor,
    -- Valuation (from product_valuation)
    pv.cost_price,
    pv.selling_price,
    p.is_taxable,
    p.tax_rate,
    pv.costing_method,
    pv.average_cost,
    pv.last_cost,
    pv.pricing_formula,
    pv.auto_update_price,
    -- Inventory (from product_inventory)
    pi.quantity_on_hand,
    pi.reorder_level,
    p.track_expiry,
    p.min_days_before_expiry_sale,
    p.is_active,
    p.created_at,
    -- Use latest updated_at across all three
    GREATEST(p.updated_at, pi.updated_at, pv.updated_at) AS updated_at
FROM products p
LEFT JOIN product_inventory pi ON pi.product_id = p.id
LEFT JOIN product_valuation pv ON pv.product_id = p.id;

COMMENT ON VIEW products_full
  IS 'Backward-compatible view that reunites products + inventory + valuation.';

-- ────────────── 4. Update bulk recalculation function ──────────────

CREATE OR REPLACE FUNCTION fn_recalculate_all_product_stock()
RETURNS TABLE(product_id UUID, old_quantity NUMERIC, new_quantity NUMERIC, status TEXT) AS $$
DECLARE
    v_product RECORD;
    v_old_quantity NUMERIC;
    v_new_quantity NUMERIC;
BEGIN
    FOR v_product IN
        SELECT pi.product_id AS id, pi.quantity_on_hand
        FROM product_inventory pi
    LOOP
        v_old_quantity := COALESCE(v_product.quantity_on_hand, 0);

        SELECT COALESCE(SUM(remaining_quantity), 0)
        INTO v_new_quantity
        FROM inventory_batches
        WHERE product_id = v_product.id
          AND status = 'ACTIVE';

        -- Write to the new table only
        UPDATE product_inventory
        SET quantity_on_hand = v_new_quantity,
            updated_at = CURRENT_TIMESTAMP
        WHERE product_id = v_product.id;

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

-- ────────────── 5. Update internal stock sync function ──────────────

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

    -- Write to the new table only
    UPDATE product_inventory
    SET quantity_on_hand = v_total_quantity,
        updated_at = CURRENT_TIMESTAMP
    WHERE product_id = p_product_id;

    RAISE NOTICE 'Updated product % stock to %', p_product_id, v_total_quantity;
END;
$$ LANGUAGE plpgsql;

-- ────────────── 6. Trigger: auto-create child rows on product INSERT ──────────────

CREATE OR REPLACE FUNCTION fn_product_create_children()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO product_inventory (product_id, quantity_on_hand, reorder_level)
    VALUES (NEW.id, COALESCE(NEW.quantity_on_hand, 0), COALESCE(NEW.reorder_level, 0))
    ON CONFLICT (product_id) DO NOTHING;

    INSERT INTO product_valuation (
        product_id, cost_price, selling_price, costing_method,
        average_cost, last_cost, pricing_formula, auto_update_price
    ) VALUES (
        NEW.id,
        COALESCE(NEW.cost_price, 0),
        COALESCE(NEW.selling_price, 0),
        COALESCE(NEW.costing_method, 'FIFO'),
        COALESCE(NEW.average_cost, 0),
        COALESCE(NEW.last_cost, 0),
        NEW.pricing_formula,
        COALESCE(NEW.auto_update_price, false)
    )
    ON CONFLICT (product_id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_product_create_children ON products;
CREATE TRIGGER trg_product_create_children
    AFTER INSERT ON products
    FOR EACH ROW
    EXECUTE FUNCTION fn_product_create_children();

COMMENT ON TRIGGER trg_product_create_children ON products
  IS 'Auto-creates product_inventory + product_valuation rows when a product is inserted.';

-- ────────────── 7. Performance indexes on main products table ──────────────
-- With volatile columns moved out, these B-trees stay compact.

CREATE INDEX IF NOT EXISTS idx_products_active_name
  ON products (name)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_products_active_category
  ON products (category)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_products_active_sku
  ON products (sku)
  WHERE is_active = true;

COMMIT;
