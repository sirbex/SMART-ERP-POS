-- Migration 541: Treasury Document Foundation (ADR-003 Phase 1A)
--
-- Canonical SSOT header for liquidity movements. Journals reference the document;
-- AccountingCore writes ledger_transactions (not legacy journal_entries).
--
-- Flag-off default: treasury_document_enabled = FALSE → no behavior change.
-- Related: docs/architecture/TREASURY_DOCUMENT_ADR.md

-- ---------------------------------------------------------------------------
-- Feature flag
-- ---------------------------------------------------------------------------
ALTER TABLE system_settings
  ADD COLUMN IF NOT EXISTS treasury_document_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN system_settings.treasury_document_enabled IS
  'ADR-003 Phase 1A: when true, /api/treasury mutating routes are enabled';

-- ---------------------------------------------------------------------------
-- Document number sequence
-- ---------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS treasury_document_seq START 1;

-- ---------------------------------------------------------------------------
-- treasury_documents
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS treasury_documents (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_number       VARCHAR(40) NOT NULL,
    document_type         VARCHAR(40) NOT NULL
        CHECK (document_type IN (
            'DEPOSIT_WORKSHEET',
            'TREASURY_TRANSFER',
            'PETTY_CASH',
            'CASH_WITHDRAWAL',
            'CASH_DEPOSIT',
            'CARD_SETTLEMENT',
            'MOBILE_MONEY_SETTLEMENT',
            'VAT_REMITTANCE',
            'WHT_REMITTANCE',
            'TREASURY_REVERSAL'
        )),
    status                VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
        CHECK (status IN ('DRAFT', 'PENDING_APPROVAL', 'POSTED', 'CANCELLED')),
    currency_code         VARCHAR(3) NOT NULL DEFAULT 'UGX',
    transaction_date      DATE NOT NULL,
    posting_date          DATE,
    memo                  TEXT,
    total_amount          NUMERIC(18, 2) NOT NULL DEFAULT 0,
    overage_amount        NUMERIC(18, 2) NOT NULL DEFAULT 0,
    shortage_amount       NUMERIC(18, 2) NOT NULL DEFAULT 0,
    from_account_code     VARCHAR(20),
    to_account_code       VARCHAR(20),
    bank_account_id       UUID,
    deposit_reference     VARCHAR(100),
    requires_approval     BOOLEAN NOT NULL DEFAULT FALSE,
    created_by            UUID NOT NULL REFERENCES users(id),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    submitted_at          TIMESTAMPTZ,
    approved_by           UUID REFERENCES users(id),
    approved_at           TIMESTAMPTZ,
    posted_at             TIMESTAMPTZ,
    journal_entry_id      UUID,
    reverses_document_id  UUID REFERENCES treasury_documents(id),
    reversed_by_document_id UUID REFERENCES treasury_documents(id),
    row_version           INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT uq_treasury_documents_number UNIQUE (document_number)
);

CREATE INDEX IF NOT EXISTS idx_treasury_documents_status
    ON treasury_documents (status);
CREATE INDEX IF NOT EXISTS idx_treasury_documents_type
    ON treasury_documents (document_type);
CREATE INDEX IF NOT EXISTS idx_treasury_documents_txn_date
    ON treasury_documents (transaction_date);
CREATE INDEX IF NOT EXISTS idx_treasury_documents_journal
    ON treasury_documents (journal_entry_id)
    WHERE journal_entry_id IS NOT NULL;

COMMENT ON TABLE treasury_documents IS
    'ADR-003 Treasury Document — canonical SSOT for liquidity movements';

-- ---------------------------------------------------------------------------
-- treasury_document_lines
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS treasury_document_lines (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    treasury_document_id    UUID NOT NULL REFERENCES treasury_documents(id) ON DELETE CASCADE,
    line_number             INTEGER NOT NULL,
    line_type               VARCHAR(40) NOT NULL DEFAULT 'ACCOUNT_MOVE'
        CHECK (line_type IN (
            'RECEIPT_APPLICATION',
            'ACCOUNT_MOVE',
            'ADJUSTMENT',
            'FEE',
            'SHORTAGE',
            'OVERAGE'
        )),
    account_code            VARCHAR(20) NOT NULL,
    description             TEXT,
    debit_amount            NUMERIC(18, 2) NOT NULL DEFAULT 0,
    credit_amount           NUMERIC(18, 2) NOT NULL DEFAULT 0,
    amount                  NUMERIC(18, 2) NOT NULL DEFAULT 0,
    source_receipt_id       UUID,
    source_payment_id       UUID,
    source_session_movement_id UUID,
    memo                    TEXT,
    CONSTRAINT chk_td_line_one_sided CHECK (
        (debit_amount > 0 AND credit_amount = 0) OR
        (credit_amount > 0 AND debit_amount = 0) OR
        (debit_amount = 0 AND credit_amount = 0 AND amount = 0)
    ),
    CONSTRAINT uq_td_line_number UNIQUE (treasury_document_id, line_number)
);

CREATE INDEX IF NOT EXISTS idx_td_lines_document
    ON treasury_document_lines (treasury_document_id);

-- ---------------------------------------------------------------------------
-- treasury_document_audit (append-only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS treasury_document_audit (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    treasury_document_id    UUID NOT NULL REFERENCES treasury_documents(id) ON DELETE CASCADE,
    event_type              VARCHAR(40) NOT NULL,
    actor_user_id           UUID REFERENCES users(id),
    event_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    detail                  JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_td_audit_document
    ON treasury_document_audit (treasury_document_id, event_at);

-- ---------------------------------------------------------------------------
-- Link ledger_transactions → treasury document (nullable; populated on post)
-- ---------------------------------------------------------------------------
ALTER TABLE ledger_transactions
  ADD COLUMN IF NOT EXISTS "TreasuryDocumentId" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_ledger_txn_treasury_document'
  ) THEN
    ALTER TABLE ledger_transactions
      ADD CONSTRAINT fk_ledger_txn_treasury_document
      FOREIGN KEY ("TreasuryDocumentId") REFERENCES treasury_documents(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ledger_txn_treasury_document
    ON ledger_transactions ("TreasuryDocumentId")
    WHERE "TreasuryDocumentId" IS NOT NULL;

-- Optional legacy table column for ADR wording parity (not written by AccountingCore)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'journal_entries'
  ) THEN
    ALTER TABLE journal_entries
      ADD COLUMN IF NOT EXISTS treasury_document_id UUID;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Posting governance: allow TREASURY_* sources on liquidity accounts
-- ---------------------------------------------------------------------------
UPDATE accounts
SET "AllowedSources" = (
  SELECT ARRAY(
    SELECT DISTINCT unnest(
      COALESCE("AllowedSources", ARRAY[]::text[])
      || ARRAY[
        'TREASURY_DEPOSIT',
        'TREASURY_TRANSFER',
        'TREASURY_PETTY_CASH',
        'TREASURY_REVERSAL'
      ]::text[]
    )
  )
)
WHERE "SystemAccountTag" = 'CASH'
   OR "AccountCode" IN ('1010', '1012', '1015', '1020', '1030', '1040');

-- Undeposited Funds / deposit clearing may be credited by treasury deposits
UPDATE accounts
SET "AllowedSources" = (
  SELECT ARRAY(
    SELECT DISTINCT unnest(
      COALESCE("AllowedSources", ARRAY[]::text[])
      || ARRAY['TREASURY_DEPOSIT', 'TREASURY_REVERSAL']::text[]
    )
  )
)
WHERE "SystemAccountTag" = 'UNDEPOSITED_FUNDS'
   OR "AccountCode" = '1015';

INSERT INTO schema_version (version) VALUES (541) ON CONFLICT DO NOTHING;
