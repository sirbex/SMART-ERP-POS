// Products Controller - HTTP Request/Response Handling
// Handles Express routes, validates input with Zod

import type { Request, Response } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { CreateProductSchema, UpdateProductSchema } from '../../../../shared/zod/product.js';
import * as productService from './productService.js';
import * as productRepository from './productRepository.js';
import * as supplierProductPriceRepository from '../suppliers/supplierProductPriceRepository.js';
import { normalizeResponse } from '../../utils/caseConverter.js';
import { asyncHandler, ValidationError } from '../../middleware/errorHandler.js';
import * as masterDataGuard from '../../services/masterDataGuard.js';
import { pool as globalPool } from '../../db/pool.js';
import logger from '../../utils/logger.js';

const UuidParamSchema = z.object({ id: z.string().uuid('ID must be a valid UUID') });

const ListProductsQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v) : 1)),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v) : 50)),
  includeUoms: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  search: z.string().optional(),
});

const ConvertQuantitySchema = z.object({
  quantity: z.number({ coerce: true }).positive('Quantity must be positive'),
  fromUomId: z.string().uuid('fromUomId must be a valid UUID'),
  toUomId: z.string().uuid('toUomId must be a valid UUID'),
});

interface AuditContext {
  userId: string;
  userName?: string;
  userRole?: string;
  ipAddress?: string;
  userAgent?: string;
}

interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    fullName: string;
    role: 'ADMIN' | 'MANAGER' | 'CASHIER' | 'STAFF';
  };
  pool?: Pool;
  auditContext?: AuditContext;
}

export const getProducts = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const { page, limit, includeUoms, search } = ListProductsQuerySchema.parse(req.query);

  const result = await productService.getAllProducts(page, limit, includeUoms, pool, search);

  res.json({
    success: true,
    data: result.data.map((product) => normalizeResponse(product)),
    pagination: result.pagination,
  });
});

export const getProduct = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const { id } = UuidParamSchema.parse(req.params);
  const includeUoms = req.query.includeUoms === 'true';

  if (includeUoms) {
    const productWithUom = await productService.getProductWithUom(id, pool);
    res.json({
      success: true,
      data: normalizeResponse(productWithUom.toJSON()),
    });
  } else {
    const product = await productService.getProductById(id, pool);
    res.json({
      success: true,
      data: normalizeResponse(product),
    });
  }
});

/**
 * Convert quantity between UoMs for a product
 * POST /products/:id/convert-quantity
 * Body: { quantity, fromUomId, toUomId }
 */
export const convertProductQuantity = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const { id } = UuidParamSchema.parse(req.params);
  const { quantity, fromUomId, toUomId } = ConvertQuantitySchema.parse(req.body);

  const result = await productService.convertQuantity(id, quantity, fromUomId, toUomId, pool);

  res.json({
    success: true,
    data: normalizeResponse(result),
  });
});

export const createProduct = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const authReq = req as AuthRequest;
  const validatedData = CreateProductSchema.parse(req.body);

  const product = await productService.createProduct(validatedData, pool);

  // Log audit trail (non-fatal)
  try {
    const auditContext: AuditContext = authReq.auditContext || {
      userId: authReq.user?.id || '00000000-0000-0000-0000-000000000000',
      userName: authReq.user?.fullName,
      userRole: authReq.user?.role,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    };

    const { logProductCreated } = await import('../audit/auditService.js');
    if (product.id) {
      await logProductCreated(
        pool,
        product.id,
        {
          name: product.name,
          sku: product.sku,
          productCode: product.sku,
          costPrice: product.costPrice,
          sellingPrice: product.sellingPrice,
        },
        auditContext
      );
    }
  } catch (auditError) {
    logger.error('Audit logging failed (non-fatal)', { error: auditError });
  }

  res.status(201).json({
    success: true,
    data: normalizeResponse(product),
    message: 'Product created successfully',
  });
});

export const updateProduct = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const { id } = req.params;
  const validatedData = UpdateProductSchema.parse(req.body);

  const product = await productService.updateProduct(id, validatedData, pool);

  res.json({
    success: true,
    data: normalizeResponse(product),
    message: 'Product updated successfully',
  });
});

export const getProductSupplierPrices = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const { id } = UuidParamSchema.parse(req.params);
  const prices = await supplierProductPriceRepository.getSupplierPricesForProduct(id, pool);
  res.json({ success: true, data: prices });
});

export const deleteProduct = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const { id } = UuidParamSchema.parse(req.params);

  await productService.deleteProduct(id, pool);

  res.json({
    success: true,
    message: 'Product deleted successfully',
  });
});

// ── Procurement Search (ERP-grade) ──────────────────────────────────────

const ProcurementSearchQuerySchema = z.object({
  q: z.string().min(1, 'Search query is required'),
  supplierId: z.string().uuid().optional(),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? Math.min(parseInt(v), 50) : 20)),
});

export const procurementSearch = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const { q, supplierId, limit } = ProcurementSearchQuerySchema.parse(req.query);

  const results = await productService.procurementSearchForPo(q, supplierId || null, limit, pool);

  res.json({ success: true, data: results });
});

// ── Master Data Guard: Damaged Items Scan ────────────────────────────────────

/**
 * GET /api/products/damaged
 * Returns all products where QoH > 0 but cost = 0 (post-reset damaged items).
 * Used by the DamagedItemsBanner to warn staff and trigger repair.
 */
export const getDamagedItems = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const items = await masterDataGuard.scanDamagedItems(pool);
  res.json({ success: true, data: items, count: items.length });
});

// ── Master Data Guard: Repair Item Valuation ─────────────────────────────────

const RepairValuationBodySchema = z.object({
  unitCost: z.number().positive('Unit cost must be greater than zero'),
});

/**
 * POST /api/products/:id/repair-valuation
 * Assigns a unit cost to existing zero-cost stock and posts
 * DR Inventory / CR Opening Balance Equity to the GL.
 */
export const repairItemValuation = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const { id } = UuidParamSchema.parse(req.params);
  const { unitCost } = RepairValuationBodySchema.parse(req.body);
  const userId = (req as any).user?.id;
  if (!userId) throw new ValidationError('Authentication required');

  const result = await masterDataGuard.repairItemValuation(pool, id, unitCost, userId);

  res.json({
    success: true,
    data: result,
    message: `Valuation repaired: ${result.productName} — ${result.quantityOnHand} units @ ${unitCost}`,
  });
});

// ── Master Data Guard: Opening Stock with Valuation ──────────────────────────

const OpeningStockBodySchema = z.object({
  quantity: z.number().positive('Quantity must be greater than zero'),
  unitCost: z.number().positive('Unit cost must be greater than zero'),
});

/**
 * POST /api/products/:id/opening-stock
 * Creates opening stock: physical quantity + unit cost together.
 * Posts DR Inventory / CR Opening Balance Equity to the GL.
 */
export const createOpeningStock = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const { id } = UuidParamSchema.parse(req.params);
  const { quantity, unitCost } = OpeningStockBodySchema.parse(req.body);
  const userId = (req as any).user?.id;
  if (!userId) throw new ValidationError('Authentication required');

  const result = await masterDataGuard.createOpeningStockEntry(pool, id, quantity, unitCost, userId);

  res.status(201).json({
    success: true,
    data: result,
    message: `Opening stock created: ${result.productName} — ${result.quantityAdded} units @ ${unitCost}`,
  });
});
