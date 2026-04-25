-- Migration 508: Add ALLOWANCE expense category
-- Adds employee allowances as an expense category

INSERT INTO expense_categories (id, name, code, description, is_active, created_at, updated_at)
VALUES (
    gen_random_uuid(),
    'Employee Allowances',
    'ALLOWANCE',
    'Employee allowances, reimbursements, and entitlements',
    true,
    NOW(),
    NOW()
)
ON CONFLICT (code) DO NOTHING;
