-- Migration 500: Wholesale Delivery Notes System
-- SAP-style dual-flow: Retail (Quotation → Sale → Invoice) vs Wholesale (Quotation → DN → Invoice)
-- Date: 2026
-- CRITICAL: Does NOT modify existing retail flow

-- ============================================================================
-- PART 1: ADD fulfillment_mode TO QUOTATIONS
-- ============================================================================

-- RETAIL = existing flow (Quotation → Sale → Invoice)
-- WHOLESALE = new flow (Quotation → Delivery Note(s) → Invoice)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quotations' AND column_name = 'fulfillment_mode'
  ) THEN
    ALTER TABLE quotations ADD COLUMN fulfillment_mode VARCHAR(20) NOT NULL DEFAULT 'RETAIL';
  END IF;
END $$;

-- ============================================================================
-- PART 2: ADD delivered_quantity TO QUOTATION_ITEMS
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quotation_items' AND column_name = 'delivered_quantity'
  ) THEN
    ALTER TABLE quotation_items ADD COLUMN delivered_quantity NUMERIC(12,4) NOT NULL DEFAULT 0;
  END IF;
END $$;

-- ============================================================================
-- PART 3: ADD DELIVERY movement type to enum
-- ============================================================================

-- PostgreSQL enums can add values but not remove them.
-- Safe to run multiple times: DO block checks before adding.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'DELIVERY'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'movement_type')
  ) THEN
    ALTER TYPE movement_type ADD VALUE IF NOT EXISTS 'DELIVERY';
  END IF;
END $$;

-- ============================================================================
-- PART 4: DELIVERY NOTE STATUS ENUM
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE delivery_note_status AS ENUM (
    'DRAFT',    -- Being prepared, editable
    'POSTED'    -- Stock moved, immutable
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- PART 5: DELIVERY NOTES TABLE
-- ============================================================================

CREATE SEQUENCE IF NOT EXISTS delivery_notes_seq START 1;

CREATE TABLE IF NOT EXISTS delivery_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_note_number VARCHAR(50) UNIQUE NOT NULL,

  -- Link to quotation (the "sales order")
  quotation_id UUID NOT NULL REFERENCES quotations(id) ON DELETE RESTRICT,

  -- Customer (denormalized from quotation for query convenience)
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  customer_name VARCHAR(255),

  -- Status
  status delivery_note_status NOT NULL DEFAULT 'DRAFT',

  -- Logistics
  delivery_date DATE NOT NULL DEFAULT CURRENT_DATE,
  warehouse_notes TEXT,
  delivery_address TEXT,
  driver_name VARCHAR(255),
  vehicle_number VARCHAR(100),

  -- Totals (calculated from lines)
  total_amount NUMERIC(15,2) NOT NULL DEFAULT 0,

  -- Posting metadata
  posted_at TIMESTAMPTZ,
  posted_by_id UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Audit
  created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PART 6: DELIVERY NOTE LINES
-- ============================================================================

CREATE TABLE IF NOT EXISTS delivery_note_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_note_id UUID NOT NULL REFERENCES delivery_notes(id) ON DELETE CASCADE,

  -- Link back to quotation item (for delivered_quantity tracking)
  quotation_item_id UUID NOT NULL REFERENCES quotation_items(id) ON DELETE RESTRICT,

  -- Product / batch
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  batch_id UUID REFERENCES inventory_batches(id) ON DELETE RESTRICT,

  -- UOM
  uom_id UUID,
  uom_name VARCHAR(50),

  -- Quantity & pricing (from quotation item)
  quantity_delivered NUMERIC(12,4) NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Cost (for COGS at invoice time)
  unit_cost NUMERIC(12,2),

  -- Description (denormalized)
  description VARCHAR(500),

  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT positive_delivery_qty CHECK (quantity_delivered > 0)
);

-- ============================================================================
-- PART 7: ADD delivery_note_id TO INVOICES (for wholesale invoicing path)
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'delivery_note_id'
  ) THEN
    -- Note: invoices table uses PascalCase column names (EF Core legacy)
    -- But we add snake_case for new columns added by our Node.js system
    ALTER TABLE invoices ADD COLUMN delivery_note_id UUID REFERENCES delivery_notes(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================================
-- PART 8: AUTO-NUMBERING TRIGGER FOR DELIVERY NOTES
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_delivery_note_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.delivery_note_number IS NULL OR NEW.delivery_note_number = '' THEN
    NEW.delivery_note_number := 'DN-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' ||
                                LPAD(nextval('delivery_notes_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_delivery_note_number ON delivery_notes;
CREATE TRIGGER trg_generate_delivery_note_number
  BEFORE INSERT ON delivery_notes
  FOR EACH ROW
  EXECUTE FUNCTION generate_delivery_note_number();

-- ============================================================================
-- PART 9: IMMUTABILITY TRIGGER (no edits after POSTED)
-- ============================================================================

CREATE OR REPLACE FUNCTION prevent_posted_delivery_note_edit()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'POSTED' THEN
    RAISE EXCEPTION 'Cannot modify a POSTED delivery note (DN %)', OLD.delivery_note_number;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_immutable_posted_delivery_note ON delivery_notes;
CREATE TRIGGER trg_immutable_posted_delivery_note
  BEFORE UPDATE OR DELETE ON delivery_notes
  FOR EACH ROW
  EXECUTE FUNCTION prevent_posted_delivery_note_edit();

-- Immutability for lines: cannot change lines of a POSTED DN
CREATE OR REPLACE FUNCTION prevent_posted_dn_line_edit()
RETURNS TRIGGER AS $$
DECLARE
  dn_status delivery_note_status;
BEGIN
  -- For INSERT/UPDATE use NEW.delivery_note_id, for DELETE use OLD
  IF TG_OP = 'DELETE' THEN
    SELECT status INTO dn_status FROM delivery_notes WHERE id = OLD.delivery_note_id;
  ELSE
    SELECT status INTO dn_status FROM delivery_notes WHERE id = NEW.delivery_note_id;
  END IF;

  IF dn_status = 'POSTED' THEN
    RAISE EXCEPTION 'Cannot modify lines of a POSTED delivery note';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_immutable_posted_dn_lines ON delivery_note_lines;
CREATE TRIGGER trg_immutable_posted_dn_lines
  BEFORE INSERT OR UPDATE OR DELETE ON delivery_note_lines
  FOR EACH ROW
  EXECUTE FUNCTION prevent_posted_dn_line_edit();

-- ============================================================================
-- PART 10: INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_delivery_notes_quotation ON delivery_notes(quotation_id);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_customer ON delivery_notes(customer_id);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_status ON delivery_notes(status);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_date ON delivery_notes(delivery_date);
CREATE INDEX IF NOT EXISTS idx_delivery_note_lines_dn ON delivery_note_lines(delivery_note_id);
CREATE INDEX IF NOT EXISTS idx_delivery_note_lines_qi ON delivery_note_lines(quotation_item_id);
CREATE INDEX IF NOT EXISTS idx_delivery_note_lines_product ON delivery_note_lines(product_id);
CREATE INDEX IF NOT EXISTS idx_delivery_note_lines_batch ON delivery_note_lines(batch_id);
CREATE INDEX IF NOT EXISTS idx_invoices_delivery_note ON invoices(delivery_note_id);
CREATE INDEX IF NOT EXISTS idx_quotations_fulfillment ON quotations(fulfillment_mode);
