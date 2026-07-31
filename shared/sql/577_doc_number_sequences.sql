-- 577: Document + movement number sequences (non-blocking allocation)
-- Replaces advisory_xact_lock + MAX held until COMMIT (serialized order complete → 30s timeouts).
-- nextval() is concurrency-safe and is NOT rolled back — gaps on failed sales are expected and OK.

CREATE SEQUENCE IF NOT EXISTS doc_sale_number_seq;
CREATE SEQUENCE IF NOT EXISTS doc_order_number_seq;
CREATE SEQUENCE IF NOT EXISTS doc_refund_number_seq;
CREATE SEQUENCE IF NOT EXISTS doc_movement_number_seq;

DO $$
DECLARE
  m BIGINT;
BEGIN
  -- Sales
  SELECT COALESCE(MAX(CAST(substring(sale_number from '[0-9]+$') AS INTEGER)), 0)
    INTO m FROM sales WHERE sale_number ~ '^SALE-[0-9]{4}-[0-9]+$';
  IF m <= 0 THEN
    PERFORM setval('doc_sale_number_seq', 1, false);
  ELSE
    PERFORM setval('doc_sale_number_seq', m, true);
  END IF;

  -- Orders
  SELECT COALESCE(MAX(CAST(substring(order_number from '[0-9]+$') AS INTEGER)), 0)
    INTO m FROM pos_orders WHERE order_number ~ '^ORD-[0-9]{4}-[0-9]+$';
  IF m <= 0 THEN
    PERFORM setval('doc_order_number_seq', 1, false);
  ELSE
    PERFORM setval('doc_order_number_seq', m, true);
  END IF;

  -- Refunds (table may be empty)
  IF to_regclass('public.sale_refunds') IS NOT NULL THEN
    SELECT COALESCE(MAX(CAST(substring(refund_number from '[0-9]+$') AS INTEGER)), 0)
      INTO m FROM sale_refunds WHERE refund_number ~ '^REF-[0-9]{4}-[0-9]+$';
    IF m <= 0 THEN
      PERFORM setval('doc_refund_number_seq', 1, false);
    ELSE
      PERFORM setval('doc_refund_number_seq', m, true);
    END IF;
  ELSE
    PERFORM setval('doc_refund_number_seq', 1, false);
  END IF;

  -- Stock movements (MOV-YYYY-N…)
  IF to_regclass('public.stock_movements') IS NOT NULL THEN
    SELECT COALESCE(MAX(CAST(substring(movement_number from '[0-9]+$') AS INTEGER)), 0)
      INTO m FROM stock_movements WHERE movement_number ~ '^MOV-[0-9]{4}-[0-9]+$';
    IF m <= 0 THEN
      PERFORM setval('doc_movement_number_seq', 1, false);
    ELSE
      PERFORM setval('doc_movement_number_seq', m, true);
    END IF;
  ELSE
    PERFORM setval('doc_movement_number_seq', 1, false);
  END IF;
END $$;
