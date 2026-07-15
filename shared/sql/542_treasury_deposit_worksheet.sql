-- Migration 542: Deposit Worksheet settlement (ADR-003 Phase 1B)
--
-- Tracks residual of receipts that hit Undeposited Funds (1015) so Deposit
-- Worksheets can partially settle without orphan clearing balances.
-- Related: docs/architecture/TREASURY_PHASE1_ROADMAP.md Phase 1B

-- Ensure cash over/short accounts exist (same as cash register)
INSERT INTO accounts ("Id", "AccountCode", "AccountName", "AccountType", "NormalBalance", "IsPostingAccount", "IsActive", "Level", "CurrentBalance", "CreatedAt", "UpdatedAt")
SELECT gen_random_uuid(), '6850', 'Cash Shortage', 'EXPENSE', 'DEBIT', true, true, 2, 0, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE "AccountCode" = '6850');

INSERT INTO accounts ("Id", "AccountCode", "AccountName", "AccountType", "NormalBalance", "IsPostingAccount", "IsActive", "Level", "CurrentBalance", "CreatedAt", "UpdatedAt")
SELECT gen_random_uuid(), '4900', 'Other Income', 'REVENUE', 'CREDIT', true, true, 2, 0, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE "AccountCode" = '4900');

-- ---------------------------------------------------------------------------
-- receipt_settlements — residual SSOT per originating receipt
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS receipt_settlements (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_type             VARCHAR(40) NOT NULL
        CHECK (source_type IN (
            'AR_CUSTOMER_PAYMENT',
            'INVOICE_PAYMENT',
            'CUSTOMER_DEPOSIT'
        )),
    source_id               UUID NOT NULL,
    source_number           VARCHAR(60),
    originating_amount      NUMERIC(18, 2) NOT NULL CHECK (originating_amount > 0),
    settled_amount          NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (settled_amount >= 0),
    residual_amount         NUMERIC(18, 2) NOT NULL,
    clearing_account_code   VARCHAR(20) NOT NULL DEFAULT '1015',
    settlement_status       VARCHAR(20) NOT NULL DEFAULT 'UNSETTLED'
        CHECK (settlement_status IN ('UNSETTLED', 'PARTIALLY_SETTLED', 'SETTLED')),
    customer_id             UUID,
    payment_date            DATE,
    payment_method          VARCHAR(40),
    ledger_transaction_id   UUID,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_receipt_settlement_source UNIQUE (source_type, source_id),
    CONSTRAINT chk_receipt_settlement_residual CHECK (
        residual_amount = originating_amount - settled_amount
        AND residual_amount >= -0.009
    )
);

CREATE INDEX IF NOT EXISTS idx_receipt_settlements_status
    ON receipt_settlements (settlement_status)
    WHERE residual_amount > 0.009;

CREATE INDEX IF NOT EXISTS idx_receipt_settlements_clearing
    ON receipt_settlements (clearing_account_code, settlement_status);

CREATE INDEX IF NOT EXISTS idx_receipt_settlements_payment_date
    ON receipt_settlements (payment_date DESC NULLS LAST);

COMMENT ON TABLE receipt_settlements IS
    'ADR-003 Phase 1B: residual of receipts awaiting Deposit Worksheet settlement';

-- ---------------------------------------------------------------------------
-- receipt_settlement_applications — per worksheet application (audit)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS receipt_settlement_applications (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_settlement_id   UUID NOT NULL REFERENCES receipt_settlements(id),
    treasury_document_id    UUID NOT NULL REFERENCES treasury_documents(id),
    treasury_document_line_id UUID REFERENCES treasury_document_lines(id),
    amount                  NUMERIC(18, 2) NOT NULL CHECK (amount > 0),
    posted_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reversed_at             TIMESTAMPTZ,
    CONSTRAINT uq_rsa_doc_settlement UNIQUE (treasury_document_id, receipt_settlement_id)
);

CREATE INDEX IF NOT EXISTS idx_rsa_settlement
    ON receipt_settlement_applications (receipt_settlement_id)
    WHERE reversed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_rsa_document
    ON receipt_settlement_applications (treasury_document_id);

-- ---------------------------------------------------------------------------
-- Backfill AR customer payments that posted to Undeposited Funds
-- Cash leg ≈ total_amount when no WHT split is tracked on the payment row.
-- ---------------------------------------------------------------------------
INSERT INTO receipt_settlements (
    source_type, source_id, source_number, originating_amount, settled_amount, residual_amount,
    clearing_account_code, settlement_status, customer_id, payment_date, payment_method,
    ledger_transaction_id
)
SELECT
    'AR_CUSTOMER_PAYMENT',
    p.id,
    p.payment_number,
    ROUND(p.total_amount::numeric, 2),
    0,
    ROUND(p.total_amount::numeric, 2),
    '1015',
    'UNSETTLED',
    p.customer_id,
    p.payment_date,
    p.payment_method,
    p.gl_transaction_id
FROM ar_customer_payments p
WHERE p.status IS DISTINCT FROM 'REVERSED'
  AND p.total_amount > 0
  AND NOT EXISTS (
      SELECT 1 FROM receipt_settlements rs
      WHERE rs.source_type = 'AR_CUSTOMER_PAYMENT' AND rs.source_id = p.id
  )
ON CONFLICT (source_type, source_id) DO NOTHING;

-- Customer deposits (cash into 1015)
INSERT INTO receipt_settlements (
    source_type, source_id, source_number, originating_amount, settled_amount, residual_amount,
    clearing_account_code, settlement_status, customer_id, payment_date, payment_method
)
SELECT
    'CUSTOMER_DEPOSIT',
    d.id,
    d.deposit_number,
    ROUND(d.amount::numeric, 2),
    0,
    ROUND(d.amount::numeric, 2),
    '1015',
    'UNSETTLED',
    d.customer_id,
    d.created_at::date,
    d.payment_method
FROM pos_customer_deposits d
WHERE d.amount > 0
  AND d.status NOT IN ('REFUNDED', 'CANCELLED')
  AND NOT EXISTS (
      SELECT 1 FROM receipt_settlements rs
      WHERE rs.source_type = 'CUSTOMER_DEPOSIT' AND rs.source_id = d.id
  )
ON CONFLICT (source_type, source_id) DO NOTHING;

-- Refine AR cash leg from ledger when WHT split the 1015 debit
UPDATE receipt_settlements rs
SET originating_amount = sub.cash_debit,
    residual_amount = sub.cash_debit - rs.settled_amount,
    ledger_transaction_id = COALESCE(rs.ledger_transaction_id, sub.txn_id),
    updated_at = NOW()
FROM (
    SELECT
        lt."ReferenceId"::uuid AS payment_id,
        lt."Id" AS txn_id,
        ROUND(SUM(le."DebitAmount")::numeric, 2) AS cash_debit
    FROM ledger_transactions lt
    JOIN ledger_entries le ON le."TransactionId" = lt."Id"
    JOIN accounts a ON a."Id" = le."AccountId"
    WHERE lt."ReferenceType" = 'CUSTOMER_PAYMENT'
      AND a."AccountCode" = '1015'
      AND le."DebitAmount" > 0
    GROUP BY lt."ReferenceId", lt."Id"
) sub
WHERE rs.source_type = 'AR_CUSTOMER_PAYMENT'
  AND rs.source_id = sub.payment_id
  AND sub.cash_debit > 0
  AND ABS(rs.originating_amount - sub.cash_debit) > 0.009;

UPDATE receipt_settlements
SET settlement_status = CASE
    WHEN residual_amount <= 0.009 THEN 'SETTLED'
    WHEN settled_amount > 0.009 THEN 'PARTIALLY_SETTLED'
    ELSE 'UNSETTLED'
END
WHERE settlement_status IS DISTINCT FROM CASE
    WHEN residual_amount <= 0.009 THEN 'SETTLED'
    WHEN settled_amount > 0.009 THEN 'PARTIALLY_SETTLED'
    ELSE 'UNSETTLED'
END;

INSERT INTO schema_version (version) VALUES (542) ON CONFLICT DO NOTHING;
