// Pricing Tier Validation Schema
// Schema for flexible pricing rules based on product, customer group, and quantity

import { z } from 'zod';
import Decimal from 'decimal.js';

/**
 * Pricing tier validation schema
 */
export const PricingTierSchema = z
  .object({
    id: z.string().uuid(),
    productId: z.string().uuid(),
    customerGroupId: z.string().uuid().optional().nullable(),
    name: z.string().max(100).optional().nullable(),
    pricingFormula: z
      .string()
      .min(1, 'Pricing formula is required')
      .max(500, 'Pricing formula cannot exceed 500 characters')
      .refine(
        (formula) => {
          // Basic validation: check for dangerous keywords
          const dangerous = ['eval', 'Function', 'constructor', 'prototype', '__proto__'];
          return !dangerous.some((keyword) => formula.includes(keyword));
        },
        {
          message: 'Pricing formula contains forbidden keywords',
        }
      ),
    calculatedPrice: z
      .number()
      .nonnegative('Calculated price cannot be negative')
      .refine(
        (val) => {
          try {
            const decimal = new Decimal(val);
            const str = decimal.toString();
            const decimalIndex = str.indexOf('.');
            if (decimalIndex === -1) return true;
            return str.length - decimalIndex - 1 <= 2;
          } catch {
            return false;
          }
        },
        {
          message: 'Calculated price must have at most 2 decimal places',
        }
      )
      .transform((val) => new Decimal(val).toNumber()),
    minQuantity: z
      .number()
      .positive('Minimum quantity must be positive')
      .default(1)
      .transform((val) => new Decimal(val).toNumber()),
    maxQuantity: z
      .number()
      .positive('Maximum quantity must be positive')
      .optional()
      .nullable()
      .transform((val) => (val !== null && val !== undefined ? new Decimal(val).toNumber() : null)),
    isActive: z.boolean().default(true),
    validFrom: z.string().datetime().optional().nullable(),
    validUntil: z.string().datetime().optional().nullable(),
    priority: z.number().int().default(0), // Higher number = higher priority
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict()
  .refine(
    (data) => {
      // If maxQuantity is set, it must be greater than minQuantity
      if (data.maxQuantity !== null && data.maxQuantity !== undefined) {
        return data.maxQuantity > data.minQuantity;
      }
      return true;
    },
    {
      message: 'Maximum quantity must be greater than minimum quantity',
      path: ['maxQuantity'],
    }
  )
  .refine(
    (data) => {
      // If validUntil is set, it must be after validFrom
      if (data.validFrom && data.validUntil) {
        return new Date(data.validUntil) > new Date(data.validFrom);
      }
      return true;
    },
    {
      message: 'Valid until date must be after valid from date',
      path: ['validUntil'],
    }
  );

export type PricingTier = z.infer<typeof PricingTierSchema>;

/**
 * Create pricing tier schema
 */
// Extract base object before applying omit
const basePricingTierSchema = PricingTierSchema._def.schema._def.schema;
export const CreatePricingTierSchema = basePricingTierSchema.omit({
  id: true,
  calculatedPrice: true, // Calculated by service
  createdAt: true,
  updatedAt: true,
});

export type CreatePricingTierInput = z.infer<typeof CreatePricingTierSchema>;

/**
 * Update pricing tier schema
 */
export const UpdatePricingTierSchema = basePricingTierSchema.omit({
  id: true,
  productId: true, // Cannot change product
  calculatedPrice: true,
  createdAt: true,
  updatedAt: true,
}).partial();

export type UpdatePricingTierInput = z.infer<typeof UpdatePricingTierSchema>;

/**
 * Validate formula schema
 */
export const ValidateFormulaSchema = z.object({
  formula: z.string().min(1).max(500),
  productId: z.string().uuid().optional(), // Optional: validate with specific product context
  quantity: z.number().positive().optional(), // Optional: test with specific quantity
});

export type ValidateFormulaInput = z.infer<typeof ValidateFormulaSchema>;

/**
 * Formula validation result
 */
export const FormulaValidationResultSchema = z.object({
  valid: z.boolean(),
  error: z.string().optional(),
  calculatedPrice: z.number().optional(),
  variables: z
    .object({
      cost: z.number().optional(),
      lastCost: z.number().optional(),
      sellingPrice: z.number().optional(),
      quantity: z.number().optional(),
    })
    .optional(),
});

export type FormulaValidationResult = z.infer<typeof FormulaValidationResultSchema>;

/**
 * Pricing tier with additional details
 */
export const PricingTierWithDetailsSchema = basePricingTierSchema.extend({
  productName: z.string(),
  productSku: z.string().optional().nullable(),
  customerGroupName: z.string().optional().nullable(),
  isCurrentlyValid: z.boolean(), // Whether tier is valid at current date
});

export type PricingTierWithDetails = z.infer<typeof PricingTierWithDetailsSchema>;

/**
 * Pricing tier query filters
 */
export const PricingTierFiltersSchema = z.object({
  productId: z.string().uuid().optional(),
  customerGroupId: z.string().uuid().optional(),
  isActive: z.boolean().optional(),
  isCurrentlyValid: z.boolean().optional(), // Filter by date validity
  minQuantity: z.number().positive().optional(),
  maxQuantity: z.number().positive().optional(),
});

export type PricingTierFilters = z.infer<typeof PricingTierFiltersSchema>;

/**
 * Bulk update tiers for a product
 */
export const BulkUpdateTiersSchema = z.object({
  productId: z.string().uuid(),
  tiers: z.array(CreatePricingTierSchema).min(1, 'At least one tier required'),
  replaceExisting: z.boolean().default(false), // If true, delete existing tiers first
});

export type BulkUpdateTiersInput = z.infer<typeof BulkUpdateTiersSchema>;

/**
 * Calculate price context (for service layer)
 */
export const CalculatePriceContextSchema = z.object({
  productId: z.string().uuid(),
  customerId: z.string().uuid().optional(),
  customerGroupId: z.string().uuid().optional(),
  quantity: z.number().positive().default(1),
  requestDate: z.string().datetime().optional(), // For testing date-specific tiers
});

export type CalculatePriceContext = z.infer<typeof CalculatePriceContextSchema>;
