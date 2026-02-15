// Products Controller - HTTP Request/Response Handling
// Handles Express routes, validates input with Zod

import type { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { CreateProductSchema, UpdateProductSchema } from '../../../../shared/zod/product.js';
import * as productService from './productService.js';
import { normalizeResponse } from '../../utils/caseConverter.js';

interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    fullName: string;
    role: 'ADMIN' | 'MANAGER' | 'CASHIER' | 'STAFF';
  };
  pool?: Pool;
}

export async function getProducts(req: Request, res: Response, next: NextFunction) {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const includeUoms = req.query.includeUoms === 'true';

    const result = await productService.getAllProducts(page, limit, includeUoms);

    res.json({
      success: true,
      data: result.data.map((product: any) => normalizeResponse(product)),
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
}

export async function getProduct(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const includeUoms = req.query.includeUoms === 'true';

    if (includeUoms) {
      // Return product with UoM details embedded
      const productWithUom = await productService.getProductWithUom(id);
      res.json({
        success: true,
        data: normalizeResponse(productWithUom.toJSON()),
      });
    } else {
      // Return basic product
      const product = await productService.getProductById(id);
      res.json({
        success: true,
        data: normalizeResponse(product),
      });
    }
  } catch (error) {
    next(error);
  }
}

/**
 * Convert quantity between UoMs for a product
 * POST /products/:id/convert-quantity
 * Body: { quantity, fromUomId, toUomId }
 */
export async function convertProductQuantity(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { quantity, fromUomId, toUomId } = req.body;

    if (!quantity || !fromUomId || !toUomId) {
      return res.status(400).json({
        success: false,
        error: 'quantity, fromUomId, and toUomId are required',
      });
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
  } catch (error) {
    next(error);
  }
}

export async function createProduct(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    // Validate request body with Zod
    const validatedData = CreateProductSchema.parse(req.body);

    const product = await productService.createProduct(validatedData);

    // Log audit trail
    try {
      const auditContext = (req as any).auditContext || {
        userId: req.user?.id || '00000000-0000-0000-0000-000000000000',
        userName: req.user?.fullName,
        userRole: req.user?.role,
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
            productCode: product.sku, // Use sku as productCode
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
  } catch (error) {
    next(error);
  }
}

export async function updateProduct(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;

    // Validate request body with Zod
    const validatedData = UpdateProductSchema.parse(req.body);

    const product = await productService.updateProduct(id, validatedData);

    res.json({
      success: true,
      data: normalizeResponse(product),
      message: 'Product updated successfully',
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteProduct(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;

    await productService.deleteProduct(id);

    res.json({
      success: true,
      message: 'Product deleted successfully',
    });
  } catch (error) {
    next(error);
  }
}
