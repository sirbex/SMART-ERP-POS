-- Migration 520: GL report performance indexes (party-scoped ledger queries)

CREATE INDEX IF NOT EXISTS idx_ledger_entries_ar_ap_party_date
  ON ledger_entries ("EntityType", "EntityId", "AccountId", "EntryDate")
  WHERE "EntityId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ledger_entries_entry_date
  ON ledger_entries ("EntryDate");

CREATE INDEX IF NOT EXISTS idx_ledger_transactions_date_status
  ON ledger_transactions ("TransactionDate", "Status")
  WHERE "IsReversed" = false;

INSERT INTO schema_version (version) VALUES (520);
