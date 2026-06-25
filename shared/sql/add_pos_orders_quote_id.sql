-- Link POS held orders back to originating quotation (quote loaded in POS → order queue → sale).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pos_orders' AND column_name = 'quote_id'
  ) THEN
    ALTER TABLE pos_orders ADD COLUMN quote_id UUID REFERENCES quotations(id) ON DELETE SET NULL;
    CREATE INDEX idx_pos_orders_quote_id ON pos_orders(quote_id) WHERE quote_id IS NOT NULL;
  END IF;
END $$;
