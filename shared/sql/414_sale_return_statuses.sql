-- Migration 414: Add PARTIALLY_RETURNED and VOIDED_BY_RETURN to sale_status enum
--
-- ERP discipline: A completed POS sale is NEVER voided.
-- It is reversed through Return → Credit Note → Refund.
--
-- PARTIALLY_RETURNED: Some items have been returned; remaining items still outstanding
-- VOIDED_BY_RETURN:   All items returned — sale fully reversed via return workflow
--
-- PostgreSQL allows adding enum values safely (no table rewrite needed)

ALTER TYPE sale_status ADD VALUE IF NOT EXISTS 'PARTIALLY_RETURNED';
ALTER TYPE sale_status ADD VALUE IF NOT EXISTS 'VOIDED_BY_RETURN';
