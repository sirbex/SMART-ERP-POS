-- 569: Restaurant VOID tickets — cancel/void after KOT notifies kitchen (no prices).

ALTER TABLE restaurant_kot
  ADD COLUMN IF NOT EXISTS ticket_kind VARCHAR(10) NOT NULL DEFAULT 'FIRE';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_restaurant_kot_ticket_kind'
  ) THEN
    ALTER TABLE restaurant_kot
      ADD CONSTRAINT chk_restaurant_kot_ticket_kind
      CHECK (ticket_kind IN ('FIRE', 'VOID'));
  END IF;
END $$;

COMMENT ON COLUMN restaurant_kot.ticket_kind IS
  'FIRE = send to cook; VOID = cancel previously fired lines (kitchen must stop / discard)';
