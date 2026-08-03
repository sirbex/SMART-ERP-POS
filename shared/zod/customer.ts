// Shared Zod Schemas - Customers
// Used by both frontend and backend for validation

import { z } from 'zod';

export const CustomerTaxProfileSchema = z.enum([
  'STANDARD',
  'VAT_REGISTERED',
  'EXEMPT',
  'ZERO_RATED',
]);

export const CustomerSchema = z.object({
  id: z.string().uuid(),
  customerNumber: z.string().optional(), // Human-readable ID (CUST-0001)
  name: z.string().min(1).max(255),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  address: z.string().optional().nullable(),
  customerGroupId: z.string().uuid().optional().nullable(),
  priceGroupId: z.string().uuid().optional().nullable(),
  pricingMode: z.enum(['STANDARD', 'AT_COST']).optional().nullable(), // Resolved from price_groups join
  balance: z.number().default(0),
  creditLimit: z.number().nonnegative().default(0),
  /**
   * Enterprise: when true, on-account / credit sales ignore the hard credit_limit ceiling.
   * credit_limit may still be kept as a soft advisory figure for display/reporting.
   */
  unlimitedCredit: z.boolean().default(false).optional(),
  depositBalance: z.number().default(0).optional(),
  /** When true, payments should default WHT for this customer (customer-withheld). */
  whtLiable: z.boolean().default(false).optional(),
  defaultWhtTypeId: z.string().uuid().optional().nullable(),
  /** DocumentTaxService — customer VAT profile */
  vatRegistered: z.boolean().default(false).optional(),
  tin: z.string().max(50).optional().nullable(),
  taxProfile: CustomerTaxProfileSchema.default('STANDARD').optional(),
  defaultVatRate: z.number().nonnegative().optional().nullable(),
  vatRegistrationDate: z.string().optional().nullable(),
  taxEffectiveFrom: z.string().optional().nullable(),
  taxExempt: z.boolean().default(false).optional(),
  allowTaxOverride: z.boolean().default(false).optional(),
  isActive: z.boolean().default(true),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  version: z.number().int().optional(),
}).strict();

export const CreateCustomerSchema = z.object({
  name: z.string().min(1, 'Customer name is required').max(255),
  email: z.union([z.string().email('Invalid email format'), z.literal('')]).optional().transform(v => v === '' ? undefined : v),
  phone: z.union([z.string().max(50), z.literal('')]).optional().transform(v => v === '' ? undefined : v),
  address: z.string().optional(),
  customerGroupId: z.string().uuid().optional().nullable(),
  priceGroupId: z.string().uuid().optional().nullable(),
  creditLimit: z.number().nonnegative().default(0),
  unlimitedCredit: z.boolean().optional(),
  whtLiable: z.boolean().optional(),
  defaultWhtTypeId: z.string().uuid().optional().nullable(),
  vatRegistered: z.boolean().optional(),
  tin: z.union([z.string().max(50), z.literal('')]).optional().transform(v => v === '' ? undefined : v).nullable(),
  taxProfile: CustomerTaxProfileSchema.optional(),
  defaultVatRate: z.number().nonnegative().optional().nullable(),
  vatRegistrationDate: z.string().optional().nullable(),
  taxEffectiveFrom: z.string().optional().nullable(),
  taxExempt: z.boolean().optional(),
  allowTaxOverride: z.boolean().optional(),
}).strict();

export const UpdateCustomerSchema = CreateCustomerSchema.partial().extend({
  version: z.number().int().positive().optional(),
});

export const CustomerGroupSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().optional().nullable(),
  discountPercentage: z.number().min(0).max(1).default(0),
  isActive: z.boolean().default(true),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();

export const CreateCustomerGroupSchema = z.object({
  name: z.string().min(1, 'Group name is required').max(255),
  description: z.string().optional(),
  discountPercentage: z.number().min(0, 'Discount must be 0-100%').max(1).default(0),
}).strict();

export const UpdateCustomerGroupSchema = CreateCustomerGroupSchema.partial();

export type Customer = z.infer<typeof CustomerSchema>;
export type CreateCustomer = z.infer<typeof CreateCustomerSchema>;
export type UpdateCustomer = z.infer<typeof UpdateCustomerSchema>;
export type CustomerGroup = z.infer<typeof CustomerGroupSchema>;
export type CreateCustomerGroup = z.infer<typeof CreateCustomerGroupSchema>;
export type UpdateCustomerGroup = z.infer<typeof UpdateCustomerGroupSchema>;
