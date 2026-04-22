-- =====================================================
-- Migration: 028_add_reprint_audit_and_print_tracking.sql
-- Purpose: Add REPRINT action to audit_log, add print_count to sales,
--          add distribution entity types to audit constraints
-- Date: April 2026
-- =====================================================

-- 1. Add REPRINT action to audit_log constraint
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_action_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_action_check CHECK (action IN (
    'CREATE', 'UPDATE', 'DELETE', 'VOID', 'CANCEL', 'REFUND', 'EXCHANGE',
    'LOGIN', 'LOGOUT', 'LOGIN_FAILED', 'PASSWORD_CHANGE', 'PERMISSION_CHANGE',
    'APPROVE', 'REJECT', 'RESTORE', 'ARCHIVE', 'EXPORT', 'IMPORT',
    'OPEN_DRAWER', 'CLOSE_SHIFT', 'ADJUST_INVENTORY', 'PRICE_CHANGE',
    'PRICE_OVERRIDE', 'STATUS_CHANGE', 'FINALIZE', 'REMOVE', 'REPRINT'
));

-- 2. Expand entity_type constraint to include distribution and other new types
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_entity_type_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_entity_type_check CHECK (entity_type IN (
    'SALE', 'INVOICE', 'PAYMENT', 'PRODUCT', 'CUSTOMER', 'SUPPLIER',
    'USER', 'PURCHASE_ORDER', 'GOODS_RECEIPT', 'INVENTORY_ADJUSTMENT',
    'BATCH', 'PRICING', 'DISCOUNT', 'SETTINGS', 'REPORT', 'SYSTEM',
    'LEAD', 'OPPORTUNITY', 'ACTIVITY', 'OPPORTUNITY_DOCUMENT',
    'DEPARTMENT', 'POSITION', 'EMPLOYEE', 'PAYROLL_PERIOD', 'PAYROLL_ENTRY',
    'SALES_ORDER', 'DELIVERY'
));

-- 3. Add print tracking to sales table
ALTER TABLE sales ADD COLUMN IF NOT EXISTS print_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN sales.print_count IS 'Number of times the receipt has been printed (0 = never printed)';
