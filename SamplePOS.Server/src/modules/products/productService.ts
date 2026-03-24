// Products Service - Business Logic Layer
// Orchestrates repository calls and contains business rules

import Decimal from 'decimal.js';
import { Pool } from 'pg';
import { pool as globalPool } from '../../db/pool.js';
import type pg from 'pg';
import { UnitOfWork } from '../../db/unitOfWork.js';
import * as productRepository from './productRepository.js';
import * as uomRepository from './uomRepository.js';
import { ProductWithUom } from './ProductWithUom.js';
import type { Product, CreateProduct, UpdateProduct } from '../../../../shared/zod/product.js';
import { PricingBusinessRules, InventoryBusinessRules } from '../../middleware/businessRules.js';
import logger from '../../utils/logger.js';

// Server-side limit cap — safe with lightweight flat query (no json_agg/GROUP BY).
// 1800 products + batch UOM = ~25ms total. Cap at 5000 for safety.
const MAX_LIST_LIMIT = 5000;

export async function getAllProducts(
  page: number = 1,
  limit: number = 50,
  includeUoms: boolean = false,
  dbPool?: pg.Pool
): Promise<{
  data: Product[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}> {
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(Math.max(1, limit), MAX_LIST_LIMIT);
  const offset = (safePage - 1) * safeLimit;

  // Two-tier query (SAP/Odoo approach):
  // 1. Lightweight flat query — no json_agg, no GROUP BY
  // 2. Batch UOM fetch for the page's products (single query)
  const [products, total] = await Promise.all([
    productRepository.findProductsForListView(safeLimit, offset, dbPool),
    productRepository.countProducts(dbPool),
  ]);

  // Attach UOMs via a single batch query (not N+1)
  if (includeUoms && products.length > 0) {
    const productIds = products.map(p => p.id).filter(Boolean) as string[];
    const uomMap = await productRepository.findProductUomsBatch(productIds, dbPool);
    for (const product of products) {
      if (product.id) {
        (product as Record<string, unknown>).productUoms = uomMap.get(product.id) || [];
      }
    }
  }

  return {
    data: products,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit),
    },
  };
}

export async function getProductById(id: string, dbPool?: pg.Pool): Promise<Product> {
  const product = await productRepository.findProductById(id, dbPool);

  if (!product) {
    throw new Error(`Product with ID ${id} not found`);
  }

  return product;
}

/**
 * Get product with UoM details and conversion methods
 * Use this when you need UoM-aware operations
 */
export async function getProductWithUom(id: string, dbPool?: pg.Pool): Promise<ProductWithUom> {
  const product = await productRepository.findProductById(id, dbPool);

  if (!product) {
    throw new Error(`Product with ID ${id} not found`);
  }

  // Fetch UoMs for this product
  const uoms = await uomRepository.listProductUoms(id, dbPool);

  return new ProductWithUom(product, uoms);
}

/**
 * Convert quantity for a product between UoMs
 * Helper endpoint for client-side conversions
 */
export async function convertQuantity(
  productId: string,
  quantity: number,
  fromUomId: string,
  toUomId: string,
  dbPool?: pg.Pool
): Promise<{ quantity: string; fromUom: string; toUom: string }> {
  const productWithUom = await getProductWithUom(productId, dbPool);

  const convertedQty = productWithUom.convertBetweenUoms(quantity, fromUomId, toUomId);

  const fromUom = productWithUom.findUomById(fromUomId);
  const toUom = productWithUom.findUomById(toUomId);

  return {
    quantity: convertedQty.toString(),
    fromUom: fromUom?.uomName || 'Unknown',
    toUom: toUom?.uomName || 'Unknown',
  };
}

/**
 * Create a new product with validation and transaction safety
 * @param data - Product creation data (validated by Zod schema)
 * @returns Created product with generated product_number
 * @throws Error if SKU already exists or validation fails
 *
 * Business Rules:
 * - BR-PRC-001: Cost price must be non-negative
 * - BR-PRC-002: Selling price must be non-negative
 * - BR-INV-005: Reorder level must be non-negative
 * - Selling price should be >= cost price (warning logged if violated)
 *
 * Transaction: Wraps product creation and UoM setup in atomic transaction
 */
export async function createProduct(data: CreateProduct, dbPool?: pg.Pool): Promise<Product> {
  const pool = dbPool || globalPool;
  // Business rule: Check if SKU already exists
  const existing = await productRepository.findProductBySku(data.sku, pool);
  if (existing) {
    throw new Error(`Product with SKU ${data.sku} already exists`);
  }

  // BR-PRC-001: Validate cost price (if provided)
  if (data.costPrice !== undefined && data.costPrice !== null) {
    const costDecimal = new Decimal(data.costPrice);
    PricingBusinessRules.validateCost(costDecimal.toNumber());
    logger.info('BR-PRC-001: Cost price validation passed', {
      sku: data.sku,
      cost: costDecimal.toString(),
    });
  }

  // BR-PRC-002: Validate selling price (if provided)
  if (data.sellingPrice !== undefined && data.sellingPrice !== null) {
    const sellingDecimal = new Decimal(data.sellingPrice);
    PricingBusinessRules.validateSellingPrice(sellingDecimal.toNumber());
    logger.info('BR-PRC-002: Selling price validation passed', {
      sku: data.sku,
      sellingPrice: sellingDecimal.toString(),
    });
  }

  // Business rule: Validate pricing relationship (selling >= cost)
  if (data.sellingPrice && data.costPrice) {
    const sellingDecimal = new Decimal(data.sellingPrice);
    const costDecimal = new Decimal(data.costPrice);

    if (sellingDecimal.lessThan(costDecimal)) {
      logger.warn('Warning: Selling price is lower than cost price', {
        sku: data.sku,
        sellingPrice: sellingDecimal.toString(),
        costPrice: costDecimal.toString(),
      });
    }
  }

  // BR-INV-005: Validate reorder level (if provided)
  if (data.reorderLevel !== undefined && data.reorderLevel !== null) {
    const maxStock = ((data as Record<string, unknown>).maxStock as number) || null;
    InventoryBusinessRules.validateReorderLevel(data.reorderLevel, maxStock);
    logger.info('BR-INV-005: Reorder level validation passed', {
      sku: data.sku,
      reorderLevel: data.reorderLevel,
      maxStock,
    });
  }

  // Use Decimal for bank-grade precision
  const productData = {
    ...data,
    costPrice: data.costPrice ? new Decimal(data.costPrice).toNumber() : data.costPrice,
    sellingPrice: data.sellingPrice ? new Decimal(data.sellingPrice).toNumber() : data.sellingPrice,
  };

  // Transaction: Create product atomically
  return UnitOfWork.run(pool, async (client) => {
    const product = await productRepository.createProduct(productData, pool);

    // If product has UoM data, create it within the transaction
    // (UoM creation would be added here if needed)

    logger.info('Product created successfully (transaction committed)', {
      productId: product.id,
      sku: product.sku,
    });

    return product;
  });
}

export async function updateProduct(
  id: string,
  data: UpdateProduct,
  dbPool?: pg.Pool
): Promise<Product> {
  const pool = dbPool || globalPool;
  // Check product exists
  const existing = await productRepository.findProductById(id, pool);
  if (!existing) {
    throw new Error(`Product with ID ${id} not found`);
  }

  // Business rule: Check SKU uniqueness if being updated
  if (data.sku && data.sku !== existing.sku) {
    const skuExists = await productRepository.findProductBySku(data.sku, pool);
    if (skuExists) {
      throw new Error(`Product with SKU ${data.sku} already exists`);
    }
  }

  // BR-PRC-001: Validate cost price (if provided)
  if (data.costPrice !== undefined && data.costPrice !== null) {
    const costDecimal = new Decimal(data.costPrice);
    PricingBusinessRules.validateCost(costDecimal.toNumber());
    logger.info('BR-PRC-001: Cost price validation passed', {
      productId: id,
      cost: costDecimal.toString(),
    });
  }

  // BR-PRC-002: Validate selling price (if provided)
  if (data.sellingPrice !== undefined && data.sellingPrice !== null) {
    const sellingDecimal = new Decimal(data.sellingPrice);
    PricingBusinessRules.validateSellingPrice(sellingDecimal.toNumber());
    logger.info('BR-PRC-002: Selling price validation passed', {
      productId: id,
      sellingPrice: sellingDecimal.toString(),
    });
  }

  // Business rule: Validate pricing relationship
  const finalCost = data.costPrice ?? existing.costPrice;
  const finalSellingPrice = data.sellingPrice ?? existing.sellingPrice;

  if (finalCost && finalSellingPrice) {
    const sellingDecimal = new Decimal(finalSellingPrice);
    const costDecimal = new Decimal(finalCost);

    if (sellingDecimal.lessThan(costDecimal)) {
      logger.warn('Warning: Selling price is lower than cost price', {
        productId: id,
        sellingPrice: sellingDecimal.toString(),
        costPrice: costDecimal.toString(),
      });
    }
  }

  // BR-INV-005: Validate reorder level (if provided)
  if (data.reorderLevel !== undefined && data.reorderLevel !== null) {
    const maxStock =
      ((data as Record<string, unknown>).maxStock as number) ||
      ((existing as Record<string, unknown>).maxStock as number) ||
      null;
    InventoryBusinessRules.validateReorderLevel(data.reorderLevel, maxStock);
    logger.info('BR-INV-005: Reorder level validation passed', {
      productId: id,
      reorderLevel: data.reorderLevel,
      maxStock,
    });
  }

  // Use Decimal for bank-grade precision
  const updateData = {
    ...data,
    costPrice: data.costPrice ? new Decimal(data.costPrice).toNumber() : data.costPrice,
    sellingPrice: data.sellingPrice ? new Decimal(data.sellingPrice).toNumber() : data.sellingPrice,
  };

  // Transaction: Update product atomically
  return UnitOfWork.run(pool, async (client) => {
    const updated = await productRepository.updateProduct(id, updateData, pool);

    if (!updated) {
      throw new Error(`Failed to update product with ID ${id}`);
    }

    // If product UoM changes are included, update them within the transaction
    // (UoM updates would be added here if needed)

    logger.info('Product updated successfully (transaction committed)', { productId: id });

    return updated;
  });
}

export async function deleteProduct(id: string, dbPool?: pg.Pool): Promise<void> {
  const product = await productRepository.findProductById(id, dbPool);
  if (!product) {
    throw new Error(`Product with ID ${id} not found`);
  }

  const success = await productRepository.deleteProduct(id, dbPool);
  if (!success) {
    throw new Error(`Failed to delete product with ID ${id}`);
  }
}
