-- Migration 057: Optimize trg_sync_customer_to_ar for bulk operations
--
-- PROBLEM: The trigger fires on EVERY customer INSERT/UPDATE/DELETE and runs
-- SUM(balance) over ALL customers each time. During a 1000-row import this
-- means 1000 full table scans — classic N² anti-pattern.
--
-- FIX: Add a session-variable check (app.skip_customer_ar_trigger) so the
-- import can disable the per-row trigger and do ONE final AR recalculation.
-- Same pattern as app.skip_stock_movement_trigger used in batch imports.

CREATE OR REPLACE FUNCTION sync_customer_to_ar()
RETURNS TRIGGER AS $$
DECLARE
    v_ar_account_id UUID;
    v_total_ar NUMERIC(18,2);
    v_skip TEXT;
BEGIN
    -- Allow bulk operations to skip per-row recalculation
    BEGIN
        v_skip := current_setting('app.skip_customer_ar_trigger', true);
    EXCEPTION WHEN OTHERS THEN
        v_skip := '';
    END;
    IF v_skip = 'true' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- Get AR account ID
    SELECT "Id" INTO v_ar_account_id FROM accounts WHERE "AccountCode" = '1200';

    IF v_ar_account_id IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- Calculate total AR from all active customers
    SELECT COALESCE(SUM(balance), 0) INTO v_total_ar
    FROM customers WHERE is_active = true;

    -- Update AR account
    UPDATE accounts
    SET "CurrentBalance" = v_total_ar,
        "UpdatedAt" = NOW()
    WHERE "Id" = v_ar_account_id;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
