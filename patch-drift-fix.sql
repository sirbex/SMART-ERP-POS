-- ============================================================
-- ONE-TIME DRIFT PATCH: Fix missing cost_layers from stock adjustments
-- Date: 2026-04-06
-- Issue: processMovement() posted to GL + updated batches/product_inventory
--        but never created/consumed cost_layers
-- Affected:
--   1. Enat Cream (SKU-4195): 1 unit × 34,500 — GL posted, no cost_layer
--   2. Vitamin C tabs (SKU-5235): 10 units × 10 — NO GL posted, no cost_layer
-- ============================================================

BEGIN;

-- ===== PRE-PATCH VERIFICATION =====
-- Show current state (should show 2 drifted products)
DO $$
DECLARE
  drift_count INT;
BEGIN
  SELECT COUNT(*) INTO drift_count
  FROM products p
  JOIN product_inventory pi ON pi.product_id = p.id
  LEFT JOIN (
    SELECT product_id, SUM(remaining_quantity) AS cl_qty
    FROM cost_layers WHERE is_active = TRUE AND remaining_quantity > 0
    GROUP BY product_id
  ) cl ON cl.product_id = p.id
  WHERE pi.quantity_on_hand - COALESCE(cl.cl_qty, 0) != 0;

  IF drift_count != 2 THEN
    RAISE EXCEPTION 'Expected 2 drifted products, found %. Aborting.', drift_count;
  END IF;

  RAISE NOTICE 'Pre-check passed: found exactly 2 drifted products';
END $$;

-- ===== PATCH 1: Create missing cost_layer for Enat Cream (1 × 34,500) =====
INSERT INTO cost_layers (
  product_id, quantity, remaining_quantity, unit_cost,
  received_date, batch_number, is_active
) VALUES (
  '544b719c-6c4b-4b3e-a1d3-781a323e38de',  -- Enat Cream
  1.0000, 1.0000, 34500.00,
  '2026-04-04', 'MAIN', true
);

-- ===== PATCH 2: Create missing cost_layer for Vitamin C tabs (10 × 10) =====
INSERT INTO cost_layers (
  product_id, quantity, remaining_quantity, unit_cost,
  received_date, batch_number, is_active
) VALUES (
  '4c9b185c-27d6-4371-b47e-7983826e52fc',  -- Vitamin C tabs 100mg
  10.0000, 10.0000, 10.00,
  '2026-04-04', 'MAIN', true
);

-- ===== PATCH 3: Post missing GL entry for Vitamin C (DR 1300 100 / CR 4110 100) =====
-- MOV-2026-2403 never posted to GL because movementValue was 0 at the time
INSERT INTO ledger_transactions (
  "TransactionNumber", "TransactionDate", "ReferenceType", "ReferenceId",
  "ReferenceNumber", "Description", "TotalDebitAmount", "TotalCreditAmount",
  "Status", "IdempotencyKey", "CreatedBy", "CreatedAt", "UpdatedAt", "IsReversed"
) VALUES (
  'TXN-002433',
  '2026-04-04',
  'STOCK_MOVEMENT',
  'd4591711-58ec-4fd0-b474-d627f9efb78f',
  'MOV-2026-2403',
  'Stock ADJUSTMENT_IN: Vitamin C tabs 100mg — MOV-2026-2403 (drift patch)',
  100.000000, 100.000000,
  'POSTED',
  'STOCK_MOVEMENT-d4591711-58ec-4fd0-b474-d627f9efb78f',
  '00000000-0000-0000-0000-000000000000',
  NOW(), NOW(), false
);

-- DR Inventory 1300
INSERT INTO ledger_entries (
  "TransactionId", "AccountId", "EntryType", "Amount",
  "DebitAmount", "CreditAmount", "Description", "LineNumber", "EntryDate", "CreatedAt"
) VALUES (
  (SELECT "Id" FROM ledger_transactions WHERE "IdempotencyKey" = 'STOCK_MOVEMENT-d4591711-58ec-4fd0-b474-d627f9efb78f'),
  '261d1b86-37bd-4b9e-a99f-6599e37bc059',  -- Inventory 1300
  'DEBIT', 100.000000,
  100.000000, 0.000000,
  'Inventory increase: MOV-2026-2403 (drift patch)',
  1,
  '2026-04-04', NOW()
);

-- CR Stock Overage 4110
INSERT INTO ledger_entries (
  "TransactionId", "AccountId", "EntryType", "Amount",
  "DebitAmount", "CreditAmount", "Description", "LineNumber", "EntryDate", "CreatedAt"
) VALUES (
  (SELECT "Id" FROM ledger_transactions WHERE "IdempotencyKey" = 'STOCK_MOVEMENT-d4591711-58ec-4fd0-b474-d627f9efb78f'),
  '4fd64457-4d2c-4d4b-8ea0-4cf84688d130',  -- Stock Overage Income 4110
  'CREDIT', 100.000000,
  0.000000, 100.000000,
  'Stock overage: MOV-2026-2403 (drift patch)',
  2,
  '2026-04-04', NOW()
);

-- ===== PATCH 4: Update account balances for the Vitamin C GL entry =====
UPDATE accounts SET "CurrentBalance" = "CurrentBalance" + 100.000000
WHERE "AccountCode" = '1300';

UPDATE accounts SET "CurrentBalance" = "CurrentBalance" + 100.000000
WHERE "AccountCode" = '4110';

-- ===== PATCH 5: Update product_valuation average costs =====
-- Enat Cream
UPDATE product_valuation
SET average_cost = (
  SELECT COALESCE(SUM(remaining_quantity * unit_cost) / NULLIF(SUM(remaining_quantity), 0), 0)
  FROM cost_layers WHERE product_id = '544b719c-6c4b-4b3e-a1d3-781a323e38de' AND is_active = TRUE AND remaining_quantity > 0
), updated_at = NOW()
WHERE product_id = '544b719c-6c4b-4b3e-a1d3-781a323e38de';

-- Vitamin C tabs
UPDATE product_valuation
SET average_cost = (
  SELECT COALESCE(SUM(remaining_quantity * unit_cost) / NULLIF(SUM(remaining_quantity), 0), 0)
  FROM cost_layers WHERE product_id = '4c9b185c-27d6-4371-b47e-7983826e52fc' AND is_active = TRUE AND remaining_quantity > 0
), updated_at = NOW()
WHERE product_id = '4c9b185c-27d6-4371-b47e-7983826e52fc';

-- ===== POST-PATCH VERIFICATION =====
-- Qty drift should now be 0
DO $$
DECLARE
  drift_count INT;
BEGIN
  SELECT COUNT(*) INTO drift_count
  FROM products p
  JOIN product_inventory pi ON pi.product_id = p.id
  LEFT JOIN (
    SELECT product_id, SUM(remaining_quantity) AS cl_qty
    FROM cost_layers WHERE is_active = TRUE AND remaining_quantity > 0
    GROUP BY product_id
  ) cl ON cl.product_id = p.id
  WHERE pi.quantity_on_hand - COALESCE(cl.cl_qty, 0) != 0;

  IF drift_count != 0 THEN
    RAISE EXCEPTION 'Post-patch qty drift check FAILED: % products still drifted', drift_count;
  END IF;

  RAISE NOTICE 'Post-check PASSED: Zero qty drift';
END $$;

COMMIT;
