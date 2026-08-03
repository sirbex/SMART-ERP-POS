-- Migration 585: Unlimited customer credit (enterprise AR policy)
-- When unlimited_credit = true, DocumentTax/sales credit checks do not enforce credit_limit.
-- credit_limit may still be stored as a soft/reference figure for reporting.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS unlimited_credit BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN customers.unlimited_credit IS
  'Enterprise: when true, customer may have unlimited on-account / credit sales (credit_limit not enforced).';

CREATE INDEX IF NOT EXISTS idx_customers_unlimited_credit
  ON customers (unlimited_credit) WHERE unlimited_credit = true;

INSERT INTO schema_version (version) VALUES (585) ON CONFLICT DO NOTHING;
