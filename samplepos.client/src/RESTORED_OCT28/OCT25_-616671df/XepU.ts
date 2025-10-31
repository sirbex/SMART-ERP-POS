import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../config/database.js';
import { authenticate, authorize } from '../middleware/auth.js';
import logger from '../utils/logger.js';
import { parsePagination, buildPaginationResponse } from '../utils/helpers.js';
import { z } from 'zod';
import { PricingService } from '../services/pricingService.js';
import { PricingCacheService } from '../services/pricingCacheService.js';

const router = Router();

// Validation schemas
const CreatePricingTierSchema = z
  .object({
    productId: z.string().cuid('Product ID must be a valid CUID'),
    customerGroupId: z.string().cuid('Customer Group ID must be a valid CUID').optional(),
    name: z.string().max(200).optional(),
    // Accept constant price (e.g., "2500") or expressions (e.g., "cost * 1.15")
    pricingFormula: z
      .string()
      .min(1, 'Pricing formula is required')
      .refine((formula) => typeof formula === 'string' && formula.trim().length > 0, 'Invalid pricing formula'),
    // Quantities align with DECIMAL(15,4)
    minQuantity: z
      .number()
      .nonnegative('minQuantity cannot be negative')
      .refine(
        (val) => val <= 999_999_999.9999,
        'minQuantity cannot exceed 999,999,999.9999'
      )
      .refine(
        (val) => {
          const dp = val.toString().split('.')[1];
          return !dp || dp.length <= 4;
        },
        'minQuantity cannot exceed 4 decimal places'
      )
      .default(1),
    maxQuantity: z
      .number()
      .nonnegative('maxQuantity cannot be negative')
      .refine(
        (val) => val <= 999_999_999.9999,
        'maxQuantity cannot exceed 999,999,999.9999'
      )
      .refine(
        (val) => {
          const dp = val.toString().split('.')[1];
          return !dp || dp.length <= 4;
        },
        'maxQuantity cannot exceed 4 decimal places'
      )
      .optional(),
    isActive: z.boolean().default(true),
    validFrom: z.string().datetime().optional(),
    validUntil: z.string().datetime().optional(),
    // Priority determines rule precedence (higher wins)
    priority: z
      .number()
      .int('priority must be an integer')
      .min(0, 'priority cannot be negative')
      .max(10000, 'priority cannot exceed 10000')
      .default(0),
  })
  .refine(
    (data) => {
      if (data.maxQuantity === undefined || data.maxQuantity === null) return true;
      return Number(data.maxQuantity) >= Number(data.minQuantity);
    },
    {
      message: 'maxQuantity must be greater than or equal to minQuantity',
      path: ['maxQuantity'],
    }
  )
  .refine(
    (data) => {
      if (!data.validFrom || !data.validUntil) return true;
      return new Date(data.validUntil) >= new Date(data.validFrom);
    },
    {
      message: 'validUntil must be after or equal to validFrom',
      path: ['validUntil'],
    }
  );

const UpdatePricingTierSchema = z
  .object({
    customerGroupId: z.string().cuid('Customer Group ID must be a valid CUID').optional(),
    name: z.string().max(200).optional(),
    pricingFormula: z
      .string()
      .min(1, 'Pricing formula is required')
      .refine((formula) => typeof formula === 'string' && formula.trim().length > 0, 'Invalid pricing formula')
      .optional(),
    minQuantity: z
      .number()
      .nonnegative('minQuantity cannot be negative')
      .refine(
        (val) => val <= 999_999_999.9999,
        'minQuantity cannot exceed 999,999,999.9999'
      )
      .refine(
        (val) => {
          const dp = val.toString().split('.')[1];
          return !dp || dp.length <= 4;
        },
        'minQuantity cannot exceed 4 decimal places'
      )
      .optional(),
    maxQuantity: z
      .number()
      .nonnegative('maxQuantity cannot be negative')
      .refine(
        (val) => val <= 999_999_999.9999,
        'maxQuantity cannot exceed 999,999,999.9999'
      )
      .refine(
        (val) => {
          const dp = val.toString().split('.')[1];
          return !dp || dp.length <= 4;
        },
        'maxQuantity cannot exceed 4 decimal places'
      )
      .optional(),
    isActive: z.boolean().optional(),
    validFrom: z.string().datetime().optional(),
    validUntil: z.string().datetime().optional(),
    priority: z
      .number()
      .int('priority must be an integer')
      .min(0, 'priority cannot be negative')
      .max(10000, 'priority cannot exceed 10000')
      .optional(),
  })
  .refine(
    (data) => {
      if (data.minQuantity === undefined || data.maxQuantity === undefined) return true;
      return Number(data.maxQuantity) >= Number(data.minQuantity);
    },
    {
      message: 'maxQuantity must be greater than or equal to minQuantity',
      path: ['maxQuantity'],
    }
  )
  .refine(
    (data) => {
      if (!data.validFrom || !data.validUntil) return true;
      return new Date(data.validUntil) >= new Date(data.validFrom);
    },
    {
      message: 'validUntil must be after or equal to validFrom',
      path: ['validUntil'],
    }
  );

// POST /api/pricing-tiers/validate-formula - Validate pricing formula
router.post(
  '/validate-formula',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { formula } = req.body;

      if (!formula || typeof formula !== 'string') {
        return res.status(400).json({ error: 'Formula is required' });
      }

      const validation = PricingService.validateFormula(formula);

      res.json({
        success: true,
        data: validation,
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/pricing-tiers - List pricing tiers
router.get(
  '/',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, limit, skip } = parsePagination(req.query);
      const { productId, customerGroupId, isActive } = req.query;

      const where: any = {};

      if (productId) {
        where.productId = productId as string;
      }

      if (customerGroupId) {
        where.customerGroupId = customerGroupId as string;
      }

      if (isActive !== undefined) {
        where.isActive = isActive === 'true';
      }

      const [tiers, total] = await Promise.all([
        prisma.pricingTier.findMany({
          where,
          skip,
          take: limit,
          orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
          include: {
            product: {
              select: {
                id: true,
                name: true,
                barcode: true,
                sellingPrice: true,
              },
            },
            customerGroup: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        }),
        prisma.pricingTier.count({ where }),
      ]);

      logger.info(`Listed ${tiers.length} pricing tiers`, { userId: (req as any).user?.id });

      res.json(buildPaginationResponse(tiers, total, { page, limit, skip }));
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/pricing-tiers/:id - Get single pricing tier
router.get(
  '/:id',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const tier = await prisma.pricingTier.findUnique({
        where: { id },
        include: {
          product: true,
          customerGroup: true,
        },
      });

      if (!tier) {
        return res.status(404).json({ error: 'Pricing tier not found' });
      }

      logger.info(`Retrieved pricing tier: ${tier.id}`, { userId: (req as any).user?.id });

      res.json({
        success: true,
        data: tier,
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/pricing-tiers - Create pricing tier
router.post(
  '/',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validatedData = CreatePricingTierSchema.parse(req.body);

      // Validate formula
      const formulaValidation = PricingService.validateFormula(validatedData.pricingFormula);
      if (!formulaValidation.valid) {
        return res.status(400).json({
          error: 'Invalid pricing formula',
          details: formulaValidation.error,
        });
      }

      // Calculate initial price
      const calculatedPrice = await PricingService.evaluateFormula(
        validatedData.pricingFormula,
        validatedData.productId,
        validatedData.minQuantity
      );

      const tier = await prisma.pricingTier.create({
        data: {
          ...validatedData,
          calculatedPrice,
          validFrom: validatedData.validFrom ? new Date(validatedData.validFrom) : undefined,
          validUntil: validatedData.validUntil ? new Date(validatedData.validUntil) : undefined,
        },
        include: {
          product: true,
          customerGroup: true,
        },
      });

      // Invalidate cache for affected product/group
      PricingCacheService.invalidateProduct(tier.productId);
      if (tier.customerGroupId) {
        PricingCacheService.invalidateCustomerGroup(tier.customerGroupId);
      }

      logger.info(`Pricing tier created for product: ${tier.productId}`, {
        userId: (req as any).user?.id,
        tierId: tier.id,
        calculatedPrice,
      });

      res.status(201).json({
        success: true,
        message: 'Pricing tier created successfully',
        data: tier,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      next(error);
    }
  }
);

// PUT /api/pricing-tiers/:id - Update pricing tier
router.put(
  '/:id',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const validatedData = UpdatePricingTierSchema.parse(req.body);

      const existing = await prisma.pricingTier.findUnique({
        where: { id },
      });

      if (!existing) {
        return res.status(404).json({ error: 'Pricing tier not found' });
      }

      // Validate formula if provided
      if (validatedData.pricingFormula) {
        const formulaValidation = PricingService.validateFormula(validatedData.pricingFormula);
        if (!formulaValidation.valid) {
          return res.status(400).json({
            error: 'Invalid pricing formula',
            details: formulaValidation.error,
          });
        }
      }

      // Recalculate price if formula or quantity changed
      let calculatedPrice = Number(existing.calculatedPrice);
      if (validatedData.pricingFormula || validatedData.minQuantity) {
        calculatedPrice = await PricingService.evaluateFormula(
          validatedData.pricingFormula || existing.pricingFormula,
          existing.productId,
          validatedData.minQuantity || Number(existing.minQuantity)
        );
      }

      const updated = await prisma.pricingTier.update({
        where: { id },
        data: {
          ...validatedData,
          calculatedPrice,
          validFrom: validatedData.validFrom ? new Date(validatedData.validFrom) : undefined,
          validUntil: validatedData.validUntil ? new Date(validatedData.validUntil) : undefined,
        },
        include: {
          product: true,
          customerGroup: true,
        },
      });

      // Invalidate cache
      PricingCacheService.invalidateProduct(updated.productId);
      if (updated.customerGroupId) {
        PricingCacheService.invalidateCustomerGroup(updated.customerGroupId);
      }

      logger.info(`Pricing tier updated: ${id}`, {
        userId: (req as any).user?.id,
        calculatedPrice,
      });

      res.json({
        success: true,
        message: 'Pricing tier updated successfully',
        data: updated,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      next(error);
    }
  }
);

// DELETE /api/pricing-tiers/:id - Delete pricing tier
router.delete(
  '/:id',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const tier = await prisma.pricingTier.findUnique({
        where: { id },
      });

      if (!tier) {
        return res.status(404).json({ error: 'Pricing tier not found' });
      }

      await prisma.pricingTier.delete({
        where: { id },
      });

      // Invalidate cache
      PricingCacheService.invalidateProduct(tier.productId);
      if (tier.customerGroupId) {
        PricingCacheService.invalidateCustomerGroup(tier.customerGroupId);
      }

      logger.info(`Pricing tier deleted: ${id}`, {
        userId: (req as any).user?.id,
        productId: tier.productId,
      });

      res.json({
        success: true,
        message: 'Pricing tier deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/pricing-tiers/bulk-update/:productId - Update all tiers for a product
router.post(
  '/bulk-update/:productId',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { productId } = req.params;

      await PricingService.updatePricingTiers(productId);

      logger.info(`Bulk updated pricing tiers for product: ${productId}`, {
        userId: (req as any).user?.id,
      });

      res.json({
        success: true,
        message: 'Pricing tiers updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
