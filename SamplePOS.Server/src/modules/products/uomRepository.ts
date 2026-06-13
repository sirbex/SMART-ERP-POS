// UoM Repository - SQL only
import { pool as globalPool } from '../../db/pool.js';
import type pg from 'pg';

type Queryable = pg.Pool | pg.PoolClient;

export type DbUom = {
  id: string;
  name: string;
  symbol: string | null;
  type: 'QUANTITY' | 'WEIGHT' | 'VOLUME' | 'LENGTH' | 'AREA' | 'TIME';
};

export type DbProductUom = {
  id: string;
  productId: string;
  uomId: string;
  uomName: string;
  uomSymbol: string | null;
  conversionFactor: string; // decimal as string from pg
  barcode: string | null;
  isDefault: boolean;
  priceOverride: string | null;
  costOverride: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DbItemUomConversion = {
  id: string;
  itemId: string;
  fromUomId: string;
  toUomId: string;
  factor: string;
  isCanonical: boolean;
};

export async function listUoms(dbPool?: pg.Pool): Promise<DbUom[]> {
  const pool = dbPool || globalPool;
  const res = await pool.query(`SELECT id, name, symbol, type FROM uoms ORDER BY name ASC`);
  return res.rows;
}

export async function createUom(data: {
  name: string;
  symbol?: string | null;
  type?: string;
}, dbPool?: pg.Pool): Promise<DbUom> {
  const pool = dbPool || globalPool;
  const res = await pool.query(
    `INSERT INTO uoms (name, symbol, type)
     VALUES ($1, $2, COALESCE($3,'QUANTITY'))
     RETURNING id, name, symbol, type`,
    [data.name, data.symbol ?? null, data.type ?? null]
  );
  return res.rows[0];
}

export async function getUomById(id: string, db?: Queryable): Promise<DbUom | null> {
  const pool = db || globalPool;
  const res = await pool.query(
    `SELECT id, name, symbol, type FROM uoms WHERE id = $1`,
    [id],
  );
  return res.rows[0] ?? null;
}

export async function updateUom(id: string, data: {
  name?: string;
  symbol?: string | null;
  type?: string;
}, dbPool?: pg.Pool): Promise<DbUom | null> {
  const pool = dbPool || globalPool;
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (data.name !== undefined) {
    fields.push(`name = $${i++}`);
    values.push(data.name);
  }
  if (data.symbol !== undefined) {
    fields.push(`symbol = $${i++}`);
    values.push(data.symbol);
  }
  if (data.type !== undefined) {
    fields.push(`type = $${i++}`);
    values.push(data.type);
  }

  if (fields.length === 0) {
    // No change, just fetch current
    const res = await pool.query(
      `SELECT id, name, symbol, type FROM uoms WHERE id = $1`,
      [id]
    );
    return res.rows[0] ?? null;
  }

  values.push(id);
  const res = await pool.query(
    `UPDATE uoms SET ${fields.join(', ')} WHERE id = $${i}
     RETURNING id, name, symbol, type`,
    values
  );
  return res.rows[0] ?? null;
}

export async function deleteUom(id: string, dbPool?: pg.Pool): Promise<boolean> {
  const pool = dbPool || globalPool;
  const res = await pool.query(`DELETE FROM uoms WHERE id = $1`, [id]);
  return (res.rowCount ?? 0) > 0;
}

/** Delete all product_uoms mappings for a given master UoM */
export async function deleteProductUomsByUomId(uomId: string, client: pg.PoolClient): Promise<number> {
  const res = await client.query(`DELETE FROM product_uoms WHERE uom_id = $1`, [uomId]);
  return res.rowCount ?? 0;
}

/** Check if a UoM is referenced in immutable transactional tables or as a product base UoM */
export async function getUomUsageCounts(uomId: string, dbPool?: pg.Pool): Promise<{
  productBase: number;
  productUoms: number;
  saleItems: number;
  poItems: number;
  grItems: number;
  stockMovements: number;
}> {
  const pool = dbPool || globalPool;
  const res = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM products WHERE base_uom_id = $1) AS "productBase",
       (SELECT COUNT(*)::int FROM product_uoms WHERE uom_id = $1) AS "productUoms",
       (SELECT COUNT(*)::int FROM sale_items WHERE base_uom_id = $1) AS "saleItems",
       (SELECT COUNT(*)::int FROM purchase_order_items WHERE base_uom_id = $1) AS "poItems",
       (SELECT COUNT(*)::int FROM goods_receipt_items WHERE base_uom_id = $1) AS "grItems",
       (SELECT COUNT(*)::int FROM stock_movements WHERE base_uom_id = $1) AS "stockMovements"`,
    [uomId]
  );
  return res.rows[0];
}

export async function listProductUoms(productId: string, dbPool?: pg.Pool): Promise<DbProductUom[]> {
  const pool = dbPool || globalPool;
  const res = await pool.query(
    `SELECT 
      pu.id,
      pu.product_id as "productId",
      pu.uom_id as "uomId",
      u.name as "uomName",
      u.symbol as "uomSymbol",
      pu.conversion_factor as "conversionFactor",
      pu.barcode,
      pu.is_default as "isDefault",
      pu.price_override as "priceOverride",
      pu.cost_override as "costOverride",
      pu.created_at as "createdAt",
      pu.updated_at as "updatedAt"
    FROM product_uoms pu
    JOIN uoms u ON u.id = pu.uom_id
    WHERE pu.product_id = $1
    ORDER BY pu.is_default DESC, u.name ASC`,
    [productId]
  );
  return res.rows;
}

export async function getProductBaseUomId(productId: string, db?: Queryable): Promise<string | null> {
  const pool = db || globalPool;
  const res = await pool.query(
    `SELECT COALESCE(base_uom_id, (
        SELECT pu.uom_id
        FROM product_uoms pu
        WHERE pu.product_id = products.id AND pu.is_default = true
        LIMIT 1
      )) AS "baseUomId"
     FROM products
     WHERE id = $1`,
    [productId],
  );
  return res.rows[0]?.baseUomId ?? null;
}

export async function getProductPurchaseUomContext(
  productId: string,
  db?: Queryable,
): Promise<{
  purchaseUomId: string | null;
  conversionFactor: number;
  baseUomId: string | null;
} | null> {
  const pool = db || globalPool;
  const res = await pool.query(
    `SELECT purchase_uom_id AS "purchaseUomId",
            conversion_factor AS "conversionFactor",
            base_uom_id AS "baseUomId"
     FROM products
     WHERE id = $1`,
    [productId],
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    purchaseUomId: row.purchaseUomId ?? null,
    conversionFactor: Number(row.conversionFactor ?? 1),
    baseUomId: row.baseUomId ?? null,
  };
}

export async function getProductLegacyUnitOfMeasure(
  productId: string,
  db?: Queryable,
): Promise<string | null> {
  const pool = db || globalPool;
  // Migration 013 dropped products.unit_of_measure; resolve via base_uom_id → uoms.name.
  const res = await pool.query(
    `SELECT u.name
     FROM products p
     LEFT JOIN uoms u ON u.id = p.base_uom_id
     WHERE p.id = $1`,
    [productId],
  );
  return res.rows[0]?.name ?? null;
}

export async function getProductName(productId: string, db?: Queryable): Promise<string | null> {
  const pool = db || globalPool;
  const res = await pool.query(`SELECT name FROM products WHERE id = $1`, [productId]);
  return res.rows[0]?.name ?? null;
}

export async function getProductSummary(
  productId: string,
  db?: Queryable,
): Promise<{ name: string; sku: string | null } | null> {
  const pool = db || globalPool;
  const res = await pool.query(`SELECT name, sku FROM products WHERE id = $1`, [productId]);
  const row = res.rows[0];
  if (!row) return null;
  return { name: row.name, sku: row.sku ?? null };
}

export async function setProductBaseUomId(productId: string, uomId: string, db?: Queryable): Promise<void> {
  const pool = db || globalPool;
  await pool.query(
    `UPDATE products
     SET base_uom_id = $2
     WHERE id = $1`,
    [productId, uomId],
  );
}

export async function listItemUomConversions(itemId: string, db?: Queryable): Promise<DbItemUomConversion[]> {
  const pool = db || globalPool;
  const res = await pool.query(
    `SELECT
       id,
       item_id AS "itemId",
       from_uom_id AS "fromUomId",
       to_uom_id AS "toUomId",
       factor::text AS factor,
       is_canonical AS "isCanonical"
     FROM item_uom_conversions
     WHERE item_id = $1
     ORDER BY from_uom_id ASC`,
    [itemId],
  );
  return res.rows;
}

export async function upsertItemUomConversion(data: {
  itemId: string;
  fromUomId: string;
  toUomId: string;
  factor: number;
  isCanonical?: boolean;
}, db?: Queryable): Promise<DbItemUomConversion> {
  const pool = db || globalPool;
  const res = await pool.query(
    `INSERT INTO item_uom_conversions (
       item_id, from_uom_id, to_uom_id, factor, is_canonical
     ) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (item_id, from_uom_id)
     DO UPDATE SET
       to_uom_id = EXCLUDED.to_uom_id,
       factor = EXCLUDED.factor,
       is_canonical = EXCLUDED.is_canonical,
       updated_at = CURRENT_TIMESTAMP
     RETURNING
       id,
       item_id AS "itemId",
       from_uom_id AS "fromUomId",
       to_uom_id AS "toUomId",
       factor::text AS factor,
       is_canonical AS "isCanonical"`,
    [data.itemId, data.fromUomId, data.toUomId, data.factor, data.isCanonical ?? true],
  );
  return res.rows[0];
}

export async function deleteItemUomConversionBySource(
  itemId: string,
  fromUomId: string,
  db?: Queryable,
): Promise<void> {
  const pool = db || globalPool;
  await pool.query(
    `DELETE FROM item_uom_conversions
     WHERE item_id = $1 AND from_uom_id = $2`,
    [itemId, fromUomId],
  );
}

export async function deleteAllItemUomConversionsForProduct(
  itemId: string,
  db?: Queryable,
): Promise<void> {
  const pool = db || globalPool;
  await pool.query(
    `DELETE FROM item_uom_conversions WHERE item_id = $1`,
    [itemId],
  );
}

export async function createProductUom(data: {
  productId: string;
  uomId: string;
  conversionFactor: number;
  barcode?: string | null;
  isDefault?: boolean;
  priceOverride?: number | null;
  costOverride?: number | null;
}, db?: Queryable): Promise<DbProductUom> {
  const pool = db || globalPool;
  const res = await pool.query(
    `INSERT INTO product_uoms (
      product_id, uom_id, conversion_factor, barcode, is_default, price_override, cost_override
    ) VALUES ($1,$2,$3,$4,$5,$6,$7)
    RETURNING 
      id,
      product_id as "productId",
      uom_id as "uomId",
      (SELECT name FROM uoms WHERE id = product_uoms.uom_id) as "uomName",
      (SELECT symbol FROM uoms WHERE id = product_uoms.uom_id) as "uomSymbol",
      conversion_factor as "conversionFactor",
      barcode,
      is_default as "isDefault",
      price_override as "priceOverride",
      cost_override as "costOverride",
      created_at as "createdAt",
      updated_at as "updatedAt"`,
    [
      data.productId,
      data.uomId,
      data.conversionFactor,
      data.barcode ?? null,
      data.isDefault ?? false,
      data.priceOverride ?? null,
      data.costOverride ?? null,
    ]
  );
  return res.rows[0];
}

export async function unsetDefaultForProduct(productId: string, db?: Queryable) {
  const pool = db || globalPool;
  await pool.query(
    `UPDATE product_uoms SET is_default = false WHERE product_id = $1 AND is_default = true`,
    [productId]
  );
}

/** Promote one product_uoms row as the canonical base stock UoM (factor = 1). */
export async function setProductUomAsBase(
  productId: string,
  productUomId: string,
  uomId: string,
  db?: Queryable,
): Promise<void> {
  const pool = db || globalPool;
  await unsetDefaultForProduct(productId, pool);
  await pool.query(
    `UPDATE product_uoms
     SET is_default = true, conversion_factor = 1
     WHERE id = $1 AND product_id = $2`,
    [productUomId, productId],
  );
  await setProductBaseUomId(productId, uomId, pool);
}

export async function updateProductUom(
  id: string,
  data: {
    uomId?: string;
    conversionFactor?: number;
    barcode?: string | null;
    isDefault?: boolean;
    priceOverride?: number | null;
    costOverride?: number | null;
  },
  dbPool?: pg.Pool
): Promise<DbProductUom | null> {
  const pool = dbPool || globalPool;
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (data.uomId !== undefined) {
    fields.push(`uom_id = $${i++}`);
    values.push(data.uomId);
  }
  if (data.conversionFactor !== undefined) {
    fields.push(`conversion_factor = $${i++}`);
    values.push(data.conversionFactor);
  }
  if (data.barcode !== undefined) {
    fields.push(`barcode = $${i++}`);
    values.push(data.barcode);
  }
  if (data.isDefault !== undefined) {
    fields.push(`is_default = $${i++}`);
    values.push(data.isDefault);
  }
  if (data.priceOverride !== undefined) {
    fields.push(`price_override = $${i++}`);
    values.push(data.priceOverride);
  }
  if (data.costOverride !== undefined) {
    fields.push(`cost_override = $${i++}`);
    values.push(data.costOverride);
  }

  if (fields.length === 0) {
    // No change
  } else {
    values.push(id);
    await pool.query(`UPDATE product_uoms SET ${fields.join(', ')} WHERE id = $${i}`, values);
  }

  const res = await pool.query(
    `SELECT 
      pu.id,
      pu.product_id as "productId",
      pu.uom_id as "uomId",
      u.name as "uomName",
      u.symbol as "uomSymbol",
      pu.conversion_factor as "conversionFactor",
      pu.barcode,
      pu.is_default as "isDefault",
      pu.price_override as "priceOverride",
      pu.cost_override as "costOverride",
      pu.created_at as "createdAt",
      pu.updated_at as "updatedAt"
    FROM product_uoms pu
    JOIN uoms u ON u.id = pu.uom_id
    WHERE pu.id = $1`,
    [id]
  );
  return res.rows[0] ?? null;
}

export async function deleteProductUom(id: string, dbPool?: pg.Pool): Promise<boolean> {
  const pool = dbPool || globalPool;
  const res = await pool.query(`DELETE FROM product_uoms WHERE id = $1`, [id]);
  return (res.rowCount ?? 0) > 0;
}

export async function getProductUomById(id: string, dbPool?: pg.Pool): Promise<DbProductUom | null> {
  const pool = dbPool || globalPool;
  const res = await pool.query(
    `SELECT 
      pu.id,
      pu.product_id as "productId",
      pu.uom_id as "uomId",
      u.name as "uomName",
      u.symbol as "uomSymbol",
      pu.conversion_factor as "conversionFactor",
      pu.barcode,
      pu.is_default as "isDefault",
      pu.price_override as "priceOverride",
      pu.cost_override as "costOverride",
      pu.created_at as "createdAt",
      pu.updated_at as "updatedAt"
    FROM product_uoms pu
    JOIN uoms u ON u.id = pu.uom_id
    WHERE pu.id = $1`,
    [id]
  );
  return res.rows[0] ?? null;
}
