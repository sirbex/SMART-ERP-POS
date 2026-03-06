// Products Controller - HTTP Request/Response Handling
// Handles Express routes, validates input with Zod

import type { Request, Response } from 'express';
import type { Pool } from 'pg';
import { CreateProductSchema, UpdateProductSchema } from '../../../../shared/zod/product.js';
import * as productService from './productService.js';
import * as supplierProductPriceRepository from '../suppliers/supplierProductPriceRepository.js';
import { normalizeResponse } from '../../utils/caseConverter.js';
import { asyncHandler, ValidationError } from '../../middleware/errorHandler.js';

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
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;
  const includeUoms = req.query.includeUoms === 'true';

  const result = await productService.getAllProducts(page, limit, includeUoms);

  res.json({
    success: true,
    data: result.data.map((product) => normalizeResponse(product)),
    pagination: result.pagination,
  });
});

export const getProduct = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const includeUoms = req.query.includeUoms === 'true';

  if (includeUoms) {
    const productWithUom = await productService.getProductWithUom(id);
    res.json({
      success: true,
      data: normalizeResponse(productWithUom.toJSON()),
    });
  } else {
    const product = await productService.getProductById(id);
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
  const { id } = req.params;
  const { quantity, fromUomId, toUomId } = req.body;

  if (!quantity || !fromUomId || !toUomId) {
    throw new ValidationError('quantity, fromUomId, and toUomId are required');
  }

  const result = await productService.convertQuantity(
    id,
    parseFloat(quantity),
    fromUomId,
    toUomId
  );

  res.json({
    success: true,
    data: normalizeResponse(result),
  });
});

export const createProduct = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const validatedData = CreateProductSchema.parse(req.body);

  const product = await productService.createProduct(validatedData);

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
    const { pool } = await import('../../db/pool.js');
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
    console.error('Audit logging failed (non-fatal):', auditError);
  }

  res.status(201).json({
    success: true,
    data: normalizeResponse(product),
    message: 'Product created successfully',
  });
});

export const updateProduct = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const validatedData = UpdateProductSchema.parse(req.body);

  const product = await productService.updateProduct(id, validatedData);

  res.json({
    success: true,
    data: normalizeResponse(product),
    message: 'Product updated successfully',
  });
});

export const getProductSupplierPrices = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const prices = await supplierProductPriceRepository.getSupplierPricesForProduct(id);
  res.json({ success: true, data: prices });
});

export const deleteProduct = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  await productService.deleteProduct(id);

  res.json({
    success: true,
    message: 'Product deleted successfully',
  });
});
