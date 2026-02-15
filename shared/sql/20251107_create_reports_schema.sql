-- Reports System Schema
-- Date: 2025-11-07
-- Comprehensive reporting with bank-grade precision

-- Report Types Enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'report_type') THEN
    CREATE TYPE report_type AS ENUM (
      'INVENTORY_VALUATION',
      'INVENTORY_ADJUSTMENTS',
      'SALES_REPORT',
      'EXPIRING_ITEMS',
      'LOW_STOCK',
      'BEST_SELLING_PRODUCTS',
      'SUPPLIER_COST_ANALYSIS',
      'GOODS_RECEIVED',
      'PAYMENT_REPORT',
      'CUSTOMER_PAYMENTS',
      'DELETED_ITEMS',
      'DELETED_CUSTOMERS',
      'PRODUCT_SALES_DETAIL',
      'PROFIT_LOSS'
    );
  END IF;
END$$;

-- Report Runs tracking table (audit trail)
CREATE TABLE IF NOT EXISTS report_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_type report_type NOT NULL,
  report_name VARCHAR(255) NOT NULL,
  parameters JSONB,
  generated_by_id UUID REFERENCES users(id),
  start_date TIMESTAMP WITH TIME ZONE,
  end_date TIMESTAMP WITH TIME ZONE,
  record_count INTEGER DEFAULT 0,
  file_path TEXT,
  file_format VARCHAR(10), -- pdf, csv, json
  execution_time_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_report_runs_type ON report_runs(report_type);
CREATE INDEX IF NOT EXISTS idx_report_runs_created ON report_runs(created_at);
CREATE INDEX IF NOT EXISTS idx_report_runs_user ON report_runs(generated_by_id);

-- Inventory snapshots for valuation history
CREATE TABLE IF NOT EXISTS inventory_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id),
  batch_id UUID REFERENCES inventory_batches(id),
  snapshot_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  quantity_on_hand DECIMAL(15,3) NOT NULL DEFAULT 0,
  unit_cost DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_value DECIMAL(15,2) NOT NULL DEFAULT 0,
  valuation_method VARCHAR(20) DEFAULT 'FIFO', -- FIFO, AVCO, LIFO
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_inventory_snapshots_product ON inventory_snapshots(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_snapshots_date ON inventory_snapshots(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_inventory_snapshots_batch ON inventory_snapshots(batch_id);

-- Comments for documentation
COMMENT ON TABLE report_runs IS 'Audit trail of all generated reports with metadata';
COMMENT ON TABLE inventory_snapshots IS 'Point-in-time inventory valuation snapshots for historical reporting';
COMMENT ON COLUMN report_runs.parameters IS 'JSON object containing report filter parameters';
COMMENT ON COLUMN report_runs.execution_time_ms IS 'Report generation time in milliseconds for performance tracking';

