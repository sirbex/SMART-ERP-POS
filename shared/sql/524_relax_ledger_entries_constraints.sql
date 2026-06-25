-- Migration 524: Relax legacy NOT NULL constraints on ledger_entries
--
-- Some provisioned tenants recorded 2025-12-29_add_integrity_constraints.sql
-- without the app populating LedgerTransactionId (app uses TransactionId).
-- accountingCore now sets both; this keeps older strict schemas compatible.

BEGIN;

UPDATE ledger_entries
SET "LedgerTransactionId" = "TransactionId"
WHERE "LedgerTransactionId" IS NULL;

ALTER TABLE ledger_entries
  ALTER COLUMN "LedgerTransactionId" DROP NOT NULL;

ALTER TABLE ledger_entries
  ALTER COLUMN "DebitAmount" DROP NOT NULL;

ALTER TABLE ledger_entries
  ALTER COLUMN "CreditAmount" DROP NOT NULL;

COMMIT;
