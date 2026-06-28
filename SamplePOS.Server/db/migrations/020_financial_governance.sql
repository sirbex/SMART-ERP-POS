-- =============================================================================
-- Migration 020: Financial Governance (Phase G1)
-- Builds on the Financial Integrity Framework — configurable materiality,
-- reconciliation history, period-close sign-off, and drift alerts.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS financial_materiality_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain VARCHAR(20) NOT NULL UNIQUE,
  mode VARCHAR(30) NOT NULL DEFAULT 'default'
    CHECK (mode IN ('default', 'exact', 'percent_floor', 'percent_floor_cap')),
  exact_tolerance NUMERIC(15, 2),
  percent_rate NUMERIC(12, 8),
  floor_amount NUMERIC(15, 2),
  cap_amount NUMERIC(15, 2),
  notes TEXT,
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS financial_reconciliation_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  as_of_date DATE NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  capture_source VARCHAR(50) NOT NULL DEFAULT 'manual'
    CHECK (capture_source IN ('manual', 'scheduled', 'signoff', 'deploy', 'stabilization')),
  period_year INT,
  period_month INT,
  framework_commit VARCHAR(64),
  period_close_blocked BOOLEAN NOT NULL DEFAULT false,
  blocked_domains TEXT[] NOT NULL DEFAULT '{}',
  summary_json JSONB NOT NULL,
  parity_json JSONB,
  created_by UUID
);

CREATE INDEX IF NOT EXISTS idx_fin_recon_snapshots_as_of
  ON financial_reconciliation_snapshots (as_of_date DESC, captured_at DESC);

CREATE TABLE IF NOT EXISTS financial_period_close_signoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_year INT NOT NULL,
  period_month INT NOT NULL,
  snapshot_id UUID REFERENCES financial_reconciliation_snapshots(id),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  requested_by UUID NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  attestation TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fin_period_signoff_approved
  ON financial_period_close_signoffs (period_year, period_month)
  WHERE status = 'APPROVED';

CREATE TABLE IF NOT EXISTS financial_integrity_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain VARCHAR(20) NOT NULL,
  lane VARCHAR(20) NOT NULL DEFAULT 'integrity',
  alert_type VARCHAR(50) NOT NULL
    CHECK (alert_type IN ('new_drift', 'drift_worsened', 'drift_resolved', 'parity_mismatch')),
  previous_difference NUMERIC(15, 2),
  current_difference NUMERIC(15, 2),
  materiality_threshold NUMERIC(15, 2),
  severity VARCHAR(20) NOT NULL DEFAULT 'warning'
    CHECK (severity IN ('info', 'warning', 'critical')),
  message TEXT NOT NULL,
  snapshot_id UUID REFERENCES financial_reconciliation_snapshots(id),
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  acknowledged_by UUID,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fin_integrity_alerts_open
  ON financial_integrity_alerts (acknowledged, created_at DESC);

-- Seed default rows (mode=default uses framework hard-coded rules until overridden)
INSERT INTO financial_materiality_config (domain, mode, notes)
VALUES
  ('ap', 'default', 'Exact match within 0.01 UGX unless overridden'),
  ('ar', 'default', 'max(500, 0.01% × |GL|) capped at 5000 unless overridden'),
  ('inventory', 'default', 'max(5000, 0.01% × |GL|) unless overridden')
ON CONFLICT (domain) DO NOTHING;

COMMIT;
