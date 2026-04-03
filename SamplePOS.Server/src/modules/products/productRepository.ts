// Products Repository - Database Layer
// Contains ONLY SQL queries - NO business logic

import { pool as globalPool } from '../../db/pool.js';
import type pg from 'pg';
import type { Product, CreateProduct, UpdateProduct } from '../../../../shared/zod/product.js';
import { assertRowUpdated } from '../../utils/optimisticUpdate.js';
import type { DuplicateStrategy } from '../../../../shared/zod/importSchemas.js';

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
      p.preferred_supplier_id as "preferredSupplierId",
      p.supplier_product_code as "supplierProductCode",
      p.purchase_uom_id as "purchaseUomId",
      COALESCE(p.lead_time_days, 0) as "leadTimeDays",
      COALESCE(pi.reorder_quantity, 0) as "reorderQuantity",
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
             pi.reorder_level, pi.reorder_quantity, p.track_expiry, p.min_days_before_expiry_sale, p.is_active,
             p.preferred_supplier_id, p.supplier_product_code, p.purchase_uom_id, p.lead_time_days,
             p.created_at, p.updated_at, pi.updated_at, pv.updated_at, p.version`;

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

/**
 * Lightweight list query — SAP/Odoo style.
 * NO json_agg, NO GROUP BY, NO product_uoms join.
 * Only flat 1:1 JOINs on indexed columns. Sub-50ms for any dataset size.
 * Optional server-side search on name, SKU, and barcode.
 */
export async function findProductsForListView(
  limit: number = 50,
  offset: number = 0,
  dbPool?: pg.Pool,
  search?: string
): Promise<Product[]> {
  const pool = dbPool || globalPool;
  const params: (string | number)[] = [];
  let paramIdx = 1;

  let whereClause = 'WHERE p.is_active = true';
  if (search && search.trim().length > 0) {
    const pattern = `%${search.trim()}%`;
    whereClause += ` AND (p.name ILIKE $${paramIdx} OR p.sku ILIKE $${paramIdx} OR p.barcode ILIKE $${paramIdx})`;
    params.push(pattern);
    paramIdx++;
  }

  params.push(limit, offset);
  const result = await pool.query(
    `SELECT ${PRODUCT_SELECT_COLUMNS}
    ${PRODUCT_JOINS}
    ${whereClause}
    ORDER BY p.name ASC
    LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
    params
  );
  return result.rows;
}

/**
 * Batch-fetch UOMs for a set of product IDs in a single query.
 * Replaces N+1 individual UOM lookups.
 */
export async function findProductUomsBatch(
  productIds: string[],
  dbPool?: pg.Pool
): Promise<Map<string, Array<{ id: string; uomId: string; uomName: string; uomSymbol: string | null; conversionFactor: number; isDefault: boolean; priceOverride: number | null; costOverride: number | null }>>> {
  if (productIds.length === 0) return new Map();
  const pool = dbPool || globalPool;
  const result = await pool.query(
    `SELECT pu.product_id as "productId",
            pu.id, pu.uom_id as "uomId",
            u.name as "uomName", u.symbol as "uomSymbol",
            pu.conversion_factor as "conversionFactor",
            pu.is_default as "isDefault",
            pu.price_override as "priceOverride",
            pu.cost_override as "costOverride"
     FROM product_uoms pu
     JOIN uoms u ON pu.uom_id = u.id
     WHERE pu.product_id = ANY($1)
     ORDER BY pu.conversion_factor DESC`,
    [productIds]
  );
  const map = new Map<string, Array<typeof result.rows[0]>>();
  for (const row of result.rows) {
    const pid = row.productId;
    if (!map.has(pid)) map.set(pid, []);
    map.get(pid)!.push(row);
  }
  return map;
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

/**
 * Generate next product number (PROD-NNNNNN format).
 * Uses advisory lock + sequence — safe for concurrent calls.
 * Accepts Pool or PoolClient so it can participate in a transaction.
 */
export async function generateProductNumber(conn: pg.Pool | pg.PoolClient): Promise<string> {
  await conn.query(`SELECT pg_advisory_xact_lock(hashtext('product_number_seq'))`);
  const result = await conn.query(`SELECT nextval('product_number_seq') AS seq`);
  const seq = parseInt(result.rows[0].seq, 10);
  return `PROD-${seq.toString().padStart(6, '0')}`;
}

export async function createProduct(data: CreateProduct, dbPool?: pg.Pool): Promise<Product> {
  const pool = dbPool || globalPool;

  // Generate product number in app layer (trigger removed — SAP/Odoo pattern)
  const productNumber = await generateProductNumber(pool);

  const params = [
    productNumber,
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
    data.preferredSupplierId || null,
    data.supplierProductCode || null,
    data.purchaseUomId || null,
    data.leadTimeDays ?? 0,
  ];

  const sql = `INSERT INTO products (
      product_number, sku, barcode, name, description, category, generic_name,
      conversion_factor,
      cost_price, selling_price, is_taxable, tax_rate, costing_method,
      pricing_formula, auto_update_price, reorder_level, track_expiry, min_days_before_expiry_sale, is_active,
      preferred_supplier_id, supplier_product_code, purchase_uom_id, lead_time_days
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
    RETURNING ${PRODUCT_RETURNING_COLUMNS}`;

  const result = await pool.query(sql, params);
  const product = result.rows[0];

  // Create child rows (replaces fn_product_create_children trigger)
  await pool.query(
    `INSERT INTO product_inventory (product_id, quantity_on_hand, reorder_level, reorder_quantity)
     VALUES ($1, 0, $2, $3)
     ON CONFLICT (product_id) DO NOTHING`,
    [product.id, data.reorderLevel ?? 0, data.reorderQuantity ?? 0]
  );
  await pool.query(
    `INSERT INTO product_valuation (
       product_id, cost_price, selling_price, costing_method,
       average_cost, last_cost, pricing_formula, auto_update_price
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (product_id) DO NOTHING`,
    [product.id, data.costPrice ?? 0, data.sellingPrice ?? 0,
    data.costingMethod || 'FIFO', data.costPrice ?? 0, data.costPrice ?? 0,
    data.pricingFormula || null, data.autoUpdatePrice ?? false]
  );

  return product;
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
  if (data.preferredSupplierId !== undefined) {
    masterFields.push(`preferred_supplier_id = $${masterIdx++}`);
    masterValues.push(data.preferredSupplierId || null);
  }
  if (data.supplierProductCode !== undefined) {
    masterFields.push(`supplier_product_code = $${masterIdx++}`);
    masterValues.push(data.supplierProductCode || null);
  }
  if (data.purchaseUomId !== undefined) {
    masterFields.push(`purchase_uom_id = $${masterIdx++}`);
    masterValues.push(data.purchaseUomId || null);
  }
  if (data.leadTimeDays !== undefined) {
    masterFields.push(`lead_time_days = $${masterIdx++}`);
    masterValues.push(data.leadTimeDays);
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
  if (data.reorderQuantity !== undefined) {
    invFields.push(`reorder_quantity = $${invIdx++}`);
    invValues.push(data.reorderQuantity);
  }

  const hasChanges = masterFields.length > 0 || valFields.length > 0 || invFields.length > 0;
  if (!hasChanges) {
    return findProductById(id, pool);
  }

  // Execute updates (each only if there are fields to set)
  if (masterFields.length > 0) {
    masterFields.push(`version = version + 1`);
    masterFields.push(`updated_at = NOW()`);
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
  const result = await pool.query('UPDATE products SET is_active = false, updated_at = NOW() WHERE id = $1', [id]);

  return result.rowCount !== null && result.rowCount > 0;
}

export async function countProducts(dbPool?: pg.Pool, search?: string): Promise<number> {
  const pool = dbPool || globalPool;
  const params: string[] = [];
  let whereClause = 'WHERE is_active = true';
  if (search && search.trim().length > 0) {
    const pattern = `%${search.trim()}%`;
    whereClause += ` AND (name ILIKE $1 OR sku ILIKE $1 OR barcode ILIKE $1)`;
    params.push(pattern);
  }
  const result = await pool.query(`SELECT COUNT(*) as count FROM products ${whereClause}`, params);

  return parseInt(result.rows[0].count, 10);
}

// ── Bulk Upsert for Opening Inventory Import ──────────────────────────────

export interface BulkImportProductRow {
  sku: string;
  barcode?: string;
  name: string;
  description?: string;
  category?: string;
  genericName?: string;
  conversionFactor?: number;
  costPrice?: number;
  sellingPrice?: number;
  isTaxable?: boolean;
  taxRate?: number;
  costingMethod?: string;
  pricingFormula?: string;
  autoUpdatePrice?: boolean;
  reorderLevel?: number;
  trackExpiry?: boolean;
  minDaysBeforeExpirySale?: number;
  isActive?: boolean;
  unitOfMeasure?: string;
}

export interface BulkUpsertResult {
  inserted: number;
  skipped: number;
  skuToProductId: Map<string, string>;
}

/**
 * Bulk upsert product master data for opening inventory import.
 * Handles: products, product_valuation, product_inventory (qty=0), product_uoms.
 * Does NOT create batches, stock movements, or cost layers — those flow through
 * goodsReceiptService.createOpeningBalanceGRN() per ERP best practices.
 *
 * @param client - Transaction client (caller manages tx boundary)
 * @param rows - Validated product rows from CSV
 * @param duplicateStrategy - SKIP | UPDATE | FAIL
 */
export async function bulkUpsertForImport(
  client: pg.PoolClient,
  rows: BulkImportProductRow[],
  duplicateStrategy: DuplicateStrategy
): Promise<BulkUpsertResult> {
  if (rows.length === 0) return { inserted: 0, skipped: 0, skuToProductId: new Map() };

  // Pre-generate product numbers (app-layer, advisory lock for concurrency)
  await client.query(`SELECT pg_advisory_xact_lock(hashtext('product_number_seq'))`);
  const seqResult = await client.query(
    `SELECT nextval('product_number_seq') AS seq FROM generate_series(1, $1)`,
    [rows.length]
  );
  const productNumbers = seqResult.rows.map(
    (r: { seq: string }) => `PROD-${String(r.seq).padStart(6, '0')}`
  );

  // Build bulk INSERT
  const values: unknown[] = [];
  const placeholders: string[] = [];
  let idx = 1;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    placeholders.push(
      `($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5}, $${idx + 6},
        $${idx + 7}, $${idx + 8}, $${idx + 9}, $${idx + 10}, $${idx + 11}, $${idx + 12},
        $${idx + 13}, $${idx + 14}, $${idx + 15}, $${idx + 16}, $${idx + 17}, $${idx + 18})`
    );
    values.push(
      productNumbers[i],
      r.sku,
      r.barcode || null,
      r.name,
      r.description || null,
      r.category || null,
      r.genericName || null,
      r.conversionFactor ?? 1,
      r.costPrice ?? 0,
      r.sellingPrice ?? 0,
      r.isTaxable ?? false,
      r.taxRate ?? 0,
      r.costingMethod || 'FIFO',
      r.pricingFormula || null,
      r.autoUpdatePrice ?? false,
      r.reorderLevel ?? 0,
      r.trackExpiry ?? false,
      r.minDaysBeforeExpirySale ?? 0,
      r.isActive ?? true
    );
    idx += 19;
  }

  let conflictClause: string;
  if (duplicateStrategy === 'UPDATE') {
    conflictClause = `ON CONFLICT (sku) DO UPDATE SET
      name = EXCLUDED.name,
      barcode = EXCLUDED.barcode,
      description = EXCLUDED.description,
      category = EXCLUDED.category,
      generic_name = EXCLUDED.generic_name,
      conversion_factor = EXCLUDED.conversion_factor,
      cost_price = EXCLUDED.cost_price,
      selling_price = EXCLUDED.selling_price,
      is_taxable = EXCLUDED.is_taxable,
      tax_rate = EXCLUDED.tax_rate,
      costing_method = EXCLUDED.costing_method,
      pricing_formula = EXCLUDED.pricing_formula,
      auto_update_price = EXCLUDED.auto_update_price,
      reorder_level = EXCLUDED.reorder_level,
      track_expiry = EXCLUDED.track_expiry,
      min_days_before_expiry_sale = EXCLUDED.min_days_before_expiry_sale,
      is_active = EXCLUDED.is_active`;
  } else {
    conflictClause = `ON CONFLICT (sku) DO NOTHING`;
  }

  const sql = `
    INSERT INTO products (
      product_number, sku, barcode, name, description, category, generic_name,
      conversion_factor, cost_price, selling_price,
      is_taxable, tax_rate, costing_method,
      pricing_formula, auto_update_price,
      reorder_level, track_expiry, min_days_before_expiry_sale, is_active
    ) VALUES ${placeholders.join(', ')}
    ${conflictClause}
    RETURNING id, sku`;

  const result = await client.query(sql, values);
  const inserted = result.rowCount ?? 0;
  const skipped = rows.length - inserted;

  // Build SKU → product ID map (RETURNING + fallback for existing)
  const skuToProductId = new Map<string, string>();
  for (const row of result.rows) {
    skuToProductId.set(String(row.sku).toLowerCase(), row.id);
  }
  const missingSKUs = rows
    .filter((r) => !skuToProductId.has(r.sku.toLowerCase()))
    .map((r) => r.sku);
  if (missingSKUs.length > 0) {
    const lookupResult = await client.query(
      `SELECT id, LOWER(sku) AS sku FROM products WHERE LOWER(sku) = ANY($1::text[])`,
      [missingSKUs.map((s) => s.toLowerCase())]
    );
    for (const row of lookupResult.rows) {
      skuToProductId.set(row.sku, row.id);
    }
  }

  // ── Sync child tables ──
  const newlyInsertedIds = new Set<string>(result.rows.map((r: { id: string }) => r.id));
  const idsToSync =
    duplicateStrategy === 'UPDATE' ? new Set<string>(skuToProductId.values()) : newlyInsertedIds;

  if (idsToSync.size > 0) {
    const syncRows = rows.filter((r) => {
      const pid = skuToProductId.get(r.sku.toLowerCase());
      return pid && idsToSync.has(pid);
    });

    // ── product_valuation: prices, costing, formula ──
    const pvValues: unknown[] = [];
    const pvPlaceholders: string[] = [];
    let pvIdx = 1;
    for (const r of syncRows) {
      const productId = skuToProductId.get(r.sku.toLowerCase())!;
      pvPlaceholders.push(
        `($${pvIdx}::uuid, $${pvIdx + 1}::numeric, $${pvIdx + 2}::numeric, $${pvIdx + 3}::numeric, $${pvIdx + 4}::numeric, $${pvIdx + 5}, $${pvIdx + 6}, $${pvIdx + 7}::boolean)`
      );
      pvValues.push(
        productId,
        r.costPrice ?? 0,
        r.sellingPrice ?? 0,
        r.costPrice ?? 0,
        r.costPrice ?? 0,
        r.costingMethod || 'FIFO',
        r.pricingFormula || null,
        r.autoUpdatePrice ?? false
      );
      pvIdx += 8;
    }
    if (pvPlaceholders.length > 0) {
      await client.query(
        `INSERT INTO product_valuation (product_id, cost_price, selling_price, average_cost, last_cost, costing_method, pricing_formula, auto_update_price)
         VALUES ${pvPlaceholders.join(', ')}
         ON CONFLICT (product_id) DO UPDATE SET
           cost_price = EXCLUDED.cost_price,
           selling_price = EXCLUDED.selling_price,
           average_cost = EXCLUDED.average_cost,
           last_cost = EXCLUDED.last_cost,
           costing_method = EXCLUDED.costing_method,
           pricing_formula = EXCLUDED.pricing_formula,
           auto_update_price = EXCLUDED.auto_update_price,
           updated_at = NOW()`,
        pvValues
      );
    }

    // ── product_inventory: init with qty=0 (inventory flows through GRN) ──
    const piValues: unknown[] = [];
    const piPlaceholders: string[] = [];
    let piIdx = 1;
    for (const r of syncRows) {
      const productId = skuToProductId.get(r.sku.toLowerCase())!;
      piPlaceholders.push(`($${piIdx}::uuid, $${piIdx + 1}::numeric)`);
      piValues.push(productId, r.reorderLevel ?? 0);
      piIdx += 2;
    }
    if (piPlaceholders.length > 0) {
      await client.query(
        `INSERT INTO product_inventory (product_id, quantity_on_hand, reorder_level)
         VALUES ${piPlaceholders.join(', ')}
         ON CONFLICT (product_id) DO UPDATE SET
           reorder_level = EXCLUDED.reorder_level,
           updated_at = NOW()`,
        piValues
      );
    }

    // ── product_uoms: assign UOM to imported products ──
    {
      const allUoms = await client.query(
        `SELECT id, UPPER(name) AS name, UPPER(symbol) AS symbol FROM uoms`
      );
      const uomNameMap = new Map<string, string>();
      for (const u of allUoms.rows) {
        uomNameMap.set(u.name, u.id);
        if (u.symbol) uomNameMap.set(u.symbol, u.id);
      }
      const eachUomId = uomNameMap.get('EACH') || uomNameMap.get('EA');

      // Auto-create missing UoMs
      const missingUoms = new Set<string>();
      for (const r of syncRows) {
        if (r.unitOfMeasure) {
          const upper = r.unitOfMeasure.toUpperCase();
          if (!uomNameMap.has(upper)) missingUoms.add(r.unitOfMeasure);
        }
      }
      for (const uomName of missingUoms) {
        const res = await client.query(
          `INSERT INTO uoms (name, symbol, type) VALUES ($1, $2, 'QUANTITY') RETURNING id, UPPER(name) AS name`,
          [uomName, uomName.toLowerCase()]
        );
        if (res.rows[0]) {
          uomNameMap.set(res.rows[0].name, res.rows[0].id);
        }
      }

      const puValues: unknown[] = [];
      const puPlaceholders: string[] = [];
      let puIdx = 1;
      for (const r of syncRows) {
        const productId = skuToProductId.get(r.sku.toLowerCase())!;
        let uomId: string | undefined;
        if (r.unitOfMeasure) {
          uomId = uomNameMap.get(r.unitOfMeasure.toUpperCase());
        }
        if (!uomId) uomId = eachUomId;
        if (!uomId) continue;
        puPlaceholders.push(`($${puIdx}::uuid, $${puIdx + 1}::uuid, 1.0, true)`);
        puValues.push(productId, uomId);
        puIdx += 2;
      }
      if (puPlaceholders.length > 0) {
        const productIdsToSync = syncRows
          .map((r) => skuToProductId.get(r.sku.toLowerCase()))
          .filter((pid): pid is string => !!pid);
        if (productIdsToSync.length > 0) {
          await client.query(
            `UPDATE product_uoms SET is_default = false
             WHERE product_id = ANY($1::uuid[]) AND is_default = true`,
            [productIdsToSync]
          );
        }

        await client.query(
          `INSERT INTO product_uoms (product_id, uom_id, conversion_factor, is_default)
           VALUES ${puPlaceholders.join(', ')}
           ON CONFLICT (product_id, uom_id) DO UPDATE SET
             is_default = true,
             updated_at = NOW()`,
          puValues
        );
      }
    }
  }

  return { inserted, skipped, skuToProductId };
}

// ── Procurement Search (ERP-grade PO search) ────────────────────────────

export interface ProcurementSearchResult {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  genericName: string | null;
  quantityOnHand: number;
  reorderLevel: number;
  reorderQuantity: number;
  costPrice: number;
  lastCost: number;
  preferredSupplierId: string | null;
  supplierProductCode: string | null;
  purchaseUomId: string | null;
  leadTimeDays: number;
  trackExpiry: boolean;
  // Supplier-specific pricing (when supplierId provided)
  supplierLastPrice: number | null;
  supplierPurchaseCount: number | null;
  supplierName: string | null;
}

/**
 * Procurement-aware product search for PO creation.
 * Searches: name, sku, barcode, generic_name, supplier_product_code.
 * Returns inventory intelligence: on-hand, reorder, last cost, supplier pricing.
 * 
 * When supplierId is provided, also returns that supplier's last purchase price.
 */
export async function procurementSearch(
  query: string,
  supplierId: string | null,
  limit: number = 20,
  dbPool?: pg.Pool
): Promise<ProcurementSearchResult[]> {
  const pool = dbPool || globalPool;
  const pattern = `%${query.trim()}%`;
  const params: (string | number)[] = [pattern, limit];
  let supplierJoin = '';
  let supplierSelect = `
      NULL::numeric AS "supplierLastPrice",
      NULL::integer AS "supplierPurchaseCount",
      NULL::text AS "supplierName"`;

  if (supplierId) {
    params.push(supplierId);
    const supplierIdx = params.length; // $3
    supplierJoin = `LEFT JOIN supplier_product_prices spp ON spp.product_id = p.id AND spp.supplier_id = $${supplierIdx}
    LEFT JOIN suppliers s ON s."Id" = spp.supplier_id`;
    supplierSelect = `
      spp.last_purchase_price AS "supplierLastPrice",
      spp.purchase_count AS "supplierPurchaseCount",
      s."CompanyName" AS "supplierName"`;
  }

  const sql = `
    SELECT
      p.id,
      p.name,
      p.sku,
      p.barcode,
      p.generic_name AS "genericName",
      COALESCE(pi.quantity_on_hand, 0) AS "quantityOnHand",
      COALESCE(pi.reorder_level, 0) AS "reorderLevel",
      COALESCE(pi.reorder_quantity, 0) AS "reorderQuantity",
      COALESCE(pv.cost_price, 0) AS "costPrice",
      COALESCE(pv.last_cost, 0) AS "lastCost",
      p.preferred_supplier_id AS "preferredSupplierId",
      p.supplier_product_code AS "supplierProductCode",
      p.purchase_uom_id AS "purchaseUomId",
      COALESCE(p.lead_time_days, 0) AS "leadTimeDays",
      p.track_expiry AS "trackExpiry",
      ${supplierSelect}
    FROM products p
    LEFT JOIN product_inventory pi ON pi.product_id = p.id
    LEFT JOIN product_valuation pv ON pv.product_id = p.id
    ${supplierJoin}
    WHERE p.is_active = true
      AND (
        p.name ILIKE $1
        OR p.sku ILIKE $1
        OR p.barcode ILIKE $1
        OR p.generic_name ILIKE $1
        OR p.supplier_product_code ILIKE $1
      )
    ORDER BY
      CASE WHEN p.name ILIKE $1 THEN 0 ELSE 1 END,
      p.name ASC
    LIMIT $2`;

  const result = await pool.query(sql, params);
  return result.rows;
}
