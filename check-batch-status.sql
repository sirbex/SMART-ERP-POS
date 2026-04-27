-- Check actual batch status for test product
SELECT 
  batch_number, 
  remaining_quantity, 
  expiry_date, 
  status,
  created_at
FROM inventory_batches
WHERE product_id = '3801aad9-2fcb-487d-8fac-100e2e5b9171'
ORDER BY created_at DESC
LIMIT 10;
