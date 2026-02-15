-- Migration: Create report_runs table for audit trail
-- Date: 2025-01-24
-- Purpose: Track report generation for auditing and analytics

-- Create ENUM type for report types
CREATE TYPE report_type_enum AS ENUM (
  'INVENTORY_VALUATION',
  'SALES_REPORT',
  'EXPIRING_ITEMS',
  'LOW_STOCK',
  'BEST_SELLING_PRODUCTS',
  'SUPPLIER_COST_ANALYSIS',
  'GOODS_RECEIVED',
  'PAYMENT_REPORT',
  'CUSTOMER_PAYMENTS',
  'PROFIT_LOSS',
  'DELETED_ITEMS',
  'INVENTORY_ADJUSTMENTS',
  'PURCHASE_ORDER_SUMMARY',
  'STOCK_MOVEMENT_ANALYSIS',
  'CUSTOMER_ACCOUNT_STATEMENT',
  'PROFIT_MARGIN_BY_PRODUCT',
  'DAILY_CASH_FLOW',
  'SUPPLIER_PAYMENT_STATUS',
  'TOP_CUSTOMERS',
  'STOCK_AGING',
  'WASTE_DAMAGE_REPORT',
  'REORDER_RECOMMENDATIONS',
  'SALES_BY_CATEGORY',
  'SALES_BY_PAYMENT_METHOD',
  'HOURLY_SALES_ANALYSIS',
  'SALES_COMPARISON',
  'CUSTOMER_PURCHASE_HISTORY',
  'SALES_SUMMARY_BY_DATE',
  'SALES_DETAILS_REPORT',
  'SALES_BY_CASHIER'
);

-- Create report_runs table
CREATE TABLE IF NOT EXISTS report_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type report_type_enum NOT NULL,
  report_name VARCHAR(255) NOT NULL,
  parameters JSONB NOT NULL DEFAULT '{}',
  generated_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  start_date DATE NULL,
  end_date DATE NULL,
  record_count INTEGER NOT NULL DEFAULT 0,
  file_path VARCHAR(500) NULL,
  file_format VARCHAR(20) NULL,
  execution_time_ms INTEGER NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_report_runs_report_type ON report_runs(report_type);
CREATE INDEX idx_report_runs_generated_by ON report_runs(generated_by_id);
CREATE INDEX idx_report_runs_created_at ON report_runs(created_at DESC);
CREATE INDEX idx_report_runs_date_range ON report_runs(start_date, end_date);

-- Add comments
COMMENT ON TABLE report_runs IS 'Audit trail for report generation activities';
COMMENT ON COLUMN report_runs.report_type IS 'Type of report generated';
COMMENT ON COLUMN report_runs.report_name IS 'Human-readable report name';
COMMENT ON COLUMN report_runs.parameters IS 'JSON object containing report filter parameters';
COMMENT ON COLUMN report_runs.generated_by_id IS 'User who generated the report';
COMMENT ON COLUMN report_runs.start_date IS 'Report date range start (if applicable)';
COMMENT ON COLUMN report_runs.end_date IS 'Report date range end (if applicable)';
COMMENT ON COLUMN report_runs.record_count IS 'Number of records in report result';
COMMENT ON COLUMN report_runs.file_path IS 'Path to exported file (for PDF/CSV exports)';
COMMENT ON COLUMN report_runs.file_format IS 'Export format: json, pdf, csv';
COMMENT ON COLUMN report_runs.execution_time_ms IS 'Report generation time in milliseconds';
COMMENT ON COLUMN report_runs.created_at IS 'Timestamp when report was generated';
