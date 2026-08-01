/**
 * Heal doc_* sequences to MAX(suffix) so nextval cannot collide.
 * HENBER_DATABASE_URL=... node scripts/heal-doc-number-sequences.mjs
 */
import pg from 'pg';

const url =
  process.env.HENBER_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres:55b9bed51c599b26e7115ab126a974e8@209.38.203.138:5432/pos_tenant_henber_pharmacy';

const pool = new pg.Pool({ connectionString: url, connectionTimeoutMillis: 20000 });

const HEAL_SQL = `
DO $$
DECLARE
  m BIGINT;
BEGIN
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
`;

async function main() {
  await pool.query(HEAL_SQL);
  const seqs = await pool.query(`
    SELECT 'sale' AS k, last_value::text FROM doc_sale_number_seq
    UNION ALL SELECT 'order', last_value::text FROM doc_order_number_seq
    UNION ALL SELECT 'refund', last_value::text FROM doc_refund_number_seq
    UNION ALL SELECT 'movement', last_value::text FROM doc_movement_number_seq
  `);
  const maxes = await pool.query(`
    SELECT
      (SELECT COALESCE(MAX(CAST(substring(sale_number from '[0-9]+$') AS INTEGER)),0)
         FROM sales WHERE sale_number ~ '^SALE-[0-9]{4}-[0-9]+$') AS sale_max,
      (SELECT COALESCE(MAX(CAST(substring(movement_number from '[0-9]+$') AS INTEGER)),0)
         FROM stock_movements WHERE movement_number ~ '^MOV-[0-9]{4}-[0-9]+$') AS mov_max
  `);
  console.log(JSON.stringify({ healed: true, seqs: seqs.rows, maxes: maxes.rows[0] }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
