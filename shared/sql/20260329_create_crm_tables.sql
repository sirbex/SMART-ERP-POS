-- CRM Module Migration
-- Creates leads, opportunities, opportunity_items, activities, opportunity_documents tables
-- Safe to run multiple times (idempotent)

-- ============================================================================
-- LEADS
-- ============================================================================
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  source TEXT,
  notes TEXT,
  status TEXT CHECK (status IN ('NEW','CONTACTED','QUALIFIED','CONVERTED','LOST')) DEFAULT 'NEW',
  converted_customer_id UUID REFERENCES customers(id),
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);

-- ============================================================================
-- OPPORTUNITIES
-- ============================================================================
CREATE TABLE IF NOT EXISTS opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id),
  lead_id UUID REFERENCES leads(id),
  title TEXT NOT NULL,
  tender_ref TEXT,
  procuring_entity TEXT,
  deadline DATE,
  estimated_value NUMERIC(18,2),
  probability INT CHECK (probability BETWEEN 0 AND 100) DEFAULT 0,
  status TEXT CHECK (status IN ('OPEN','BIDDING','SUBMITTED','WON','LOST')) DEFAULT 'OPEN',
  assigned_to UUID,
  won_at TIMESTAMPTZ,
  lost_reason TEXT,
  quotation_id UUID,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT chk_opportunity_owner CHECK (
    (lead_id IS NOT NULL) OR (customer_id IS NOT NULL)
  ),
  CONSTRAINT chk_won_requires_quotation CHECK (
    (status != 'WON') OR (quotation_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_opportunities_status ON opportunities(status);
CREATE INDEX IF NOT EXISTS idx_opportunities_customer ON opportunities(customer_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_assigned ON opportunities(assigned_to);
CREATE INDEX IF NOT EXISTS idx_opportunities_deadline ON opportunities(deadline);

-- ============================================================================
-- OPPORTUNITY ITEMS (line items for bid/tender)
-- ============================================================================
CREATE TABLE IF NOT EXISTS opportunity_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  description TEXT,
  quantity NUMERIC(18,4),
  estimated_price NUMERIC(18,2),
  line_total NUMERIC(18,2),
  sort_order INT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_opportunity_items_opp ON opportunity_items(opportunity_id);

-- ============================================================================
-- ACTIVITIES (calls, meetings, emails, notes)
-- ============================================================================
CREATE TABLE IF NOT EXISTS activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID REFERENCES opportunities(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT,
  notes TEXT,
  activity_date TIMESTAMPTZ,
  due_date TIMESTAMPTZ,
  completed BOOLEAN DEFAULT false,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT chk_activity_parent CHECK (
    (opportunity_id IS NOT NULL) OR (lead_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_activities_opp ON activities(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_activities_lead ON activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_activities_date ON activities(activity_date DESC);
CREATE INDEX IF NOT EXISTS idx_activities_due ON activities(due_date) WHERE NOT completed;

-- ============================================================================
-- OPPORTUNITY DOCUMENTS (tender docs, bids, attachments)
-- ============================================================================
CREATE TABLE IF NOT EXISTS opportunity_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size INT,
  mime_type TEXT,
  uploaded_by UUID,
  uploaded_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_opp_docs_opp ON opportunity_documents(opportunity_id);

-- ============================================================================
-- EXTEND audit_log entity_type CHECK to include CRM types
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audit_log_entity_type_check'
  ) THEN
    ALTER TABLE audit_log DROP CONSTRAINT audit_log_entity_type_check;
  END IF;
  ALTER TABLE audit_log ADD CONSTRAINT audit_log_entity_type_check CHECK (
    entity_type IN (
      'SALE','INVOICE','PAYMENT','PRODUCT','CUSTOMER','SUPPLIER','USER',
      'PURCHASE_ORDER','GOODS_RECEIPT','INVENTORY_ADJUSTMENT','BATCH',
      'PRICING','SETTINGS','REPORT','SYSTEM',
      'LEAD','OPPORTUNITY','ACTIVITY','OPPORTUNITY_DOCUMENT'
    )
  );
END $$;
