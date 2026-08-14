-- =============================================================================
-- Migration 607: Payroll pay granularity (ALL / SELECTED / PARTIAL)
-- SSOT: shared/hr/payrollPaySsot.ts
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payroll_entries' AND column_name = 'AmountPaid'
  ) THEN
    ALTER TABLE payroll_entries
      ADD COLUMN "AmountPaid" NUMERIC(15,2) NOT NULL DEFAULT 0;
  END IF;
END$$;

-- Backfill: entries already stamped with PaymentJournalEntryId = fully paid
UPDATE payroll_entries
SET "AmountPaid" = "NetPay"
WHERE "PaymentJournalEntryId" IS NOT NULL
  AND COALESCE("AmountPaid", 0) = 0
  AND COALESCE("NetPay", 0) > 0;

ALTER TABLE payroll_entries DROP CONSTRAINT IF EXISTS payroll_entries_amount_paid_chk;
ALTER TABLE payroll_entries
  ADD CONSTRAINT payroll_entries_amount_paid_chk
  CHECK ("AmountPaid" >= 0 AND ("NetPay" <= 0 OR "AmountPaid" <= "NetPay"));

-- Period status: PARTIALLY_PAID between POSTED and PAID
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payroll_periods_status_check'
  ) THEN
    ALTER TABLE payroll_periods DROP CONSTRAINT payroll_periods_status_check;
  END IF;
END$$;

-- 598 used inline CHECK without a stable name on some DBs — drop any status check
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'payroll_periods'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%Status%'
  LOOP
    EXECUTE format('ALTER TABLE payroll_periods DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END$$;

ALTER TABLE payroll_periods
  ADD CONSTRAINT payroll_periods_status_check
  CHECK ("Status" IN ('OPEN', 'PROCESSED', 'POSTED', 'PARTIALLY_PAID', 'PAID'));

COMMENT ON COLUMN payroll_entries."AmountPaid" IS
  'Cumulative cash paid against NetPay — residual = NetPay - AmountPaid';
COMMENT ON CONSTRAINT payroll_periods_status_check ON payroll_periods IS
  'OPEN→PROCESSED→POSTED→PARTIALLY_PAID→PAID — selective/partial pay supported';
