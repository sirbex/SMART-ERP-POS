/**
 * Recipe / BOM resolution for sale and production (Phase 3 + Kitchen ADR-005).
 *
 * - explodeActiveRecipe (sale): only usage_mode AT_SALE — never KOT.
 * - explodeRecipeForProduction: any active recipe (AT_SALE or AT_PRODUCTION) for batch planning.
 */

import type { Pool, PoolClient } from 'pg';
import Decimal from 'decimal.js';
import {
  planSaleStockDeduction,
  normalizeRecipeUsageMode,
  type SaleStockDeductionPlan,
  type RecipeUsageMode,
} from '../../../../shared/utils/productTypeRules.js';

export { planSaleStockDeduction, normalizeRecipeUsageMode, type SaleStockDeductionPlan, type RecipeUsageMode };

type DbConn = Pool | PoolClient;

export interface RecipeExplosionLine {
  componentProductId: string;
  componentName: string;
  /** Base UoM qty to consume for this sale / production line */
  baseQty: Decimal;
}

let recipesTableExistsCache: boolean | null = null;
let usageModeColumnCache: boolean | null = null;

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

async function usageModeColumnExists(conn: DbConn): Promise<boolean> {
  if (usageModeColumnCache !== null) return usageModeColumnCache;
  try {
    const r = await conn.query(
      `SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'product_recipes'
         AND column_name = 'usage_mode'
       LIMIT 1`,
    );
    usageModeColumnCache = r.rows.length > 0;
  } catch {
    usageModeColumnCache = false;
  }
  return usageModeColumnCache;
}

/** Test helper — reset schema existence cache */
export function resetProductRecipesTableCache(): void {
  recipesTableExistsCache = null;
  usageModeColumnCache = null;
}

async function explodeRecipeLines(
  conn: DbConn,
  parentProductId: string,
  scaleBaseQty: Decimal,
  opts: { saleOnly: boolean },
): Promise<RecipeExplosionLine[] | null> {
  if (!(await productRecipesTableExists(conn))) return null;

  const hasUsage = await usageModeColumnExists(conn);
  const usageFilter =
    opts.saleOnly && hasUsage
      ? `AND COALESCE(r.usage_mode, 'AT_SALE') = 'AT_SALE'`
      : '';

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
       ${usageFilter}
     ORDER BY l.sort_order ASC, p.name ASC`,
    [parentProductId],
  );

  if (result.rows.length === 0) return null;

  return result.rows.map((row) => ({
    componentProductId: row.componentProductId as string,
    componentName: row.componentName as string,
    baseQty: scaleBaseQty.times(new Decimal(String(row.quantityBase))),
  }));
}

/**
 * Active AT_SALE recipe lines for a parent product, scaled by sold parent base qty.
 * Returns null when no at-sale recipe (caller uses direct product deduction / skip).
 */
export async function explodeActiveRecipe(
  conn: DbConn,
  parentProductId: string,
  soldParentBaseQty: Decimal,
): Promise<RecipeExplosionLine[] | null> {
  return explodeRecipeLines(conn, parentProductId, soldParentBaseQty, { saleOnly: true });
}

/**
 * Any active recipe for kitchen production batch planning (AT_SALE or AT_PRODUCTION).
 */
export async function explodeRecipeForProduction(
  conn: DbConn,
  parentProductId: string,
  outputBaseQty: Decimal,
): Promise<RecipeExplosionLine[] | null> {
  return explodeRecipeLines(conn, parentProductId, outputBaseQty, { saleOnly: false });
}
