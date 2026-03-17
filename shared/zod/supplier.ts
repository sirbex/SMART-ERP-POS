// Shared Zod Schemas - Suppliers

import { z } from 'zod';

export const SupplierSchema = z.object({
  id: z.string().uuid(),
  supplierNumber: z.string().optional(), // Human-readable ID (SUP-0001)
  name: z.string().min(1).max(255),
  contactPerson: z.string().max(255).optional().nullable().or(z.literal('')),
  email: z.string().email().optional().nullable().or(z.literal('')),
  phone: z.string().max(50).optional().nullable().or(z.literal('')),
  address: z.string().optional().nullable().or(z.literal('')),
  paymentTerms: z.string().max(50).default('NET30'),
  isActive: z.boolean().default(true),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  version: z.number().int().optional(),
}).strict();

export const CreateSupplierSchema = z.object({
  name: z.string().min(1, 'Supplier name is required').max(255),
  contactPerson: z.union([z.string().max(255), z.literal('')]).optional().transform(v => v === '' ? undefined : v),
  email: z.union([z.string().email('Invalid email format'), z.literal('')]).optional().transform(v => v === '' ? undefined : v),
  phone: z.union([z.string().max(50), z.literal('')]).optional().transform(v => v === '' ? undefined : v),
  address: z.union([z.string(), z.literal('')]).optional().transform(v => v === '' ? undefined : v),
  paymentTerms: z.string().max(50).default('NET30'),
  creditLimit: z.number().nonnegative().optional(),
  taxId: z.union([z.string().max(100), z.literal('')]).optional().transform(v => v === '' ? undefined : v),
  notes: z.union([z.string(), z.literal('')]).optional().transform(v => v === '' ? undefined : v),
}).strict();

export const UpdateSupplierSchema = CreateSupplierSchema.extend({
  isActive: z.boolean().optional(),
}).partial();

export type Supplier = z.infer<typeof SupplierSchema>;
export type CreateSupplier = z.infer<typeof CreateSupplierSchema>;
export type UpdateSupplier = z.infer<typeof UpdateSupplierSchema>;
