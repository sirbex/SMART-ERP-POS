-- Phase 6: Initial Data Seed Script
-- File: 001_seed_initial_data.sql

-- Seed default admin user
INSERT INTO users (id, username, email, password_hash, first_name, last_name, role, is_active)
VALUES 
    (uuid_generate_v4(), 'admin', 'admin@samplepos.com', '$2b$10$rOzN8k8rqVqJ7xJxJ7xJxOzN8k8rqVqJ7xJxJ7xJxOzN8k8rqVqJ7x', 'System', 'Administrator', 'ADMIN', true),
    (uuid_generate_v4(), 'manager', 'manager@samplepos.com', '$2b$10$rOzN8k8rqVqJ7xJxJ7xJxOzN8k8rqVqJ7xJxJ7xJxOzN8k8rqVqJ7x', 'Store', 'Manager', 'MANAGER', true),
    (uuid_generate_v4(), 'cashier', 'cashier@samplepos.com', '$2b$10$rOzN8k8rqVqJ7xJxJ7xJxOzN8k8rqVqJ7xJxJ7xJxOzN8k8rqVqJ7x', 'Main', 'Cashier', 'CASHIER', true)
ON CONFLICT (username) DO NOTHING;

-- Seed chart of accounts
INSERT INTO accounts (id, account_code, account_name, account_type, account_subtype, is_active)
VALUES 
    -- Assets
    (uuid_generate_v4(), '1000', 'Cash', 'ASSET', 'CURRENT_ASSET', true),
    (uuid_generate_v4(), '1100', 'Accounts Receivable', 'ASSET', 'CURRENT_ASSET', true),
    (uuid_generate_v4(), '1200', 'Inventory', 'ASSET', 'CURRENT_ASSET', true),
    (uuid_generate_v4(), '1500', 'Equipment', 'ASSET', 'FIXED_ASSET', true),
    
    -- Liabilities
    (uuid_generate_v4(), '2000', 'Accounts Payable', 'LIABILITY', 'CURRENT_LIABILITY', true),
    (uuid_generate_v4(), '2100', 'Sales Tax Payable', 'LIABILITY', 'CURRENT_LIABILITY', true),
    (uuid_generate_v4(), '2500', 'Long Term Debt', 'LIABILITY', 'LONG_TERM_LIABILITY', true),
    
    -- Equity
    (uuid_generate_v4(), '3000', 'Owner Equity', 'EQUITY', 'OWNER_EQUITY', true),
    (uuid_generate_v4(), '3100', 'Retained Earnings', 'EQUITY', 'RETAINED_EARNINGS', true),
    
    -- Revenue
    (uuid_generate_v4(), '4000', 'Sales Revenue', 'REVENUE', 'SALES_REVENUE', true),
    (uuid_generate_v4(), '4100', 'Service Revenue', 'REVENUE', 'SERVICE_REVENUE', true),
    
    -- Expenses
    (uuid_generate_v4(), '5000', 'Cost of Goods Sold', 'EXPENSE', 'COGS', true),
    (uuid_generate_v4(), '6000', 'Operating Expenses', 'EXPENSE', 'OPERATING_EXPENSE', true)
ON CONFLICT (account_code) DO NOTHING;

-- Seed sample customer
INSERT INTO customers (id, customer_number, name, email, phone, address, customer_type, credit_limit, balance, is_active)
VALUES 
    (uuid_generate_v4(), 'CUST-001', 'Walk-in Customer', 'walkin@samplepos.com', '+1-000-000-0000', 'Default Walk-in Address', 'INDIVIDUAL', 0.00, 0.00, true),
    (uuid_generate_v4(), 'CUST-002', 'VIP Customer', 'vip@samplepos.com', '+1-111-111-1111', '123 VIP Street, Premium City', 'INDIVIDUAL', 5000.00, 0.00, true),
    (uuid_generate_v4(), 'CUST-003', 'Business Customer Ltd', 'business@samplepos.com', '+1-222-222-2222', '456 Business Ave, Corporate City', 'BUSINESS', 10000.00, 0.00, true)
ON CONFLICT (customer_number) DO NOTHING;

-- Seed sample products
INSERT INTO products (id, sku, barcode, name, description, category, brand, unit_of_measure, cost_price, selling_price, markup_percentage, tax_rate, reorder_level, track_expiry, track_batches, is_active)
VALUES 
    (uuid_generate_v4(), 'PROD-001', '1234567890123', 'Sample Product 1', 'Basic product for demonstration', 'Electronics', 'SampleBrand', 'PCS', 25.00, 50.00, 100.00, 0.08, 10, false, false, true),
    (uuid_generate_v4(), 'PROD-002', '1234567890124', 'Sample Product 2', 'Premium product with tracking', 'Electronics', 'SampleBrand', 'PCS', 45.00, 80.00, 77.78, 0.08, 5, true, true, true),
    (uuid_generate_v4(), 'PROD-003', '1234567890125', 'Sample Service', 'Service item for testing', 'Services', 'SampleBrand', 'HR', 0.00, 100.00, 0.00, 0.08, 0, false, false, true)
ON CONFLICT (sku) DO NOTHING;

-- Add some initial inventory for products with tracking
INSERT INTO inventory_batches (id, product_id, batch_number, expiry_date, cost_price, initial_quantity, remaining_quantity)
SELECT 
    uuid_generate_v4(),
    p.id,
    'INITIAL-BATCH-001',
    CURRENT_DATE + INTERVAL '1 year',
    p.cost_price,
    100.0,
    100.0
FROM products p 
WHERE p.sku IN ('PROD-001', 'PROD-002')
ON CONFLICT (product_id, batch_number) DO NOTHING;

-- Create initial stock movements for the inventory
INSERT INTO stock_movements (id, product_id, batch_id, movement_type, quantity, unit_cost, total_cost, reference_type, reason)
SELECT 
    uuid_generate_v4(),
    ib.product_id,
    ib.id,
    'ADJUSTMENT_IN',
    ib.initial_quantity,
    ib.cost_price,
    ib.initial_quantity * ib.cost_price,
    'INITIAL_SETUP',
    'Initial inventory setup'
FROM inventory_batches ib
WHERE ib.batch_number = 'INITIAL-BATCH-001';

-- Grant necessary permissions (adjust as needed for your setup)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO pos_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO pos_user;