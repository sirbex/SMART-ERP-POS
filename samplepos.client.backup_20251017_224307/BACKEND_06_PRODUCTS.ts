// ============================================================================
// PRODUCT & INVENTORY MODULES - Part 1
// ============================================================================
// Due to size, business modules are split into multiple template files
// This file contains: Products and Inventory Management

// ============================================================================
// FILE: pos-backend/src/modules/products.ts
// ============================================================================

import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { UserRole } from '@prisma/client';
import { prisma } from '../config/database.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { asyncHandler, createError } from '../middleware/errorHandler.js';
import { validate } from '../middleware/validation.js';
import { parsePagination, buildPaginationResponse, sanitizeSearchQuery } from '../utils/helpers.js';
import { Decimal } from '@prisma/client/runtime/library';

export const productRouter = Router();

productRouter.use(authenticate);

// ============================================================================
// GET ALL PRODUCTS
// ============================================================================

productRouter.get('/',
  asyncHandler(async (req, res) => {
    const { page, limit, search, category, isActive } = req.query;
    const pagination = parsePagination(page as string, limit as string);

    const where: any = {};

    if (search) {
      const searchTerm = sanitizeSearchQuery(search as string);
      where.OR = [
        { name: { contains: searchTerm, mode: 'insensitive' } },
        { barcode: { contains: searchTerm, mode: 'insensitive' } },
        { description: { contains: searchTerm, mode: 'insensitive' } }
      ];
    }

    if (category) {
      where.category = category;
    }

    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          _count: {
            select: { stockBatches: true }
          }
        },
        orderBy: { name: 'asc' },
        skip: pagination.skip,
        take: pagination.limit
      }),
      prisma.product.count({ where })
    ]);

    res.json(buildPaginationResponse(products, total, pagination));
  })
);

// ============================================================================
// GET PRODUCT BY ID
// ============================================================================

productRouter.get('/:id',
  validate([param('id').isString()]),
  asyncHandler(async (req, res) => {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: {
        stockBatches: {
          where: { quantityRemaining: { gt: 0 } },
          orderBy: { receivedDate: 'asc' }
        },
        _count: {
          select: {
            purchaseItems: true,
            saleItems: true
          }
        }
      }
    });

    if (!product) {
      throw createError('Product not found', 404);
    }

    res.json(product);
  })
);

// ============================================================================
// GET PRODUCT BY BARCODE
// ============================================================================

productRouter.get('/barcode/:barcode',
  validate([param('barcode').notEmpty()]),
  asyncHandler(async (req, res) => {
    const product = await prisma.product.findUnique({
      where: { barcode: req.params.barcode },
      include: {
        stockBatches: {
          where: { quantityRemaining: { gt: 0 } },
          orderBy: { receivedDate: 'asc' },
          take: 1
        }
      }
    });

    if (!product) {
      throw createError('Product not found', 404);
    }

    res.json(product);
  })
);

// ============================================================================
// CREATE PRODUCT
// ============================================================================

productRouter.post('/',
  authorize(UserRole.ADMIN, UserRole.MANAGER),
  validate([
    body('name').trim().notEmpty().withMessage('Product name is required'),
    body('barcode').optional().trim(),
    body('description').optional().trim(),
    body('category').optional().trim(),
    body('baseUnit').notEmpty().withMessage('Base unit is required'),
    body('sellingPrice').isDecimal({ decimal_digits: '0,2' }).withMessage('Invalid selling price'),
    body('costPrice').optional().isDecimal({ decimal_digits: '0,2' }),
    body('currentStock').optional().isDecimal({ decimal_digits: '0,4' }),
    body('reorderLevel').optional().isDecimal({ decimal_digits: '0,4' }),
    body('hasMultipleUnits').optional().isBoolean(),
    body('alternateUnit').optional().trim(),
    body('conversionFactor').optional().isDecimal({ decimal_digits: '0,4' }),
    body('taxRate').optional().isDecimal({ decimal_digits: '0,4' })
  ]),
  asyncHandler(async (req, res) => {
    const {
      barcode,
      name,
      description,
      category,
      baseUnit,
      currentStock = 0,
      reorderLevel = 0,
      costPrice = 0,
      sellingPrice,
      hasMultipleUnits = false,
      alternateUnit,
      conversionFactor,
      taxRate = 0
    } = req.body;

    // Check barcode uniqueness if provided
    if (barcode) {
      const existing = await prisma.product.findUnique({
        where: { barcode }
      });
      if (existing) {
        throw createError('Barcode already exists', 409);
      }
    }

    // Validate multi-UOM
    if (hasMultipleUnits && (!alternateUnit || !conversionFactor)) {
      throw createError('Alternate unit and conversion factor required for multi-UOM', 400);
    }

    const product = await prisma.product.create({
      data: {
        barcode: barcode || null,
        name,
        description,
        category,
        baseUnit,
        currentStock: new Decimal(currentStock),
        reorderLevel: new Decimal(reorderLevel),
        costPrice: new Decimal(costPrice),
        sellingPrice: new Decimal(sellingPrice),
        hasMultipleUnits,
        alternateUnit: hasMultipleUnits ? alternateUnit : null,
        conversionFactor: hasMultipleUnits ? new Decimal(conversionFactor) : null,
        taxRate: new Decimal(taxRate)
      }
    });

    res.status(201).json({
      message: 'Product created successfully',
      product
    });
  })
);

// ============================================================================
// UPDATE PRODUCT
// ============================================================================

productRouter.put('/:id',
  authorize(UserRole.ADMIN, UserRole.MANAGER),
  validate([
    param('id').isString(),
    body('name').optional().trim().notEmpty(),
    body('barcode').optional().trim(),
    body('description').optional().trim(),
    body('category').optional().trim(),
    body('sellingPrice').optional().isDecimal({ decimal_digits: '0,2' }),
    body('reorderLevel').optional().isDecimal({ decimal_digits: '0,4' }),
    body('hasMultipleUnits').optional().isBoolean(),
    body('alternateUnit').optional().trim(),
    body('conversionFactor').optional().isDecimal({ decimal_digits: '0,4' }),
    body('taxRate').optional().isDecimal({ decimal_digits: '0,4' }),
    body('isActive').optional().isBoolean()
  ]),
  asyncHandler(async (req, res) => {
    const {
      name,
      barcode,
      description,
      category,
      sellingPrice,
      reorderLevel,
      hasMultipleUnits,
      alternateUnit,
      conversionFactor,
      taxRate,
      isActive
    } = req.body;

    // Check barcode uniqueness if changed
    if (barcode) {
      const existing = await prisma.product.findFirst({
        where: {
          barcode,
          NOT: { id: req.params.id }
        }
      });
      if (existing) {
        throw createError('Barcode already exists', 409);
      }
    }

    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(barcode !== undefined && { barcode: barcode || null }),
        ...(description !== undefined && { description }),
        ...(category !== undefined && { category }),
        ...(sellingPrice && { sellingPrice: new Decimal(sellingPrice) }),
        ...(reorderLevel !== undefined && { reorderLevel: new Decimal(reorderLevel) }),
        ...(hasMultipleUnits !== undefined && { hasMultipleUnits }),
        ...(alternateUnit !== undefined && { alternateUnit }),
        ...(conversionFactor !== undefined && { conversionFactor: new Decimal(conversionFactor) }),
        ...(taxRate !== undefined && { taxRate: new Decimal(taxRate) }),
        ...(isActive !== undefined && { isActive })
      }
    });

    res.json({
      message: 'Product updated successfully',
      product
    });
  })
);

// ============================================================================
// DELETE PRODUCT (soft delete)
// ============================================================================

productRouter.delete('/:id',
  authorize(UserRole.ADMIN),
  validate([param('id').isString()]),
  asyncHandler(async (req, res) => {
    // Check if product has stock
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      select: { currentStock: true }
    });

    if (!product) {
      throw createError('Product not found', 404);
    }

    if (product.currentStock.gt(0)) {
      throw createError('Cannot delete product with remaining stock', 400);
    }

    await prisma.product.update({
      where: { id: req.params.id },
      data: { isActive: false }
    });

    res.json({ message: 'Product deleted successfully' });
  })
);

// ============================================================================
// GET LOW STOCK PRODUCTS
// ============================================================================

productRouter.get('/alerts/low-stock',
  asyncHandler(async (req, res) => {
    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        currentStock: {
          lte: prisma.product.fields.reorderLevel
        }
      },
      orderBy: { currentStock: 'asc' }
    });

    res.json(products);
  })
);

// ============================================================================
// GET PRODUCT CATEGORIES
// ============================================================================

productRouter.get('/meta/categories',
  asyncHandler(async (req, res) => {
    const categories = await prisma.product.findMany({
      where: {
        category: { not: null },
        isActive: true
      },
      distinct: ['category'],
      select: { category: true }
    });

    const categoryList = categories
      .map(p => p.category)
      .filter((c): c is string => c !== null)
      .sort();

    res.json(categoryList);
  })
);

console.log('✅ Product module template created');
console.log('📁 File: modules/products.ts');
