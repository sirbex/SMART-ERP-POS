import type { Pool, PoolClient } from 'pg';

/** Cached information_schema lookups — keyed by database so tenants never poison each other */
const columnExistsCache = new Map<string, boolean>();
const poolDatabaseCache = new WeakMap<object, string>();

async function resolveDatabaseName(pool: Pool | PoolClient): Promise<string> {
  const cached = poolDatabaseCache.get(pool as object);
  if (cached) return cached;
  const result = await pool.query<{ db: string }>('SELECT current_database() AS db');
  const name = result.rows[0]?.db || 'unknown';
  poolDatabaseCache.set(pool as object, name);
  return name;
}

/**
 * Returns true when `table.column` exists in public schema (migration may not be applied yet).
 */
export async function tableHasColumn(
  pool: Pool | PoolClient,
  table: string,
  column: string
): Promise<boolean> {
  const db = await resolveDatabaseName(pool);
  const key = `${db}.${table}.${column}`;
  const cached = columnExistsCache.get(key);
  if (cached !== undefined) return cached;

  const result = await pool.query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = $1
       AND column_name = $2
     LIMIT 1`,
    [table, column]
  );
  const exists = result.rows.length > 0;
  columnExistsCache.set(key, exists);
  return exists;
}

/** Clear cache (tests only) */
export function clearSchemaColumnCache(): void {
  columnExistsCache.clear();
}

/** SQL expression for GR line conversion factor (legacy DB: product_uoms only). */
export async function grItemsConversionFactorExpr(
  pool: Pool | PoolClient,
  griAlias = 'gri'
): Promise<string> {
  const hasGriSnapshot = await tableHasColumn(pool, 'goods_receipt_items', 'conversion_factor');
  if (hasGriSnapshot) {
    return `COALESCE(${griAlias}.conversion_factor, pu.conversion_factor, def_pu.conversion_factor, 1)`;
  }
  return `COALESCE(pu.conversion_factor, def_pu.conversion_factor, 1)`;
}

/** SQL expression for GR line is_bonus (legacy DB: always false). */
export async function grItemsIsBonusExpr(
  pool: Pool | PoolClient,
  griAlias = 'gri'
): Promise<string> {
  const hasBonus = await tableHasColumn(pool, 'goods_receipt_items', 'is_bonus');
  if (hasBonus) {
    return `COALESCE(${griAlias}.is_bonus, false)`;
  }
  return 'false';
}
