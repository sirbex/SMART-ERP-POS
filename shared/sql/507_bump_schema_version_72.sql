-- ============================================================
-- Migration 507: Bump schema version to 72
-- ============================================================
-- Marks all tenants as fully caught up after applying:
--   307_state_table_performance.sql
--   400_down_payment_clearings.sql
--   406_fix_summary_reconciliation_thresholds.sql
--   413_sale_refunds.sql
--   414_add_sales_refund_permission.sql
--   414_sale_return_statuses.sql
--   415_sap_uom_snapshot_columns.sql
--   416_customer_cn_returns_goods.sql
--   501_sap_delivery_picking_flow.sql
-- These were present on disk but not tracked because schema_version
-- was already at 71 when they were added.
-- ============================================================

INSERT INTO schema_version (version) VALUES (72) ON CONFLICT DO NOTHING;
