import { z } from 'zod';

/**
 * Customer Validation Schemas
 * 
 * These schemas validate customer data for:
 * - Creating new customers
 * - Updating existing customers
 * 
 * Features:
 * - Required fields: name, phone
 * - Optional fields: email, address, city, taxId, notes
 * - Phone and email validation
 * - Length limits on all fields
 * - Business rules enforced at validation layer
 */

// Phone number regex - supports formats: 123-456-7890, (123) 456-7890, 1234567890
const phoneRegex = /^[\d\s\-\(\)]+$/;

/**
 * Create Customer Schema
 * Used when creating a new customer via POST /api/customers
 */
export const CreateCustomerSchema = z.object({
  name: z.string()
    .trim()
    .min(1, 'Customer name is required')
    .max(200, 'Customer name cannot exceed 200 characters'),
  
  phone: z.string()
    .trim()
    .max(50, 'Phone number cannot exceed 50 characters')
    .regex(phoneRegex, 'Phone number can only contain digits, spaces, dashes, and parentheses')
    .optional()
    .nullable(),
  
  email: z.string()
    .trim()
    .email('Invalid email format')
    .max(200, 'Email cannot exceed 200 characters')
    .optional()
    .nullable(),
  
  address: z.string()
    .trim()
    .max(500, 'Address cannot exceed 500 characters')
    .optional()
    .nullable(),
  
  city: z.string()
    .trim()
    .max(100, 'City cannot exceed 100 characters')
    .optional()
    .nullable(),
  
  taxId: z.string()
    .trim()
    .max(50, 'Tax ID cannot exceed 50 characters')
    .optional()
    .nullable(),
  
  creditLimit: z.number()
    .min(0, 'Credit limit cannot be negative')
    .optional()
    .default(0),

  // Additional fields that frontend might send
  type: z.enum(['INDIVIDUAL', 'BUSINESS'])
    .optional()
    .nullable(),
  
  notes: z.string()
    .trim()
    .max(1000, 'Notes cannot exceed 1000 characters')
    .optional()
    .nullable(),
});

/**
 * Update Customer Schema
 * Used when updating an existing customer via PUT /api/customers/:id
 * All fields are optional since this is a partial update
 */
export const UpdateCustomerSchema = z.object({
  name: z.string()
    .trim()
    .min(1, 'Customer name cannot be empty')
    .max(200, 'Customer name cannot exceed 200 characters')
    .optional(),
  
  phone: z.string()
    .trim()
    .min(1, 'Phone number cannot be empty')
    .max(50, 'Phone number cannot exceed 50 characters')
    .regex(phoneRegex, 'Phone number can only contain digits, spaces, dashes, and parentheses')
    .optional(),
  
  email: z.string()
    .trim()
    .email('Invalid email format')
    .max(200, 'Email cannot exceed 200 characters')
    .optional()
    .nullable(),
  
  address: z.string()
    .trim()
    .max(500, 'Address cannot exceed 500 characters')
    .optional()
    .nullable(),
  
  city: z.string()
    .trim()
    .max(100, 'City cannot exceed 100 characters')
    .optional()
    .nullable(),
  
  taxId: z.string()
    .trim()
    .max(50, 'Tax ID cannot exceed 50 characters')
    .optional()
    .nullable(),
  
  isActive: z.boolean()
    .optional(),
  
  creditLimit: z.number()
    .min(0, 'Credit limit cannot be negative')
    .optional(),
});

// TypeScript types for use in route handlers
export type CreateCustomerInput = z.infer<typeof CreateCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof UpdateCustomerSchema>;
