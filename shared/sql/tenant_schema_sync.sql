-- Tenant Schema Sync Migration
-- Applies missing schema objects to tenant databases and pos_template
-- Safe to run multiple times (idempotent)

-- 1. Missing column on invoice_settings
ALTER TABLE invoice_settings ADD COLUMN IF NOT EXISTS show_prices_on_dn_pdf BOOLEAN DEFAULT true;

-- 2. Missing columns on existing tables
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS delivery_note_id UUID;
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS delivered_quantity NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS fulfillment_mode VARCHAR NOT NULL DEFAULT 'RETAIL';

-- 3. Delivery note enum
DO $$ BEGIN
  CREATE TYPE delivery_note_status AS ENUM ('DRAFT', 'POSTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. Sequence for DN numbers
CREATE SEQUENCE IF NOT EXISTS delivery_notes_seq START 1;

-- 5. Trigger functions
CREATE OR REPLACE FUNCTION generate_delivery_note_number() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.delivery_note_number IS NULL OR NEW.delivery_note_number = '' THEN
    NEW.delivery_note_number := 'DN-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(nextval('delivery_notes_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION prevent_posted_delivery_note_edit() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF OLD.status = 'POSTED' THEN
    RAISE EXCEPTION 'Cannot modify a POSTED delivery note (DN %)', OLD.delivery_note_number;
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION prevent_posted_dn_line_edit() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE
  dn_status delivery_note_status;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT status INTO dn_status FROM delivery_notes WHERE id = OLD.delivery_note_id;
  ELSE
    SELECT status INTO dn_status FROM delivery_notes WHERE id = NEW.delivery_note_id;
  END IF;
  IF dn_status = 'POSTED' THEN
    RAISE EXCEPTION 'Cannot modify lines of a POSTED delivery note';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$fn$;

-- 6. Delivery notes tables
CREATE TABLE IF NOT EXISTS delivery_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  delivery_note_number VARCHAR(50) UNIQUE NOT NULL,
  quotation_id UUID NOT NULL REFERENCES quotations(id) ON DELETE RESTRICT,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  customer_name VARCHAR(255),
  status delivery_note_status NOT NULL DEFAULT 'DRAFT',
  delivery_date DATE NOT NULL DEFAULT CURRENT_DATE,
  warehouse_notes TEXT,
  delivery_address TEXT,
  driver_name VARCHAR(255),
  vehicle_number VARCHAR(100),
  total_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  posted_at TIMESTAMPTZ,
  posted_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS delivery_note_lines (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  delivery_note_id UUID NOT NULL REFERENCES delivery_notes(id) ON DELETE CASCADE,
  quotation_item_id UUID NOT NULL REFERENCES quotation_items(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  batch_id UUID REFERENCES inventory_batches(id) ON DELETE RESTRICT,
  uom_id UUID,
  uom_name VARCHAR(50),
  quantity_delivered NUMERIC(12,4) NOT NULL CHECK (quantity_delivered > 0),
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  unit_cost NUMERIC(12,2),
  description VARCHAR(500),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. Indexes
CREATE INDEX IF NOT EXISTS idx_delivery_notes_quotation ON delivery_notes(quotation_id);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_customer ON delivery_notes(customer_id);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_date ON delivery_notes(delivery_date);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_status ON delivery_notes(status);
CREATE INDEX IF NOT EXISTS idx_delivery_note_lines_dn ON delivery_note_lines(delivery_note_id);
CREATE INDEX IF NOT EXISTS idx_delivery_note_lines_product ON delivery_note_lines(product_id);
CREATE INDEX IF NOT EXISTS idx_delivery_note_lines_qi ON delivery_note_lines(quotation_item_id);
CREATE INDEX IF NOT EXISTS idx_delivery_note_lines_batch ON delivery_note_lines(batch_id);

-- 8. Triggers
DROP TRIGGER IF EXISTS trg_generate_delivery_note_number ON delivery_notes;
CREATE TRIGGER trg_generate_delivery_note_number BEFORE INSERT ON delivery_notes FOR EACH ROW EXECUTE FUNCTION generate_delivery_note_number();

DROP TRIGGER IF EXISTS trg_immutable_posted_delivery_note ON delivery_notes;
CREATE TRIGGER trg_immutable_posted_delivery_note BEFORE DELETE OR UPDATE ON delivery_notes FOR EACH ROW EXECUTE FUNCTION prevent_posted_delivery_note_edit();

DROP TRIGGER IF EXISTS trg_immutable_posted_dn_lines ON delivery_note_lines;
CREATE TRIGGER trg_immutable_posted_dn_lines BEFORE INSERT OR DELETE OR UPDATE ON delivery_note_lines FOR EACH ROW EXECUTE FUNCTION prevent_posted_dn_line_edit();

-- 9. FK from invoices to delivery_notes
DO $$ BEGIN
  ALTER TABLE invoices ADD CONSTRAINT invoices_delivery_note_id_fkey FOREIGN KEY (delivery_note_id) REFERENCES delivery_notes(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
