// Shared Zod Schemas - Pricing & Pricing Tiers
// Used by both frontend and backend for validation

import { z } from 'zod';

export const PricingTierSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  customerGroupId: z.string().uuid().optional().nullable(),
  name: z.string().max(255).optional().nullable(),
  pricingFormula: z.string(),
  calculatedPrice: z.number().nonnegative(),
  minQuantity: z.number().positive().default(1),
  maxQuantity: z.number().positive().optional().nullable(),
  isActive: z.boolean().default(true),
  validFrom: z.string().datetime().optional().nullable(),
  validUntil: z.string().datetime().optional().nullable(),
  priority: z.number().int().nonnegative().default(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();

export const CreatePricingTierSchema = z.object({
  productId: z.string().uuid('Invalid product ID'),
  customerGroupId: z.string().uuid().optional(),
  name: z.string().max(255).optional(),
  pricingFormula: z.string().min(1, 'Pricing formula is required'),
  minQuantity: z.number().positive('Minimum quantity must be positive').default(1),
  maxQuantity: z.number().positive('Maximum quantity must be positive').optional(),
  validFrom: z.string().datetime().optional(),
  validUntil: z.string().datetime().optional(),
  priority: z.number().int().nonnegative().default(0),
}).strict();

export const UpdatePricingTierSchema = z.object({
  name: z.string().max(255).optional(),
  pricingFormula: z.string().min(1).optional(),
  minQuantity: z.number().positive().optional(),
  maxQuantity: z.number().positive().optional(),
  isActive: z.boolean().optional(),
  validFrom: z.string().datetime().optional(),
  validUntil: z.string().datetime().optional(),
  priority: z.number().int().nonnegative().optional(),
}).strict();

export const CalculatePriceRequestSchema = z.object({
  productId: z.string().uuid('Invalid product ID'),
  customerGroupId: z.string().uuid().optional(),
  quantity: z.number().positive('Quantity must be positive').default(1),
}).strict();

export const CalculatePriceResponseSchema = z.object({
  productId: z.string().uuid(),
  basePrice: z.number().nonnegative(),
  finalPrice: z.number().nonnegative(),
  discount: z.number().nonnegative().default(0),
  appliedTierId: z.string().uuid().optional().nullable(),
  appliedTierName: z.string().optional().nullable(),
}).strict();

export type PricingTier = z.infer<typeof PricingTierSchema>;
export type CreatePricingTier = z.infer<typeof CreatePricingTierSchema>;
export type UpdatePricingTier = z.infer<typeof UpdatePricingTierSchema>;
export type CalculatePriceRequest = z.infer<typeof CalculatePriceRequestSchema>;
export type CalculatePriceResponse = z.infer<typeof CalculatePriceResponseSchema>;
