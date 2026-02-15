-- Expense Management System Migration
-- Creates tables for expense tracking with categories, approvals, and audit trail
-- Following SamplePOS architecture: snake_case DB, UUID PKs, business IDs

-- Create expense categories table
CREATE TABLE expense_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    code VARCHAR(20) NOT NULL UNIQUE, -- OFFICE, TRAVEL, etc.
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create expenses table
CREATE TABLE expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_number VARCHAR(50) NOT NULL UNIQUE, -- EXP-2025-0001
    
    -- Basic information
    title VARCHAR(255) NOT NULL,
    description TEXT,
    amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
    expense_date DATE NOT NULL, -- Using DATE as per timezone strategy
    
    -- Categories and relationships
    category_id UUID NOT NULL REFERENCES expense_categories(id),
    supplier_id UUID REFERENCES suppliers(id), -- Optional supplier reference
    vendor VARCHAR(255), -- Free text vendor if no supplier record
    
    -- Payment information
    payment_method VARCHAR(20) NOT NULL CHECK (payment_method IN ('CASH', 'CARD', 'BANK_TRANSFER', 'MOBILE_MONEY', 'CHEQUE')),
    receipt_number VARCHAR(100),
    reference_number VARCHAR(100),
    
    -- Status and approval workflow
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'PAID', 'CANCELLED')),
    
    -- Audit trail
    created_by UUID NOT NULL REFERENCES users(id),
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    rejected_by UUID REFERENCES users(id),
    rejected_at TIMESTAMPTZ,
    rejection_reason TEXT,
    paid_by UUID REFERENCES users(id),
    paid_at TIMESTAMPTZ,
    
    -- Metadata
    notes TEXT,
    tags TEXT[], -- Array for searchable tags
    
    -- Timestamps (UTC as per strategy)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create expense documents table for attachments
CREATE TABLE expense_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    
    -- File information
    filename VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size BIGINT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    
    -- Document type and metadata
    document_type VARCHAR(50) NOT NULL CHECK (document_type IN ('RECEIPT', 'INVOICE', 'CONTRACT', 'APPROVAL', 'OTHER')),
    description TEXT,
    
    -- Audit
    uploaded_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create expense approvals table for approval workflow
CREATE TABLE expense_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    
    -- Approval details
    approver_id UUID NOT NULL REFERENCES users(id),
    approval_level INTEGER NOT NULL DEFAULT 1, -- Support multi-level approvals
    status VARCHAR(20) NOT NULL CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    
    -- Decision details
    decision_date TIMESTAMPTZ,
    comments TEXT,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_expenses_expense_number ON expenses(expense_number);
CREATE INDEX idx_expenses_expense_date ON expenses(expense_date);
CREATE INDEX idx_expenses_category_id ON expenses(category_id);
CREATE INDEX idx_expenses_created_by ON expenses(created_by);
CREATE INDEX idx_expenses_status ON expenses(status);
CREATE INDEX idx_expenses_supplier_id ON expenses(supplier_id);
CREATE INDEX idx_expense_documents_expense_id ON expense_documents(expense_id);
CREATE INDEX idx_expense_approvals_expense_id ON expense_approvals(expense_id);
CREATE INDEX idx_expense_approvals_approver_id ON expense_approvals(approver_id);

-- Create function for expense number generation
CREATE OR REPLACE FUNCTION generate_expense_number()
RETURNS VARCHAR(50) AS $$
DECLARE
    year_part VARCHAR(4);
    month_part VARCHAR(2);
    sequence_num INTEGER;
    expense_number VARCHAR(50);
BEGIN
    -- Get current year and month
    year_part := EXTRACT(YEAR FROM NOW())::VARCHAR(4);
    month_part := LPAD(EXTRACT(MONTH FROM NOW())::VARCHAR(2), 2, '0');
    
    -- Get next sequence number for this year-month
    SELECT COALESCE(MAX(CAST(SUBSTRING(expense_number FROM 10) AS INTEGER)), 0) + 1
    INTO sequence_num
    FROM expenses 
    WHERE expense_number LIKE 'EXP-' || year_part || month_part || '-%';
    
    -- Format as EXP-YYYYMM-####
    expense_number := 'EXP-' || year_part || month_part || '-' || LPAD(sequence_num::VARCHAR(4), 4, '0');
    
    RETURN expense_number;
END;
$$ LANGUAGE plpgsql;

-- Create trigger function for updated_at timestamp
CREATE OR REPLACE FUNCTION update_expense_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
CREATE TRIGGER expenses_updated_at
    BEFORE UPDATE ON expenses
    FOR EACH ROW
    EXECUTE FUNCTION update_expense_updated_at();

CREATE TRIGGER expense_categories_updated_at
    BEFORE UPDATE ON expense_categories
    FOR EACH ROW
    EXECUTE FUNCTION update_expense_updated_at();

CREATE TRIGGER expense_approvals_updated_at
    BEFORE UPDATE ON expense_approvals
    FOR EACH ROW
    EXECUTE FUNCTION update_expense_updated_at();

-- Insert default expense categories
INSERT INTO expense_categories (name, description, code) VALUES
('Office Supplies', 'Stationery, printing, office equipment', 'OFFICE_SUPPLIES'),
('Travel & Transportation', 'Business travel, fuel, vehicle expenses', 'TRAVEL'),
('Meals & Entertainment', 'Business meals, client entertainment', 'MEALS'),
('Fuel & Vehicle', 'Fuel, vehicle maintenance, parking', 'FUEL'),
('Utilities', 'Electricity, water, internet, phone', 'UTILITIES'),
('Maintenance & Repairs', 'Equipment maintenance, facility repairs', 'MAINTENANCE'),
('Marketing & Advertising', 'Promotional materials, advertising costs', 'MARKETING'),
('Equipment & Tools', 'Business equipment, tools, hardware', 'EQUIPMENT'),
('Software & Licenses', 'Software subscriptions, licenses', 'SOFTWARE'),
('Professional Services', 'Legal, accounting, consulting fees', 'PROFESSIONAL_SERVICES'),
('Accommodation', 'Business accommodation, hotels', 'ACCOMMODATION'),
('Training & Education', 'Employee training, courses, certifications', 'TRAINING'),
('Other Expenses', 'Miscellaneous business expenses', 'OTHER');

-- Create view for expense reporting
CREATE VIEW expense_summary AS
SELECT 
    e.id,
    e.expense_number,
    e.title,
    e.amount,
    e.expense_date,
    e.status,
    e.payment_method,
    ec.name as category_name,
    ec.code as category_code,
    u_created.full_name as created_by_name,
    u_approved.full_name as approved_by_name,
    s.name as supplier_name,
    e.vendor,
    e.created_at,
    e.updated_at,
    e.approved_at
FROM expenses e
LEFT JOIN expense_categories ec ON e.category_id = ec.id
LEFT JOIN users u_created ON e.created_by = u_created.id
LEFT JOIN users u_approved ON e.approved_by = u_approved.id
LEFT JOIN suppliers s ON e.supplier_id = s.id;

-- Grant permissions (adjust as needed for your user setup)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO postgres;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO postgres;