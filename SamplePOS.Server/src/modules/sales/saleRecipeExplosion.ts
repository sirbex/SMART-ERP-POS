/**
 * Phase 3 — Recipe / BOM resolution for sale inventory consumption.
 * Tables may be absent (migration not applied) → treat as no recipe (retail unchanged).
 *
 * Stock is consumed only in salesService.createSale (payment), never on KOT.
 * Parent × recipe matrix: see planSaleStockDeduction in shared/utils/productTypeRules.
 */

import type { Pool, PoolClient } from 'pg';
import Decimal from 'decimal.js';
import {
  planSaleStockDeduction,
  type SaleStockDeductionPlan,
} from '../../../../shared/utils/productTypeRules.js';

export { planSaleStockDeduction, type SaleStockDeductionPlan };

type DbConn = Pool | PoolClient;

export interface RecipeExplosionLine {
  componentProductId: string;
  componentName: string;
  /** Base UoM qty to consume for this sale line */
  baseQty: Decimal;
}

let recipesTableExistsCache: boolean | null = null;

export async function productRecipesTableExists(conn: DbConn): Promise<boolean> {
  if (recipesTableExistsCache !== null) return recipesTableExistsCache;
  const result = await conn.query(
    `SELECT 1
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'product_recipes'
     LIMIT 1`,
  );
  recipesTableExistsCache = result.rows.length > 0;
  return recipesTableExistsCache;
}

/** Test helper — reset schema existence cache */
export function resetProductRecipesTableCache(): void {
  recipesTableExistsCache = null;
}

/**
 * Active recipe lines for a parent product, scaled by sold parent base qty.
 * Returns null when no active recipe (caller uses direct product deduction).
 */
export async function explodeActiveRecipe(
  conn: DbConn,
  parentProductId: string,
  soldParentBaseQty: Decimal,
): Promise<RecipeExplosionLine[] | null> {
  if (!(await productRecipesTableExists(conn))) return null;

  const result = await conn.query(
    `SELECT
       l.component_product_id AS "componentProductId",
       p.name AS "componentName",
       l.quantity_base::text AS "quantityBase"
     FROM product_recipes r
     JOIN product_recipe_lines l ON l.recipe_id = r.id
     JOIN products p ON p.id = l.component_product_id
     WHERE r.parent_product_id = $1
       AND r.is_active = TRUE
       AND COALESCE(p.is_active, TRUE) = TRUE
     ORDER BY l.sort_order ASC, p.name ASC`,
    [parentProductId],
  );

  if (result.rows.length === 0) return null;

  return result.rows.map((row) => ({
    componentProductId: row.componentProductId as string,
    componentName: row.componentName as string,
    baseQty: soldParentBaseQty.times(new Decimal(String(row.quantityBase))),
  }));
}
