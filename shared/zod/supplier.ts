// Shared Zod Schemas - Suppliers

import { z } from 'zod';

export const SupplierSchema = z.object({
  id: z.string().uuid(),
  supplierNumber: z.string().optional(), // Human-readable ID (SUP-0001)
  name: z.string().min(1).max(255),
  contactPerson: z.string().max(255).optional().nullable(),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  address: z.string().optional().nullable(),
  paymentTerms: z.string().max(50).default('NET30'),
  isActive: z.boolean().default(true),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();

export const CreateSupplierSchema = z.object({
  name: z.string().min(1, 'Supplier name is required').max(255),
  contactPerson: z.string().max(255).optional(),
  email: z.string().email('Invalid email format').optional(),
  phone: z.string().max(50).optional(),
  address: z.string().optional(),
  paymentTerms: z.string().max(50).default('NET30'),
  creditLimit: z.number().nonnegative().optional(),
  taxId: z.string().max(100).optional(),
  notes: z.string().optional(),
}).strict();

export const UpdateSupplierSchema = CreateSupplierSchema.extend({
  isActive: z.boolean().optional(),
}).partial();

export type Supplier = z.infer<typeof SupplierSchema>;
export type CreateSupplier = z.infer<typeof CreateSupplierSchema>;
export type UpdateSupplier = z.infer<typeof UpdateSupplierSchema>;
