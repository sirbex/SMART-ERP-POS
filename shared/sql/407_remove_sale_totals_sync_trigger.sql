-- Migration: 407_remove_sale_totals_sync_trigger.sql
-- Date: 2026-03-06
-- Description: Remove trg_sync_sale_totals trigger (SAP-style architecture)
--
-- ARCHITECTURE CHANGE: Application-layer totals, database-layer validation
--
-- BEFORE (broken):
--   INSERT sale_items → trigger recalculates sales.total_amount, discount_amount
--   This OVERWRITES app-calculated values, breaking:
--     - Cart-level discounts (trigger only sees item-level discount_amount)
--     - Offline sync (trigger recalculates on sync, corrupting offline totals)
--     - Discount stacking (cart + item + group + promo discounts lost)
--     - Complex tax rules (per-item tax, compound tax)
--     - Refund adjustments
--
-- AFTER (SAP approach):
--   Application service layer (salesService.ts) = SINGLE SOURCE OF TRUTH
--     → Calculates subtotal, discounts, tax, total with full business context
--     → Writes final values to sales + sale_items
--   Database = VALIDATION ONLY
--     → trg_validate_sale_totals (BEFORE trigger) RAISES on inconsistency
--     → NEVER modifies data
--
-- Triggers KEPT (validation/side-effects that don't touch totals):
--   trg_validate_sale_totals      → BEFORE INSERT/UPDATE on sales (validates total = subtotal - discount + tax)
--   trg_validate_sale_payment     → BEFORE INSERT/UPDATE on sales (validates payment amounts)
--   trg_check_credit_sale_customer→ BEFORE INSERT on sales (requires customer for credit sales)
--   trg_post_sale_to_ledger       → AFTER INSERT on sales (GL journal entries)
--   trg_post_sale_void_to_ledger  → AFTER UPDATE on sales (void GL reversal)
--   trg_sync_customer_balance     → AFTER INSERT/UPDATE on sales (customer balance recalc)
--   trg_enforce_period_sales      → BEFORE INSERT on sales (accounting period check)
--   trg_maintenance_check_sales   → BEFORE INSERT on sales (maintenance mode check)
--   trg_sale_items_set_product_type→ BEFORE INSERT on sale_items (sets product_type)

-- Drop the data-modifying trigger
DROP TRIGGER IF EXISTS trg_sync_sale_totals ON sale_items;

-- Keep the function in case we need to run manual recalculation
-- but it should NEVER be called automatically via trigger
COMMENT ON FUNCTION fn_update_sale_totals_internal(UUID) IS
  'DEPRECATED: Manual use only. Do NOT attach as trigger. '
  'Application layer (salesService.ts) is the single source of truth for sale totals. '
  'See migration 407_remove_sale_totals_sync_trigger.sql';

COMMENT ON FUNCTION fn_recalculate_sale_totals() IS
  'DEPRECATED: Trigger function removed from sale_items. '
  'Application layer calculates all totals. DB only validates via trg_validate_sale_totals.';
