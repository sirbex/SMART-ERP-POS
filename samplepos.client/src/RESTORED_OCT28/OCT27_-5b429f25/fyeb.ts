import express, { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../config/database.js';
import { authenticate, authorize } from '../middleware/auth.js';
import logger from '../utils/logger.js';
import {
  CreateUoMCategorySchema,
  UpdateUoMCategorySchema,
  CreateUnitOfMeasureSchema,
  UpdateUnitOfMeasureSchema,
  CreateProductUoMSchema,
  UpdateProductUoMSchema,
  BulkAssignUoMsSchema,
  ConvertUoMSchema,
  CalculatePriceSchema,
} from '../validation/uom.js';
import {
  convertToBaseUnit,
  convertFromBaseUnit,
  calculatePriceForUoM,
  getAllowedUoMs,
  getDefaultUoM,
  validateUoMForProduct,
} from '../utils/uomService.js';

const router = express.Router();

// ============================================================================
// UoM Category Endpoints
// ============================================================================

// GET /api/uom-categories - List all UoM categories
router.get('/categories', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { includeInactive } = req.query;

    const categories = await prisma.uoMCategory.findMany({
      where: includeInactive === 'true' ? undefined : { isActive: true },
      include: {
        baseUoM: {
          select: {
            id: true,
            name: true,
            abbreviation: true,
          },
        },
        uoms: {
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            abbreviation: true,
            conversionFactor: true,
            isBase: true,
          },
          orderBy: { conversionFactor: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });

    logger.info(`Listed ${categories.length} UoM categories`, {
      userId: (req as any).user?.id,
    });

    res.json(categories);
  } catch (error) {
    next(error);
  }
});

// GET /api/uom-categories/:id - Get single UoM category
router.get('/categories/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const category = await prisma.uoMCategory.findUnique({
      where: { id },
      include: {
        baseUoM: true,
        uoms: {
          include: {
            productUoMs: {
              select: {
                productId: true,
              },
            },
          },
          orderBy: { conversionFactor: 'asc' },
        },
      },
    });

    if (!category) {
      return res.status(404).json({ error: 'UoM category not found' });
    }

    logger.info(`Retrieved UoM category: ${category.name}`, {
      categoryId: id,
      userId: (req as any).user?.id,
    });

    res.json(category);
  } catch (error) {
    next(error);
  }
});

// POST /api/uom-categories - Create new UoM category
router.post('/categories', authenticate, authorize(['ADMIN', 'MANAGER']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validatedData = CreateUoMCategorySchema.parse(req.body);

    const category = await prisma.uoMCategory.create({
      data: {
        name: validatedData.name,
        description: validatedData.description,
        baseUoMId: validatedData.baseUoMId,
      },
      include: {
        baseUoM: true,
        uoms: true,
      },
    });

    logger.info(`Created UoM category: ${category.name}`, {
      categoryId: category.id,
      userId: (req as any).user?.id,
    });

    res.status(201).json(category);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return res.status(400).json({ error: 'UoM category with this name already exists' });
      }
    }
    next(error);
  }
});

// PUT /api/uom-categories/:id - Update UoM category
router.put('/categories/:id', authenticate, authorize(['ADMIN', 'MANAGER']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const validatedData = UpdateUoMCategorySchema.parse(req.body);

    const category = await prisma.uoMCategory.update({
      where: { id },
      data: validatedData,
      include: {
        baseUoM: true,
        uoms: true,
      },
    });

    logger.info(`Updated UoM category: ${category.name}`, {
      categoryId: id,
      userId: (req as any).user?.id,
    });

    res.json(category);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        return res.status(404).json({ error: 'UoM category not found' });
      }
      if (error.code === 'P2002') {
        return res.status(400).json({ error: 'UoM category with this name already exists' });
      }
    }
    next(error);
  }
});

// DELETE /api/uom-categories/:id - Delete UoM category
router.delete('/categories/:id', authenticate, authorize(['ADMIN']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    // Check if category has units
    const uomCount = await prisma.unitOfMeasure.count({
      where: { categoryId: id },
    });

    if (uomCount > 0) {
      return res.status(400).json({
        error: `Cannot delete category with ${uomCount} associated units. Please delete or reassign the units first.`,
      });
    }

    await prisma.uoMCategory.delete({
      where: { id },
    });

    logger.info(`Deleted UoM category`, {
      categoryId: id,
      userId: (req as any).user?.id,
    });

    res.json({ message: 'UoM category deleted successfully' });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        return res.status(404).json({ error: 'UoM category not found' });
      }
    }
    next(error);
  }
});

// ============================================================================
// Unit of Measure Endpoints
// ============================================================================

// GET /api/uoms - List all units of measure
router.get('/units', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { categoryId, includeInactive } = req.query;

    const where: any = {};
    if (categoryId) {
      where.categoryId = categoryId as string;
    }
    if (includeInactive !== 'true') {
      where.isActive = true;
    }

    const uoms = await prisma.unitOfMeasure.findMany({
      where,
      include: {
        category: {
          select: {
            id: true,
            name: true,
          },
        },
        productUoMs: {
          select: {
            productId: true,
          },
        },
      },
      orderBy: [
        { category: { name: 'asc' } },
        { conversionFactor: 'asc' },
      ],
    });

    logger.info(`Listed ${uoms.length} units of measure`, {
      categoryId: categoryId || 'all',
      userId: (req as any).user?.id,
    });

    res.json(uoms);
  } catch (error) {
    next(error);
  }
});

// GET /api/uoms/:id - Get single unit of measure
router.get('/units/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const uom = await prisma.unitOfMeasure.findUnique({
      where: { id },
      include: {
        category: true,
        productUoMs: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                barcode: true,
              },
            },
          },
        },
      },
    });

    if (!uom) {
      return res.status(404).json({ error: 'Unit of measure not found' });
    }

    logger.info(`Retrieved unit of measure: ${uom.name}`, {
      uomId: id,
      userId: (req as any).user?.id,
    });

    res.json(uom);
  } catch (error) {
    next(error);
  }
});

// POST /api/uoms - Create new unit of measure
router.post('/units', authenticate, authorize(['ADMIN', 'MANAGER']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validatedData = CreateUnitOfMeasureSchema.parse(req.body);

    // If this is marked as base, update category's baseUoMId after creation
    const uom = await prisma.$transaction(async (tx: any) => {
      const newUom = await tx.unitOfMeasure.create({
        data: {
          categoryId: validatedData.categoryId,
          name: validatedData.name,
          abbreviation: validatedData.abbreviation,
          conversionFactor: new Prisma.Decimal(validatedData.conversionFactor),
          isBase: validatedData.isBase,
          description: validatedData.description,
        },
        include: {
          category: true,
        },
      });

      // If marked as base, set as category's base UoM
      if (validatedData.isBase) {
        await tx.uoMCategory.update({
          where: { id: validatedData.categoryId },
          data: { baseUoMId: newUom.id },
        });
      }

      return newUom;
    });

    logger.info(`Created unit of measure: ${uom.name}`, {
      uomId: uom.id,
      categoryId: uom.categoryId,
      userId: (req as any).user?.id,
    });

    res.status(201).json(uom);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return res.status(400).json({ error: 'Unit of measure with this name/abbreviation already exists in this category' });
      }
      if (error.code === 'P2003') {
        return res.status(400).json({ error: 'Invalid category ID' });
      }
    }
    next(error);
  }
});

// PUT /api/uoms/:id - Update unit of measure
router.put('/units/:id', authenticate, authorize(['ADMIN', 'MANAGER']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const validatedData = UpdateUnitOfMeasureSchema.parse(req.body);

    const updateData: any = {};
    if (validatedData.categoryId) updateData.categoryId = validatedData.categoryId;
    if (validatedData.name) updateData.name = validatedData.name;
    if (validatedData.abbreviation) updateData.abbreviation = validatedData.abbreviation;
    if (validatedData.conversionFactor) updateData.conversionFactor = new Prisma.Decimal(validatedData.conversionFactor);
    if (validatedData.isBase !== undefined) updateData.isBase = validatedData.isBase;
    if (validatedData.isActive !== undefined) updateData.isActive = validatedData.isActive;
    if (validatedData.description !== undefined) updateData.description = validatedData.description;

    const uom = await prisma.unitOfMeasure.update({
      where: { id },
      data: updateData,
      include: {
        category: true,
      },
    });

    logger.info(`Updated unit of measure: ${uom.name}`, {
      uomId: id,
      userId: (req as any).user?.id,
    });

    res.json(uom);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        return res.status(404).json({ error: 'Unit of measure not found' });
      }
      if (error.code === 'P2002') {
        return res.status(400).json({ error: 'Unit of measure with this name/abbreviation already exists in this category' });
      }
    }
    next(error);
  }
});

// DELETE /api/uoms/:id - Delete unit of measure
router.delete('/units/:id', authenticate, authorize(['ADMIN']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    // Check if UoM is used by products
    const productCount = await prisma.productUoM.count({
      where: { uomId: id },
    });

    if (productCount > 0) {
      return res.status(400).json({
        error: `Cannot delete unit used by ${productCount} products. Please remove product associations first.`,
      });
    }

    await prisma.unitOfMeasure.delete({
      where: { id },
    });

    logger.info(`Deleted unit of measure`, {
      uomId: id,
      userId: (req as any).user?.id,
    });

    res.json({ message: 'Unit of measure deleted successfully' });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        return res.status(404).json({ error: 'Unit of measure not found' });
      }
    }
    next(error);
  }
});

// ============================================================================
// Product UoM Association Endpoints
// ============================================================================

// GET /api/products/:productId/uoms - Get allowed UoMs for product
router.get('/products/:productId/uoms', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { productId } = req.params;
    const { saleOnly } = req.query;

    const uoms = await getAllowedUoMs(productId, saleOnly === 'true');

    logger.info(`Retrieved ${uoms.length} UoMs for product`, {
      productId,
      userId: (req as any).user?.id,
    });

    res.json(uoms);
  } catch (error) {
    next(error);
  }
});

// POST /api/products/:productId/uoms - Add UoM to product
router.post('/products/:productId/uoms', authenticate, authorize(['ADMIN', 'MANAGER']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { productId } = req.params;
    const validatedData = CreateProductUoMSchema.parse({
      ...req.body,
      productId,
    });

    // If setting as default, unset other defaults
    const productUoM = await prisma.$transaction(async (tx: any) => {
      if (validatedData.isDefault) {
        await tx.productUoM.updateMany({
          where: { productId },
          data: { isDefault: false },
        });
      }

      // Prepare unit price - convert to Decimal if provided
      const unitPriceValue = validatedData.unitPrice !== undefined && validatedData.unitPrice !== null
        ? new Prisma.Decimal(validatedData.unitPrice)
        : null;

      return await tx.productUoM.create({
        data: {
          productId: validatedData.productId,
          uomId: validatedData.uomId,
          conversionFactor: new Prisma.Decimal(validatedData.conversionFactor),
          priceMultiplier: new Prisma.Decimal(validatedData.priceMultiplier),
          unitPrice: unitPriceValue,
          isDefault: validatedData.isDefault,
          isSaleAllowed: validatedData.isSaleAllowed,
          isPurchaseAllowed: validatedData.isPurchaseAllowed,
          barcode: validatedData.barcode,
          sortOrder: validatedData.sortOrder,
        },
        include: {
          uom: true,
          product: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });
    });

    logger.info(`Added UoM to product`, {
      productId,
      uomId: productUoM.uomId,
      userId: (req as any).user?.id,
    });

    res.status(201).json(productUoM);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return res.status(400).json({ error: 'This UoM is already associated with this product' });
      }
      if (error.code === 'P2003') {
        return res.status(400).json({ error: 'Invalid product or UoM ID' });
      }
    }
    next(error);
  }
});

// PUT /api/products/:productId/uoms/:uomId - Update product UoM association
router.put('/products/:productId/uoms/:uomId', authenticate, authorize(['ADMIN', 'MANAGER']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { productId, uomId } = req.params;
    const validatedData = UpdateProductUoMSchema.parse(req.body);

    const productUoM = await prisma.$transaction(async (tx: any) => {
      if (validatedData.isDefault) {
        await tx.productUoM.updateMany({
          where: {
            productId,
            NOT: { uomId },
          },
          data: { isDefault: false },
        });
      }

      const updateData: any = {};
      if (validatedData.conversionFactor) updateData.conversionFactor = new Prisma.Decimal(validatedData.conversionFactor);
      if (validatedData.priceMultiplier) updateData.priceMultiplier = new Prisma.Decimal(validatedData.priceMultiplier);
      if (validatedData.unitPrice !== undefined) {
        updateData.unitPrice = validatedData.unitPrice !== null 
          ? new Prisma.Decimal(validatedData.unitPrice) 
          : null;
      }
      if (validatedData.isDefault !== undefined) updateData.isDefault = validatedData.isDefault;
      if (validatedData.isSaleAllowed !== undefined) updateData.isSaleAllowed = validatedData.isSaleAllowed;
      if (validatedData.isPurchaseAllowed !== undefined) updateData.isPurchaseAllowed = validatedData.isPurchaseAllowed;
      if (validatedData.barcode !== undefined) updateData.barcode = validatedData.barcode;
      if (validatedData.sortOrder !== undefined) updateData.sortOrder = validatedData.sortOrder;

      return await tx.productUoM.update({
        where: {
          productId_uomId: {
            productId,
            uomId,
          },
        },
        data: updateData,
        include: {
          uom: true,
        },
      });
    });

    logger.info(`Updated product UoM association`, {
      productId,
      uomId,
      userId: (req as any).user?.id,
    });

    res.json(productUoM);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        return res.status(404).json({ error: 'Product UoM association not found' });
      }
    }
    next(error);
  }
});

// DELETE /api/products/:productId/uoms/:uomId - Remove UoM from product
router.delete('/products/:productId/uoms/:uomId', authenticate, authorize(['ADMIN', 'MANAGER']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { productId, uomId } = req.params;

    await prisma.productUoM.delete({
      where: {
        productId_uomId: {
          productId,
          uomId,
        },
      },
    });

    logger.info(`Removed UoM from product`, {
      productId,
      uomId,
      userId: (req as any).user?.id,
    });

    res.json({ message: 'UoM removed from product successfully' });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        return res.status(404).json({ error: 'Product UoM association not found' });
      }
    }
    next(error);
  }
});

// POST /api/products/:productId/uoms/bulk - Bulk assign UoMs to product
router.post('/products/:productId/uoms/bulk', authenticate, authorize(['ADMIN', 'MANAGER']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { productId } = req.params;
    const validatedData = BulkAssignUoMsSchema.parse({
      ...req.body,
      productId,
    });

    const productUoMs = await prisma.$transaction(async (tx: any) => {
      // Remove existing associations
      await tx.productUoM.deleteMany({
        where: { productId },
      });

      // Create new associations
      const created = [];
      for (const uom of validatedData.uoms) {
        const unitPriceValue = uom.unitPrice !== undefined && uom.unitPrice !== null
          ? new Prisma.Decimal(uom.unitPrice)
          : null;

        const productUoM = await tx.productUoM.create({
          data: {
            productId,
            uomId: uom.uomId,
            conversionFactor: new Prisma.Decimal(uom.conversionFactor),
            priceMultiplier: new Prisma.Decimal(uom.priceMultiplier),
            unitPrice: unitPriceValue,
            isDefault: uom.isDefault,
            isSaleAllowed: uom.isSaleAllowed,
            isPurchaseAllowed: uom.isPurchaseAllowed,
            sortOrder: uom.sortOrder,
          },
          include: {
            uom: true,
          },
        });
        created.push(productUoM);
      }

      return created;
    });

    logger.info(`Bulk assigned ${productUoMs.length} UoMs to product`, {
      productId,
      userId: (req as any).user?.id,
    });

    res.status(201).json(productUoMs);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2003') {
        return res.status(400).json({ error: 'Invalid product or UoM ID' });
      }
    }
    next(error);
  }
});

// ============================================================================
// UoM Utility Endpoints
// ============================================================================

// POST /api/uoms/convert - Convert quantity between UoMs
router.post('/convert', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validatedData = ConvertUoMSchema.parse(req.body);

    const product = await prisma.product.findUnique({
      where: { id: validatedData.productId },
      include: {
        productUoMs: {
          include: {
            uom: true,
          },
        },
      },
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Convert to base unit
    const conversionResult = await convertToBaseUnit(
      product,
      new Prisma.Decimal(validatedData.quantity),
      validatedData.fromUoMId
    );

    // Convert to target unit
    const targetQuantity = await convertFromBaseUnit(
      product,
      conversionResult.quantityInBaseUnit,
      validatedData.toUoMId
    );

    res.json({
      sourceQuantity: validatedData.quantity,
      sourceUoMId: validatedData.fromUoMId,
      targetQuantity: targetQuantity.toNumber(),
      targetUoMId: validatedData.toUoMId,
      quantityInBaseUnit: conversionResult.quantityInBaseUnit.toNumber(),
      baseUnit: product.baseUnit,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/uoms/calculate-price - Calculate price for UoM
router.post('/calculate-price', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validatedData = CalculatePriceSchema.parse(req.body);

    const product = await prisma.product.findUnique({
      where: { id: validatedData.productId },
      include: {
        productUoMs: {
          include: {
            uom: true,
          },
        },
      },
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const basePrice = validatedData.basePrice !== undefined
      ? new Prisma.Decimal(validatedData.basePrice)
      : product.sellingPrice;

    const priceCalc = await calculatePriceForUoM(
      basePrice,
      new Prisma.Decimal(validatedData.quantity),
      validatedData.uomId,
      product
    );

    res.json({
      quantity: validatedData.quantity,
      uomId: validatedData.uomId,
      basePrice: priceCalc.basePrice.toNumber(),
      unitPrice: priceCalc.unitPrice.toNumber(),
      total: priceCalc.total.toNumber(),
      priceMultiplier: priceCalc.priceMultiplier.toNumber(),
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Enhanced UoM Price Management Endpoints
// ============================================================================

// PUT /api/products/:productId/uoms/:uomId/price - Set individual UoM price
router.put('/products/:productId/uoms/:uomId/price', 
  authenticate, 
  authorize(['ADMIN', 'MANAGER']), 
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { productId, uomId } = req.params;
      const { unitPrice } = req.body;

      if (typeof unitPrice !== 'number' || unitPrice < 0) {
        return res.status(400).json({ error: 'Invalid unit price' });
      }

      // Check if ProductUoM exists
      const existingProductUoM = await prisma.productUoM.findFirst({
        where: { productId, uomId },
      });

      if (!existingProductUoM) {
        return res.status(404).json({ error: 'Product UoM not found' });
      }

      // Update price
      const updated = await prisma.productUoM.update({
        where: {
          productId_uomId: { productId, uomId },
        },
        data: {
          unitPrice: new Prisma.Decimal(unitPrice),
        },
        include: {
          uom: true,
          product: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      logger.info(`Updated UoM price`, {
        productId,
        uomId,
        unitPrice,
        userId: (req as any).user?.id,
      });

      res.json({
        success: true,
        data: updated,
        message: 'Unit price updated successfully',
      });
    } catch (error) {
      logger.error('Error updating UoM price:', error);
      next(error);
    }
  }
);

// POST /api/products/:productId/uoms/bulk-prices - Bulk update UoM prices
router.post('/products/:productId/uoms/bulk-prices', 
  authenticate, 
  authorize(['ADMIN', 'MANAGER']), 
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { productId } = req.params;
      const { prices } = req.body;

      if (!Array.isArray(prices) || prices.length === 0) {
        return res.status(400).json({ error: 'Prices array is required' });
      }

      // Validate prices format
      for (const priceData of prices) {
        if (!priceData.uomId || typeof priceData.unitPrice !== 'number' || priceData.unitPrice < 0) {
          return res.status(400).json({ error: 'Invalid price data format' });
        }
      }

      // Verify product exists
      const product = await prisma.product.findUnique({
        where: { id: productId },
      });

      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }

      // Verify all UoMs exist for this product
      const existingUoMs = await prisma.productUoM.findMany({
        where: {
          productId,
          uomId: { in: prices.map((p) => p.uomId) },
        },
      });

      if (existingUoMs.length !== prices.length) {
        return res.status(400).json({ error: 'Some UoMs do not exist for this product' });
      }

      // Update prices in transaction
      const updated = await prisma.$transaction(
        prices.map((priceData) =>
          prisma.productUoM.updateMany({
            where: {
              productId,
              uomId: priceData.uomId,
            },
            data: {
              unitPrice: new Prisma.Decimal(priceData.unitPrice),
            },
          })
        )
      );

      // Fetch updated records
      const updatedUoMs = await prisma.productUoM.findMany({
        where: {
          productId,
          uomId: { in: prices.map((p) => p.uomId) },
        },
        include: {
          uom: true,
        },
        orderBy: { sortOrder: 'asc' },
      });

      logger.info(`Bulk updated UoM prices`, {
        productId,
        count: prices.length,
        userId: (req as any).user?.id,
      });

      res.json({
        success: true,
        data: updatedUoMs,
        message: `Updated prices for ${updated.length} units`,
      });
    } catch (error) {
      logger.error('Error bulk updating UoM prices:', error);
      next(error);
    }
  }
);

// POST /api/products/:productId/setup-uoms - Complete UoM setup with prices
router.post('/products/:productId/setup-uoms', 
  authenticate, 
  authorize(['ADMIN', 'MANAGER']), 
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { productId } = req.params;
      const { uoms } = req.body;

      if (!Array.isArray(uoms) || uoms.length === 0) {
        return res.status(400).json({ error: 'UoMs array is required' });
      }

      // Validate exactly one default
      const defaultCount = uoms.filter((u) => u.isDefault).length;
      if (defaultCount !== 1) {
        return res.status(400).json({ error: 'Exactly one UoM must be marked as default' });
      }

      // Verify product exists
      const product = await prisma.product.findUnique({
        where: { id: productId },
      });

      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }

      // Verify all UoMs exist
      const uomIds = uoms.map((u: any) => u.uomId);
      const existingUoMs = await prisma.unitOfMeasure.findMany({
        where: { id: { in: uomIds } },
      });

      if (existingUoMs.length !== uomIds.length) {
        return res.status(400).json({ error: 'Some UoMs do not exist' });
      }

      // Check for duplicates
      const uniqueUomIds = new Set(uomIds);
      if (uniqueUomIds.size !== uomIds.length) {
        return res.status(400).json({ error: 'Duplicate UoMs in request' });
      }

      // Setup in transaction
      const result = await prisma.$transaction(async (tx: any) => {
        // Delete existing ProductUoMs
        await tx.productUoM.deleteMany({
          where: { productId },
        });

        // Create new ProductUoMs
        const created = await Promise.all(
          uoms.map((uomData: any, index: number) =>
            tx.productUoM.create({
              data: {
                productId,
                uomId: uomData.uomId,
                conversionFactor: new Prisma.Decimal(uomData.conversionFactor),
                unitPrice: uomData.unitPrice ? new Prisma.Decimal(uomData.unitPrice) : null,
                isDefault: uomData.isDefault || false,
                isSaleAllowed: uomData.isSaleAllowed !== false,
                isPurchaseAllowed: uomData.isPurchaseAllowed !== false,
                barcode: uomData.barcode || null,
                sortOrder: index,
              },
              include: {
                uom: true,
              },
            })
          )
        );

        return created;
      });

      logger.info(`Setup product UoMs`, {
        productId,
        count: result.length,
        userId: (req as any).user?.id,
      });

      res.status(201).json({
        success: true,
        data: result,
        message: `Configured ${result.length} units for product`,
      });
    } catch (error) {
      logger.error('Error setting up product UoMs:', error);
      next(error);
    }
  }
);

export default router;
