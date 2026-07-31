/**
 * Order complete idempotency SSOT — one settlement per key / per order.
 *
 * Integrity contract:
 * - Same idempotencyKey → at most one sale (sales.idempotency_key UNIQUE)
 * - Concurrent complete on same PENDING order → FOR UPDATE serializes; loser sees COMPLETED
 * - Retry after success → return existing sale (by key or from_order_id)
 */
import type { Pool, PoolClient } from 'pg';

export type CompletedSaleRef = {
  id: string;
  saleNumber: string;
};

export function isIdempotencyUniqueViolation(err: unknown): boolean {
  const pgErr = err as { code?: string; constraint?: string; message?: string };
  if (pgErr.code !== '23505') return false;
  const hay = `${pgErr.constraint ?? ''} ${pgErr.message ?? ''}`;
  return hay.includes('idempotency_key');
}

export async function findSaleByIdempotencyKey(
  pool: Pool | PoolClient,
  idempotencyKey: string,
): Promise<CompletedSaleRef | null> {
  const result = await pool.query<{ id: string; sale_number: string }>(
    `SELECT id, sale_number FROM sales WHERE idempotency_key = $1`,
    [idempotencyKey],
  );
  const row = result.rows[0];
  if (!row) return null;
  return { id: row.id, saleNumber: row.sale_number };
}

export async function findSaleByFromOrderId(
  pool: Pool | PoolClient,
  orderId: string,
): Promise<CompletedSaleRef | null> {
  const result = await pool.query<{ id: string; sale_number: string }>(
    `SELECT id, sale_number
     FROM sales
     WHERE from_order_id = $1
     ORDER BY created_at ASC
     LIMIT 1`,
    [orderId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return { id: row.id, saleNumber: row.sale_number };
}

/**
 * Resolve a prior successful complete for retries / concurrent losers.
 * Prefer exact idempotency key match; fall back to sale linked to the order.
 */
export async function resolveExistingCompleteSale(
  pool: Pool | PoolClient,
  opts: { orderId: string; idempotencyKey?: string | null },
): Promise<CompletedSaleRef | null> {
  if (opts.idempotencyKey) {
    const byKey = await findSaleByIdempotencyKey(pool, opts.idempotencyKey);
    if (byKey) return byKey;
  }
  return findSaleByFromOrderId(pool, opts.orderId);
}
