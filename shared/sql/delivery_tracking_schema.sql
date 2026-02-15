-- Delivery Tracking System Schema
-- Phase 2: Complete delivery management and tracking system
-- Date: November 30, 2025

-- ====================================================
-- DELIVERY TRACKING TABLES
-- ====================================================

-- Main delivery orders table
CREATE TABLE delivery_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_number VARCHAR(50) UNIQUE NOT NULL, -- DEL-2025-0001
    
    -- Related entities
    sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
    invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE RESTRICT,
    
    -- Delivery details
    delivery_date DATE NOT NULL,
    expected_delivery_time TIME,
    actual_delivery_time TIME,
    delivery_address TEXT NOT NULL,
    delivery_contact_name VARCHAR(255),
    delivery_contact_phone VARCHAR(50),
    special_instructions TEXT,
    
    -- Status tracking
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    -- PENDING, ASSIGNED, IN_TRANSIT, DELIVERED, FAILED, CANCELLED
    
    -- Driver assignment
    assigned_driver_id UUID REFERENCES users(id) ON DELETE SET NULL,
    assigned_at TIMESTAMPTZ,
    
    -- Tracking information
    tracking_number VARCHAR(100) UNIQUE,
    estimated_distance_km DECIMAL(8,2),
    actual_distance_km DECIMAL(8,2),
    
    -- Financial
    delivery_fee DECIMAL(10,2) DEFAULT 0.00,
    fuel_cost DECIMAL(10,2),
    total_cost DECIMAL(10,2),
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ,
    
    -- Audit
    created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by_id UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Delivery items table (what's being delivered)
CREATE TABLE delivery_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_order_id UUID NOT NULL REFERENCES delivery_orders(id) ON DELETE CASCADE,
    
    -- Product information
    product_id UUID REFERENCES products(id) ON DELETE RESTRICT,
    product_name VARCHAR(255) NOT NULL,
    product_code VARCHAR(100),
    
    -- Quantity tracking
    quantity_requested DECIMAL(12,3) NOT NULL,
    quantity_delivered DECIMAL(12,3) DEFAULT 0,
    unit_of_measure VARCHAR(50),
    
    -- Batch tracking (for FEFO compliance)
    batch_id UUID REFERENCES inventory_batches(id) ON DELETE SET NULL,
    batch_number VARCHAR(100),
    expiry_date DATE,
    
    -- Item condition
    condition_on_delivery VARCHAR(50) DEFAULT 'GOOD',
    -- GOOD, DAMAGED, MISSING, PARTIAL
    damage_notes TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Delivery status history for tracking
CREATE TABLE delivery_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_order_id UUID NOT NULL REFERENCES delivery_orders(id) ON DELETE CASCADE,
    
    -- Status change details
    old_status VARCHAR(50),
    new_status VARCHAR(50) NOT NULL,
    status_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    
    -- Location tracking
    latitude DECIMAL(10,8),
    longitude DECIMAL(11,8),
    location_name VARCHAR(255),
    
    -- Notes and context
    notes TEXT,
    photo_url VARCHAR(500),
    
    -- User who made the change
    changed_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Delivery routes for optimization
CREATE TABLE delivery_routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_name VARCHAR(255) NOT NULL,
    
    -- Driver and vehicle
    driver_id UUID REFERENCES users(id) ON DELETE SET NULL,
    vehicle_id VARCHAR(100),
    vehicle_plate_number VARCHAR(50),
    
    -- Route details
    route_date DATE NOT NULL,
    planned_start_time TIME,
    actual_start_time TIME,
    planned_end_time TIME,
    actual_end_time TIME,
    
    -- Route optimization
    total_distance_km DECIMAL(8,2),
    total_fuel_cost DECIMAL(10,2),
    route_efficiency_score DECIMAL(5,2), -- 0-100
    
    -- Status
    status VARCHAR(50) DEFAULT 'PLANNED',
    -- PLANNED, IN_PROGRESS, COMPLETED, CANCELLED
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by_id UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Route deliveries (many-to-many)
CREATE TABLE route_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id UUID NOT NULL REFERENCES delivery_routes(id) ON DELETE CASCADE,
    delivery_order_id UUID NOT NULL REFERENCES delivery_orders(id) ON DELETE CASCADE,
    
    -- Sequence in route
    delivery_sequence INTEGER NOT NULL,
    estimated_arrival_time TIME,
    actual_arrival_time TIME,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(route_id, delivery_order_id),
    UNIQUE(route_id, delivery_sequence)
);

-- Delivery proof (signatures, photos)
CREATE TABLE delivery_proof (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_order_id UUID NOT NULL REFERENCES delivery_orders(id) ON DELETE CASCADE,
    
    -- Proof details
    proof_type VARCHAR(50) NOT NULL,
    -- SIGNATURE, PHOTO, ID_VERIFICATION, SMS_CONFIRMATION
    proof_data TEXT, -- Base64 encoded data or URL
    recipient_name VARCHAR(255),
    recipient_relationship VARCHAR(100), -- CUSTOMER, EMPLOYEE, NEIGHBOR, etc.
    
    -- Verification
    verified_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    verified_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ====================================================
-- INDEXES FOR PERFORMANCE
-- ====================================================

-- Primary lookup indexes
CREATE INDEX idx_delivery_orders_delivery_number ON delivery_orders(delivery_number);
CREATE INDEX idx_delivery_orders_tracking_number ON delivery_orders(tracking_number);
CREATE INDEX idx_delivery_orders_status ON delivery_orders(status);
CREATE INDEX idx_delivery_orders_delivery_date ON delivery_orders(delivery_date);
CREATE INDEX idx_delivery_orders_customer_id ON delivery_orders(customer_id);
CREATE INDEX idx_delivery_orders_driver_id ON delivery_orders(assigned_driver_id);

-- Foreign key indexes
CREATE INDEX idx_delivery_items_delivery_order_id ON delivery_items(delivery_order_id);
CREATE INDEX idx_delivery_items_product_id ON delivery_items(product_id);
CREATE INDEX idx_delivery_items_batch_id ON delivery_items(batch_id);

-- Status history indexes
CREATE INDEX idx_delivery_status_history_delivery_order_id ON delivery_status_history(delivery_order_id);
CREATE INDEX idx_delivery_status_history_status_date ON delivery_status_history(status_date);

-- Route indexes
CREATE INDEX idx_delivery_routes_driver_id ON delivery_routes(driver_id);
CREATE INDEX idx_delivery_routes_route_date ON delivery_routes(route_date);
CREATE INDEX idx_route_deliveries_route_id ON route_deliveries(route_id);
CREATE INDEX idx_route_deliveries_delivery_order_id ON route_deliveries(delivery_order_id);

-- Proof indexes
CREATE INDEX idx_delivery_proof_delivery_order_id ON delivery_proof(delivery_order_id);

-- ====================================================
-- BUSINESS RULES & CONSTRAINTS
-- ====================================================

-- Ensure delivery numbers follow pattern DEL-YYYY-NNNN
ALTER TABLE delivery_orders ADD CONSTRAINT chk_delivery_number_format 
    CHECK (delivery_number ~ '^DEL-[0-9]{4}-[0-9]{4}$');

-- Valid status values
ALTER TABLE delivery_orders ADD CONSTRAINT chk_delivery_status 
    CHECK (status IN ('PENDING', 'ASSIGNED', 'IN_TRANSIT', 'DELIVERED', 'FAILED', 'CANCELLED'));

-- Valid condition values
ALTER TABLE delivery_items ADD CONSTRAINT chk_item_condition 
    CHECK (condition_on_delivery IN ('GOOD', 'DAMAGED', 'MISSING', 'PARTIAL'));

-- Valid route status
ALTER TABLE delivery_routes ADD CONSTRAINT chk_route_status 
    CHECK (status IN ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'));

-- Valid proof types
ALTER TABLE delivery_proof ADD CONSTRAINT chk_proof_type 
    CHECK (proof_type IN ('SIGNATURE', 'PHOTO', 'ID_VERIFICATION', 'SMS_CONFIRMATION'));

-- Ensure quantities are positive
ALTER TABLE delivery_items ADD CONSTRAINT chk_positive_quantities 
    CHECK (quantity_requested > 0 AND quantity_delivered >= 0);

-- Ensure delivered quantity doesn't exceed requested
ALTER TABLE delivery_items ADD CONSTRAINT chk_delivery_quantity_limit 
    CHECK (quantity_delivered <= quantity_requested);

-- ====================================================
-- TRIGGERS FOR AUDIT AND AUTOMATION
-- ====================================================

-- Update timestamps trigger
CREATE OR REPLACE FUNCTION update_delivery_timestamps()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_delivery_orders_update_timestamp
    BEFORE UPDATE ON delivery_orders
    FOR EACH ROW
    EXECUTE FUNCTION update_delivery_timestamps();

CREATE TRIGGER trg_delivery_items_update_timestamp
    BEFORE UPDATE ON delivery_items
    FOR EACH ROW
    EXECUTE FUNCTION update_delivery_timestamps();

CREATE TRIGGER trg_delivery_routes_update_timestamp
    BEFORE UPDATE ON delivery_routes
    FOR EACH ROW
    EXECUTE FUNCTION update_delivery_timestamps();

-- Auto-generate tracking number if not provided
CREATE OR REPLACE FUNCTION generate_tracking_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.tracking_number IS NULL THEN
        NEW.tracking_number = 'TRK-' || EXTRACT(YEAR FROM CURRENT_DATE) || '-' || 
                             LPAD(EXTRACT(DOY FROM CURRENT_DATE)::TEXT, 3, '0') || '-' ||
                             LPAD((EXTRACT(EPOCH FROM CURRENT_TIMESTAMP) % 86400)::INTEGER::TEXT, 5, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_generate_tracking_number
    BEFORE INSERT ON delivery_orders
    FOR EACH ROW
    EXECUTE FUNCTION generate_tracking_number();

-- Auto-create status history entry on status change
CREATE OR REPLACE FUNCTION track_delivery_status_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Only track if status actually changed
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO delivery_status_history (
            delivery_order_id,
            old_status,
            new_status,
            changed_by_id,
            notes
        ) VALUES (
            NEW.id,
            OLD.status,
            NEW.status,
            NEW.updated_by_id,
            'Status changed from ' || COALESCE(OLD.status, 'NULL') || ' to ' || NEW.status
        );
        
        -- Set completion timestamp when delivered
        IF NEW.status = 'DELIVERED' THEN
            NEW.completed_at = CURRENT_TIMESTAMP;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_track_delivery_status_change
    AFTER UPDATE ON delivery_orders
    FOR EACH ROW
    EXECUTE FUNCTION track_delivery_status_change();

-- ====================================================
-- INITIAL DATA SETUP
-- ====================================================

-- Create delivery user role if not exists
INSERT INTO user_roles (id, role_name, description, permissions)
SELECT 
    gen_random_uuid(),
    'DELIVERY_DRIVER',
    'Delivery driver with access to delivery management',
    ARRAY['delivery:read', 'delivery:update_status', 'delivery:proof']
ON CONFLICT (role_name) DO NOTHING;

-- Add delivery permissions to existing admin role
UPDATE user_roles 
SET permissions = permissions || ARRAY['delivery:create', 'delivery:read', 'delivery:update', 'delivery:delete', 'delivery:assign', 'delivery:route']
WHERE role_name = 'ADMIN' AND NOT permissions @> ARRAY['delivery:create'];

-- Add delivery permissions to manager role
UPDATE user_roles 
SET permissions = permissions || ARRAY['delivery:create', 'delivery:read', 'delivery:update', 'delivery:assign', 'delivery:route']
WHERE role_name = 'MANAGER' AND NOT permissions @> ARRAY['delivery:create'];

COMMIT;