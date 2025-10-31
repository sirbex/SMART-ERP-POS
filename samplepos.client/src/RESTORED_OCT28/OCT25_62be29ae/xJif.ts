import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import prisma from '../config/database.js';
import { PricingService } from '../services/pricingService.js';
import { Decimal } from 'decimal.js';

const router = Router();

// Helpers: coerce numeric query strings and enforce precision
const qty4dp = z.preprocess((v) => (typeof v === 'string' ? Number(v) : v),
  z
    .number({ invalid_type_error: 'Quantity must be a number' })
    .positive('Quantity must be positive')
    .refine((val) => Number.isFinite(val), 'Quantity must be finite')
    .refine((val) => val <= 999_999_999.9999, 'Quantity cannot exceed 999,999,999.9999')
    .refine((val) => {
      const dp = val.toString().split('.')[1];
      return !dp || dp.length <= 4;
    }, 'Quantity precision cannot exceed 4 decimal places')
);

const ParamsSchema = z.object({ productId: z.string().cuid('Product ID must be a valid CUID') });
const QuerySchema = z.object({
  quantity: qty4dp.default(1),
  includeBatches: z.preprocess((v) => (v === 'true' || v === true ? true : false), z.boolean()).default(false)
});

/**
 * GET /api/pricing/retail-wholesale/:productId?quantity=1&includeBatches=false
 * Returns Retail and Wholesale price for a product for the given quantity.
 * - Retail: customer group named "Retail" if exists, otherwise default (no group)
 * - Wholesale: customer group named "Wholesale" if exists, otherwise null
 * Optionally returns active batch prices and remaining quantities when includeBatches=true.
 */
router.get('/retail-wholesale/:productId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { productId } = ParamsSchema.parse(req.params);
    const { quantity, includeBatches } = QuerySchema.parse(req.query);

    // Find Retail and Wholesale groups by name (case-insensitive)
    const groups = await prisma.customerGroup.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    });

    const retailGroup = groups.find(g => g.name.toLowerCase() === 'retail');
    const wholesaleGroup = groups.find(g => g.name.toLowerCase() === 'wholesale');

    // Compute prices using PricingService (falls back to product selling price if no tier)
    const retailPrice = await PricingService.calculatePrice({
      productId,
      customerGroupId: retailGroup?.id, // if null, service handles default path
      quantity
    });

    const wholesalePrice = wholesaleGroup
      ? await PricingService.calculatePrice({ productId, customerGroupId: wholesaleGroup.id, quantity })
      : null;

    // Optionally include batch-level prices
    let batches: Array<{ id: string; batchNumber: string; sellingPrice: number | null; remainingQuantity: number }> | undefined;
    if (includeBatches) {
      const activeBatches = await prisma.inventoryBatch.findMany({
        where: { productId, status: 'ACTIVE', remainingQuantity: { gt: 0 } },
        orderBy: { receivedDate: 'asc' },
        select: { id: true, batchNumber: true, remainingQuantity: true, costPrice: true }
      });
      batches = activeBatches.map(b => ({
        id: b.id,
        batchNumber: b.batchNumber,
        sellingPrice: (b as any).sellingPrice ? new Decimal((b as any).sellingPrice).toNumber() : null,
        remainingQuantity: new Decimal(b.remainingQuantity).toNumber()
      }));
    }

    return res.json({
      success: true,
      data: {
        productId,
        quantity,
        retail: {
          groupId: retailGroup?.id || null,
          groupName: retailGroup?.name || 'Default',
          price: retailPrice.price,
          tierName: retailPrice.tierName || null,
          formula: retailPrice.formula || null,
          appliedDiscount: retailPrice.appliedDiscount || null
        },
        wholesale: wholesalePrice
          ? {
              groupId: wholesaleGroup!.id,
              groupName: wholesaleGroup!.name,
              price: wholesalePrice.price,
              tierName: wholesalePrice.tierName || null,
              formula: wholesalePrice.formula || null,
              appliedDiscount: wholesalePrice.appliedDiscount || null
            }
          : null,
        batches
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    next(error);
  }
});

export default router;
