-- Restock the CN-DN test product batch so payment method tests can run
UPDATE inventory_batches
SET remaining_quantity = remaining_quantity + 100
WHERE product_id = '3801aad9-2fcb-487d-8fac-100e2e5b9171'
  AND id = (
    SELECT id FROM inventory_batches
    WHERE product_id = '3801aad9-2fcb-487d-8fac-100e2e5b9171'
    ORDER BY created_at DESC
    LIMIT 1
  );

SELECT batch_number, remaining_quantity
FROM inventory_batches
WHERE product_id = '3801aad9-2fcb-487d-8fac-100e2e5b9171'
ORDER BY created_at DESC
LIMIT 3;
