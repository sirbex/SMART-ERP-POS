-- Migration 555: Quotation content_hash unique index — exclude EXPIRED/REJECTED
--
-- BR-QUOTE-012 unique index previously blocked recreation when an EXPIRED or
-- REJECTED quote had the same content_hash. Users only see open quotes, so they
-- report "duplicate error but there is no duplicate" (Henber production).
-- Migration 503 comment said "short window / after cancellation" — terminal
-- statuses must release the hash.

DROP INDEX IF EXISTS idx_quotations_content_hash_open;

CREATE UNIQUE INDEX IF NOT EXISTS idx_quotations_content_hash_open
  ON quotations (content_hash)
  WHERE content_hash IS NOT NULL
    AND status NOT IN ('CONVERTED', 'CANCELLED', 'EXPIRED', 'REJECTED');

INSERT INTO schema_version (version) VALUES (555) ON CONFLICT DO NOTHING;
