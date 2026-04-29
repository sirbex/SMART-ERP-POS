-- ============================================================
-- Migration 508: Bump schema version to 73
-- ============================================================
-- Marks all tenants as fully caught up after applying:
--   201_pnl_reconciliation.sql
--   202_fix_pnl_reconciliation_functions.sql
-- These were present on disk but not applied to existing tenants because
-- schema_version was already at 72 when 201 was added, and 201 had
-- column reference bugs (invoices."OutstandingBalance") that caused
-- the functions to fail at runtime on all tenants.
-- ============================================================

INSERT INTO schema_version (version) VALUES (73) ON CONFLICT DO NOTHING;
