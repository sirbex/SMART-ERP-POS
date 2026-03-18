// Products Repository - Database Layer
// Contains ONLY SQL queries - NO business logic

import { pool as globalPool } from '../../db/pool.js';
import type pg from 'pg';
import type { Product, CreateProduct, UpdateProduct } from '../../../../shared/zod/product.js';
import { assertRowUpdated } from '../../utils/optimisticUpdate.js';

// ── Shared SQL fragments (DRY) ──────────────────────────────────────────────
// Single source of truth for product column SELECT & GROUP BY lists.
// Uses product_inventory (pi) and product_valuation (pv) for volatile columns.

const PRODUCT_SELECT_COLUMNS = `
      p.id, p.product_number as "productNumber", p.sku, p.barcode, p.name, p.description, p.category,
      p.generic_name as "genericName",
      p.conversion_factor as "conversionFactor",
      pv.cost_price as "costPrice",
      pv.selling_price as "sellingPrice",
      p.is_taxable as "isTaxable",
      p.tax_rate as "taxRate",
      pv.costing_method as "costingMethod",
      pv.average_cost as "averageCost",
      pv.last_cost as "lastCost",
      pv.pricing_formula as "pricingFormula",
      pv.auto_update_price as "autoUpdatePrice",
      pi.quantity_on_hand as "quantityOnHand",
      pi.reorder_level as "reorderLevel",
      p.track_expiry as "trackExpiry",
      p.min_days_before_expiry_sale as "minDaysBeforeExpirySale",
      p.is_active as "isActive",
      p.created_at as "createdAt",
      GREATEST(p.updated_at, pi.updated_at, pv.updated_at) as "updatedAt",
      p.version`;

const PRODUCT_JOINS = `
    FROM products p
    LEFT JOIN product_inventory pi ON pi.product_id = p.id
    LEFT JOIN product_valuation pv ON pv.product_id = p.id`;

const PRODUCT_UOM_AGG = `
      COALESCE(
        json_agg(
          json_build_object(
            'id', pu.id,
            'uomId', pu.uom_id,
            'uomName', u.name,
            'uomSymbol', u.symbol,
            'conversionFactor', pu.conversion_factor,
            'isDefault', pu.is_default,
            'priceOverride', pu.price_override,
            'costOverride', pu.cost_override
          ) ORDER BY pu.conversion_factor DESC
        ) FILTER (WHERE pu.id IS NOT NULL),
        '[]'
      ) as "productUoms"`;

const PRODUCT_GROUP_BY = `p.id, p.product_number, p.sku, p.barcode, p.name, p.description, p.category,
             p.generic_name, p.conversion_factor, pv.cost_price, pv.selling_price,
             p.is_taxable, p.tax_rate, pv.costing_method, pv.average_cost, pv.last_cost,
             pv.pricing_formula, pv.auto_update_price, pi.quantity_on_hand,
             pi.reorder_level, p.track_expiry, p.min_days_before_expiry_sale, p.is_active, p.created_at,
             p.updated_at, pi.updated_at, pv.updated_at, p.version`;

// RETURNING clause for INSERT/UPDATE (no table alias prefix needed)
const PRODUCT_RETURNING_COLUMNS = `
      id, product_number as "productNumber", sku, barcode, name, description, category,
      generic_name as "genericName",
      conversion_factor as "conversionFactor",
      cost_price as "costPrice",
      selling_price as "sellingPrice",
      is_taxable as "isTaxable",
      tax_rate as "taxRate",
      costing_method as "costingMethod",
      average_cost as "averageCost",
      last_cost as "lastCost",
      pricing_formula as "pricingFormula",
      auto_update_price as "autoUpdatePrice",
      quantity_on_hand as "quantityOnHand",
      reorder_level as "reorderLevel",
      track_expiry as "trackExpiry",
      min_days_before_expiry_sale as "minDaysBeforeExpirySale",
      is_active as "isActive",
      created_at as "createdAt",
      updated_at as "updatedAt",
      version`;

export async function findAllProducts(limit: number = 50, offset: number = 0, dbPool?: pg.Pool): Promise<Product[]> {
  const pool = dbPool || globalPool;
  const result = await pool.query(
    `SELECT ${PRODUCT_SELECT_COLUMNS},
      ${PRODUCT_UOM_AGG}
    ${PRODUCT_JOINS}
    LEFT JOIN product_uoms pu ON p.id = pu.product_id
    LEFT JOIN uoms u ON pu.uom_id = u.id
    WHERE p.is_active = true
    GROUP BY ${PRODUCT_GROUP_BY}
    ORDER BY p.name ASC
    LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  return result.rows;
}

export async function findProductById(id: string, dbPool?: pg.Pool): Promise<Product | null> {
  const pool = dbPool || globalPool;
  const result = await pool.query(
    `SELECT ${PRODUCT_SELECT_COLUMNS},
      ${PRODUCT_UOM_AGG}
    ${PRODUCT_JOINS}
    LEFT JOIN product_uoms pu ON p.id = pu.product_id
    LEFT JOIN uoms u ON pu.uom_id = u.id
    WHERE p.id = $1
    GROUP BY ${PRODUCT_GROUP_BY}`,
    [id]
  );

  return result.rows[0] || null;
}

export async function findProductBySku(sku: string, dbPool?: pg.Pool): Promise<Product | null> {
  const pool = dbPool || globalPool;
  const result = await pool.query(
    `SELECT ${PRODUCT_SELECT_COLUMNS},
      ${PRODUCT_UOM_AGG}
    ${PRODUCT_JOINS}
    LEFT JOIN product_uoms pu ON p.id = pu.product_id
    LEFT JOIN uoms u ON pu.uom_id = u.id
    WHERE p.sku = $1
    GROUP BY ${PRODUCT_GROUP_BY}`,
    [sku]
  );

  return result.rows[0] || null;
}

export async function createProduct(data: CreateProduct, dbPool?: pg.Pool): Promise<Product> {
  const pool = dbPool || globalPool;
  const params = [
    data.sku,
    data.barcode || null,
    data.name,
    data.description || null,
    data.category || null,
    data.genericName || null,
    data.conversionFactor || 1.0,
    data.costPrice || 0,
    data.sellingPrice || 0,
    data.isTaxable ?? false,
    data.taxRate ?? 0,
    data.costingMethod || 'FIFO',
    data.pricingFormula || null,
    data.autoUpdatePrice ?? false,
    data.reorderLevel ?? 0,
    data.trackExpiry ?? false,
    data.minDaysBeforeExpirySale ?? 0,
    data.isActive ?? true,
  ];

  const sql = `INSERT INTO products (
      sku, barcode, name, description, category, generic_name,
      conversion_factor,
      cost_price, selling_price, is_taxable, tax_rate, costing_method,
      pricing_formula, auto_update_price, reorder_level, track_expiry, min_days_before_expiry_sale, is_active
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
    RETURNING ${PRODUCT_RETURNING_COLUMNS}`;

  // Retry up to 3 times if product_number sequence is desynced (duplicate key on product_number)
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await pool.query(sql, params);
      return result.rows[0];
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('products_product_number_key') && attempt < 3) {
        // Sequence is behind — advance it past the current max and retry
        await pool.query(`
          SELECT setval('product_number_seq',
            (SELECT COALESCE(MAX(CAST(SUBSTRING(product_number FROM 6) AS INTEGER)), 0)
             FROM products WHERE product_number LIKE 'PROD-%'))
        `);
        continue;
      }
      throw error;
    }
  }

  // Unreachable, but satisfies TypeScript
  throw new Error('Failed to create product after retries');
}

export async function updateProduct(id: string, data: UpdateProduct, dbPool?: pg.Pool): Promise<Product | null> {
  const pool = dbPool || globalPool;
  const clientVersion = data.version; // OCC: version from the caller

  // Separate fields into their target tables
  const masterFields: string[] = [];
  const masterValues: unknown[] = [];
  let masterIdx = 1;

  const valFields: string[] = [];
  const valValues: unknown[] = [];
  let valIdx = 1;

  const invFields: string[] = [];
  const invValues: unknown[] = [];
  let invIdx = 1;

  // ── Master (products table) ──
  if (data.sku !== undefined) {
    masterFields.push(`sku = $${masterIdx++}`);
    masterValues.push(data.sku);
  }
  if (data.barcode !== undefined) {
    masterFields.push(`barcode = $${masterIdx++}`);
    masterValues.push(data.barcode);
  }
  if (data.name !== undefined) {
    masterFields.push(`name = $${masterIdx++}`);
    masterValues.push(data.name);
  }
  if (data.description !== undefined) {
    masterFields.push(`description = $${masterIdx++}`);
    masterValues.push(data.description);
  }
  if (data.category !== undefined) {
    masterFields.push(`category = $${masterIdx++}`);
    masterValues.push(data.category);
  }
  if (data.genericName !== undefined) {
    masterFields.push(`generic_name = $${masterIdx++}`);
    masterValues.push(data.genericName || null);
  }
  if (data.isTaxable !== undefined) {
    masterFields.push(`is_taxable = $${masterIdx++}`);
    masterValues.push(data.isTaxable);
  }
  if (data.taxRate !== undefined) {
    masterFields.push(`tax_rate = $${masterIdx++}`);
    masterValues.push(data.taxRate);
  }
  if (data.trackExpiry !== undefined) {
    masterFields.push(`track_expiry = $${masterIdx++}`);
    masterValues.push(data.trackExpiry);
  }
  if (data.minDaysBeforeExpirySale !== undefined) {
    masterFields.push(`min_days_before_expiry_sale = $${masterIdx++}`);
    masterValues.push(data.minDaysBeforeExpirySale);
  }
  if (data.isActive !== undefined) {
    masterFields.push(`is_active = $${masterIdx++}`);
    masterValues.push(data.isActive);
  }

  // ── Valuation (product_valuation table) ──
  if (data.costPrice !== undefined) {
    valFields.push(`cost_price = $${valIdx++}`);
    valValues.push(data.costPrice);
  }
  if (data.sellingPrice !== undefined) {
    valFields.push(`selling_price = $${valIdx++}`);
    valValues.push(data.sellingPrice);
  }

  // ── Inventory (product_inventory table) ──
  if (data.reorderLevel !== undefined) {
    invFields.push(`reorder_level = $${invIdx++}`);
    invValues.push(data.reorderLevel);
  }

  const hasChanges = masterFields.length > 0 || valFields.length > 0 || invFields.length > 0;
  if (!hasChanges) {
    return findProductById(id, pool);
  }

  // Execute updates (each only if there are fields to set)
  if (masterFields.length > 0) {
    masterFields.push(`version = version + 1`);
    masterValues.push(id);
    let whereClause = `WHERE id = $${masterIdx}`;
    if (clientVersion !== undefined) {
      masterValues.push(clientVersion);
      whereClause += ` AND version = $${masterIdx + 1}`;
    }
    const result = await pool.query(
      `UPDATE products SET ${masterFields.join(', ')} ${whereClause}`,
      masterValues
    );
    if (clientVersion !== undefined) {
      assertRowUpdated(result.rowCount, 'Product', id);
    }
  }

  if (valFields.length > 0) {
    valFields.push(`version = version + 1`);
    valValues.push(id);
    await pool.query(
      `UPDATE product_valuation SET ${valFields.join(', ')}, updated_at = NOW() WHERE product_id = $${valIdx}`,
      valValues
    );
  }

  if (invFields.length > 0) {
    invFields.push(`version = version + 1`);
    invValues.push(id);
    await pool.query(
      `UPDATE product_inventory SET ${invFields.join(', ')}, updated_at = NOW() WHERE product_id = $${invIdx}`,
      invValues
    );
  }

  // Return the full joined product
  return findProductById(id, pool);
}

export async function deleteProduct(id: string, dbPool?: pg.Pool): Promise<boolean> {
  const pool = dbPool || globalPool;
  // Soft delete
  const result = await pool.query('UPDATE products SET is_active = false WHERE id = $1', [id]);

  return result.rowCount !== null && result.rowCount > 0;
}

export async function countProducts(dbPool?: pg.Pool): Promise<number> {
  const pool = dbPool || globalPool;
  const result = await pool.query('SELECT COUNT(*) as count FROM products WHERE is_active = true');

  return parseInt(result.rows[0].count, 10);
}
