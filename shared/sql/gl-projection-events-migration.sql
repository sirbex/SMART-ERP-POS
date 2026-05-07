-- =============================================================================
-- GL PROJECTION EVENTS TABLE — ACCOUNTING KERNEL OUTBOX
-- =============================================================================
--
-- Implements the "transactional outbox" pattern for gl_period_balances updates.
--
-- DESIGN:
--   Every ledger entry written by AccountingCore.createJournalEntry() inserts
--   a row here INSIDE the same DB transaction.  If that transaction commits,
--   the event is committed too — zero data loss even on process crash.
--
--   A background Bull worker picks up PENDING events and calls
--   rebuildSingleAccountPeriod() (absolute recompute from ledger_entries)
--   to keep gl_period_balances in sync.
--
-- GUARANTEE:
--   gl_period_balances is NEVER updated in the synchronous request path.
--   Reports that read gl_period_balances will always see consistent data
--   (eventual consistency via the worker).
--
-- RECOVERY:
--   If the worker falls behind, the manual full rebuild is always available:
--     POST /api/system/gl/rebuild-period-balances
--
-- RUN ON EACH TENANT DB:
--   pos_system
--   pos_tenant_henber_pharmacy
--   (all future tenant databases)
-- =============================================================================

CREATE TABLE IF NOT EXISTS gl_projection_events (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Which (account, period) needs a gl_period_balances rebuild
    account_id        UUID        NOT NULL,
    fiscal_year       INT         NOT NULL,
    fiscal_period     INT         NOT NULL CHECK (fiscal_period BETWEEN 1 AND 12),

    -- Traceability — which ledger transaction triggered this event
    transaction_id    UUID        NOT NULL,
    idempotency_key   VARCHAR(255) NOT NULL,

    -- Worker state machine: PENDING → PROCESSING → DONE | FAILED
    status            VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                          CHECK (status IN ('PENDING', 'PROCESSING', 'DONE', 'FAILED')),

    retry_count       INT         NOT NULL DEFAULT 0,
    error_message     TEXT,

    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at      TIMESTAMPTZ
);

-- Worker polling index: only look at rows that need work
CREATE INDEX IF NOT EXISTS idx_gl_proj_events_status
    ON gl_projection_events (status, created_at)
    WHERE status IN ('PENDING', 'FAILED');

-- Deduplication: one event per (account, period, transaction)
-- Prevents the same transaction from creating duplicate rebuild requests
CREATE UNIQUE INDEX IF NOT EXISTS idx_gl_proj_events_dedup
    ON gl_projection_events (account_id, fiscal_year, fiscal_period, transaction_id);

-- Lookup by transaction for audit / debugging
CREATE INDEX IF NOT EXISTS idx_gl_proj_events_txn
    ON gl_projection_events (transaction_id);

COMMENT ON TABLE gl_projection_events IS
    'Transactional outbox for gl_period_balances async rebuilds. '
    'Rows written atomically with ledger_entries; processed by PeriodBalanceWorker.';
