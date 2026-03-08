// Discount Schema - Zod validation for discount rules

import { z } from 'zod';

export const DiscountTypeEnum = z.enum(['PERCENTAGE', 'FIXED_AMOUNT', 'BUY_X_GET_Y']);
export type DiscountType = z.infer<typeof DiscountTypeEnum>;

export const DiscountScopeEnum = z.enum(['LINE_ITEM', 'CART', 'CUSTOMER']);
export type DiscountScope = z.infer<typeof DiscountScopeEnum>;

export const DiscountSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  type: DiscountTypeEnum,
  scope: DiscountScopeEnum,
  value: z.number().min(0),
  maxDiscountAmount: z.number().min(0).optional().nullable(),
  minPurchaseAmount: z.number().min(0).optional().nullable(),
  requiresApproval: z.boolean().default(false),
  approvalRoles: z.array(z.string()).optional(),
  isActive: z.boolean().default(true),
  validFrom: z.string().datetime().optional().nullable(),
  validUntil: z.string().datetime().optional().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  version: z.number().int().optional(),
}).strict();

export const ApplyDiscountSchema = z.object({
  discountId: z.string().uuid().optional(),
  type: DiscountTypeEnum,
  scope: DiscountScopeEnum,
  value: z.number().min(0).max(100, 'Discount cannot exceed 100%'),
  reason: z.string().min(5, 'Discount reason required (min 5 characters)').max(500),
  managerPin: z.string().optional(), // Required if discount exceeds role limit
  lineItemIndex: z.number().int().min(0).optional(), // For line-item discounts
}).strict();

export const DiscountAuthorizationSchema = z.object({
  id: z.string().uuid(),
  saleId: z.string().uuid(),
  discountAmount: z.number().min(0),
  discountType: DiscountTypeEnum,
  reason: z.string(),
  requestedBy: z.string().uuid(),
  requestedByName: z.string(),
  approvedBy: z.string().uuid().nullable(),
  approvedByName: z.string().nullable(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']),
  createdAt: z.string().datetime(),
  approvedAt: z.string().datetime().nullable(),
}).strict();

export const RoleDiscountLimitsSchema = z.object({
  ADMIN: z.number().default(100), // 100% discount allowed
  MANAGER: z.number().default(50), // 50% max
  CASHIER: z.number().default(10), // 10% max
  STAFF: z.number().default(5),    // 5% max
});

export type Discount = z.infer<typeof DiscountSchema>;
export type ApplyDiscount = z.infer<typeof ApplyDiscountSchema>;
export type DiscountAuthorization = z.infer<typeof DiscountAuthorizationSchema>;
export type RoleDiscountLimits = z.infer<typeof RoleDiscountLimitsSchema>;

/**
 * Calculate discount amount based on type and value
 * @param originalAmount - Original price/total
 * @param discountType - PERCENTAGE or FIXED_AMOUNT
 * @param discountValue - Percentage (0-100) or fixed amount
 * @returns Discount amount
 */
export function calculateDiscountAmount(
  originalAmount: number,
  discountType: DiscountType,
  discountValue: number
): number {
  if (originalAmount <= 0) {
    return 0;
  }

  if (discountType === 'PERCENTAGE') {
    return (originalAmount * discountValue) / 100;
  }

  if (discountType === 'FIXED_AMOUNT') {
    return Math.min(discountValue, originalAmount); // Cannot exceed original
  }

  return 0;
}

/**
 * Validate discount against role limits
 * @param userRole - User's role
 * @param discountPercentage - Requested discount %
 * @param limits - Role-based limits
 * @returns True if allowed, false if manager approval needed
 */
export function isDiscountAllowed(
  userRole: string,
  discountPercentage: number,
  limits: RoleDiscountLimits
): boolean {
  const maxAllowed = limits[userRole as keyof RoleDiscountLimits] || 0;
  return discountPercentage <= maxAllowed;
}
