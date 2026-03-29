-- Migration: Add new report types to report_type_enum
-- Date: 2026-03-29
-- Purpose: Support delivery notes, quotation, journal entry, and bank transaction reports

ALTER TYPE report_type ADD VALUE IF NOT EXISTS 'DELIVERY_NOTES';
ALTER TYPE report_type ADD VALUE IF NOT EXISTS 'QUOTATIONS';
ALTER TYPE report_type ADD VALUE IF NOT EXISTS 'MANUAL_JOURNAL_ENTRIES';
ALTER TYPE report_type ADD VALUE IF NOT EXISTS 'BANK_TRANSACTIONS';
