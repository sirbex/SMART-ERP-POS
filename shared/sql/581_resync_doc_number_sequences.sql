-- 581: Resync document number sequences to MAX(digits)
-- Legacy MAX+1 writers (GR / quote / delivery / adjustments) race ahead of
-- doc_movement_number_seq → stock_movements_movement_number_key → 409 on order complete.
-- Idempotent: safe to re-run on every tenant.

DO $$
DECLARE
  m BIGINT;
BEGIN
  IF to_regclass('public.doc_sale_number_seq') IS NULL THEN
    RAISE NOTICE '581: doc_* sequences missing — run 577 first';
    RETURN;
  END IF;

  SELECT COALESCE(MAX(CAST(substring(sale_number from '[0-9]+$') AS INTEGER)), 0)
    INTO m FROM sales WHERE sale_number ~ '^SALE-[0-9]{4}-[0-9]+$';
  IF m > 0 THEN PERFORM setval('doc_sale_number_seq', m, true);
  ELSE PERFORM setval('doc_sale_number_seq', 1, false);
  END IF;

  SELECT COALESCE(MAX(CAST(substring(order_number from '[0-9]+$') AS INTEGER)), 0)
    INTO m FROM pos_orders WHERE order_number ~ '^ORD-[0-9]{4}-[0-9]+$';
  IF m > 0 THEN PERFORM setval('doc_order_number_seq', m, true);
  ELSE PERFORM setval('doc_order_number_seq', 1, false);
  END IF;

  IF to_regclass('public.sale_refunds') IS NOT NULL THEN
    SELECT COALESCE(MAX(CAST(substring(refund_number from '[0-9]+$') AS INTEGER)), 0)
      INTO m FROM sale_refunds WHERE refund_number ~ '^REF-[0-9]{4}-[0-9]+$';
    IF m > 0 THEN PERFORM setval('doc_refund_number_seq', m, true);
    ELSE PERFORM setval('doc_refund_number_seq', 1, false);
    END IF;
  END IF;

  SELECT COALESCE(MAX(CAST(substring(movement_number from '[0-9]+$') AS INTEGER)), 0)
    INTO m FROM stock_movements WHERE movement_number ~ '^MOV-[0-9]{4}-[0-9]+$';
  IF m > 0 THEN PERFORM setval('doc_movement_number_seq', m, true);
  ELSE PERFORM setval('doc_movement_number_seq', 1, false);
  END IF;
END $$;

INSERT INTO schema_version (version) VALUES (581) ON CONFLICT DO NOTHING;
