// Products Repository - Database Layer
// Contains ONLY SQL queries - NO business logic

import pool from '../../db/pool.js';
import type { Product, CreateProduct, UpdateProduct } from '../../../../shared/zod/product.js';

export async function findAllProducts(limit: number = 50, offset: number = 0): Promise<Product[]> {
  const result = await pool.query(
    `SELECT 
      p.id, p.product_number as "productNumber", p.sku, p.barcode, p.name, p.description, p.category,
      p.conversion_factor as "conversionFactor",
      p.cost_price as "costPrice",
      p.selling_price as "sellingPrice",
      p.is_taxable as "isTaxable",
      p.tax_rate as "taxRate",
      p.costing_method as "costingMethod",
      p.average_cost as "averageCost",
      p.last_cost as "lastCost",
      p.pricing_formula as "pricingFormula",
      p.auto_update_price as "autoUpdatePrice",
      p.quantity_on_hand as "quantityOnHand",
      p.reorder_level as "reorderLevel",
      p.track_expiry as "trackExpiry",
      p.is_active as "isActive",
      p.created_at as "createdAt",
      p.updated_at as "updatedAt",
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
      ) as "productUoms"
    FROM products p
    LEFT JOIN product_uoms pu ON p.id = pu.product_id
    LEFT JOIN uoms u ON pu.uom_id = u.id
    WHERE p.is_active = true
    GROUP BY p.id, p.product_number, p.sku, p.barcode, p.name, p.description, p.category,
             p.conversion_factor, p.cost_price, p.selling_price,
             p.is_taxable, p.tax_rate, p.costing_method, p.average_cost, p.last_cost,
             p.pricing_formula, p.auto_update_price, p.quantity_on_hand,
             p.reorder_level, p.track_expiry, p.is_active, p.created_at, p.updated_at
    ORDER BY p.name ASC
    LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  return result.rows;
}

export async function findProductById(id: string): Promise<Product | null> {
  const result = await pool.query(
    `SELECT 
      p.id, p.product_number as "productNumber", p.sku, p.barcode, p.name, p.description, p.category,
      p.conversion_factor as "conversionFactor",
      p.cost_price as "costPrice",
      p.selling_price as "sellingPrice",
      p.is_taxable as "isTaxable",
      p.tax_rate as "taxRate",
      p.costing_method as "costingMethod",
      p.average_cost as "averageCost",
      p.last_cost as "lastCost",
      p.pricing_formula as "pricingFormula",
      p.auto_update_price as "autoUpdatePrice",
      p.quantity_on_hand as "quantityOnHand",
      p.reorder_level as "reorderLevel",
      p.track_expiry as "trackExpiry",
      p.is_active as "isActive",
      p.created_at as "createdAt",
      p.updated_at as "updatedAt",
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
      ) as "productUoms"
    FROM products p
    LEFT JOIN product_uoms pu ON p.id = pu.product_id
    LEFT JOIN uoms u ON pu.uom_id = u.id
    WHERE p.id = $1
    GROUP BY p.id, p.product_number, p.sku, p.barcode, p.name, p.description, p.category,
             p.conversion_factor, p.cost_price, p.selling_price,
             p.is_taxable, p.tax_rate, p.costing_method, p.average_cost, p.last_cost,
             p.pricing_formula, p.auto_update_price, p.quantity_on_hand,
             p.reorder_level, p.track_expiry, p.is_active, p.created_at, p.updated_at`,
    [id]
  );

  return result.rows[0] || null;
}

export async function findProductBySku(sku: string): Promise<Product | null> {
  const result = await pool.query(
    `SELECT 
      p.id, p.product_number as "productNumber", p.sku, p.barcode, p.name, p.description, p.category,
      p.conversion_factor as "conversionFactor",
      p.cost_price as "costPrice",
      p.selling_price as "sellingPrice",
      p.is_taxable as "isTaxable",
      p.tax_rate as "taxRate",
      p.costing_method as "costingMethod",
      p.average_cost as "averageCost",
      p.last_cost as "lastCost",
      p.pricing_formula as "pricingFormula",
      p.auto_update_price as "autoUpdatePrice",
      p.quantity_on_hand as "quantityOnHand",
      p.reorder_level as "reorderLevel",
      p.track_expiry as "trackExpiry",
      p.is_active as "isActive",
      p.created_at as "createdAt",
      p.updated_at as "updatedAt",
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
      ) as "productUoms"
    FROM products p
    LEFT JOIN product_uoms pu ON p.id = pu.product_id
    LEFT JOIN uoms u ON pu.uom_id = u.id
    WHERE p.sku = $1
    GROUP BY p.id, p.product_number, p.sku, p.barcode, p.name, p.description, p.category,
             p.conversion_factor, p.cost_price, p.selling_price,
             p.is_taxable, p.tax_rate, p.costing_method, p.average_cost, p.last_cost,
             p.pricing_formula, p.auto_update_price, p.quantity_on_hand,
             p.reorder_level, p.track_expiry, p.is_active, p.created_at, p.updated_at`,
    [sku]
  );

  return result.rows[0] || null;
}

export async function createProduct(data: CreateProduct): Promise<Product> {
  const result = await pool.query(
    `INSERT INTO products (
      sku, barcode, name, description, category,
      conversion_factor,
      cost_price, selling_price, is_taxable, tax_rate, costing_method,
      pricing_formula, auto_update_price, reorder_level, track_expiry, is_active
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    RETURNING 
      id, product_number as "productNumber", sku, barcode, name, description, category,
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
      is_active as "isActive",
      created_at as "createdAt",
      updated_at as "updatedAt"`,
    [
      data.sku,
      data.barcode || null,
      data.name,
      data.description || null,
      data.category || null,
      data.conversionFactor || 1.0,
      data.costPrice || 0,
      data.sellingPrice || 0,
      (data as any).isTaxable ?? false,
      (data as any).taxRate ?? 0,
      data.costingMethod || 'FIFO',
      data.pricingFormula || null,
      data.autoUpdatePrice ?? false,
      data.reorderLevel ?? 0,
      data.trackExpiry ?? false,
      (data as any).isActive ?? true,
    ]
  );

  return result.rows[0];
}

export async function updateProduct(id: string, data: UpdateProduct): Promise<Product | null> {
  const fields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  // Build dynamic UPDATE query
  if (data.sku !== undefined) {
    fields.push(`sku = $${paramIndex++}`);
    values.push(data.sku);
  }
  if (data.barcode !== undefined) {
    fields.push(`barcode = $${paramIndex++}`);
    values.push(data.barcode);
  }
  if (data.name !== undefined) {
    fields.push(`name = $${paramIndex++}`);
    values.push(data.name);
  }
  if (data.description !== undefined) {
    fields.push(`description = $${paramIndex++}`);
    values.push(data.description);
  }
  if (data.category !== undefined) {
    fields.push(`category = $${paramIndex++}`);
    values.push(data.category);
  }
  if (data.costPrice !== undefined) {
    fields.push(`cost_price = $${paramIndex++}`);
    values.push(data.costPrice);
  }
  if (data.sellingPrice !== undefined) {
    fields.push(`selling_price = $${paramIndex++}`);
    values.push(data.sellingPrice);
  }
  if ((data as any).isTaxable !== undefined) {
    fields.push(`is_taxable = $${paramIndex++}`);
    values.push((data as any).isTaxable);
  }
  if ((data as any).taxRate !== undefined) {
    fields.push(`tax_rate = $${paramIndex++}`);
    values.push((data as any).taxRate);
  }
  if (data.reorderLevel !== undefined) {
    fields.push(`reorder_level = $${paramIndex++}`);
    values.push(data.reorderLevel);
  }
  if (data.trackExpiry !== undefined) {
    fields.push(`track_expiry = $${paramIndex++}`);
    values.push(data.trackExpiry);
  }
  if ((data as any).isActive !== undefined) {
    fields.push(`is_active = $${paramIndex++}`);
    values.push((data as any).isActive);
  }

  if (fields.length === 0) {
    return findProductById(id);
  }

  values.push(id);

  const result = await pool.query(
    `UPDATE products 
     SET ${fields.join(', ')}
     WHERE id = $${paramIndex}
     RETURNING 
      id, product_number as "productNumber", sku, barcode, name, description, category,
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
      is_active as "isActive",
      created_at as "createdAt",
      updated_at as "updatedAt"`,
    values
  );

  return result.rows[0] || null;
}

export async function deleteProduct(id: string): Promise<boolean> {
  // Soft delete
  const result = await pool.query('UPDATE products SET is_active = false WHERE id = $1', [id]);

  return result.rowCount !== null && result.rowCount > 0;
}

export async function countProducts(): Promise<number> {
  const result = await pool.query('SELECT COUNT(*) as count FROM products WHERE is_active = true');

  return parseInt(result.rows[0].count, 10);
}
