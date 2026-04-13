// UoM Repository - SQL only
import { pool as globalPool } from '../../db/pool.js';
import type pg from 'pg';

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

export async function createProductUom(data: {
  productId: string;
  uomId: string;
  conversionFactor: number;
  barcode?: string | null;
  isDefault?: boolean;
  priceOverride?: number | null;
  costOverride?: number | null;
}, dbPool?: pg.Pool): Promise<DbProductUom> {
  const pool = dbPool || globalPool;
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

export async function unsetDefaultForProduct(productId: string, dbPool?: pg.Pool) {
  const pool = dbPool || globalPool;
  await pool.query(
    `UPDATE product_uoms SET is_default = false WHERE product_id = $1 AND is_default = true`,
    [productId]
  );
}

export async function updateProductUom(
  id: string,
  data: {
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
