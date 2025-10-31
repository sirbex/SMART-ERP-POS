import { Router, Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../config/database.js';
import { authenticate, authorize } from '../middleware/auth.js';
import logger from '../utils/logger.js';
import { parsePagination, buildPaginationResponse } from '../utils/helpers.js';
import { CreateProductSchema, UpdateProductSchema } from '../validation/product.js';
import { ProductHistoryService } from '../services/productHistoryService.js';
import cacheMiddleware, { invalidateCache } from '../middleware/redisCache.js';
import { REDIS_TTL } from '../config/redis.js';

const router = Router();

// GET /api/products - List all products with pagination
router.get(
  '/',
  authenticate,
  cacheMiddleware({ prefix: 'products', ttl: REDIS_TTL.MEDIUM }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, limit, skip } = parsePagination(req.query);
      const { search, category, isActive, includeUoMs } = req.query;

      const where: any = {};

      if (search) {
        where.OR = [
          { name: { contains: search as string, mode: 'insensitive' } },
          { barcode: { contains: search as string, mode: 'insensitive' } },
        ];
      }

      if (category) {
        where.category = category;
      }

      // Default to active products only unless explicitly requesting all or inactive
      if (isActive !== undefined) {
        where.isActive = isActive === 'true';
      } else {
        // Default to active products only for sales/POS usage
        where.isActive = true;
      }

      const [products, total] = await Promise.all([
        prisma.product.findMany({
          where,
          skip,
          take: limit,
          orderBy: { name: 'asc' },
          include: includeUoMs === 'true' ? {
            productUoMs: {
              where: { isSaleAllowed: true },
              include: {
                uom: {
                  select: {
                    id: true,
                    name: true,
                    abbreviation: true,
                    conversionFactor: true,
                  },
                },
              },
              orderBy: [
                { isDefault: 'desc' },
                { sortOrder: 'asc' },
              ],
            },
          } : undefined,
        }),
        prisma.product.count({ where }),
      ]);

      logger.info(`Listed ${products.length} products`, { userId: (req as any).user?.id });

      res.json(buildPaginationResponse(products, total, { page, limit, skip }));
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/products/:id/history - Get product history
router.get(
  '/:id/history',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const history = await ProductHistoryService.getProductHistory(id);

      logger.info(`Retrieved product history for product: ${id}`, { 
        userId: (req as any).user?.id,
        eventsCount: history.events.length 
      });

      res.json({
        success: true,
        data: history,
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Product not found') {
        return res.status(404).json({ error: 'Product not found' });
      }
      next(error);
    }
  }
);

// GET /api/products/:id - Get single product
router.get(
  '/:id',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { includeUoMs } = req.query;

      const product = await prisma.product.findUnique({
        where: { id },
        include: includeUoMs === 'true' ? {
          productUoMs: {
            include: {
              uom: {
                select: {
                  id: true,
                  name: true,
                  abbreviation: true,
                  conversionFactor: true,
                  category: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
            },
            orderBy: [
              { isDefault: 'desc' },
              { sortOrder: 'asc' },
            ],
          },
        } : undefined,
      });

      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }

      logger.info(`Retrieved product: ${product.name}`, { userId: (req as any).user?.id });

      res.json(product);
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/products - Create new product
router.post(
  '/',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  invalidateCache.products,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate request body with Zod
      const validatedData = CreateProductSchema.parse(req.body);

      const product = await prisma.product.create({
        data: {
          name: validatedData.name,
          barcode: validatedData.barcode,
          category: validatedData.category,
          baseUnit: validatedData.baseUnit,
          costPrice: new Prisma.Decimal(validatedData.costPrice),
          sellingPrice: new Prisma.Decimal(validatedData.sellingPrice),
          taxRate: validatedData.taxRate ? new Prisma.Decimal(validatedData.taxRate) : new Prisma.Decimal(0),
          hasMultipleUnits: validatedData.hasMultipleUnits ?? false,
          alternateUnit: validatedData.alternateUnit || null,
          conversionFactor: validatedData.conversionFactor ? new Prisma.Decimal(validatedData.conversionFactor) : null,
          reorderLevel: validatedData.reorderPoint ? new Prisma.Decimal(validatedData.reorderPoint) : new Prisma.Decimal(0),
        },
      });

      logger.info(`Created product: ${product.name}`, { 
        userId: (req as any).user?.id,
        productId: product.id 
      });

      res.status(201).json(product);
    } catch (error) {
      next(error); // Global handler catches Zod errors
    }
  }
);

// PUT /api/products/:id - Update product
router.put(
  '/:id',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  invalidateCache.products,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      
      // Validate request body with Zod
      const validatedData = UpdateProductSchema.parse(req.body);

      // Build update data dynamically (only include fields that were provided)
      const updateData: any = {};
      
      if (validatedData.name !== undefined) updateData.name = validatedData.name;
      if (validatedData.barcode !== undefined) updateData.barcode = validatedData.barcode;
      if (validatedData.category !== undefined) updateData.category = validatedData.category;
      if (validatedData.baseUnit !== undefined) updateData.baseUnit = validatedData.baseUnit;
      if (validatedData.costPrice !== undefined) updateData.costPrice = new Prisma.Decimal(validatedData.costPrice);
      if (validatedData.sellingPrice !== undefined) updateData.sellingPrice = new Prisma.Decimal(validatedData.sellingPrice);
      if (validatedData.taxRate !== undefined) updateData.taxRate = validatedData.taxRate ? new Prisma.Decimal(validatedData.taxRate) : null;
      if (validatedData.isActive !== undefined) updateData.isActive = validatedData.isActive;
      if (validatedData.hasMultipleUnits !== undefined) updateData.hasMultipleUnits = validatedData.hasMultipleUnits;
      if (validatedData.alternateUnit !== undefined) updateData.alternateUnit = validatedData.alternateUnit;
      if (validatedData.conversionFactor !== undefined) updateData.conversionFactor = validatedData.conversionFactor ? new Prisma.Decimal(validatedData.conversionFactor) : null;
      if (validatedData.minStockLevel !== undefined) updateData.minStockLevel = validatedData.minStockLevel;
      if (validatedData.maxStockLevel !== undefined) updateData.maxStockLevel = validatedData.maxStockLevel;
      if (validatedData.reorderPoint !== undefined) updateData.reorderLevel = validatedData.reorderPoint !== null ? new Prisma.Decimal(validatedData.reorderPoint) : new Prisma.Decimal(0);
      if (validatedData.notes !== undefined) updateData.notes = validatedData.notes;

      const product = await prisma.product.update({
        where: { id },
        data: updateData,
      });

      logger.info(`Updated product: ${product.name}`, { 
        userId: (req as any).user?.id,
        productId: product.id 
      });

      res.json(product);
    } catch (error) {
      next(error); // Global handler catches Zod errors
    }
  }
);

// DELETE /api/products/:id - Delete product (soft delete)
router.delete(
  '/:id',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  invalidateCache.products,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      // Soft delete: set isActive to false instead of removing the record
      const product = await prisma.product.update({
        where: { id },
        data: { isActive: false },
      });

      logger.info(`Soft deleted product: ${product.name}`, { 
        userId: (req as any).user?.id,
        productId: product.id 
      });

      res.json({ message: 'Product deleted successfully', product });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
