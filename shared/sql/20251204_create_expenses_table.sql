-- Create expenses table
CREATE TABLE expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_number VARCHAR(50) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
    expense_date DATE NOT NULL,
    category VARCHAR(50) NOT NULL CHECK (category IN (
        'OFFICE_SUPPLIES',
        'TRAVEL', 
        'MEALS',
        'FUEL',
        'UTILITIES',
        'MAINTENANCE',
        'MARKETING',
        'EQUIPMENT',
        'SOFTWARE',
        'PROFESSIONAL_SERVICES',
        'ACCOMMODATION',
        'TRAINING',
        'OTHER'
    )),
    vendor VARCHAR(255),
    payment_method VARCHAR(20) NOT NULL CHECK (payment_method IN (
        'CASH',
        'CARD', 
        'BANK_TRANSFER',
        'MOBILE_MONEY',
        'CHEQUE'
    )),
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN (
        'DRAFT',
        'PENDING_APPROVAL',
        'APPROVED',
        'REJECTED',
        'PAID',
        'CANCELLED'
    )),
    receipt_required BOOLEAN NOT NULL DEFAULT false,
    notes TEXT,
    created_by UUID NOT NULL REFERENCES users(id),
    updated_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for efficient queries
CREATE INDEX idx_expenses_expense_number ON expenses(expense_number);
CREATE INDEX idx_expenses_expense_date ON expenses(expense_date);
CREATE INDEX idx_expenses_category ON expenses(category);
CREATE INDEX idx_expenses_status ON expenses(status);
CREATE INDEX idx_expenses_created_by ON expenses(created_by);
CREATE INDEX idx_expenses_deleted_at ON expenses(deleted_at);

-- Composite indexes for common queries
CREATE INDEX idx_expenses_status_date ON expenses(status, expense_date);
CREATE INDEX idx_expenses_category_date ON expenses(category, expense_date);
CREATE INDEX idx_expenses_created_by_status ON expenses(created_by, status);

-- Full-text search index for title, description, and vendor
CREATE INDEX idx_expenses_search ON expenses 
USING gin(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce(vendor, '')))
WHERE deleted_at IS NULL;

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_expenses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trigger_expenses_updated_at
    BEFORE UPDATE ON expenses
    FOR EACH ROW
    EXECUTE FUNCTION update_expenses_updated_at();

-- Insert some sample expense categories data (for testing)
-- This would typically be populated by the application
COMMENT ON TABLE expenses IS 'Expense tracking table with approval workflow and document attachments';
COMMENT ON COLUMN expenses.expense_number IS 'Auto-generated business identifier (EXP-YYYYMM-####)';
COMMENT ON COLUMN expenses.receipt_required IS 'Whether receipt attachment is required based on category/amount rules';
COMMENT ON COLUMN expenses.status IS 'Workflow status: DRAFT -> PENDING_APPROVAL -> APPROVED -> PAID';
COMMENT ON COLUMN expenses.amount IS 'Expense amount in base currency with 2 decimal precision';
COMMENT ON COLUMN expenses.expense_date IS 'Date when expense was incurred (not created date)';