-- Migration 055: Cash Register Enterprise Upgrades
-- Purpose: 4 enterprise-level enhancements for SAP/QuickBooks-grade POS
--
-- 1. cash_register_reconciliations — Variance audit history (separate from session)
-- 2. cash_movements.metadata       — Flexible JSONB for expense_type, approved_by, etc.
-- 3. z_reports                      — Persistent Z-Report storage for reprinting/audit
-- 4. Offline safety                 — client_uuid + sync_status for deduplication
--
-- Also fixes: calculateExpectedClosing missing specific movement types

-- ============================================================
-- 1. CASH REGISTER RECONCILIATIONS TABLE
--    Separate audit trail — keeps EVERY reconciliation attempt
--    even if session is re-reconciled or variance is challenged
-- ============================================================

CREATE TABLE IF NOT EXISTS cash_register_reconciliations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        UUID NOT NULL REFERENCES cash_register_sessions(id),
  reconciled_by     UUID NOT NULL REFERENCES users(id),
  expected_amount   NUMERIC(15,2) NOT NULL,
  counted_amount    NUMERIC(15,2) NOT NULL,
  variance          NUMERIC(15,2) NOT NULL,
  variance_percent  NUMERIC(7,4) GENERATED ALWAYS AS (
    CASE WHEN expected_amount = 0 THEN 0
         ELSE (variance / expected_amount) * 100
    END
  ) STORED,
  approved          BOOLEAN NOT NULL DEFAULT false,
  approved_by       UUID REFERENCES users(id),
  approved_at       TIMESTAMPTZ,
  reason            TEXT,
  notes             TEXT,
  denomination_breakdown JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reconciliations_session_id
  ON cash_register_reconciliations(session_id);

CREATE INDEX IF NOT EXISTS idx_reconciliations_reconciled_by
  ON cash_register_reconciliations(reconciled_by);

CREATE INDEX IF NOT EXISTS idx_reconciliations_created_at
  ON cash_register_reconciliations(created_at);

COMMENT ON TABLE cash_register_reconciliations IS
  'Enterprise variance audit trail — every reconciliation attempt is recorded, even if re-reconciled.';

-- ============================================================
-- 2. CASH MOVEMENT METADATA (JSONB)
--    Flexible auditing: expense_type, receipt_number, etc.
-- ============================================================

ALTER TABLE cash_movements
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;

COMMENT ON COLUMN cash_movements.metadata IS
  'Flexible metadata: { expense_type, receipt_number, supplier, category, etc. }';

-- ============================================================
-- 3. Z-REPORTS TABLE (Persistent Storage)
--    Every Z-Report is stored permanently for reprint/audit
-- ============================================================

CREATE TABLE IF NOT EXISTS z_reports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        UUID NOT NULL REFERENCES cash_register_sessions(id),
  report_number     VARCHAR(50) NOT NULL UNIQUE,
  register_name     VARCHAR(100) NOT NULL,
  cashier_name      VARCHAR(255) NOT NULL,
  cashier_id        UUID NOT NULL REFERENCES users(id),
  opened_at         TIMESTAMPTZ NOT NULL,
  closed_at         TIMESTAMPTZ NOT NULL,
  opening_float     NUMERIC(15,2) NOT NULL,
  expected_closing  NUMERIC(15,2) NOT NULL,
  actual_closing    NUMERIC(15,2) NOT NULL,
  variance          NUMERIC(15,2) NOT NULL,
  variance_reason   TEXT,
  total_sales       NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_refunds     NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_cash_in     NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_cash_out    NUMERIC(15,2) NOT NULL DEFAULT 0,
  net_cash_flow     NUMERIC(15,2) NOT NULL DEFAULT 0,
  transaction_count INTEGER NOT NULL DEFAULT 0,
  payment_summary   JSONB,
  denomination_breakdown JSONB,
  movement_breakdown JSONB,
  generated_by      UUID NOT NULL REFERENCES users(id),
  generated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_z_reports_session_id
  ON z_reports(session_id);

CREATE INDEX IF NOT EXISTS idx_z_reports_generated_at
  ON z_reports(generated_at);

COMMENT ON TABLE z_reports IS
  'Persistent Z-Report storage — enterprise audit trail for end-of-day reports. Supports reprint.';

-- ============================================================
-- 4. OFFLINE SAFETY
--    client_uuid for deduplication, sync_status for tracking
-- ============================================================

-- Add to cash_movements
ALTER TABLE cash_movements
  ADD COLUMN IF NOT EXISTS client_uuid UUID DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS sync_status VARCHAR(20) NOT NULL DEFAULT 'SYNCED';

-- Unique constraint prevents duplicate movements from offline sync
CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_movements_client_uuid
  ON cash_movements(client_uuid) WHERE client_uuid IS NOT NULL;

COMMENT ON COLUMN cash_movements.client_uuid IS
  'Client-generated UUID for offline deduplication. NULL for server-originated movements.';
COMMENT ON COLUMN cash_movements.sync_status IS
  'SYNCED (server-created), PENDING (awaiting sync), CONFLICT (needs resolution)';

-- Add to cash_register_sessions
ALTER TABLE cash_register_sessions
  ADD COLUMN IF NOT EXISTS client_uuid UUID DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS sync_status VARCHAR(20) NOT NULL DEFAULT 'SYNCED';

CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_client_uuid
  ON cash_register_sessions(client_uuid) WHERE client_uuid IS NOT NULL;

COMMENT ON COLUMN cash_register_sessions.client_uuid IS
  'Client-generated UUID for offline deduplication.';

-- ============================================================
-- 5. HELPER: Generate Z-Report number (ZRPT-YYYY-NNNN)
-- ============================================================

CREATE OR REPLACE FUNCTION fn_next_z_report_number()
RETURNS VARCHAR(50) AS $$
DECLARE
  current_year TEXT := EXTRACT(YEAR FROM CURRENT_DATE)::TEXT;
  last_num INTEGER;
BEGIN
  SELECT COALESCE(
    MAX(CAST(SPLIT_PART(report_number, '-', 3) AS INTEGER)), 0
  ) INTO last_num
  FROM z_reports
  WHERE report_number LIKE 'ZRPT-' || current_year || '-%';

  RETURN 'ZRPT-' || current_year || '-' || LPAD((last_num + 1)::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;
