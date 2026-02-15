// Customer Group Validation Schema
// Schema for customer segmentation and group-based pricing

import { z } from 'zod';
import Decimal from 'decimal.js';

/**
 * Customer group validation schema
 */
export const CustomerGroupSchema = z
  .object({
    id: z.string().uuid(),
    name: z
      .string()
      .min(2, 'Group name must be at least 2 characters')
      .max(100, 'Group name cannot exceed 100 characters'),
    description: z.string().max(500).optional().nullable(),
    discount: z
      .number()
      .min(0, 'Discount cannot be negative')
      .max(1, 'Discount cannot exceed 100%')
      .refine(
        (val) => {
          try {
            const decimal = new Decimal(val);
            const str = decimal.toString();
            const decimalIndex = str.indexOf('.');
            if (decimalIndex === -1) return true;
            return str.length - decimalIndex - 1 <= 4;
          } catch {
            return false;
          }
        },
        {
          message: 'Discount must have at most 4 decimal places',
        }
      )
      .transform((val) => new Decimal(val).toNumber()),
    isActive: z.boolean().default(true),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export type CustomerGroup = z.infer<typeof CustomerGroupSchema>;

/**
 * Create customer group schema
 */
export const CreateCustomerGroupSchema = CustomerGroupSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CreateCustomerGroupInput = z.infer<typeof CreateCustomerGroupSchema>;

/**
 * Update customer group schema
 */
export const UpdateCustomerGroupSchema = CustomerGroupSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).partial();

export type UpdateCustomerGroupInput = z.infer<typeof UpdateCustomerGroupSchema>;

/**
 * Customer group with additional metadata
 */
export const CustomerGroupWithStatsSchema = CustomerGroupSchema.extend({
  customerCount: z.number().int().nonnegative(),
  tierCount: z.number().int().nonnegative(),
  totalRevenue: z.number().nonnegative().optional(),
  averageOrderValue: z.number().nonnegative().optional(),
});

export type CustomerGroupWithStats = z.infer<typeof CustomerGroupWithStatsSchema>;

/**
 * Customer group query filters
 */
export const CustomerGroupFiltersSchema = z.object({
  isActive: z.boolean().optional(),
  search: z.string().optional(), // Search by name or description
  minDiscount: z.number().min(0).max(1).optional(),
  maxDiscount: z.number().min(0).max(1).optional(),
});

export type CustomerGroupFilters = z.infer<typeof CustomerGroupFiltersSchema>;

/**
 * Assign customer to group schema
 */
export const AssignCustomerToGroupSchema = z.object({
  customerId: z.string().uuid(),
  customerGroupId: z.string().uuid(),
});

export type AssignCustomerToGroupInput = z.infer<typeof AssignCustomerToGroupSchema>;

/**
 * Bulk assign customers to group
 */
export const BulkAssignCustomersSchema = z.object({
  customerIds: z.array(z.string().uuid()).min(1, 'At least one customer required'),
  customerGroupId: z.string().uuid(),
});

export type BulkAssignCustomersInput = z.infer<typeof BulkAssignCustomersSchema>;
