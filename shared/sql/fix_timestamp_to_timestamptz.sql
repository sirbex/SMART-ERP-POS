-- Migration: Fix TIMESTAMP WITHOUT TIME ZONE → TIMESTAMPTZ (SAP-style UTC everywhere)
-- All timestamp columns must be TIMESTAMPTZ so timezone provenance is never lost.
-- Existing data is assumed UTC (since pool.ts sets session timezone = UTC).

-- Quotations system tables (from 003_create_quotations_system.sql)
ALTER TABLE quotations 
  ALTER COLUMN converted_at TYPE TIMESTAMPTZ USING converted_at AT TIME ZONE 'UTC',
  ALTER COLUMN approved_at TYPE TIMESTAMPTZ USING approved_at AT TIME ZONE 'UTC',
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC';

ALTER TABLE quotation_items
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';

-- Customer balance adjustments (from 20251107_create_customer_balance_adjustments.sql)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customer_balance_adjustments') THEN
    ALTER TABLE customer_balance_adjustments
      ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
      ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC';
  END IF;
END $$;
