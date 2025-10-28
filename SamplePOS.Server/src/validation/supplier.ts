/**
 * Supplier Validation Schemas
 * 
 * Zod validation for supplier CRUD operations.
 * Replaces express-validator for consistent, type-safe validation.
 * 
 * @module validation/supplier
 */

import { z } from 'zod';

/**
 * Phone number regex - accepts international formats
 * Examples: +1234567890, (123) 456-7890, 123-456-7890
 */
const phoneRegex = /^\+?[0-9\s\-()]{7,20}$/;

/**
 * Create Supplier Schema
 * Used for POST /api/suppliers
 */
export const CreateSupplierSchema = z.object({
  name: z
    .string({ required_error: 'Supplier name is required' })
    .trim()
    .min(1, 'Supplier name is required')
    .max(200, 'Supplier name cannot exceed 200 characters'),

  contactPerson: z
    .string()
    .trim()
    .max(100, 'Contact person name cannot exceed 100 characters')
    .optional()
    .nullable(),

  phone: z
    .string()
    .trim()
    .regex(phoneRegex, 'Invalid phone number format')
    .max(50, 'Phone number too long')
    .optional()
    .nullable(),

  email: z
    .string()
    .trim()
    .email('Invalid email format')
    .max(255, 'Email too long')
    .optional()
    .nullable(),

  address: z
    .string()
    .trim()
    .max(500, 'Address cannot exceed 500 characters')
    .optional()
    .nullable(),

  taxId: z
    .string()
    .trim()
    .max(100, 'Tax ID cannot exceed 100 characters')
    .optional()
    .nullable(),

  paymentTerms: z
    .string()
    .trim()
    .max(500, 'Payment terms cannot exceed 500 characters')
    .optional()
    .nullable(),

  notes: z
    .string()
    .trim()
    .max(1000, 'Notes cannot exceed 1000 characters')
    .optional()
    .nullable(),

  isActive: z
    .boolean()
    .default(true)
});

/**
 * Update Supplier Schema
 * Used for PUT /api/suppliers/:id
 * All fields optional (partial update)
 */
export const UpdateSupplierSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Supplier name is required')
    .max(200, 'Supplier name cannot exceed 200 characters')
    .optional(),

  contactPerson: z
    .string()
    .trim()
    .max(100, 'Contact person name cannot exceed 100 characters')
    .optional()
    .nullable(),

  phone: z
    .string()
    .trim()
    .regex(phoneRegex, 'Invalid phone number format')
    .max(50, 'Phone number too long')
    .optional()
    .nullable(),

  email: z
    .string()
    .trim()
    .email('Invalid email format')
    .max(255, 'Email too long')
    .optional()
    .nullable(),

  address: z
    .string()
    .trim()
    .max(500, 'Address cannot exceed 500 characters')
    .optional()
    .nullable(),

  taxId: z
    .string()
    .trim()
    .max(100, 'Tax ID cannot exceed 100 characters')
    .optional()
    .nullable(),

  paymentTerms: z
    .string()
    .trim()
    .max(500, 'Payment terms cannot exceed 500 characters')
    .optional()
    .nullable(),

  notes: z
    .string()
    .trim()
    .max(1000, 'Notes cannot exceed 1000 characters')
    .optional()
    .nullable(),

  isActive: z
    .boolean()
    .optional()
});

/**
 * TypeScript types inferred from schemas
 */
export type CreateSupplierInput = z.infer<typeof CreateSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof UpdateSupplierSchema>;
