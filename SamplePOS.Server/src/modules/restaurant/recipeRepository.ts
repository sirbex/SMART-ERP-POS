/**
 * Recipe / BOM repository — product_recipes + product_recipe_lines.
 */

import type { Pool, PoolClient } from 'pg';
import { convertKeysToCamelCase } from '../../utils/caseConverter.js';

type DbConn = Pool | PoolClient;

export interface RecipeLineRecord {
  id: string;
  recipeId: string;
  componentProductId: string;
  componentName?: string;
  componentSku?: string | null;
  quantityBase: string;
  sortOrder: number;
}

export interface RecipeRecord {
  id: string;
  parentProductId: string;
  parentProductName?: string;
  name: string;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  lines: RecipeLineRecord[];
}

export const recipeRepository = {
  async tableExists(conn: DbConn): Promise<boolean> {
    const result = await conn.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'product_recipes' LIMIT 1`,
    );
    return result.rows.length > 0;
  },

  async listRecipes(conn: DbConn): Promise<RecipeRecord[]> {
    if (!(await this.tableExists(conn))) return [];
    const headers = await conn.query(
      `SELECT
         r.id, r.parent_product_id, r.name, r.is_active, r.notes, r.created_at, r.updated_at,
         p.name AS parent_product_name
       FROM product_recipes r
       JOIN products p ON p.id = r.parent_product_id
       ORDER BY p.name ASC`,
    );
    const out: RecipeRecord[] = [];
    for (const row of headers.rows) {
      const recipe = convertKeysToCamelCase(row) as RecipeRecord;
      recipe.lines = await this.listLines(conn, recipe.id);
      out.push(recipe);
    }
    return out;
  },

  async getByParentProductId(conn: DbConn, parentProductId: string): Promise<RecipeRecord | null> {
    if (!(await this.tableExists(conn))) return null;
    const result = await conn.query(
      `SELECT
         r.id, r.parent_product_id, r.name, r.is_active, r.notes, r.created_at, r.updated_at,
         p.name AS parent_product_name
       FROM product_recipes r
       JOIN products p ON p.id = r.parent_product_id
       WHERE r.parent_product_id = $1`,
      [parentProductId],
    );
    if (!result.rows[0]) return null;
    const recipe = convertKeysToCamelCase(result.rows[0]) as RecipeRecord;
    recipe.lines = await this.listLines(conn, recipe.id);
    return recipe;
  },

  async getById(conn: DbConn, id: string): Promise<RecipeRecord | null> {
    if (!(await this.tableExists(conn))) return null;
    const result = await conn.query(
      `SELECT
         r.id, r.parent_product_id, r.name, r.is_active, r.notes, r.created_at, r.updated_at,
         p.name AS parent_product_name
       FROM product_recipes r
       JOIN products p ON p.id = r.parent_product_id
       WHERE r.id = $1`,
      [id],
    );
    if (!result.rows[0]) return null;
    const recipe = convertKeysToCamelCase(result.rows[0]) as RecipeRecord;
    recipe.lines = await this.listLines(conn, recipe.id);
    return recipe;
  },

  async listLines(conn: DbConn, recipeId: string): Promise<RecipeLineRecord[]> {
    const result = await conn.query(
      `SELECT
         l.id, l.recipe_id, l.component_product_id, l.quantity_base, l.sort_order,
         p.name AS component_name, p.sku AS component_sku
       FROM product_recipe_lines l
       JOIN products p ON p.id = l.component_product_id
       WHERE l.recipe_id = $1
       ORDER BY l.sort_order ASC, p.name ASC`,
      [recipeId],
    );
    return result.rows.map((r) => convertKeysToCamelCase(r) as RecipeLineRecord);
  },

  async upsertRecipe(
    conn: DbConn,
    data: {
      parentProductId: string;
      name: string;
      isActive?: boolean;
      notes?: string | null;
      lines: Array<{ componentProductId: string; quantityBase: number; sortOrder?: number }>;
    },
  ): Promise<RecipeRecord> {
    const existing = await this.getByParentProductId(conn, data.parentProductId);
    let recipeId: string;

    if (existing) {
      await conn.query(
        `UPDATE product_recipes
         SET name = $2,
             is_active = COALESCE($3, is_active),
             notes = $4,
             updated_at = NOW()
         WHERE id = $1`,
        [existing.id, data.name.trim(), data.isActive ?? existing.isActive, data.notes ?? null],
      );
      recipeId = existing.id;
      await conn.query(`DELETE FROM product_recipe_lines WHERE recipe_id = $1`, [recipeId]);
    } else {
      const inserted = await conn.query(
        `INSERT INTO product_recipes (parent_product_id, name, is_active, notes)
         VALUES ($1, $2, COALESCE($3, TRUE), $4)
         RETURNING id`,
        [data.parentProductId, data.name.trim(), data.isActive ?? true, data.notes ?? null],
      );
      recipeId = inserted.rows[0].id;
    }

    for (let i = 0; i < data.lines.length; i++) {
      const line = data.lines[i];
      await conn.query(
        `INSERT INTO product_recipe_lines (recipe_id, component_product_id, quantity_base, sort_order)
         VALUES ($1, $2, $3, $4)`,
        [recipeId, line.componentProductId, line.quantityBase, line.sortOrder ?? (i + 1) * 10],
      );
    }

    const fresh = await this.getById(conn, recipeId);
    if (!fresh) throw new Error('Recipe upsert failed');
    return fresh;
  },

  async deleteRecipe(conn: DbConn, id: string): Promise<boolean> {
    const result = await conn.query(`DELETE FROM product_recipes WHERE id = $1`, [id]);
    return (result.rowCount ?? 0) > 0;
  },
};
