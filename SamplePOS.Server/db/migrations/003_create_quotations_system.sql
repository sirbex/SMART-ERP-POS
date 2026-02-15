-- Migration: 003 - Create Quotations System
-- Description: Creates tables for quotation management (both POS quick quotes and standard quotes)
-- Author: System
-- Date: 2025-11-24

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

CREATE TYPE quotation_status AS ENUM (
  'DRAFT',
  'SENT',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
  'CONVERTED',
  'CANCELLED'
);

CREATE TYPE quote_type AS ENUM (
  'quick',      -- POS quick quotes (simple cart save)
  'standard'    -- Full quotations with terms and conditions
);

CREATE TYPE quote_item_type AS ENUM (
  'product',    -- Regular inventory product
  'service',    -- Service item
  'custom'      -- Custom line item
);

-- ============================================================================
-- MAIN QUOTATIONS TABLE
-- ============================================================================

CREATE TABLE quotations (
  -- Identity
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number VARCHAR(50) UNIQUE NOT NULL,
  quote_type quote_type NOT NULL DEFAULT 'standard',
  
  -- Customer Information (supports both registered and walk-in)
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  customer_name VARCHAR(255),
  customer_phone VARCHAR(50),
  customer_email VARCHAR(255),
  
  -- Quote Details
  reference VARCHAR(255),
  description TEXT,
  
  -- Financial Totals
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  
  -- Status & Validity
  status quotation_status NOT NULL DEFAULT 'DRAFT',
  valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until DATE NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '30 days'),
  
  -- Conversion Tracking (links to sale and invoice when converted)
  converted_to_sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
  converted_to_invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  converted_at TIMESTAMP,
  
  -- Workflow
  created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_to_id UUID REFERENCES users(id) ON DELETE SET NULL,
  terms_and_conditions TEXT,
  payment_terms VARCHAR(500),
  delivery_terms VARCHAR(500),
  internal_notes TEXT,
  rejection_reason TEXT,
  
  -- Approval Workflow (for standard quotes requiring approval)
  requires_approval BOOLEAN NOT NULL DEFAULT FALSE,
  approved_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMP,
  
  -- Revision Support (for quote versioning)
  parent_quote_id UUID REFERENCES quotations(id) ON DELETE SET NULL,
  revision_number INTEGER NOT NULL DEFAULT 1,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT valid_dates CHECK (valid_until >= valid_from),
  CONSTRAINT customer_info_required CHECK (
    customer_id IS NOT NULL OR 
    customer_name IS NOT NULL
  )
);

-- ============================================================================
-- QUOTATION ITEMS TABLE
-- ============================================================================

CREATE TABLE quotation_items (
  -- Identity
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL,
  
  -- Item Details
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  item_type quote_item_type NOT NULL DEFAULT 'product',
  sku VARCHAR(100),
  description VARCHAR(500) NOT NULL,
  notes TEXT,
  
  -- Pricing
  quantity NUMERIC(10, 3) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
  
  -- Tax
  is_taxable BOOLEAN NOT NULL DEFAULT TRUE,
  tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  line_total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  
  -- UOM Support (for proper unit tracking)
  uom_id UUID REFERENCES uoms(id) ON DELETE SET NULL,
  uom_name VARCHAR(50),
  
  -- Cost Tracking (for margin analysis)
  unit_cost NUMERIC(12, 2),
  cost_total NUMERIC(12, 2),
  
  -- Product Type (for services vs inventory)
  product_type VARCHAR(50) NOT NULL DEFAULT 'inventory',
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT positive_quantity CHECK (quantity > 0),
  CONSTRAINT positive_unit_price CHECK (unit_price >= 0),
  CONSTRAINT positive_discount CHECK (discount_amount >= 0),
  UNIQUE (quotation_id, line_number)
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Quotations indexes
CREATE INDEX idx_quotations_quote_number ON quotations(quote_number);
CREATE INDEX idx_quotations_customer_id ON quotations(customer_id);
CREATE INDEX idx_quotations_status ON quotations(status);
CREATE INDEX idx_quotations_quote_type ON quotations(quote_type);
CREATE INDEX idx_quotations_created_by ON quotations(created_by_id);
CREATE INDEX idx_quotations_assigned_to ON quotations(assigned_to_id);
CREATE INDEX idx_quotations_valid_until ON quotations(valid_until);
CREATE INDEX idx_quotations_created_at ON quotations(created_at DESC);
CREATE INDEX idx_quotations_converted_sale ON quotations(converted_to_sale_id);
CREATE INDEX idx_quotations_converted_invoice ON quotations(converted_to_invoice_id);

-- Composite indexes for common queries
CREATE INDEX idx_quotations_status_type ON quotations(status, quote_type);
CREATE INDEX idx_quotations_customer_status ON quotations(customer_id, status);
CREATE INDEX idx_quotations_expiry_check ON quotations(status, valid_until) 
  WHERE status NOT IN ('CONVERTED', 'CANCELLED', 'EXPIRED');

-- Full-text search support
CREATE INDEX idx_quotations_search ON quotations 
  USING gin(to_tsvector('english', 
    COALESCE(quote_number, '') || ' ' || 
    COALESCE(customer_name, '') || ' ' ||
    COALESCE(reference, '')
  ));

-- Quotation items indexes
CREATE INDEX idx_quotation_items_quotation_id ON quotation_items(quotation_id);
CREATE INDEX idx_quotation_items_product_id ON quotation_items(product_id);
CREATE INDEX idx_quotation_items_line_number ON quotation_items(quotation_id, line_number);

-- ============================================================================
-- AUTO-INCREMENT SEQUENCE FOR QUOTE NUMBERS
-- ============================================================================

CREATE SEQUENCE quotation_number_seq START 1;

-- ============================================================================
-- TRIGGER: Auto-generate quote number
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_quote_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.quote_number IS NULL THEN
    NEW.quote_number := 'QUOTE-' || 
                        TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || 
                        LPAD(NEXTVAL('quotation_number_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_generate_quote_number
  BEFORE INSERT ON quotations
  FOR EACH ROW
  EXECUTE FUNCTION generate_quote_number();

-- ============================================================================
-- TRIGGER: Update timestamp
-- ============================================================================

CREATE TRIGGER trg_quotations_updated_at
  BEFORE UPDATE ON quotations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- TRIGGER: Auto-expire quotes
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_expire_quotes()
RETURNS void AS $$
BEGIN
  UPDATE quotations
  SET status = 'EXPIRED'::quotation_status,
      updated_at = NOW()
  WHERE valid_until < CURRENT_DATE
    AND status NOT IN ('CONVERTED', 'CANCELLED', 'EXPIRED', 'REJECTED');
END;
$$ LANGUAGE plpgsql;

-- Schedule auto-expire to run daily (setup via pg_cron or application scheduler)
COMMENT ON FUNCTION auto_expire_quotes() IS 
  'Run daily to automatically expire quotes past their valid_until date';

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE quotations IS 
  'Stores both POS quick quotes (cart saves) and standard customer quotations';

COMMENT ON COLUMN quotations.quote_type IS 
  'quick = POS cart save, standard = formal customer quotation';

COMMENT ON COLUMN quotations.customer_id IS 
  'Links to registered customer, NULL for walk-in customers';

COMMENT ON COLUMN quotations.customer_name IS 
  'Required for walk-in customers when customer_id IS NULL';

COMMENT ON COLUMN quotations.converted_to_sale_id IS 
  'Links to sale created from this quote (hybrid integration)';

COMMENT ON COLUMN quotations.converted_to_invoice_id IS 
  'Links to invoice created from this quote (hybrid integration)';

COMMENT ON TABLE quotation_items IS 
  'Line items for quotations, supports products, services, and custom items';

-- ============================================================================
-- SAMPLE DATA (Optional - for testing)
-- ============================================================================

-- Example: Create a quick quote from POS
-- INSERT INTO quotations (quote_type, customer_name, customer_phone, total_amount, valid_from, valid_until)
-- VALUES ('quick', 'John Doe', '0700123456', 150000.00, CURRENT_DATE, CURRENT_DATE + 30);

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
BEGIN
  -- Verify tables exist
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'quotations') THEN
    RAISE EXCEPTION 'quotations table not created';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'quotation_items') THEN
    RAISE EXCEPTION 'quotation_items table not created';
  END IF;
  
  -- Verify types exist
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'quotation_status') THEN
    RAISE EXCEPTION 'quotation_status enum not created';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'quote_type') THEN
    RAISE EXCEPTION 'quote_type enum not created';
  END IF;
  
  RAISE NOTICE 'Quotations system migration completed successfully';
END $$;
