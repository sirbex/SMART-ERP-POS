import { Router } from 'express';
import prisma from '@prisma/client';
import prisma from '../config/database.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { body, query } from 'express-validator';
import logger from '../utils/logger.js';
import { parsePagination, buildPaginationResponse } from '../utils/helpers.js';
import { convertToBaseUnit, convertFromBaseUnit } from '../utils/uomConverter.js';

const router = Router();

// Validation schemas
const createProductValidation = [
  body('name').trim().isLength({ min: 1, max: 200 }).withMessage('Product name is required'),
  body('sku').optional().trim().isLength({ max: 100 }),
  body('barcode').optional().trim().isLength({ max: 100 }),
  body('description').optional().trim(),
  body('category').optional().trim().isLength({ max: 100 }),
  body('baseUnit').trim().notEmpty().withMessage('Base unit is required'),
  body('sellingPrice').isDecimal({ decimal_digits: '0,2' }).withMessage('Valid selling price required'),
  body('costPrice').optional().isDecimal({ decimal_digits: '0,2' }),
  body('reorderLevel').optional().isDecimal({ decimal_digits: '0,4' }),
  body('reorderQuantity').optional().isDecimal({ decimal_digits: '0,4' }),
  body('taxRate').optional().isDecimal({ decimal_digits: '0,2' }),
  body('isActive').optional().isBoolean(),
  body('trackInventory').optional().isBoolean(),
  body('allowNegativeStock').optional().isBoolean(),
  body('alternateUnits').optional().isArray(),
  body('alternateUnits.*.unit').trim().notEmpty(),
  body('alternateUnits.*.conversionFactor').isDecimal({ decimal_digits: '0,6' }),
  body('alternateUnits.*.barcode').optional().trim(),
];

const updateProductValidation = [
  body('name').optional().trim().isLength({ min: 1, max: 200 }),
  body('sku').optional().trim().isLength({ max: 100 }),
  body('barcode').optional().trim().isLength({ max: 100 }),
  body('description').optional().trim(),
  body('category').optional().trim().isLength({ max: 100 }),
  body('baseUnit').optional().trim().notEmpty(),
  body('sellingPrice').optional().isDecimal({ decimal_digits: '0,2' }),
  body('costPrice').optional().isDecimal({ decimal_digits: '0,2' }),
  body('reorderLevel').optional().isDecimal({ decimal_digits: '0,4' }),
  body('reorderQuantity').optional().isDecimal({ decimal_digits: '0,4' }),
  body('taxRate').optional().isDecimal({ decimal_digits: '0,2' }),
  body('isActive').optional().isBoolean(),
  body('trackInventory').optional().isBoolean(),
  body('allowNegativeStock').optional().isBoolean(),
  body('alternateUnits').optional().isArray(),
];

// GET /api/products - List all products with pagination, search, and filters
router.get(
  '/',
  authenticate,
  async (req, res, next) => {
    try {
      const { page, limit, skip } = parsePagination(req.query);
      const { search, category, isActive, inStock } = req.query;

      // Build where clause
      const where: Prisma.ProductWhereInput = {};

      if (search) {
        where.OR = [
          { name: { contains: search as string, mode: 'insensitive' } },
          { sku: { contains: search as string, mode: 'insensitive' } },
          { barcode: { contains: search as string, mode: 'insensitive' } },
          { description: { contains: search as string, mode: 'insensitive' } },
        ];
      }

      if (category) {
        where.category = { contains: category as string, mode: 'insensitive' };
      }

      if (isActive !== undefined) {
        where.isActive = isActive === 'true';
      }

      // Get products and total count
      const [products, total] = await Promise.all([
        prisma.product.findMany({
          where,
          include: {
            _count: {
              select: { stockBatches: true },
            },
          },
          orderBy: { name: 'asc' },
          skip,
          take: limit,
        }),
        prisma.product.count({ where }),
      ]);

      // Calculate current stock for each product
      const productsWithStock = await Promise.all(
        products.map(async (product) => {
          const totalStock = await prisma.stockBatch.aggregate({
            where: {
              productId: product.id,
              quantity: { gt: 0 },
            },
            _sum: { quantity: true },
          });

          return {
            ...product,
            currentStock: totalStock._sum.quantity || new Prisma.Decimal(0),
            batchCount: product._count.batches,
          };
        })
      );

      // Filter by stock if requested
      let filteredProducts = productsWithStock;
      if (inStock === 'true') {
        filteredProducts = productsWithStock.filter((p) => p.currentStock.gt(0));
      } else if (inStock === 'false') {
        filteredProducts = productsWithStock.filter((p) => p.currentStock.lte(0));
      }

      logger.info(`Listed ${filteredProducts.length} products`, { userId: req.user?.id });

      res.json(buildPaginationResponse(filteredProducts, total, page, limit));
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/products/:id - Get single product with stock details
router.get(
  '/:id',
  authenticate,
  async (req, res, next) => {
    try {
      const { id } = req.params;

      const product = await prisma.product.findUnique({
        where: { id },
        include: {
          batches: {
            where: { quantity: { gt: 0 } },
            orderBy: { purchaseDate: 'asc' }, // FIFO order
            include: {
              purchase: {
                select: {
                  supplier: { select: { name: true } },
                },
              },
            },
          },
        },
      });

      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }

      // Calculate total stock
      const totalStock = await prisma.stockBatch.aggregate({
        where: {
          productId: product.id,
          quantity: { gt: 0 },
        },
        _sum: { quantity: true },
        _avg: { unitCost: true },
      });

      logger.info(`Retrieved product: ${product.name}`, { userId: req.user?.id });

      res.json({
        ...product,
        currentStock: totalStock._sum.quantity || new Prisma.Decimal(0),
        averageCost: totalStock._avg.unitCost || new Prisma.Decimal(0),
      });
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
  createProductValidation,
  validate,
  async (req, res, next) => {
    try {
      const {
        name,
        sku,
        barcode,
        description,
        category,
        baseUnit,
        sellingPrice,
        costPrice,
        reorderLevel,
        reorderQuantity,
        taxRate,
        isActive,
        trackInventory,
        allowNegativeStock,
        alternateUnits,
      } = req.body;

      // Check for duplicate SKU or barcode
      if (sku || barcode) {
        const duplicate = await prisma.product.findFirst({
          where: {
            OR: [
              ...(sku ? [{ sku }] : []),
              ...(barcode ? [{ barcode }] : []),
            ],
          },
        });

        if (duplicate) {
          return res.status(400).json({
            error: duplicate.sku === sku ? 'SKU already exists' : 'Barcode already exists',
          });
        }
      }

      // Create product
      const product = await prisma.product.create({
        data: {
          name,
          sku,
          barcode,
          description,
          category,
          baseUnit,
          sellingPrice: new Prisma.Decimal(sellingPrice),
          costPrice: costPrice ? new Prisma.Decimal(costPrice) : undefined,
          reorderLevel: reorderLevel ? new Prisma.Decimal(reorderLevel) : undefined,
          reorderQuantity: reorderQuantity ? new Prisma.Decimal(reorderQuantity) : undefined,
          taxRate: taxRate ? new Prisma.Decimal(taxRate) : new Prisma.Decimal(0),
          isActive: isActive ?? true,
          trackInventory: trackInventory ?? true,
          allowNegativeStock: allowNegativeStock ?? false,
          alternateUnits: alternateUnits || [],
        },
      });

      logger.info(`Created product: ${product.name}`, { userId: req.user?.id });

      res.status(201).json(product);
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/products/:id - Update product
router.put(
  '/:id',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  updateProductValidation,
  validate,
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const updateData = req.body;

      // Check if product exists
      const existingProduct = await prisma.product.findUnique({ where: { id } });
      if (!existingProduct) {
        return res.status(404).json({ error: 'Product not found' });
      }

      // Check for duplicate SKU or barcode
      if (updateData.sku || updateData.barcode) {
        const duplicate = await prisma.product.findFirst({
          where: {
            AND: [
              { id: { not: id } },
              {
                OR: [
                  ...(updateData.sku ? [{ sku: updateData.sku }] : []),
                  ...(updateData.barcode ? [{ barcode: updateData.barcode }] : []),
                ],
              },
            ],
          },
        });

        if (duplicate) {
          return res.status(400).json({
            error: duplicate.sku === updateData.sku ? 'SKU already exists' : 'Barcode already exists',
          });
        }
      }

      // Convert decimal fields
      const processedData: any = { ...updateData };
      ['sellingPrice', 'costPrice', 'reorderLevel', 'reorderQuantity', 'taxRate'].forEach((field) => {
        if (processedData[field] !== undefined) {
          processedData[field] = new Prisma.Decimal(processedData[field]);
        }
      });

      // Update product
      const product = await prisma.product.update({
        where: { id },
        data: processedData,
      });

      logger.info(`Updated product: ${product.name}`, { userId: req.user?.id });

      res.json(product);
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/products/:id - Delete product (soft delete by setting inactive)
router.delete(
  '/:id',
  authenticate,
  authorize(['ADMIN']),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { permanent } = req.query;

      const product = await prisma.product.findUnique({ where: { id } });
      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }

      if (permanent === 'true') {
        // Check if product has any stock batches or sales
        const [batchCount, saleItemCount] = await Promise.all([
          prisma.stockBatch.count({ where: { productId: id } }),
          prisma.saleItem.count({ where: { productId: id } }),
        ]);

        if (batchCount > 0 || saleItemCount > 0) {
          return res.status(400).json({
            error: 'Cannot permanently delete product with transaction history. Set inactive instead.',
          });
        }

        // Permanent delete
        await prisma.product.delete({ where: { id } });
        logger.info(`Permanently deleted product: ${product.name}`, { userId: req.user?.id });
        res.json({ message: 'Product permanently deleted' });
      } else {
        // Soft delete (set inactive)
        const updatedProduct = await prisma.product.update({
          where: { id },
          data: { isActive: false },
        });
        logger.info(`Deactivated product: ${product.name}`, { userId: req.user?.id });
        res.json({ message: 'Product deactivated', product: updatedProduct });
      }
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/products/search/barcode/:barcode - Search by barcode (including alternate units)
router.get(
  '/search/barcode/:barcode',
  authenticate,
  async (req, res, next) => {
    try {
      const { barcode } = req.params;

      // Search in main barcode
      let product = await prisma.product.findFirst({
        where: { 
          barcode,
          isActive: true,
        },
        include: {
          batches: {
            where: { quantity: { gt: 0 } },
            orderBy: { purchaseDate: 'asc' },
          },
        },
      });

      let unit = null;
      let conversionFactor = 1;

      // If not found, search in alternate units
      if (!product) {
        const products = await prisma.product.findMany({
          where: { isActive: true },
        });

        for (const p of products) {
          const alternateUnits = p.alternateUnits as any[];
          const matchingUnit = alternateUnits?.find((u: any) => u.barcode === barcode);
          
          if (matchingUnit) {
            product = await prisma.product.findUnique({
              where: { id: p.id },
              include: {
                batches: {
                  where: { quantity: { gt: 0 } },
                  orderBy: { purchaseDate: 'asc' },
                },
              },
            });
            unit = matchingUnit.unit;
            conversionFactor = parseFloat(matchingUnit.conversionFactor);
            break;
          }
        }
      }

      if (!product) {
        return res.status(404).json({ error: 'Product not found with this barcode' });
      }

      // Calculate total stock
      const totalStock = await prisma.stockBatch.aggregate({
        where: {
          productId: product.id,
          quantity: { gt: 0 },
        },
        _sum: { quantity: true },
      });

      logger.info(`Found product by barcode: ${product.name}`, { userId: req.user?.id });

      res.json({
        ...product,
        currentStock: totalStock._sum.quantity || new Prisma.Decimal(0),
        scannedUnit: unit || product.baseUnit,
        conversionFactor,
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/products/low-stock - Get products below reorder level
router.get(
  '/alerts/low-stock',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  async (req, res, next) => {
    try {
      const products = await prisma.product.findMany({
        where: {
          isActive: true,
          trackInventory: true,
          reorderLevel: { gt: 0 },
        },
      });

      const lowStockProducts = [];

      for (const product of products) {
        const totalStock = await prisma.stockBatch.aggregate({
          where: {
            productId: product.id,
            quantity: { gt: 0 },
          },
          _sum: { quantity: true },
        });

        const currentStock = totalStock._sum.quantity || new Prisma.Decimal(0);
        
        if (currentStock.lte(product.reorderLevel!)) {
          lowStockProducts.push({
            ...product,
            currentStock,
            deficit: product.reorderLevel!.minus(currentStock),
          });
        }
      }

      logger.info(`Found ${lowStockProducts.length} low stock products`, { userId: req.user?.id });

      res.json(lowStockProducts);
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/products/categories - Get unique categories
router.get(
  '/meta/categories',
  authenticate,
  async (req, res, next) => {
    try {
      const products = await prisma.product.findMany({
        where: { 
          isActive: true,
          category: { not: null },
        },
        select: { category: true },
        distinct: ['category'],
      });

      const categories = products
        .map((p) => p.category)
        .filter((c): c is string => c !== null)
        .sort();

      res.json(categories);
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/products/stats - Product statistics
router.get(
  '/stats/overview',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  async (req, res, next) => {
    try {
      const [totalProducts, activeProducts, trackedProducts, lowStockCount] = await Promise.all([
        prisma.product.count(),
        prisma.product.count({ where: { isActive: true } }),
        prisma.product.count({ where: { trackInventory: true } }),
        // This is a simplified count - actual low stock would need to check inventory
        prisma.product.count({ where: { reorderLevel: { gt: 0 } } }),
      ]);

      const stats = {
        totalProducts,
        activeProducts,
        inactiveProducts: totalProducts - activeProducts,
        trackedProducts,
        lowStockCount, // Approximation
      };

      logger.info('Retrieved product statistics', { userId: req.user?.id });

      res.json(stats);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
