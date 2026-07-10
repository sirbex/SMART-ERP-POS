/**
 * Data-integrity SQL probes for inventory lot foundation proofs (ADR-002 §12).
 * Run inside a transaction or read-only connection on staging/production.
 */

/** Rows where projection expiry diverges from batch master (must be 0). */
export const SQL_EXPIRY_PROJECTION_DRIFT = `
  SELECT pl.id AS product_lot_id,
         pl.lot_number,
         pl.expiry_date AS projection_expiry,
         ib.expiry_date AS master_expiry
  FROM product_lots pl
  INNER JOIN inventory_batches ib ON ib.id = pl.inventory_batch_id
  WHERE pl.expiry_date IS DISTINCT FROM ib.expiry_date
  ORDER BY pl.lot_number
  LIMIT 100`;

/** product_lots without batch master link (orphan projections). */
export const SQL_ORPHAN_PROJECTIONS = `
  SELECT pl.id, pl.product_id, pl.lot_number, pl.status
  FROM product_lots pl
  WHERE pl.inventory_batch_id IS NULL
  ORDER BY pl.created_at DESC
  LIMIT 100`;

/** Multistore: sum(store balances) != batch remaining per linked lot. */
export const SQL_BATCH_BALANCE_MISMATCH = `
  SELECT pl.id AS product_lot_id,
         pl.lot_number,
         COALESCE(SUM(ib.quantity_on_hand), 0)::numeric AS balance_total,
         COALESCE(bat.remaining_quantity, 0)::numeric AS batch_remaining,
         ABS(
           COALESCE(SUM(ib.quantity_on_hand), 0)::numeric
           - COALESCE(bat.remaining_quantity, 0)::numeric
         ) AS delta
  FROM product_lots pl
  LEFT JOIN inventory_balances ib ON ib.product_lot_id = pl.id
  LEFT JOIN inventory_batches bat ON bat.id = pl.inventory_batch_id
  WHERE pl.inventory_batch_id IS NOT NULL
  GROUP BY pl.id, pl.lot_number, bat.remaining_quantity
  HAVING ABS(
    COALESCE(SUM(ib.quantity_on_hand), 0)::numeric
    - COALESCE(bat.remaining_quantity, 0)::numeric
  ) > 0.001
  ORDER BY delta DESC
  LIMIT 100`;

/** Active batches with negative remaining (must be 0). */
export const SQL_NEGATIVE_BATCH_REMAINING = `
  SELECT id, product_id, batch_number, remaining_quantity, status
  FROM inventory_batches
  WHERE remaining_quantity < -0.001
  LIMIT 50`;

/** Detect pg_locks on inventory_batches during proof (advisory). */
export const SQL_ACTIVE_BATCH_LOCKS = `
  SELECT l.locktype, l.mode, l.granted, a.query
  FROM pg_locks l
  JOIN pg_stat_activity a ON a.pid = l.pid
  WHERE a.datname = current_database()
    AND a.query ILIKE '%inventory_batches%'
    AND a.pid <> pg_backend_pid()
  LIMIT 20`;
