-- Migration 521: pos_order_items UoM FKs → master uoms.id (align with sale_items / MUoM SSOT)

ALTER TABLE pos_order_items DROP CONSTRAINT IF EXISTS pos_order_items_uom_id_fkey;
ALTER TABLE pos_order_items DROP CONSTRAINT IF EXISTS pos_order_items_base_uom_id_fkey;

-- Remap legacy junction product_uoms.id → master uoms.id where applicable
UPDATE pos_order_items oi
SET uom_id = pu.uom_id
FROM product_uoms pu
WHERE oi.uom_id IS NOT NULL
  AND oi.uom_id = pu.id
  AND pu.uom_id IS NOT NULL;

UPDATE pos_order_items oi
SET base_uom_id = pu.uom_id
FROM product_uoms pu
WHERE oi.base_uom_id IS NOT NULL
  AND oi.base_uom_id = pu.id
  AND pu.uom_id IS NOT NULL;

ALTER TABLE pos_order_items
  ADD CONSTRAINT pos_order_items_uom_id_fkey
  FOREIGN KEY (uom_id) REFERENCES uoms(id) ON DELETE RESTRICT;

ALTER TABLE pos_order_items
  ADD CONSTRAINT pos_order_items_base_uom_id_fkey
  FOREIGN KEY (base_uom_id) REFERENCES uoms(id) ON DELETE RESTRICT;

INSERT INTO schema_version (version) VALUES (521);
