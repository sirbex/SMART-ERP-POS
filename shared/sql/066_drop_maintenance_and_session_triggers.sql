-- Migration 066: Drop CAT 9 (Maintenance mode) and CAT 10 (Session duration) triggers
-- THE FINAL 3 TRIGGERS — after this, zero triggers remain in pos_system.
-- Maintenance mode checks moved to maintenanceGuard.ts called from PO/sales services.
-- Session duration computation moved to auditRepository logout queries.
-- Date: 2026-04-02

BEGIN;

-- =====================================================
-- CAT 9: MAINTENANCE MODE (2 triggers)
-- =====================================================

DROP TRIGGER IF EXISTS trg_maintenance_check_po ON purchase_orders;
DROP TRIGGER IF EXISTS trg_maintenance_check_sales ON sales;

-- =====================================================
-- CAT 10: SESSION DURATION (1 trigger)
-- =====================================================

DROP TRIGGER IF EXISTS trigger_update_session_duration ON user_sessions;

-- =====================================================
-- DROP ORPHANED FUNCTIONS (2 functions)
-- =====================================================

DROP FUNCTION IF EXISTS check_maintenance_mode() CASCADE;
DROP FUNCTION IF EXISTS update_session_duration() CASCADE;

COMMIT;
