/**
 * Restaurant order tags (Samba modifiers) — catalog + product mapping.
 */
import type { Pool, PoolClient } from 'pg';

type Db = Pool | PoolClient;

export type OrderTagGroupRow = {
  id: string;
  name: string;
  sortOrder: number;
  minSelect: number;
  maxSelect: number | null;
  autoPrompt: boolean;
  isActive: boolean;
};

export type OrderTagRow = {
  id: string;
  groupId: string;
  label: string;
  prefix: string | null;
  price: string;
  sortOrder: number;
  isActive: boolean;
};

export type OrderTagGroupWithTags = OrderTagGroupRow & {
  tags: OrderTagRow[];
};

export const orderTagRepository = {
  async listGroupsWithTags(pool: Db, opts?: { activeOnly?: boolean }): Promise<OrderTagGroupWithTags[]> {
    const activeOnly = opts?.activeOnly !== false;
    const groups = await pool.query(
      `SELECT id, name, sort_order AS "sortOrder", min_select AS "minSelect",
              max_select AS "maxSelect", auto_prompt AS "autoPrompt", is_active AS "isActive"
       FROM restaurant_order_tag_groups
       WHERE ($1::boolean = FALSE OR is_active = TRUE)
       ORDER BY sort_order, name`,
      [activeOnly],
    );
    if (groups.rows.length === 0) return [];

    const tags = await pool.query(
      `SELECT id, group_id AS "groupId", label, prefix, price::text,
              sort_order AS "sortOrder", is_active AS "isActive"
       FROM restaurant_order_tags
       WHERE ($1::boolean = FALSE OR is_active = TRUE)
       ORDER BY sort_order, label`,
      [activeOnly],
    );

    const byGroup = new Map<string, OrderTagRow[]>();
    for (const t of tags.rows as OrderTagRow[]) {
      const list = byGroup.get(t.groupId) || [];
      list.push(t);
      byGroup.set(t.groupId, list);
    }

    return (groups.rows as OrderTagGroupRow[]).map((g) => ({
      ...g,
      tags: byGroup.get(g.id) || [],
    }));
  },

  async listGroupsForProduct(
    pool: Db,
    productId: string,
  ): Promise<OrderTagGroupWithTags[]> {
    const all = await this.listGroupsWithTags(pool, { activeOnly: true });
    if (all.length === 0) return [];

    const prod = await pool.query(
      `SELECT id, category_id AS "categoryId"
       FROM products WHERE id = $1`,
      [productId],
    );
    if (prod.rows.length === 0) return [];
    const categoryId = prod.rows[0].categoryId as string | null;

    const maps = await pool.query(
      `SELECT group_id AS "groupId", product_id AS "productId", category_id AS "categoryId"
       FROM restaurant_order_tag_mappings`,
    );

    const allowed = new Set<string>();
    for (const m of maps.rows as Array<{
      groupId: string;
      productId: string | null;
      categoryId: string | null;
    }>) {
      if (!m.productId && !m.categoryId) {
        allowed.add(m.groupId); // global
        continue;
      }
      if (m.productId && m.productId === productId) {
        allowed.add(m.groupId);
        continue;
      }
      if (m.categoryId && categoryId && m.categoryId === categoryId) {
        allowed.add(m.groupId);
      }
    }

    // If no mappings at all, expose all active groups (fresh install safety).
    if (maps.rows.length === 0) return all;
    return all.filter((g) => allowed.has(g.id));
  },

  async upsertGroup(
    pool: Db,
    data: {
      id?: string;
      name: string;
      sortOrder?: number;
      minSelect?: number;
      maxSelect?: number | null;
      autoPrompt?: boolean;
      isActive?: boolean;
    },
  ): Promise<OrderTagGroupRow> {
    if (data.id) {
      const r = await pool.query(
        `UPDATE restaurant_order_tag_groups
         SET name = $2, sort_order = COALESCE($3, sort_order),
             min_select = COALESCE($4, min_select),
             max_select = $5,
             auto_prompt = COALESCE($6, auto_prompt),
             is_active = COALESCE($7, is_active),
             updated_at = NOW()
         WHERE id = $1
         RETURNING id, name, sort_order AS "sortOrder", min_select AS "minSelect",
                   max_select AS "maxSelect", auto_prompt AS "autoPrompt", is_active AS "isActive"`,
        [
          data.id,
          data.name.trim(),
          data.sortOrder ?? null,
          data.minSelect ?? null,
          data.maxSelect === undefined ? null : data.maxSelect,
          data.autoPrompt ?? null,
          data.isActive ?? null,
        ],
      );
      return r.rows[0] as OrderTagGroupRow;
    }
    const r = await pool.query(
      `INSERT INTO restaurant_order_tag_groups
         (name, sort_order, min_select, max_select, auto_prompt, is_active)
       VALUES ($1, COALESCE($2, 0), COALESCE($3, 0), $4, COALESCE($5, FALSE), COALESCE($6, TRUE))
       RETURNING id, name, sort_order AS "sortOrder", min_select AS "minSelect",
                 max_select AS "maxSelect", auto_prompt AS "autoPrompt", is_active AS "isActive"`,
      [
        data.name.trim(),
        data.sortOrder ?? 0,
        data.minSelect ?? 0,
        data.maxSelect ?? null,
        data.autoPrompt ?? false,
        data.isActive ?? true,
      ],
    );
    return r.rows[0] as OrderTagGroupRow;
  },

  async upsertTag(
    pool: Db,
    data: {
      id?: string;
      groupId: string;
      label: string;
      prefix?: string | null;
      price?: number;
      sortOrder?: number;
      isActive?: boolean;
    },
  ): Promise<OrderTagRow> {
    if (data.id) {
      const r = await pool.query(
        `UPDATE restaurant_order_tags
         SET label = $2, prefix = $3, price = COALESCE($4, price),
             sort_order = COALESCE($5, sort_order),
             is_active = COALESCE($6, is_active),
             updated_at = NOW()
         WHERE id = $1 AND group_id = $7
         RETURNING id, group_id AS "groupId", label, prefix, price::text,
                   sort_order AS "sortOrder", is_active AS "isActive"`,
        [
          data.id,
          data.label.trim(),
          data.prefix?.trim() || null,
          data.price ?? null,
          data.sortOrder ?? null,
          data.isActive ?? null,
          data.groupId,
        ],
      );
      return r.rows[0] as OrderTagRow;
    }
    const r = await pool.query(
      `INSERT INTO restaurant_order_tags (group_id, label, prefix, price, sort_order, is_active)
       VALUES ($1, $2, $3, COALESCE($4, 0), COALESCE($5, 0), COALESCE($6, TRUE))
       RETURNING id, group_id AS "groupId", label, prefix, price::text,
                 sort_order AS "sortOrder", is_active AS "isActive"`,
      [
        data.groupId,
        data.label.trim(),
        data.prefix?.trim() || null,
        data.price ?? 0,
        data.sortOrder ?? 0,
        data.isActive ?? true,
      ],
    );
    return r.rows[0] as OrderTagRow;
  },

  async setGroupMapping(
    pool: Db,
    data: { groupId: string; productId?: string | null; categoryId?: string | null },
  ): Promise<void> {
    await pool.query(
      `INSERT INTO restaurant_order_tag_mappings (group_id, product_id, category_id)
       SELECT $1, $2, $3
       WHERE NOT EXISTS (
         SELECT 1 FROM restaurant_order_tag_mappings m
         WHERE m.group_id = $1
           AND m.product_id IS NOT DISTINCT FROM $2
           AND m.category_id IS NOT DISTINCT FROM $3
       )`,
      [data.groupId, data.productId ?? null, data.categoryId ?? null],
    );
  },

  async setOrderItemTags(
    client: PoolClient,
    itemId: string,
    tags: Array<{ id?: string | null; label: string; prefix?: string | null; price?: number }>,
    lineNotes: string | null,
  ): Promise<void> {
    const hasOrderTags = await client.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_name = 'pos_order_items' AND column_name = 'order_tags'`,
    );
    if (hasOrderTags.rows.length > 0) {
      await client.query(
        `UPDATE pos_order_items
         SET line_notes = $2, order_tags = $3::jsonb
         WHERE id = $1`,
        [itemId, lineNotes, JSON.stringify(tags)],
      );
      return;
    }
    await client.query(
      `UPDATE pos_order_items SET line_notes = $2 WHERE id = $1`,
      [itemId, lineNotes],
    );
  },
};
