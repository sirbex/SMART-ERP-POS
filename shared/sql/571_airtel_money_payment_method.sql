-- ============================================================================
-- Migration: 571_airtel_money_payment_method.sql
-- Description: Add AIRTEL_MONEY as a separate payment method
-- ============================================================================

-- 1. Add to the payment_method enum (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'AIRTEL_MONEY'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'payment_method')
  ) THEN
    ALTER TYPE payment_method ADD VALUE 'AIRTEL_MONEY';
  END IF;
END $$;

-- 2. Insert into payment_methods table
INSERT INTO payment_methods (code, name, description, requires_reference)
VALUES ('AIRTEL_MONEY', 'Airtel Money', 'Airtel Money mobile payment', true)
ON CONFLICT (code) DO NOTHING;

-- 3. Widen the CHECK constraint on payment_lines (if it exists)
DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  SELECT conname INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'payment_lines'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%payment_method%';

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE payment_lines DROP CONSTRAINT %I', v_constraint_name);
    ALTER TABLE payment_lines ADD CONSTRAINT payment_lines_payment_method_check
      CHECK (payment_method IN ('CASH', 'CARD', 'MOBILE_MONEY', 'AIRTEL_MONEY', 'CREDIT', 'DEPOSIT', 'BANK_TRANSFER', 'CUSTOMER_CREDIT'));
  END IF;
END $$;

-- 4. Widen expense CHECK (if present)
DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  SELECT conname INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'expenses'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%payment_method%';

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE expenses DROP CONSTRAINT %I', v_constraint_name);
    ALTER TABLE expenses ADD CONSTRAINT expenses_payment_method_check
      CHECK (payment_method IN ('CASH', 'CARD', 'BANK_TRANSFER', 'MOBILE_MONEY', 'AIRTEL_MONEY', 'CHEQUE'));
  END IF;
END $$;
