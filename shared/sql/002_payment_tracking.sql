-- ============================================================
-- PAYMENT TRACKING SYSTEM
-- Enhanced Purchase Order Workflow
-- Date: November 1, 2025
-- ============================================================

-- Payment Status Enum
CREATE TYPE payment_status AS ENUM ('PENDING', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELLED');

-- Payment Method Enum
CREATE TYPE payment_method AS ENUM ('CASH', 'BANK_TRANSFER', 'CHEQUE', 'MOBILE_MONEY', 'CREDIT');

-- ============================================================
-- SUPPLIER PAYMENTS TABLE
-- Tracks all payments made to suppliers
-- ============================================================

CREATE TABLE supplier_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_number VARCHAR(50) UNIQUE NOT NULL,
    purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id),
    supplier_id UUID NOT NULL REFERENCES suppliers(id),
    
    -- Payment Details
    payment_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    payment_method payment_method NOT NULL,
    payment_status payment_status DEFAULT 'PENDING',
    
    -- Amounts
    invoice_amount DECIMAL(15, 2) NOT NULL,
    paid_amount DECIMAL(15, 2) DEFAULT 0.00,
    outstanding_amount DECIMAL(15, 2) NOT NULL,
    discount_amount DECIMAL(15, 2) DEFAULT 0.00,
    
    -- Reference Information
    invoice_number VARCHAR(100),
    delivery_note_number VARCHAR(100),
    reference_number VARCHAR(100),
    
    -- Banking Details (if applicable)
    bank_name VARCHAR(200),
    transaction_id VARCHAR(200),
    cheque_number VARCHAR(100),
    
    -- Due Date Tracking
    invoice_date DATE,
    due_date DATE,
    
    -- Approval Workflow
    approved_by_id UUID REFERENCES users(id),
    approved_at TIMESTAMP WITH TIME ZONE,
    
    -- Notes
    notes TEXT,
    
    -- Audit Fields
    created_by_id UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- PAYMENT TRANSACTIONS TABLE
-- Tracks individual payment transactions (for partial payments)
-- ============================================================

CREATE TABLE payment_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_number VARCHAR(50) UNIQUE NOT NULL,
    supplier_payment_id UUID NOT NULL REFERENCES supplier_payments(id) ON DELETE CASCADE,
    
    -- Transaction Details
    transaction_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    payment_method payment_method NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    
    -- Reference Information
    reference_number VARCHAR(200),
    receipt_number VARCHAR(100),
    
    -- Banking Details
    bank_name VARCHAR(200),
    transaction_id VARCHAR(200),
    cheque_number VARCHAR(100),
    
    -- Notes
    notes TEXT,
    
    -- Audit Fields
    processed_by_id UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- PURCHASE ORDER ENHANCEMENTS
-- Add payment tracking fields to purchase_orders
-- ============================================================

ALTER TABLE purchase_orders
ADD COLUMN IF NOT EXISTS sent_to_supplier_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS sent_by_id UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(100),
ADD COLUMN IF NOT EXISTS invoice_date DATE,
ADD COLUMN IF NOT EXISTS invoice_amount DECIMAL(15, 2),
ADD COLUMN IF NOT EXISTS payment_status payment_status DEFAULT 'PENDING',
ADD COLUMN IF NOT EXISTS paid_amount DECIMAL(15, 2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS outstanding_amount DECIMAL(15, 2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS payment_due_date DATE;

-- ============================================================
-- GOODS RECEIPT ENHANCEMENTS
-- Link to delivery notes and invoices
-- ============================================================

ALTER TABLE goods_receipts
ADD COLUMN IF NOT EXISTS delivery_note_number VARCHAR(100),
ADD COLUMN IF NOT EXISTS delivery_note_date DATE,
ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(100),
ADD COLUMN IF NOT EXISTS invoice_date DATE,
ADD COLUMN IF NOT EXISTS invoice_amount DECIMAL(15, 2),
ADD COLUMN IF NOT EXISTS approved_by_id UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE;

-- ============================================================
-- INDEXES
-- ============================================================

-- Supplier Payments Indexes
CREATE INDEX idx_supplier_payments_po ON supplier_payments(purchase_order_id);
CREATE INDEX idx_supplier_payments_supplier ON supplier_payments(supplier_id);
CREATE INDEX idx_supplier_payments_status ON supplier_payments(payment_status);
CREATE INDEX idx_supplier_payments_due_date ON supplier_payments(due_date);
CREATE INDEX idx_supplier_payments_invoice ON supplier_payments(invoice_number);

-- Payment Transactions Indexes
CREATE INDEX idx_payment_transactions_payment ON payment_transactions(supplier_payment_id);
CREATE INDEX idx_payment_transactions_date ON payment_transactions(transaction_date);

-- Purchase Orders Enhanced Indexes
CREATE INDEX idx_po_payment_status ON purchase_orders(payment_status);
CREATE INDEX idx_po_sent_date ON purchase_orders(sent_to_supplier_at);
CREATE INDEX idx_po_invoice_number ON purchase_orders(invoice_number);

-- Goods Receipts Enhanced Indexes
CREATE INDEX idx_gr_delivery_note ON goods_receipts(delivery_note_number);
CREATE INDEX idx_gr_invoice ON goods_receipts(invoice_number);

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Update supplier_payments updated_at
CREATE TRIGGER update_supplier_payments_updated_at 
BEFORE UPDATE ON supplier_payments 
FOR EACH ROW 
EXECUTE FUNCTION update_updated_at_column();

-- Auto-update outstanding amount on supplier_payments
CREATE OR REPLACE FUNCTION update_outstanding_amount()
RETURNS TRIGGER AS $$
BEGIN
    NEW.outstanding_amount := NEW.invoice_amount - NEW.paid_amount - NEW.discount_amount;
    
    -- Update payment status based on amounts
    IF NEW.paid_amount >= NEW.invoice_amount - NEW.discount_amount THEN
        NEW.payment_status := 'PAID';
    ELSIF NEW.paid_amount > 0 THEN
        NEW.payment_status := 'PARTIAL';
    ELSIF NEW.due_date < CURRENT_DATE AND NEW.paid_amount = 0 THEN
        NEW.payment_status := 'OVERDUE';
    ELSE
        NEW.payment_status := 'PENDING';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_outstanding_amount
BEFORE INSERT OR UPDATE ON supplier_payments
FOR EACH ROW
EXECUTE FUNCTION update_outstanding_amount();

-- Auto-update PO payment amounts
CREATE OR REPLACE FUNCTION sync_po_payment_amounts()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE purchase_orders
    SET 
        paid_amount = COALESCE((
            SELECT SUM(paid_amount)
            FROM supplier_payments
            WHERE purchase_order_id = NEW.purchase_order_id
        ), 0),
        outstanding_amount = COALESCE((
            SELECT SUM(outstanding_amount)
            FROM supplier_payments
            WHERE purchase_order_id = NEW.purchase_order_id
        ), 0),
        payment_status = NEW.payment_status
    WHERE id = NEW.purchase_order_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sync_po_payments
AFTER INSERT OR UPDATE ON supplier_payments
FOR EACH ROW
EXECUTE FUNCTION sync_po_payment_amounts();

-- ============================================================
-- FUNCTIONS FOR PAYMENT WORKFLOWS
-- ============================================================

-- Generate payment number (PAY-YYYY-NNNN format)
CREATE OR REPLACE FUNCTION generate_payment_number()
RETURNS VARCHAR(50) AS $$
DECLARE
    year TEXT;
    last_number INTEGER;
    new_number VARCHAR(50);
BEGIN
    year := TO_CHAR(CURRENT_DATE, 'YYYY');
    
    SELECT COALESCE(
        MAX(CAST(SUBSTRING(payment_number FROM 10) AS INTEGER)), 
        0
    ) INTO last_number
    FROM supplier_payments
    WHERE payment_number LIKE 'PAY-' || year || '-%';
    
    new_number := 'PAY-' || year || '-' || LPAD((last_number + 1)::TEXT, 4, '0');
    
    RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- Generate transaction number (TXN-YYYY-NNNN format)
CREATE OR REPLACE FUNCTION generate_transaction_number()
RETURNS VARCHAR(50) AS $$
DECLARE
    year TEXT;
    last_number INTEGER;
    new_number VARCHAR(50);
BEGIN
    year := TO_CHAR(CURRENT_DATE, 'YYYY');
    
    SELECT COALESCE(
        MAX(CAST(SUBSTRING(transaction_number FROM 10) AS INTEGER)), 
        0
    ) INTO last_number
    FROM payment_transactions
    WHERE transaction_number LIKE 'TXN-' || year || '-%';
    
    new_number := 'TXN-' || year || '-' || LPAD((last_number + 1)::TEXT, 4, '0');
    
    RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- VIEWS FOR REPORTING
-- ============================================================

-- Payment Summary View
CREATE OR REPLACE VIEW v_payment_summary AS
SELECT 
    sp.id,
    sp.payment_number,
    po.order_number as po_number,
    s.name as supplier_name,
    sp.invoice_number,
    sp.invoice_date,
    sp.due_date,
    sp.invoice_amount,
    sp.paid_amount,
    sp.outstanding_amount,
    sp.discount_amount,
    sp.payment_status,
    sp.payment_method,
    CASE 
        WHEN sp.due_date < CURRENT_DATE AND sp.outstanding_amount > 0 THEN TRUE
        ELSE FALSE
    END as is_overdue,
    CASE 
        WHEN sp.due_date < CURRENT_DATE THEN CURRENT_DATE - sp.due_date
        ELSE 0
    END as days_overdue,
    COUNT(pt.id) as transaction_count,
    sp.created_at,
    sp.updated_at
FROM supplier_payments sp
JOIN purchase_orders po ON sp.purchase_order_id = po.id
JOIN suppliers s ON sp.supplier_id = s.id
LEFT JOIN payment_transactions pt ON pt.supplier_payment_id = sp.id
GROUP BY sp.id, po.order_number, s.name;

-- Outstanding Payments View
CREATE OR REPLACE VIEW v_outstanding_payments AS
SELECT *
FROM v_payment_summary
WHERE payment_status IN ('PENDING', 'PARTIAL', 'OVERDUE')
ORDER BY is_overdue DESC, due_date ASC;

-- Overdue Payments View
CREATE OR REPLACE VIEW v_overdue_payments AS
SELECT *
FROM v_payment_summary
WHERE is_overdue = TRUE
ORDER BY days_overdue DESC;

COMMENT ON TABLE supplier_payments IS 'Tracks payment obligations to suppliers for purchase orders';
COMMENT ON TABLE payment_transactions IS 'Individual payment transactions for partial or full payments';
COMMENT ON VIEW v_payment_summary IS 'Comprehensive payment summary with supplier details';
COMMENT ON VIEW v_outstanding_payments IS 'All pending and partial payments';
COMMENT ON VIEW v_overdue_payments IS 'Overdue payments requiring immediate attention';
