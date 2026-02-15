-- Migration: Add human-readable IDs for business entities
-- Date: November 9, 2025
-- Purpose: Replace UUID display with business-friendly IDs

-- ============================================================
-- CUSTOMERS - Add customer_number field
-- ============================================================

-- Add customer_number column
ALTER TABLE customers ADD COLUMN customer_number VARCHAR(20) UNIQUE;

-- Create sequence for customer numbers
CREATE SEQUENCE IF NOT EXISTS customer_number_seq START WITH 1;

-- Function to generate customer number
CREATE OR REPLACE FUNCTION generate_customer_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.customer_number IS NULL THEN
        NEW.customer_number := 'CUST-' || LPAD(nextval('customer_number_seq')::TEXT, 4, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate customer number
DROP TRIGGER IF EXISTS trigger_generate_customer_number ON customers;
CREATE TRIGGER trigger_generate_customer_number
    BEFORE INSERT ON customers
    FOR EACH ROW
    EXECUTE FUNCTION generate_customer_number();

-- Update existing customers with numbers using a CTE
WITH numbered_customers AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as row_num
    FROM customers
    WHERE customer_number IS NULL
)
UPDATE customers c
SET customer_number = 'CUST-' || LPAD(nc.row_num::TEXT, 4, '0')
FROM numbered_customers nc
WHERE c.id = nc.id;

-- Update sequence to continue from last number
SELECT setval('customer_number_seq', (SELECT COUNT(*) FROM customers));

-- ============================================================
-- SUPPLIERS - Add supplier_number field
-- ============================================================

-- Add supplier_number column
ALTER TABLE suppliers ADD COLUMN supplier_number VARCHAR(20) UNIQUE;

-- Create sequence for supplier numbers
CREATE SEQUENCE IF NOT EXISTS supplier_number_seq START WITH 1;

-- Function to generate supplier number
CREATE OR REPLACE FUNCTION generate_supplier_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.supplier_number IS NULL THEN
        NEW.supplier_number := 'SUP-' || LPAD(nextval('supplier_number_seq')::TEXT, 4, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate supplier number
DROP TRIGGER IF EXISTS trigger_generate_supplier_number ON suppliers;
CREATE TRIGGER trigger_generate_supplier_number
    BEFORE INSERT ON suppliers
    FOR EACH ROW
    EXECUTE FUNCTION generate_supplier_number();

-- Update existing suppliers with numbers using a CTE
WITH numbered_suppliers AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as row_num
    FROM suppliers
    WHERE supplier_number IS NULL
)
UPDATE suppliers s
SET supplier_number = 'SUP-' || LPAD(ns.row_num::TEXT, 4, '0')
FROM numbered_suppliers ns
WHERE s.id = ns.id;

-- Update sequence to continue from last number
SELECT setval('supplier_number_seq', (SELECT COUNT(*) FROM suppliers));

-- ============================================================
-- SALES - Improve sale_number format (already exists)
-- ============================================================
-- Sales already has sale_number, but let's ensure format is: INV-YYYY-0001

-- Function to generate improved sale number
CREATE OR REPLACE FUNCTION generate_sale_number()
RETURNS VARCHAR(50) AS $$
DECLARE
    year_suffix VARCHAR(4);
    next_num INTEGER;
    formatted_num VARCHAR(50);
BEGIN
    year_suffix := TO_CHAR(CURRENT_DATE, 'YYYY');
    
    -- Get next number for this year
    SELECT COALESCE(MAX(CAST(SUBSTRING(sale_number FROM 10) AS INTEGER)), 0) + 1
    INTO next_num
    FROM sales
    WHERE sale_number LIKE 'INV-' || year_suffix || '-%';
    
    formatted_num := 'INV-' || year_suffix || '-' || LPAD(next_num::TEXT, 4, '0');
    
    RETURN formatted_num;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- GOODS RECEIPTS - Improve receipt_number format (already exists)
-- ============================================================
-- Goods receipts already has receipt_number, ensure format is: GR-YYYY-0001

-- Function to generate improved goods receipt number
CREATE OR REPLACE FUNCTION generate_gr_number()
RETURNS VARCHAR(50) AS $$
DECLARE
    year_suffix VARCHAR(4);
    next_num INTEGER;
    formatted_num VARCHAR(50);
BEGIN
    year_suffix := TO_CHAR(CURRENT_DATE, 'YYYY');
    
    -- Get next number for this year
    SELECT COALESCE(MAX(CAST(SUBSTRING(receipt_number FROM 9) AS INTEGER)), 0) + 1
    INTO next_num
    FROM goods_receipts
    WHERE receipt_number LIKE 'GR-' || year_suffix || '-%';
    
    formatted_num := 'GR-' || year_suffix || '-' || LPAD(next_num::TEXT, 4, '0');
    
    RETURN formatted_num;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- CREATE INDEXES for performance
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_customers_number ON customers(customer_number);
CREATE INDEX IF NOT EXISTS idx_suppliers_number ON suppliers(supplier_number);

-- ============================================================
-- COMMENTS for documentation
-- ============================================================

COMMENT ON COLUMN customers.customer_number IS 'Human-readable customer ID (CUST-0001)';
COMMENT ON COLUMN suppliers.supplier_number IS 'Human-readable supplier ID (SUP-0001)';
COMMENT ON COLUMN sales.sale_number IS 'Human-readable invoice number (INV-2025-0001)';
COMMENT ON COLUMN goods_receipts.receipt_number IS 'Human-readable GR number (GR-2025-0001)';
