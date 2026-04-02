-- Migration 063: Drop number-generator triggers (CAT 2) and balance/sync triggers (CAT 3)
-- 
-- CAT 2: 8 number-generator triggers → app layer now generates numbers before INSERT
-- CAT 3: 6 balance/sync triggers → service layer now handles all balance updates
--
-- Total: 14 triggers + 20 functions (14 trigger fns + 6 helper fns)
--
-- Prerequisites:
--   - deliveryNoteRepository.ts generates DN-YYYY-#### via delivery_notes_seq
--   - depositsRepository.ts generates DEP-YYYY-#### via deposit_number_seq
--   - holdRepository.ts generates HOLD-YYYY-#### via hold_number_seq
--   - deliveryRepository.ts generates TRK-YYYY-DDD-SSSSS (time-based)
--   - quotationRepository.ts already generates Q-YYYY-#### via quotations_seq
--   - invoiceService.ts, salesService.ts, creditDebitNoteService.ts sync AR account balance
--   - invoiceFromDN.ts updates account balances after GL posting
--   - accountingCore.ts already updates account balances on all GL operations

BEGIN;

-- ============================================================
-- CAT 2: NUMBER GENERATOR TRIGGERS (8)
-- ============================================================

-- 1. bank_reconciliations → reconciliation_number (no INSERT in app, dead trigger)
DROP TRIGGER IF EXISTS trigger_reconciliation_number ON bank_reconciliations;

-- 2. cash_bank_transfers → transfer_number (no INSERT in app, dead trigger)
DROP TRIGGER IF EXISTS trigger_transfer_number ON cash_bank_transfers;

-- 3. cash_book_entries → entry_number (no INSERT in app, dead trigger)
DROP TRIGGER IF EXISTS trigger_cashbook_entry_number ON cash_book_entries;

-- 4. delivery_notes → delivery_note_number (now generated in deliveryNoteRepository.ts)
DROP TRIGGER IF EXISTS trg_generate_delivery_note_number ON delivery_notes;

-- 5. delivery_orders → tracking_number (now generated in deliveryRepository.ts)
DROP TRIGGER IF EXISTS trg_generate_tracking_number ON delivery_orders;

-- 6. pos_customer_deposits → deposit_number (now generated in depositsRepository.ts)
DROP TRIGGER IF EXISTS trg_generate_deposit_number ON pos_customer_deposits;

-- 7. pos_held_orders → hold_number (now generated in holdRepository.ts)
DROP TRIGGER IF EXISTS trg_set_hold_number ON pos_held_orders;

-- 8. quotations → quote_number (already generated in quotationRepository.ts)
DROP TRIGGER IF EXISTS trg_generate_quote_number ON quotations;

-- ============================================================
-- CAT 3: BALANCE/SYNC TRIGGERS (6)
-- ============================================================

-- 9. cash_bank_transfers → bank_accounts balance (no UPDATE in app, dead trigger)
DROP TRIGGER IF EXISTS trigger_update_transfer_balances ON cash_bank_transfers;

-- 10. cash_book_entries → bank_accounts balance + running_balance (no INSERT in app, dead trigger)
DROP TRIGGER IF EXISTS trigger_update_cashbook_running_balance ON cash_book_entries;

-- 11. customers → AR account (1200) sync (now in invoiceService, salesService, creditDebitNoteService)
DROP TRIGGER IF EXISTS trg_sync_customer_to_ar ON customers;

-- 12. invoice_payments → invoice recalculation (app already calls recalcInvoice after every payment)
DROP TRIGGER IF EXISTS trg_sync_invoice_balance ON invoice_payments;

-- 13. invoices → customer balance recalculation (now in service layer after every invoice change)
DROP TRIGGER IF EXISTS trg_sync_customer_balance_on_invoice ON invoices;

-- 14. ledger_entries → account CurrentBalance sync (accountingCore already updates, gap in invoiceFromDN fixed)
DROP TRIGGER IF EXISTS trg_sync_account_balance ON ledger_entries;

-- ============================================================
-- DROP TRIGGER FUNCTIONS (14)
-- ============================================================

DROP FUNCTION IF EXISTS trg_set_reconciliation_number() CASCADE;
DROP FUNCTION IF EXISTS trg_set_transfer_number() CASCADE;
DROP FUNCTION IF EXISTS trg_set_cashbook_entry_number() CASCADE;
DROP FUNCTION IF EXISTS generate_delivery_note_number() CASCADE;
DROP FUNCTION IF EXISTS generate_tracking_number() CASCADE;
DROP FUNCTION IF EXISTS generate_deposit_number() CASCADE;
DROP FUNCTION IF EXISTS set_hold_number() CASCADE;
DROP FUNCTION IF EXISTS generate_quote_number() CASCADE;
DROP FUNCTION IF EXISTS trg_update_transfer_balances() CASCADE;
DROP FUNCTION IF EXISTS trg_update_cashbook_running_balance() CASCADE;
DROP FUNCTION IF EXISTS sync_customer_to_ar() CASCADE;
DROP FUNCTION IF EXISTS fn_recalculate_invoice_balance() CASCADE;
DROP FUNCTION IF EXISTS sync_customer_balance_on_invoice_change() CASCADE;
DROP FUNCTION IF EXISTS fn_sync_account_balance() CASCADE;

-- ============================================================
-- DROP HELPER FUNCTIONS (6)
-- ============================================================

DROP FUNCTION IF EXISTS generate_reconciliation_number() CASCADE;
DROP FUNCTION IF EXISTS generate_transfer_number() CASCADE;
DROP FUNCTION IF EXISTS generate_cashbook_entry_number() CASCADE;
DROP FUNCTION IF EXISTS generate_hold_number() CASCADE;
DROP FUNCTION IF EXISTS fn_update_invoice_balance_internal(UUID) CASCADE;
DROP FUNCTION IF EXISTS recalc_customer_balance_from_invoices(UUID) CASCADE;

COMMIT;
