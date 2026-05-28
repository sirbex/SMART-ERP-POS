-- Backfill products.base_uom_id from product_uoms (legacy rows missing base after MUoM rollout).

UPDATE products p
SET base_uom_id = d.uom_id
FROM (
  SELECT DISTINCT ON (pu.product_id)
         pu.product_id,
         pu.uom_id
  FROM product_uoms pu
  WHERE pu.is_default = true
  ORDER BY pu.product_id, pu.created_at ASC
) d
WHERE p.id = d.product_id
  AND p.base_uom_id IS NULL;

-- Products with UoMs but no default flag: promote earliest row as base.
UPDATE products p
SET base_uom_id = d.uom_id
FROM (
  SELECT DISTINCT ON (pu.product_id)
         pu.product_id,
         pu.uom_id
  FROM product_uoms pu
  ORDER BY pu.product_id, pu.created_at ASC
) d
WHERE p.id = d.product_id
  AND p.base_uom_id IS NULL
  AND EXISTS (SELECT 1 FROM product_uoms pu2 WHERE pu2.product_id = p.id);

UPDATE product_uoms pu
SET is_default = true,
    conversion_factor = 1
FROM products p
WHERE pu.product_id = p.id
  AND pu.uom_id = p.base_uom_id
  AND NOT EXISTS (
    SELECT 1 FROM product_uoms pu2
    WHERE pu2.product_id = pu.product_id AND pu2.is_default = true
  );

INSERT INTO schema_version (version) VALUES (519);
