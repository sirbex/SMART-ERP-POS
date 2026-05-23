import type { Pool, PoolClient } from 'pg';

/** Cached information_schema lookups — safe across tenants in long-lived processes */
const columnExistsCache = new Map<string, boolean>();

/**
 * Returns true when `table.column` exists in public schema (migration may not be applied yet).
 */
export async function tableHasColumn(
  pool: Pool | PoolClient,
  table: string,
  column: string
): Promise<boolean> {
  const key = `${table}.${column}`;
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
