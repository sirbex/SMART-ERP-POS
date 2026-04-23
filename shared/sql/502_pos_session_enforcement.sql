-- Migration 502: POS Session Enforcement
-- Links sales to cash register sessions and adds session policy setting
-- Safe: additive only — no column renames, no drops, backward compatible

-- 1) Add cash_register_session_id to sales table
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS cash_register_session_id UUID
    REFERENCES cash_register_sessions(id);

CREATE INDEX IF NOT EXISTS idx_sales_session_id
  ON sales(cash_register_session_id);

-- 2) Add pos_session_policy to system_settings
-- DISABLED = no enforcement (backward compatible default)
-- PER_CASHIER_SESSION = each cashier must open their own session on a register
-- PER_COUNTER_SHARED_SESSION = one session per register, shared by cashiers
-- GLOBAL_STORE_SESSION = any open session in the store works
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'system_settings'
      AND column_name = 'pos_session_policy'
  ) THEN
    ALTER TABLE system_settings
      ADD COLUMN pos_session_policy VARCHAR(50) NOT NULL DEFAULT 'DISABLED';
  END IF;
END $$;

-- 3) Add session_enforced flag for session-aware refunds (only if table exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'refunds'
  ) THEN
    EXECUTE 'ALTER TABLE refunds ADD COLUMN IF NOT EXISTS cash_register_session_id UUID REFERENCES cash_register_sessions(id)';
  END IF;
END $$;
