-- Approval workflow business rules and limits

-- Create approval limits table
CREATE TABLE IF NOT EXISTS approval_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role VARCHAR(50) NOT NULL,
    max_amount DECIMAL(15, 2) NOT NULL,
    requires_additional_approval BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default approval limits
INSERT INTO approval_limits (role, max_amount, requires_additional_approval) VALUES
    ('CASHIER', 100.00, false),
    ('MANAGER', 1000.00, false), 
    ('ADMIN', 10000.00, true)
ON CONFLICT DO NOTHING;

-- Create expense approval rules function
CREATE OR REPLACE FUNCTION check_expense_approval_required(
    expense_amount DECIMAL(15, 2),
    submitter_role VARCHAR(50)
) RETURNS TABLE (
    approval_required BOOLEAN,
    max_amount DECIMAL(15, 2),
    requires_additional BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        (expense_amount > al.max_amount) as approval_required,
        al.max_amount,
        al.requires_additional_approval
    FROM approval_limits al
    WHERE al.role = submitter_role 
      AND al.is_active = true
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Add expense status transition function
CREATE OR REPLACE FUNCTION validate_expense_status_transition(
    current_status VARCHAR(20),
    new_status VARCHAR(20),
    user_role VARCHAR(50)
) RETURNS BOOLEAN AS $$
BEGIN
    -- Draft can go to pending approval or cancelled
    IF current_status = 'DRAFT' THEN
        RETURN new_status IN ('PENDING_APPROVAL', 'CANCELLED');
    END IF;
    
    -- Pending approval can be approved/rejected (by MANAGER/ADMIN) or cancelled
    IF current_status = 'PENDING_APPROVAL' THEN
        IF user_role IN ('MANAGER', 'ADMIN') THEN
            RETURN new_status IN ('APPROVED', 'REJECTED', 'CANCELLED');
        ELSE
            RETURN new_status = 'CANCELLED';
        END IF;
    END IF;
    
    -- Approved can go to paid or cancelled (by ADMIN)
    IF current_status = 'APPROVED' THEN
        IF user_role = 'ADMIN' THEN
            RETURN new_status IN ('PAID', 'CANCELLED');
        ELSE
            RETURN false;
        END IF;
    END IF;
    
    -- Paid and cancelled are final states
    IF current_status IN ('PAID', 'CANCELLED', 'REJECTED') THEN
        RETURN false;
    END IF;
    
    RETURN false;
END;
$$ LANGUAGE plpgsql;