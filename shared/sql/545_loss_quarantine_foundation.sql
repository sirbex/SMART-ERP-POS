-- Migration 545: Loss & Quarantine Foundation (ADR-004 Phase 2A)
--
-- Classifiers on stock_movements separate quarantine (no GL) from disposal (GL).
-- Flag-off default: loss_quarantine_document_enabled = FALSE → disposal documents
-- not required yet; metadata columns are additive and safe.
-- Related: docs/architecture/LOSS_QUARANTINE_ADR.md

-- ---------------------------------------------------------------------------
-- Feature flag
-- ---------------------------------------------------------------------------
ALTER TABLE system_settings
  ADD COLUMN IF NOT EXISTS loss_quarantine_document_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN system_settings.loss_quarantine_document_enabled IS
  'ADR-004 Phase 2A: when true, disposal document gateway is required for valued write-offs';

-- ---------------------------------------------------------------------------
-- stock_movements classifiers (LQ-INV-3)
-- ---------------------------------------------------------------------------
ALTER TABLE stock_movements
  ADD COLUMN IF NOT EXISTS economic_event VARCHAR(40);

ALTER TABLE stock_movements
  ADD COLUMN IF NOT EXISTS posts_gl BOOLEAN;

COMMENT ON COLUMN stock_movements.economic_event IS
  'ADR-004: QUARANTINE_TRANSFER | LOSS_DISPOSAL | LOSS_REVERSAL | OTHER';
COMMENT ON COLUMN stock_movements.posts_gl IS
  'ADR-004: false for quarantine-only audits (must not be GL-repaired)';

-- Backfill quarantine heuristics (idempotent)
UPDATE stock_movements
SET economic_event = 'QUARANTINE_TRANSFER',
    posts_gl = false
WHERE economic_event IS NULL
  AND (
    UPPER(COALESCE(reference_type, '')) = 'EXPIRY_AUTOMATION'
    OR LOWER(COALESCE(notes, '')) LIKE '%internal quarantine transfer%'
  );

-- Backfill known GL-bearing loss types still unmarked
UPDATE stock_movements
SET economic_event = 'LOSS_DISPOSAL',
    posts_gl = true
WHERE economic_event IS NULL
  AND movement_type::text IN ('DAMAGE', 'EXPIRY', 'ADJUSTMENT_OUT');

CREATE INDEX IF NOT EXISTS idx_stock_movements_economic_event
  ON stock_movements (economic_event)
  WHERE economic_event IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stock_movements_posts_gl_false
  ON stock_movements (movement_type)
  WHERE posts_gl IS FALSE;

INSERT INTO schema_version (version) VALUES (545) ON CONFLICT DO NOTHING;
