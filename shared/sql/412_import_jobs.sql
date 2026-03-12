-- Migration 412: CSV Import Jobs
-- Tracks bulk import operations for products, customers, suppliers
-- Provides audit trail and error reporting for data imports

-- ============================================================
-- Import Jobs - tracks each import operation
-- ============================================================
CREATE TABLE IF NOT EXISTS import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_number VARCHAR(50) UNIQUE NOT NULL,            -- IMP-2026-0001
  entity_type VARCHAR(20) NOT NULL                    -- PRODUCT, CUSTOMER, SUPPLIER
    CHECK (entity_type IN ('PRODUCT', 'CUSTOMER', 'SUPPLIER')),
  file_name VARCHAR(500) NOT NULL,                    -- Original upload filename
  file_path VARCHAR(1000) NOT NULL,                   -- Disk path to stored CSV
  file_size_bytes INTEGER NOT NULL DEFAULT 0,
  duplicate_strategy VARCHAR(10) NOT NULL DEFAULT 'SKIP'
    CHECK (duplicate_strategy IN ('SKIP', 'UPDATE', 'FAIL')),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED')),
  rows_total INTEGER NOT NULL DEFAULT 0,
  rows_processed INTEGER NOT NULL DEFAULT 0,
  rows_imported INTEGER NOT NULL DEFAULT 0,
  rows_skipped INTEGER NOT NULL DEFAULT 0,
  rows_failed INTEGER NOT NULL DEFAULT 0,
  error_summary TEXT,                                  -- High-level error message if job failed
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_import_jobs_user_id ON import_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_import_jobs_status ON import_jobs(status);
CREATE INDEX IF NOT EXISTS idx_import_jobs_created_at ON import_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_jobs_entity_type ON import_jobs(entity_type);

-- Sequence for human-readable job numbers: IMP-2026-0001
CREATE SEQUENCE IF NOT EXISTS import_job_number_seq START WITH 1 INCREMENT BY 1;

-- ============================================================
-- Import Job Errors - per-row error tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS import_job_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_job_id UUID NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,                         -- CSV row number (1-based, excluding header)
  raw_data JSONB,                                      -- Original CSV row as key-value pairs
  error_message TEXT NOT NULL,
  error_type VARCHAR(20) NOT NULL DEFAULT 'VALIDATION'
    CHECK (error_type IN ('VALIDATION', 'DUPLICATE', 'DATABASE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_import_job_errors_job_id ON import_job_errors(import_job_id);
CREATE INDEX IF NOT EXISTS idx_import_job_errors_type ON import_job_errors(error_type);

-- ============================================================
-- Customer dedup index for ON CONFLICT during import
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_name_email_dedup
  ON customers (LOWER(name), LOWER(COALESCE(email, '')));

-- ============================================================
-- Supplier dedup index for ON CONFLICT during import
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_companyname_dedup
  ON suppliers (LOWER("CompanyName"));
