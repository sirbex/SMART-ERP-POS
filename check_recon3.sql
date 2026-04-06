-- Find inventory batches that don't have corresponding GL entries
-- or GL entries that don't match batch values
-- This checks the -1,200 gap between BATCH_VAL and GL_1300
-- BATCH_VAL = 94,277,017 vs GL = 94,275,817 → batch is 1,200 MORE than GL

-- Check for bonus items (cost_price > 0 but no GL posting)
SELECT 'BONUS_BATCHES' AS src,
       COUNT(*) AS cnt,
       COALESCE(SUM(ROUND(remaining_quantity * cost_price, 0)), 0) AS val
FROM inventory_batches
WHERE remaining_quantity > 0 AND is_bonus = true;
