-- 580: Print Job SSOT — durable queue for KOT / bill / receipt delivery
-- Business events (sendKot, bill, sale) enqueue jobs; the local print agent
-- (localhost:1811) delivers them. Browser never owns print selection.

CREATE TABLE IF NOT EXISTS print_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type   VARCHAR(32) NOT NULL,
  target_printer  VARCHAR(255) NULL,
  copies          INTEGER NOT NULL DEFAULT 1,
  payload_json    JSONB NOT NULL,
  status          VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  source_type     VARCHAR(32) NULL,
  source_id       UUID NULL,
  order_id        UUID NULL,
  station_code    VARCHAR(64) NULL,
  error_message   TEXT NULL,
  retry_count     INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  printed_at      TIMESTAMPTZ NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_print_jobs_document_type
    CHECK (document_type IN ('KOT', 'VOID_KOT', 'GUEST_BILL', 'RECEIPT')),
  CONSTRAINT chk_print_jobs_status
    CHECK (status IN ('PENDING', 'PRINTING', 'PRINTED', 'ERROR')),
  CONSTRAINT chk_print_jobs_copies
    CHECK (copies >= 1 AND copies <= 10)
);

CREATE INDEX IF NOT EXISTS idx_print_jobs_status_created
  ON print_jobs (status, created_at);

CREATE INDEX IF NOT EXISTS idx_print_jobs_order
  ON print_jobs (order_id)
  WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_print_jobs_source
  ON print_jobs (source_type, source_id)
  WHERE source_id IS NOT NULL;

COMMENT ON TABLE print_jobs IS
  'Print Job SSOT: one row per physical print. Checkout/KOT creates jobs; local agent delivers.';
COMMENT ON COLUMN print_jobs.target_printer IS
  'Windows/OS printer name for X-Printer-Name. NULL = agent default printer.';
COMMENT ON COLUMN print_jobs.payload_json IS
  'Structured ticket/receipt data. Client renders HTML (or future ESC/POS) for the agent.';

INSERT INTO schema_version (version) VALUES (580) ON CONFLICT DO NOTHING;
