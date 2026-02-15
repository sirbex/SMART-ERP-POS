-- Migration 004: Quotation System (Hybrid Integration)
-- Creates quote system that integrates with existing sales/invoices
-- Date: November 23, 2025
-- CRITICAL: Does NOT modify existing tables structure

-- ============================================================================
-- PART 1: QUOTATION TYPES AND SEQUENCES
-- ============================================================================

-- Quote status enum
DO $$ BEGIN
  CREATE TYPE quotation_status AS ENUM (
    'DRAFT',           -- Quote being created
    'SENT',            -- Sent to customer
    'ACCEPTED',        -- Customer accepted (pending conversion)
    'REJECTED',        -- Customer declined
    'EXPIRED',         -- Past validity date
    'CONVERTED',       -- Converted to sale+invoice
    'CANCELLED'        -- Manually cancelled
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Quote type enum
DO $$ BEGIN
  CREATE TYPE quote_type AS ENUM (
    'quick',           -- Quick quote from POS
    'standard'         -- Detailed quote from module
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Sequence for quote numbering
CREATE SEQUENCE IF NOT EXISTS quotations_seq START 1;

-- ============================================================================
-- PART 2: MAIN QUOTATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS quotations (
  -- Primary identification
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number VARCHAR(50) UNIQUE NOT NULL,
  quote_type quote_type DEFAULT 'standard',
  
  -- Customer information
  customer_id UUID REFERENCES customers(id) ON DELETE RESTRICT,
  customer_name VARCHAR(255),  -- For walk-ins without customer record
  customer_phone VARCHAR(50),
  customer_email VARCHAR(255),
  
  -- Reference and description
  reference VARCHAR(255),  -- Project name, PO reference, etc.
  description TEXT,
  
  -- Financial amounts
  subtotal NUMERIC(15,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(15,2) DEFAULT 0,
  tax_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(15,2) NOT NULL,
  
  -- Status and lifecycle
  status quotation_status DEFAULT 'DRAFT',
  valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until DATE NOT NULL,
  
  -- Conversion tracking (links to existing tables)
  converted_to_sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
  converted_to_invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  converted_at TIMESTAMPTZ,
  
  -- Ownership and assignment
  created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_to_id UUID REFERENCES users(id) ON DELETE SET NULL,  -- Sales rep
  
  -- Terms and conditions
  terms_and_conditions TEXT,
  payment_terms TEXT,
  delivery_terms TEXT,
  
  -- Internal notes (not shown to customer)
  internal_notes TEXT,
  rejection_reason TEXT,  -- Why quote was rejected
  
  -- Approval workflow (for complex quotes)
  requires_approval BOOLEAN DEFAULT FALSE,
  approved_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  
  -- Revision tracking
  parent_quote_id UUID REFERENCES quotations(id) ON DELETE SET NULL,
  revision_number INT DEFAULT 1,
  
  -- Audit timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT valid_amounts CHECK (
    subtotal >= 0 AND 
    discount_amount >= 0 AND 
    tax_amount >= 0 AND 
    total_amount >= 0
  ),
  CONSTRAINT valid_dates CHECK (valid_until >= valid_from),
  CONSTRAINT conversion_complete CHECK (
    (status = 'CONVERTED' AND converted_to_sale_id IS NOT NULL AND converted_at IS NOT NULL)
    OR
    (status != 'CONVERTED')
  )
);

-- ============================================================================
-- PART 3: QUOTATION LINE ITEMS
-- ============================================================================

CREATE TABLE IF NOT EXISTS quotation_items (
  -- Primary identification
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  line_number INT NOT NULL,
  
  -- Product link (optional - may be custom item)
  product_id UUID REFERENCES products(id) ON DELETE RESTRICT,
  
  -- Item details
  item_type VARCHAR(20) NOT NULL DEFAULT 'product',  -- 'product', 'service', 'custom'
  sku VARCHAR(100),
  description VARCHAR(500) NOT NULL,
  notes TEXT,
  
  -- Quantities and pricing
  quantity NUMERIC(12,4) NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL,
  discount_amount NUMERIC(12,2) DEFAULT 0,
  subtotal NUMERIC(12,2) NOT NULL,
  
  -- Tax
  is_taxable BOOLEAN DEFAULT TRUE,
  tax_rate NUMERIC(5,2) DEFAULT 0,
  tax_amount NUMERIC(12,2) DEFAULT 0,
  
  -- Total for this line
  line_total NUMERIC(12,2) NOT NULL,
  
  -- UOM (if product) - Optional, table may not exist yet
  uom_id UUID,
  uom_name VARCHAR(50),
  
  -- Cost tracking (for margin calculations)
  unit_cost NUMERIC(12,2),
  cost_total NUMERIC(12,2),
  
  -- Product type (from products table)
  product_type VARCHAR(20) DEFAULT 'inventory',  -- 'inventory', 'service', 'bundle'
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT valid_quote_item_amounts CHECK (
    quantity > 0 AND 
    unit_price >= 0 AND 
    discount_amount >= 0 AND 
    subtotal >= 0 AND
    line_total >= 0
  ),
  CONSTRAINT unique_line_number UNIQUE (quotation_id, line_number)
);

-- ============================================================================
-- PART 4: QUOTATION STATUS HISTORY
-- ============================================================================

CREATE TABLE IF NOT EXISTS quotation_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  
  -- Status transition
  from_status quotation_status,
  to_status quotation_status NOT NULL,
  
  -- Change details
  notes TEXT,
  changed_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Metadata
  ip_address VARCHAR(50),
  user_agent TEXT
);

-- ============================================================================
-- PART 5: QUOTATION ATTACHMENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS quotation_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  
  -- File details
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  file_size BIGINT,
  mime_type VARCHAR(100),
  
  -- Description
  description TEXT,
  
  -- Audit
  uploaded_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PART 6: QUOTATION EMAIL LOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS quotation_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  
  -- Email details
  recipient_email VARCHAR(255) NOT NULL,
  recipient_name VARCHAR(255),
  subject VARCHAR(500),
  body TEXT,
  
  -- Status
  status VARCHAR(20) DEFAULT 'sent',  -- 'sent', 'failed', 'bounced', 'opened'
  error_message TEXT,
  
  -- Tracking
  opened_at TIMESTAMPTZ,
  
  -- Audit
  sent_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PART 7: ENHANCE EXISTING TABLES (NON-DESTRUCTIVE)
-- ============================================================================

-- Add quote_id to sales table (if not exists)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'sales' AND column_name = 'quote_id'
  ) THEN
    ALTER TABLE sales ADD COLUMN quote_id UUID REFERENCES quotations(id) ON DELETE SET NULL;
    CREATE INDEX idx_sales_quote_id ON sales(quote_id);
  END IF;
END $$;

-- Add quote_id to invoices table (if not exists)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'invoices' AND column_name = 'quote_id'
  ) THEN
    ALTER TABLE invoices ADD COLUMN quote_id UUID REFERENCES quotations(id) ON DELETE SET NULL;
    CREATE INDEX idx_invoices_quote_id ON invoices(quote_id);
  END IF;
END $$;

-- ============================================================================
-- PART 8: INDEXES FOR PERFORMANCE
-- ============================================================================

-- Quotations indexes
CREATE INDEX IF NOT EXISTS idx_quotations_customer ON quotations(customer_id);
CREATE INDEX IF NOT EXISTS idx_quotations_status ON quotations(status);
CREATE INDEX IF NOT EXISTS idx_quotations_created_by ON quotations(created_by_id);
CREATE INDEX IF NOT EXISTS idx_quotations_assigned_to ON quotations(assigned_to_id);
CREATE INDEX IF NOT EXISTS idx_quotations_valid_until ON quotations(valid_until);
CREATE INDEX IF NOT EXISTS idx_quotations_created_at ON quotations(created_at);
CREATE INDEX IF NOT EXISTS idx_quotations_parent ON quotations(parent_quote_id);
CREATE INDEX IF NOT EXISTS idx_quotations_conversion ON quotations(converted_to_sale_id, converted_to_invoice_id);

-- Quotation items indexes (only if table exists)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'quotation_items') THEN
    CREATE INDEX IF NOT EXISTS idx_quotation_items_quote ON quotation_items(quotation_id);
    CREATE INDEX IF NOT EXISTS idx_quotation_items_product ON quotation_items(product_id);
  END IF;
END $$;

-- Status history index
CREATE INDEX IF NOT EXISTS idx_quote_status_history_quote ON quotation_status_history(quotation_id);
CREATE INDEX IF NOT EXISTS idx_quote_status_history_date ON quotation_status_history(changed_at);

-- Attachments index
CREATE INDEX IF NOT EXISTS idx_quote_attachments_quote ON quotation_attachments(quotation_id);

-- Email log index
CREATE INDEX IF NOT EXISTS idx_quote_emails_quote ON quotation_emails(quotation_id);
CREATE INDEX IF NOT EXISTS idx_quote_emails_sent_at ON quotation_emails(sent_at);

-- ============================================================================
-- PART 9: AUTO-NUMBERING TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_quote_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.quote_number IS NULL OR NEW.quote_number = '' THEN
    NEW.quote_number := 'Q-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || 
                        LPAD(nextval('quotations_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_quote_number ON quotations;
CREATE TRIGGER trg_generate_quote_number
  BEFORE INSERT ON quotations
  FOR EACH ROW
  EXECUTE FUNCTION generate_quote_number();

-- ============================================================================
-- PART 10: STATUS HISTORY TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION log_quotation_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO quotation_status_history (
      quotation_id,
      from_status,
      to_status,
      notes,
      changed_by_id
    ) VALUES (
      NEW.id,
      OLD.status,
      NEW.status,
      'Status changed from ' || OLD.status || ' to ' || NEW.status,
      NEW.updated_by_id  -- Assumes updated_by_id tracking
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_log_quote_status_change ON quotations;
CREATE TRIGGER trg_log_quote_status_change
  AFTER UPDATE ON quotations
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION log_quotation_status_change();

-- ============================================================================
-- PART 11: UPDATED_AT TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION update_quotation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_quotation_timestamp ON quotations;
CREATE TRIGGER trg_update_quotation_timestamp
  BEFORE UPDATE ON quotations
  FOR EACH ROW
  EXECUTE FUNCTION update_quotation_timestamp();

-- ============================================================================
-- PART 12: AUTO-EXPIRE QUOTES FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION expire_old_quotations()
RETURNS INTEGER AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  UPDATE quotations
  SET status = 'EXPIRED'
  WHERE status IN ('DRAFT', 'SENT')
    AND valid_until < CURRENT_DATE;
  
  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- Schedule: Run this function daily via cron or application scheduler
COMMENT ON FUNCTION expire_old_quotations() IS 'Automatically expire quotes past their valid_until date. Should be run daily.';

-- ============================================================================
-- PART 13: REPORTING VIEWS
-- ============================================================================

-- Quote conversion metrics view
CREATE OR REPLACE VIEW v_quote_conversion_metrics AS
SELECT 
  DATE_TRUNC('month', created_at) as month,
  COUNT(*) as total_quotes,
  COUNT(*) FILTER (WHERE status = 'CONVERTED') as converted,
  COUNT(*) FILTER (WHERE status = 'REJECTED') as rejected,
  COUNT(*) FILTER (WHERE status = 'EXPIRED') as expired,
  COUNT(*) FILTER (WHERE status IN ('DRAFT', 'SENT')) as pending,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'CONVERTED') / NULLIF(COUNT(*), 0), 2) as conversion_rate,
  SUM(total_amount) FILTER (WHERE status = 'CONVERTED') as converted_value,
  SUM(total_amount) as total_quoted_value
FROM quotations
GROUP BY DATE_TRUNC('month', created_at)
ORDER BY month DESC;

-- Quote aging report
CREATE OR REPLACE VIEW v_quote_aging AS
SELECT 
  q.id,
  q.quote_number,
  q.status,
  q.created_at,
  q.valid_until,
  CURRENT_DATE - q.created_at::DATE as age_days,
  q.valid_until - CURRENT_DATE as days_until_expiry,
  q.total_amount,
  COALESCE(c.name, q.customer_name) as customer_name,
  u.name as created_by_name
FROM quotations q
LEFT JOIN customers c ON c.id = q.customer_id
LEFT JOIN users u ON u.id = q.created_by_id
WHERE q.status IN ('DRAFT', 'SENT', 'ACCEPTED')
ORDER BY q.valid_until;

-- Quote to payment timeline
CREATE OR REPLACE VIEW v_quote_payment_timeline AS
SELECT 
  q.quote_number,
  q.created_at as quote_date,
  q.status as quote_status,
  s.sale_number,
  s.created_at as sale_date,
  i.invoice_number,
  i.issue_date as invoice_date,
  i.status as invoice_status,
  i.total_amount,
  i.amount_paid,
  i.balance,
  (SELECT MIN(payment_date) FROM invoice_payments WHERE invoice_id = i.id) as first_payment_date,
  (SELECT MAX(payment_date) FROM invoice_payments WHERE invoice_id = i.id) as last_payment_date,
  (s.created_at - q.created_at) as quote_to_sale_duration,
  CASE 
    WHEN i.status = 'PAID' THEN 
      (SELECT MAX(payment_date) FROM invoice_payments WHERE invoice_id = i.id) - q.created_at
    ELSE NULL
  END as quote_to_fully_paid_duration
FROM quotations q
LEFT JOIN sales s ON s.quote_id = q.id
LEFT JOIN invoices i ON i.quote_id = q.id
WHERE q.status = 'CONVERTED'
ORDER BY q.created_at DESC;

-- ============================================================================
-- PART 14: COMMENTS AND DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE quotations IS 'Customer quotations - proposals that can be converted to sales and invoices';
COMMENT ON COLUMN quotations.quote_number IS 'Auto-generated unique quote number (Q-YYYY-####)';
COMMENT ON COLUMN quotations.quote_type IS 'quick = POS quick quote, standard = detailed quote from module';
COMMENT ON COLUMN quotations.customer_name IS 'For walk-in customers without customer record';
COMMENT ON COLUMN quotations.converted_to_sale_id IS 'Links to sales.id when quote is converted';
COMMENT ON COLUMN quotations.converted_to_invoice_id IS 'Links to invoices.id when quote is converted';
COMMENT ON COLUMN quotations.parent_quote_id IS 'Links to original quote if this is a revision';

COMMENT ON TABLE quotation_items IS 'Line items for quotations - copied to sale_items on conversion';
COMMENT ON COLUMN quotation_items.item_type IS 'product = from inventory, service = non-inventory, custom = one-off item';

COMMENT ON TABLE quotation_status_history IS 'Audit trail of quote status changes';
COMMENT ON TABLE quotation_attachments IS 'Files attached to quotes (site photos, specs, etc)';
COMMENT ON TABLE quotation_emails IS 'Log of quote emails sent to customers';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Verify migration
DO $$
DECLARE
  quote_count INTEGER := 0;
  item_count INTEGER := 0;
BEGIN
  -- Safe count with error handling
  BEGIN
    SELECT COUNT(*) INTO quote_count FROM quotations;
    SELECT COUNT(*) INTO item_count FROM quotation_items;
  EXCEPTION WHEN OTHERS THEN
    -- Tables might not exist yet, skip
    quote_count := 0;
    item_count := 0;
  END;
  
  RAISE NOTICE 'Quotation system migration completed successfully';
  RAISE NOTICE 'Existing quotes: %, Existing items: %', quote_count, item_count;
  RAISE NOTICE 'Auto-numbering: Q-YYYY-####';
  RAISE NOTICE 'Quote types: quick (POS), standard (module)';
  RAISE NOTICE 'Integration: sales.quote_id and invoices.quote_id columns added';
END $$;
