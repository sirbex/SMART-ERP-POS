-- ============================================================
-- SUPPLIER INVOICES AND PAYMENT ALLOCATIONS
-- Supports supplier bill tracking and payment allocation
-- ============================================================

-- Supplier Invoices (Bills from Suppliers)
CREATE TABLE IF NOT EXISTS supplier_invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_number VARCHAR(50) UNIQUE NOT NULL,
    supplier_invoice_number VARCHAR(100),  -- Supplier's own invoice number
    supplier_id UUID NOT NULL REFERENCES suppliers("Id"),
    
    -- Invoice Details
    invoice_date DATE NOT NULL,
    due_date DATE,
    
    -- Amounts
    subtotal DECIMAL(15, 2) NOT NULL DEFAULT 0,
    tax_amount DECIMAL(15, 2) DEFAULT 0,
    total_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    paid_amount DECIMAL(15, 2) DEFAULT 0,
    
    -- Status: PENDING, PARTIAL, PAID, CANCELLED, OVERDUE
    status VARCHAR(20) DEFAULT 'PENDING',
    
    notes TEXT,
    
    -- Audit
    created_by_id UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_supplier_invoices_supplier ON supplier_invoices(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_status ON supplier_invoices(status);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_due_date ON supplier_invoices(due_date);

-- Add allocated_amount to supplier_payments if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'supplier_payments' AND column_name = 'allocated_amount'
    ) THEN
        ALTER TABLE supplier_payments ADD COLUMN allocated_amount DECIMAL(15, 2) DEFAULT 0;
    END IF;
END $$;

-- Supplier Payment Allocations (links payments to invoices)
CREATE TABLE IF NOT EXISTS supplier_payment_allocations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_payment_id UUID NOT NULL REFERENCES supplier_payments(id) ON DELETE CASCADE,
    supplier_invoice_id UUID NOT NULL REFERENCES supplier_invoices(id) ON DELETE CASCADE,
    amount DECIMAL(15, 2) NOT NULL,
    allocated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    allocated_by_id UUID REFERENCES users(id),
    
    UNIQUE(supplier_payment_id, supplier_invoice_id)
);

CREATE INDEX IF NOT EXISTS idx_supplier_allocations_payment ON supplier_payment_allocations(supplier_payment_id);
CREATE INDEX IF NOT EXISTS idx_supplier_allocations_invoice ON supplier_payment_allocations(supplier_invoice_id);

-- Function to update supplier invoice status when paid_amount changes
CREATE OR REPLACE FUNCTION update_supplier_invoice_status()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.paid_amount >= NEW.total_amount THEN
        NEW.status := 'PAID';
    ELSIF NEW.paid_amount > 0 THEN
        NEW.status := 'PARTIAL';
    ELSIF NEW.due_date IS NOT NULL AND NEW.due_date < CURRENT_DATE AND NEW.status NOT IN ('PAID', 'CANCELLED') THEN
        NEW.status := 'OVERDUE';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_supplier_invoice_status ON supplier_invoices;
CREATE TRIGGER trg_update_supplier_invoice_status
    BEFORE UPDATE OF paid_amount ON supplier_invoices
    FOR EACH ROW
    EXECUTE FUNCTION update_supplier_invoice_status();
