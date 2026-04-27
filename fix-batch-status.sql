-- Fix batch status back to ACTIVE now that remaining_quantity = 100
UPDATE inventory_batches
SET status = 'ACTIVE'
WHERE product_id = '3801aad9-2fcb-487d-8fac-100e2e5b9171'
  AND batch_number = 'BATCH-20260404-001';

-- Verify
SELECT batch_number, remaining_quantity, expiry_date, status
FROM inventory_batches
WHERE product_id = '3801aad9-2fcb-487d-8fac-100e2e5b9171';
