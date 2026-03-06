// Shared Zod Schemas - Customers
// Used by both frontend and backend for validation

import { z } from 'zod';

export const CustomerSchema = z.object({
  id: z.string().uuid(),
  customerNumber: z.string().optional(), // Human-readable ID (CUST-0001)
  name: z.string().min(1).max(255),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  address: z.string().optional().nullable(),
  customerGroupId: z.string().uuid().optional().nullable(),
  balance: z.number().default(0),
  creditLimit: z.number().nonnegative().default(0),
  depositBalance: z.number().default(0).optional(),
  isActive: z.boolean().default(true),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();

export const CreateCustomerSchema = z.object({
  name: z.string().min(1, 'Customer name is required').max(255),
  email: z.string().email('Invalid email format').optional(),
  phone: z.string().max(50).optional(),
  address: z.string().optional(),
  customerGroupId: z.string().uuid().optional(),
  creditLimit: z.number().nonnegative().default(0),
}).strict();

export const UpdateCustomerSchema = CreateCustomerSchema.partial();

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
