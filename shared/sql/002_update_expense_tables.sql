-- Update existing expense table to match comprehensive schema
-- Add missing columns and relationships

-- First, create expense_categories table if it doesn't exist
CREATE TABLE IF NOT EXISTS expense_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    code VARCHAR(20) NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add missing columns to expenses table
ALTER TABLE expenses 
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS category_id UUID,
ADD COLUMN IF NOT EXISTS supplier_id UUID,
ADD COLUMN IF NOT EXISTS vendor VARCHAR(255),
ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) DEFAULT 'CASH' CHECK (payment_method IN ('CASH', 'CARD', 'BANK_TRANSFER', 'MOBILE_MONEY', 'CHEQUE')),
ADD COLUMN IF NOT EXISTS receipt_number VARCHAR(100),
ADD COLUMN IF NOT EXISTS reference_number VARCHAR(100),
ADD COLUMN IF NOT EXISTS created_by UUID,
ADD COLUMN IF NOT EXISTS approved_by UUID,
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS rejected_by UUID,
ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
ADD COLUMN IF NOT EXISTS paid_by UUID,
ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS tags TEXT[],
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Update existing status column constraint
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_status_check;
ALTER TABLE expenses ADD CONSTRAINT expenses_status_check 
    CHECK (status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'PAID', 'CANCELLED'));

-- Update created_at to use TIMESTAMPTZ
ALTER TABLE expenses ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';

-- Create expense_documents table if not exists
CREATE TABLE IF NOT EXISTS expense_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size BIGINT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    document_type VARCHAR(50) NOT NULL CHECK (document_type IN ('RECEIPT', 'INVOICE', 'CONTRACT', 'APPROVAL', 'OTHER')),
    description TEXT,
    uploaded_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create expense_approvals table if not exists
CREATE TABLE IF NOT EXISTS expense_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    approver_id UUID NOT NULL REFERENCES users(id),
    approval_level INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(20) NOT NULL CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    decision_date TIMESTAMPTZ,
    comments TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_expenses_expense_number ON expenses(expense_number);
CREATE INDEX IF NOT EXISTS idx_expenses_expense_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_category_id ON expenses(category_id);
CREATE INDEX IF NOT EXISTS idx_expenses_created_by ON expenses(created_by);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status);
CREATE INDEX IF NOT EXISTS idx_expenses_supplier_id ON expenses(supplier_id);
CREATE INDEX IF NOT EXISTS idx_expense_documents_expense_id ON expense_documents(expense_id);
CREATE INDEX IF NOT EXISTS idx_expense_approvals_expense_id ON expense_approvals(expense_id);
CREATE INDEX IF NOT EXISTS idx_expense_approvals_approver_id ON expense_approvals(approver_id);

-- Insert default expense categories (ignore if they exist)
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
('Other Expenses', 'Miscellaneous business expenses', 'OTHER')
ON CONFLICT (code) DO NOTHING;

-- Create function for expense number generation if not exists
CREATE OR REPLACE FUNCTION generate_expense_number()
RETURNS VARCHAR(50) AS $$
DECLARE
    year_part VARCHAR(4);
    month_part VARCHAR(2);
    sequence_num INTEGER;
    expense_number VARCHAR(50);
BEGIN
    year_part := EXTRACT(YEAR FROM NOW())::VARCHAR(4);
    month_part := LPAD(EXTRACT(MONTH FROM NOW())::VARCHAR(2), 2, '0');
    
    SELECT COALESCE(MAX(CAST(SUBSTRING(expense_number FROM 10) AS INTEGER)), 0) + 1
    INTO sequence_num
    FROM expenses 
    WHERE expense_number LIKE 'EXP-' || year_part || month_part || '-%';
    
    expense_number := 'EXP-' || year_part || month_part || '-' || LPAD(sequence_num::VARCHAR(4), 4, '0');
    
    RETURN expense_number;
END;
$$ LANGUAGE plpgsql;

-- Create trigger function for updated_at
CREATE OR REPLACE FUNCTION update_expense_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers if they don't exist
DROP TRIGGER IF EXISTS expenses_updated_at ON expenses;
CREATE TRIGGER expenses_updated_at
    BEFORE UPDATE ON expenses
    FOR EACH ROW
    EXECUTE FUNCTION update_expense_updated_at();

DROP TRIGGER IF EXISTS expense_categories_updated_at ON expense_categories;
CREATE TRIGGER expense_categories_updated_at
    BEFORE UPDATE ON expense_categories
    FOR EACH ROW
    EXECUTE FUNCTION update_expense_updated_at();

DROP TRIGGER IF EXISTS expense_approvals_updated_at ON expense_approvals;
CREATE TRIGGER expense_approvals_updated_at
    BEFORE UPDATE ON expense_approvals
    FOR EACH ROW
    EXECUTE FUNCTION update_expense_updated_at();

-- Add foreign key constraints if they don't exist
DO $$ 
BEGIN
    -- Add category_id foreign key
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'expenses' 
        AND constraint_name = 'expenses_category_id_fkey'
    ) THEN
        ALTER TABLE expenses ADD CONSTRAINT expenses_category_id_fkey 
        FOREIGN KEY (category_id) REFERENCES expense_categories(id);
    END IF;
    
    -- Add supplier_id foreign key if suppliers table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'suppliers') THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE table_name = 'expenses' 
            AND constraint_name = 'expenses_supplier_id_fkey'
        ) THEN
            ALTER TABLE expenses ADD CONSTRAINT expenses_supplier_id_fkey 
            FOREIGN KEY (supplier_id) REFERENCES suppliers(id);
        END IF;
    END IF;
    
    -- Add created_by foreign key if users table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE table_name = 'expenses' 
            AND constraint_name = 'expenses_created_by_fkey'
        ) THEN
            ALTER TABLE expenses ADD CONSTRAINT expenses_created_by_fkey 
            FOREIGN KEY (created_by) REFERENCES users(id);
        END IF;
        
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE table_name = 'expenses' 
            AND constraint_name = 'expenses_approved_by_fkey'
        ) THEN
            ALTER TABLE expenses ADD CONSTRAINT expenses_approved_by_fkey 
            FOREIGN KEY (approved_by) REFERENCES users(id);
        END IF;
    END IF;
END $$;

-- Create or replace the expense summary view
DROP VIEW IF EXISTS expense_summary;
CREATE VIEW expense_summary AS
SELECT 
    e.id,
    e.expense_number,
    e.title,
    e.description,
    e.amount,
    e.expense_date,
    e.status,
    e.payment_method,
    e.category, -- Keep old category column
    ec.name as category_name,
    ec.code as category_code,
    COALESCE(u_created.full_name, 'System') as created_by_name,
    u_approved.full_name as approved_by_name,
    s.name as supplier_name,
    e.vendor,
    e.receipt_number,
    e.reference_number,
    e.notes,
    e.created_at,
    e.updated_at,
    e.approved_at
FROM expenses e
LEFT JOIN expense_categories ec ON e.category_id = ec.id
LEFT JOIN users u_created ON e.created_by = u_created.id
LEFT JOIN users u_approved ON e.approved_by = u_approved.id
LEFT JOIN suppliers s ON e.supplier_id = s.id;