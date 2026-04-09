-- Migration 501: SAP-style Delivery Picking Flow
-- Adds PICKED status to delivery notes for warehouse pick confirmation
-- Flow: Quotation → DN (DRAFT) → Pick Confirm (PICKED) → Goods Issue/PGI (POSTED) → Invoice
-- Date: 2026-04-09

-- ============================================================================
-- PART 1: ADD 'PICKED' TO delivery_note_status ENUM
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'PICKED'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'delivery_note_status')
  ) THEN
    -- Insert PICKED between DRAFT and POSTED
    ALTER TYPE delivery_note_status ADD VALUE IF NOT EXISTS 'PICKED' BEFORE 'POSTED';
  END IF;
END $$;

-- ============================================================================
-- PART 2: ADD picking metadata columns
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'delivery_notes' AND column_name = 'picked_at'
  ) THEN
    ALTER TABLE delivery_notes ADD COLUMN picked_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'delivery_notes' AND column_name = 'picked_by_id'
  ) THEN
    ALTER TABLE delivery_notes ADD COLUMN picked_by_id UUID REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================================
-- PART 3: UPDATE IMMUTABILITY TRIGGER
-- Block edits after PICKED or POSTED (lines locked after pick confirmation)
-- Only status transitions PICKED→POSTED and DRAFT→PICKED are allowed on the header
-- ============================================================================

CREATE OR REPLACE FUNCTION prevent_posted_delivery_note_edit()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow valid status transitions on header
  IF TG_OP = 'UPDATE' THEN
    -- DRAFT → PICKED (pick confirmation)
    IF OLD.status = 'DRAFT' AND NEW.status = 'PICKED' THEN
      RETURN NEW;
    END IF;
    -- PICKED → POSTED (goods issue / PGI)
    IF OLD.status = 'PICKED' AND NEW.status = 'POSTED' THEN
      RETURN NEW;
    END IF;
    -- DRAFT → POSTED (direct goods issue, backward compat)
    IF OLD.status = 'DRAFT' AND NEW.status = 'POSTED' THEN
      RETURN NEW;
    END IF;
    -- Allow recalc of totals while still DRAFT
    IF OLD.status = 'DRAFT' AND NEW.status = 'DRAFT' THEN
      RETURN NEW;
    END IF;
    -- Allow header-level recalc while PICKED (total recalc before PGI)
    IF OLD.status = 'PICKED' AND NEW.status = 'PICKED' THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Block all other modifications on PICKED or POSTED
  IF OLD.status IN ('PICKED', 'POSTED') THEN
    RAISE EXCEPTION 'Cannot modify a % delivery note (DN %)', OLD.status, OLD.delivery_note_number;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 4: UPDATE LINE IMMUTABILITY TRIGGER
-- Block line edits after DN is PICKED or POSTED
-- ============================================================================

CREATE OR REPLACE FUNCTION prevent_posted_dn_line_edit()
RETURNS TRIGGER AS $$
DECLARE
  dn_status delivery_note_status;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT status INTO dn_status FROM delivery_notes WHERE id = OLD.delivery_note_id;
  ELSE
    SELECT status INTO dn_status FROM delivery_notes WHERE id = NEW.delivery_note_id;
  END IF;

  IF dn_status IN ('PICKED', 'POSTED') THEN
    RAISE EXCEPTION 'Cannot modify lines of a % delivery note', dn_status;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 5: ADD picked_by INDEX
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_delivery_notes_picked_by ON delivery_notes(picked_by_id);
